const express = require('express');
const db = require('../db');
const { asyncRoute, paraNumero, paraDataISO } = require('../helpers');

const router = express.Router();

function mapear(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    desc: row.descricao,
    cat: row.categoria,
    valor: Number(row.valor),
    data: row.data_lanc,
    pago: row.pago,
    vencimento: row.vencimento,
    // Nulo = insumo da loja. Preenchido = custo daquele veiculo.
    veiculoId: row.vehicle_id,
    veiculo: row.veiculo_nome || null,
    vendaId: row.sale_id,
  };
}

// Traz o nome do veiculo junto, para a tela nao ter que cruzar na mao
const SELECT_BASE = `
  SELECT f.*,
         CASE WHEN v.id IS NULL THEN NULL
              ELSE CONCAT(v.marca, ' ', v.modelo, COALESCE(' · ' || v.placa, ''))
         END AS veiculo_nome
    FROM finance_entries f
    LEFT JOIN vehicles v ON v.id = f.vehicle_id
`;

// GET /api/finance?tipo=entrada&pago=false
router.get('/', asyncRoute(async (req, res) => {
  const condicoes = ['f.store_id = $1'];
  const valores = [req.user.storeId];

  if (req.query.tipo) {
    valores.push(req.query.tipo);
    condicoes.push(`f.tipo = $${valores.length}`);
  }
  if (req.query.pago !== undefined) {
    valores.push(req.query.pago === 'true');
    condicoes.push(`f.pago = $${valores.length}`);
  }
  if (req.query.veiculoId) {
    valores.push(req.query.veiculoId);
    condicoes.push(`f.vehicle_id = $${valores.length}`);
  }

  const { rows } = await db.query(
    `${SELECT_BASE} WHERE ${condicoes.join(' AND ')} ORDER BY f.data_lanc DESC, f.id DESC`,
    valores
  );
  res.json(rows.map(mapear));
}));

// GET /api/finance/report?mes=2026-08 -> fechamento do mes, disponivel a
// qualquer momento (nao precisa esperar o mes acabar)
router.get('/report', asyncRoute(async (req, res) => {
  // Aceita "2026-08"; sem parametro, usa o mes corrente
  const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? `${req.query.mes}-01` : null;

  const params = [req.user.storeId, mes];
  const filtroMes = `date_trunc('month', f.data_lanc) = date_trunc('month', COALESCE($2::date, CURRENT_DATE))`;

  const { rows: totais } = await db.query(
    `SELECT
       COALESCE(SUM(f.valor) FILTER (WHERE f.tipo='entrada' AND f.pago), 0)  AS entradas,
       COALESCE(SUM(f.valor) FILTER (WHERE f.tipo='saida'   AND f.pago), 0)  AS saidas,
       COALESCE(SUM(f.valor) FILTER (WHERE f.tipo='saida'   AND f.pago AND f.vehicle_id IS NOT NULL), 0) AS custo_veiculos,
       COALESCE(SUM(f.valor) FILTER (WHERE f.tipo='saida'   AND f.pago AND f.vehicle_id IS NULL), 0)     AS custo_insumos,
       COALESCE(SUM(f.valor) FILTER (WHERE f.tipo='saida'   AND NOT f.pago), 0)   AS a_pagar,
       COALESCE(SUM(f.valor) FILTER (WHERE f.tipo='entrada' AND NOT f.pago), 0)   AS a_receber
     FROM finance_entries f
     WHERE f.store_id = $1 AND ${filtroMes}`,
    params
  );

  const { rows: categorias } = await db.query(
    `SELECT COALESCE(f.categoria, 'Sem categoria') AS categoria,
            SUM(f.valor) AS total,
            f.vehicle_id IS NOT NULL AS de_veiculo
       FROM finance_entries f
      WHERE f.store_id = $1 AND f.tipo = 'saida' AND f.pago AND ${filtroMes}
      GROUP BY 1, 3 ORDER BY 2 DESC`,
    params
  );

  const t = totais[0];
  res.json({
    entradas: Number(t.entradas),
    saidas: Number(t.saidas),
    custoVeiculos: Number(t.custo_veiculos),
    custoInsumos: Number(t.custo_insumos),
    resultado: Number(t.entradas) - Number(t.saidas),
    aPagar: Number(t.a_pagar),
    aReceber: Number(t.a_receber),
    categorias: categorias.map((c) => ({
      categoria: c.categoria, total: Number(c.total), deVeiculo: c.de_veiculo,
    })),
  });
}));

