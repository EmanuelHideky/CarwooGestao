const express = require('express');
const db = require('../db');
const { asyncRoute, paraNumero, paraDataISO } = require('../helpers');
const { pode } = require('../middleware/role');

const router = express.Router({ mergeParams: true });

function mapear(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    desc: row.descricao,
    valor: Number(row.valor),
    data: row.data_custo,
  };
}

// GET /api/sales/:saleId/post-sale  -> custos e resultado real da venda
router.get('/', asyncRoute(async (req, res) => {
  const venda = await buscarVenda(req.params.saleId, req.user.storeId);
  if (!venda) return res.status(404).json({ erro: 'Venda não encontrada.' });

  const { rows } = await db.query(
    'SELECT * FROM post_sale_costs WHERE sale_id = $1 ORDER BY data_custo DESC, id DESC',
    [venda.id]
  );
  // O vendedor vê os custos lançados, mas não o resultado financeiro da venda
  res.json({
    custos: rows.map(mapear),
    resultado: pode(req, 'margens') ? calcularResultado(venda, rows) : null,
  });
}));

// POST /api/sales/:saleId/post-sale  -> lança um custo de garantia
router.post('/', asyncRoute(async (req, res) => {
  const b = req.body;
  if (!b.desc || !paraNumero(b.valor)) {
    return res.status(400).json({ erro: 'Informe a descrição e o valor do custo.' });
  }

  const venda = await buscarVenda(req.params.saleId, req.user.storeId);
  if (!venda) return res.status(404).json({ erro: 'Venda não encontrada.' });

  const cliente = await db.pool.connect();
  try {
    await cliente.query('BEGIN');

    const { rows } = await cliente.query(
      `INSERT INTO post_sale_costs (sale_id, store_id, tipo, descricao, valor, data_custo)
       VALUES ($1,$2,$3,$4,$5, COALESCE($6, CURRENT_DATE)) RETURNING *`,
      [venda.id, req.user.storeId, b.tipo || 'garantia', b.desc, paraNumero(b.valor), paraDataISO(b.data)]
    );

    // O custo de garantia também é uma saída de caixa
    await cliente.query(
      `INSERT INTO finance_entries (store_id, tipo, descricao, categoria, valor, data_lanc)
       VALUES ($1,'saida',$2,'Garantia e pós-venda',$3, COALESCE($4, CURRENT_DATE))`,
      [req.user.storeId, `Pós-venda - ${b.desc} (${venda.cliente_nome})`, paraNumero(b.valor), paraDataISO(b.data)]
    );

    await cliente.query('COMMIT');

    const todos = await db.query('SELECT * FROM post_sale_costs WHERE sale_id = $1', [venda.id]);
    res.status(201).json({
      custo: mapear(rows[0]),
      resultado: pode(req, 'margens') ? calcularResultado(venda, todos.rows) : null,
    });
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}));

// DELETE /api/sales/:saleId/post-sale/:id
router.delete('/:id', asyncRoute(async (req, res) => {
  const { rowCount } = await db.query(
    'DELETE FROM post_sale_costs WHERE id = $1 AND store_id = $2',
    [req.params.id, req.user.storeId]
  );
  if (!rowCount) return res.status(404).json({ erro: 'Custo não encontrado.' });
  res.status(204).end();
}));

/* Auxiliares */

async function buscarVenda(saleId, storeId) {
  const { rows } = await db.query('SELECT * FROM sales WHERE id = $1 AND store_id = $2', [saleId, storeId]);
  return rows[0] || null;
}

function calcularResultado(venda, custos) {
  const valor = Number(venda.valor);
  const custoVeiculo = Number(venda.custo_veiculo || 0);
  const comissao = Number(venda.comissao || 0);
  const posVenda = custos.reduce((a, c) => a + Number(c.valor), 0);

  const lucroBruto = valor - custoVeiculo - comissao;
  const lucroReal = lucroBruto - posVenda;

  return {
    valorVenda: valor,
    custoVeiculo,
    comissao,
    posVenda,
    lucroBruto,
    lucroReal,
    margemBruta: custoVeiculo ? (lucroBruto / custoVeiculo) * 100 : null,
    margemReal: custoVeiculo ? (lucroReal / custoVeiculo) * 100 : null,
    percentualConsumidoPelaGarantia: lucroBruto > 0 ? (posVenda / lucroBruto) * 100 : null,
  };
}

// GET /api/sales/warranty-stats -> indicadores de garantia da loja
async function estatisticasGarantia(storeId) {
  const { rows } = await db.query(
    `SELECT
       COUNT(DISTINCT s.id)                                        AS total_vendas,
       COUNT(DISTINCT p.sale_id) FILTER (WHERE p.tipo = 'garantia') AS vendas_com_garantia,
       COALESCE(SUM(p.valor), 0)                                    AS total_pos_venda,
       COALESCE(SUM(s.valor - s.custo_veiculo - s.comissao), 0)      AS lucro_bruto
     FROM sales s
     LEFT JOIN post_sale_costs p ON p.sale_id = s.id
     WHERE s.store_id = $1`,
    [storeId]
  );
  const r = rows[0];
  const totalVendas = Number(r.total_vendas);
  const comGarantia = Number(r.vendas_com_garantia);
  const totalPosVenda = Number(r.total_pos_venda);
  const lucroBruto = Number(r.lucro_bruto);

  return {
    totalVendas,
    vendasComGarantia: comGarantia,
    taxaAcionamento: totalVendas ? (comGarantia / totalVendas) * 100 : 0,
    custoMedioPorAcionamento: comGarantia ? totalPosVenda / comGarantia : 0,
    totalPosVenda,
    lucroBruto,
    lucroReal: lucroBruto - totalPosVenda,
    impactoNaMargem: lucroBruto > 0 ? (totalPosVenda / lucroBruto) * 100 : 0,
  };
}

module.exports = { router, estatisticasGarantia, calcularResultado };