// GET /api/finance/summary
router.get('/summary', asyncRoute(async (req, res) => {
  const { rows } = await db.query(
    `SELECT
       COALESCE(SUM(valor) FILTER (WHERE tipo = 'entrada'), 0) AS entradas,
       COALESCE(SUM(valor) FILTER (WHERE tipo = 'saida'), 0)   AS saidas,
       COALESCE(SUM(valor) FILTER (WHERE tipo = 'saida' AND pago = false), 0)   AS a_pagar,
       COALESCE(SUM(valor) FILTER (WHERE tipo = 'entrada' AND pago = false), 0) AS a_receber
     FROM finance_entries WHERE store_id = $1`,
    [req.user.storeId]
  );
  const r = rows[0];
  res.json({
    entradas: Number(r.entradas),
    saidas: Number(r.saidas),
    saldo: Number(r.entradas) - Number(r.saidas),
    aPagar: Number(r.a_pagar),
    aReceber: Number(r.a_receber),
  });
}));

// POST /api/finance
router.post('/', asyncRoute(async (req, res) => {
  const b = req.body;
  if (!b.desc || !b.valor || !b.tipo) {
    return res.status(400).json({ erro: 'Informe tipo, descrição e valor do lançamento.' });
  }
  if (!['entrada', 'saida'].includes(b.tipo)) {
    return res.status(400).json({ erro: 'O tipo deve ser "entrada" ou "saida".' });
  }

  // Só aceita direcionar para um veículo da própria loja
  let veiculoId = null;
  if (b.veiculoId) {
    const { rows: v } = await db.query(
      'SELECT id FROM vehicles WHERE id = $1 AND store_id = $2',
      [b.veiculoId, req.user.storeId]
    );
    if (!v[0]) return res.status(400).json({ erro: 'Veículo não encontrado nesta loja.' });
    veiculoId = v[0].id;
  }

  const { rows } = await db.query(
    `INSERT INTO finance_entries (store_id, tipo, descricao, categoria, valor, data_lanc, pago, vencimento, vehicle_id)
     VALUES ($1,$2,$3,$4,$5, COALESCE($6, CURRENT_DATE), $7, $8, $9) RETURNING *`,
    [
      req.user.storeId, b.tipo, b.desc, b.cat || null, paraNumero(b.valor),
      paraDataISO(b.data), b.pago === undefined ? true : !!b.pago, paraDataISO(b.vencimento),
      veiculoId,
    ]
  );

  // Devolve já com o nome do veículo, para a tela não precisar recarregar
  const { rows: completo } = await db.query(`${SELECT_BASE} WHERE f.id = $1`, [rows[0].id]);
  res.status(201).json(mapear(completo[0]));
}));

// PATCH /api/finance/:id/pagar -> baixa uma conta a pagar ou a receber
router.patch('/:id/pagar', asyncRoute(async (req, res) => {
  const { rows } = await db.query(
    `UPDATE finance_entries
        SET pago = $1,
            data_lanc = CASE WHEN $1 THEN COALESCE($2::date, CURRENT_DATE) ELSE data_lanc END
      WHERE id = $3 AND store_id = $4 RETURNING id`,
    [req.body.pago === false ? false : true, paraDataISO(req.body.data), req.params.id, req.user.storeId]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Lançamento não encontrado.' });

  const { rows: completo } = await db.query(`${SELECT_BASE} WHERE f.id = $1`, [rows[0].id]);
  res.json(mapear(completo[0]));
}));

// DELETE /api/finance/:id
router.delete('/:id', asyncRoute(async (req, res) => {
  // Lançamento gerado por uma venda não se apaga solto: ele some quando a
  // venda é desfeita. Apagar só ele deixaria o financeiro sem a entrada da
  // venda que continua registrada.
  const { rows: alvo } = await db.query(
    'SELECT sale_id FROM finance_entries WHERE id = $1 AND store_id = $2',
    [req.params.id, req.user.storeId]
  );
  if (!alvo[0]) return res.status(404).json({ erro: 'Lançamento não encontrado.' });
  if (alvo[0].sale_id) {
    return res.status(409).json({
      erro: 'Este lançamento pertence a uma venda.',
      detalhe: 'Para removê-lo, desfaça a venda na tela de Vendas.',
    });
  }

  await db.query('DELETE FROM finance_entries WHERE id = $1 AND store_id = $2', [req.params.id, req.user.storeId]);
  res.status(204).end();
}));

module.exports = router;
