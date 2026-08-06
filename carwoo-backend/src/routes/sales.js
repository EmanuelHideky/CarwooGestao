const express = require('express');
const db = require('../db');
const { asyncRoute, paraNumero, paraDataISO } = require('../helpers');
const { filtrarVenda, filtroDeVendas, pode } = require('../middleware/role');
const { cpfValido, apenasDigitos } = require('../validadores');

const router = express.Router();

function mapear(row) {
  return {
    id: row.id,
    veiculoId: row.veiculo_id,
    veiculo: row.veiculo_nome || null,
    leadId: row.lead_id,
    vendedorId: row.vendedor_id,
    vendedor: row.vendedor_nome || null,
    cliente: row.cliente_nome,
    telefone: row.telefone,
    cpf: row.cpf,
    email: row.email,
    valor: Number(row.valor),
    fipeVenda: row.fipe_venda === null ? null : Number(row.fipe_venda),
    // Sem o custo do veiculo nao ha como calcular lucro nem margem depois
    // que a pagina recarrega. A coluna existia, mas ninguem gravava nela.
    custoVeiculo: row.custo_veiculo === null || row.custo_veiculo === undefined
      ? 0 : Number(row.custo_veiculo),
    comissao: Number(row.comissao),
    pagamento: row.forma_pagamento,
    data: row.data_venda,
    garantiaDias: row.garantia_dias,
    garantiaAte: row.garantia_ate,
    garantiaBaixada: row.garantia_baixada === true,
    garantiaBaixadaEm: row.garantia_baixada_em || null,
    // Nome igual ao que a tela usa, para nao virar dois campos diferentes
    garantiaBaixaAutomatica: row.garantia_baixa_auto === true,
    garantiaAvisada: row.garantia_avisada === true,
    custosPosVenda: [],
  };
}

/** Anexa os custos de garantia de cada venda, em uma consulta so. */
async function comCustosPosVenda(vendas) {
  if (!vendas.length) return vendas;
  const { rows } = await db.query(
    `SELECT id, sale_id, tipo, descricao, valor, data_custo
       FROM post_sale_costs WHERE sale_id = ANY($1::int[]) ORDER BY id`,
    [vendas.map((v) => v.id)]
  );
  const porVenda = new Map();
  for (const c of rows) {
    if (!porVenda.has(c.sale_id)) porVenda.set(c.sale_id, []);
    porVenda.get(c.sale_id).push({
      id: c.id, tipo: c.tipo, desc: c.descricao,
      valor: Number(c.valor), data: c.data_custo,
    });
  }
  for (const v of vendas) v.custosPosVenda = porVenda.get(v.id) || [];
  return vendas;
}

const SELECT_BASE = `
  SELECT s.*,
         u.nome AS vendedor_nome,
         CONCAT(v.marca, ' ', v.modelo, ' ', v.ano_fab, '/', v.ano_mod) AS veiculo_nome
    FROM sales s
    LEFT JOIN users u    ON u.id = s.vendedor_id
    LEFT JOIN vehicles v ON v.id = s.veiculo_id
`;

// GET /api/sales
router.get('/', asyncRoute(async (req, res) => {
  // Vendedor só enxerga as próprias vendas
  const restricao = filtroDeVendas(req, 2);
  const { rows } = await db.query(
    `${SELECT_BASE} WHERE s.store_id = $1${restricao.sql} ORDER BY s.data_venda DESC`,
    [req.user.storeId, ...restricao.valores]
  );
  const vendas = await comCustosPosVenda(rows.map(mapear));
  res.json(vendas.map((v) => filtrarVenda(v, req)));
}));

// POST /api/sales  -> registra a venda e marca o veículo como vendido
router.post('/', asyncRoute(async (req, res) => {
  const b = req.body;
  // Sem comprador identificado a venda nao serve para nada: nao da para
  // acionar garantia, emitir nota nem transferir o veiculo.
  if (!b.clienteNome || !String(b.clienteNome).trim()) {
    return res.status(400).json({ erro: 'Informe o nome do comprador.' });
  }
  if (!b.telefone || apenasDigitos(b.telefone).length < 10) {
    return res.status(400).json({ erro: 'Informe o telefone do comprador com DDD.' });
  }
  if (!b.valor) {
    return res.status(400).json({ erro: 'Informe o valor da venda.' });
  }
  if (b.cpf && !cpfValido(apenasDigitos(b.cpf))) {
    return res.status(400).json({ erro: 'O CPF informado é inválido.' });
  }

  const cliente = await db.pool.connect();
  try {
    await cliente.query('BEGIN');

    const { rows } = await cliente.query(
      `INSERT INTO sales (store_id, veiculo_id, lead_id, vendedor_id, cliente_nome, telefone,
                          cpf, email,
                          valor, fipe_venda, custo_veiculo, comissao, forma_pagamento, data_venda,
                          garantia_dias, garantia_ate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, COALESCE($14, CURRENT_DATE),$15,$16) RETURNING *`,
      [
        req.user.storeId, b.veiculoId || null, b.leadId || null,
        b.vendedorId || req.user.id, b.clienteNome, b.telefone || null,
        b.cpf ? String(b.cpf).replace(/\D/g, '') : null, b.email || null,
        paraNumero(b.valor), paraNumero(b.fipeVenda),
        // Guarda o custo no momento da venda. Nao da para calcular depois a
        // partir do veiculo, porque a preparacao pode mudar com o tempo.
        paraNumero(b.custoVeiculo) || 0,
        paraNumero(b.comissao) || 0,
        b.pagamento || 'A vista', paraDataISO(b.data),
        paraNumero(b.garantiaDias), paraDataISO(b.garantiaAte),
      ]
    );

    if (b.veiculoId) {
      await cliente.query(
        `UPDATE vehicles SET status = 'vendido', atualizado_em = now() WHERE id = $1 AND store_id = $2`,
        [b.veiculoId, req.user.storeId]
      );
    }
    if (b.leadId) {
      await cliente.query(
        `UPDATE leads SET etapa = 'ganho', atualizado_em = now() WHERE id = $1 AND store_id = $2`,
        [b.leadId, req.user.storeId]
      );
    }
    // Lança a entrada no financeiro
    await cliente.query(
      `INSERT INTO finance_entries (store_id, tipo, descricao, categoria, valor, data_lanc)
       VALUES ($1,'entrada',$2,'Venda de veículo',$3, COALESCE($4, CURRENT_DATE))`,
      [req.user.storeId, `Venda - ${b.clienteNome}`, paraNumero(b.valor), paraDataISO(b.data)]
    );

    await cliente.query('COMMIT');
    res.status(201).json(mapear(rows[0]));
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}));

// PUT /api/sales/:id/warranty -> grava o estado da garantia
//
// A baixa (automatica pelo prazo, ou manual) acontecia so no navegador: as
// colunas existiam no banco e ninguem escrevia nelas. Ao recarregar a pagina,
// toda garantia voltava aberta e a baixa automatica rodava de novo.
router.put('/:id/warranty', asyncRoute(async (req, res) => {
  const b = req.body;
  const { rows } = await db.query(
    `UPDATE sales
        SET garantia_baixada    = COALESCE($1, garantia_baixada),
            garantia_baixada_em = $2,
            garantia_baixa_auto = COALESCE($3, garantia_baixa_auto),
            garantia_avisada    = COALESCE($4, garantia_avisada),
            garantia_dias       = COALESCE($5, garantia_dias),
            garantia_ate        = COALESCE($6, garantia_ate)
      WHERE id = $7 AND store_id = $8
      RETURNING *`,
    [
      b.garantiaBaixada === undefined ? null : !!b.garantiaBaixada,
      paraDataISO(b.garantiaBaixadaEm),
      b.garantiaBaixaAutomatica === undefined ? null : !!b.garantiaBaixaAutomatica,
      b.garantiaAvisada === undefined ? null : !!b.garantiaAvisada,
      paraNumero(b.garantiaDias),
      paraDataISO(b.garantiaAte),
      req.params.id, req.user.storeId,
    ]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Venda não encontrada.' });
  res.json(filtrarVenda(mapear(rows[0]), req));
}));

// GET /api/sales/market-index
// Índice da praça: quanto suas vendas fecharam em relação à FIPE da época.
router.get('/market-index', asyncRoute(async (req, res) => {
  if (!pode(req, 'precificacao')) return res.status(403).json({ erro: 'Seu perfil não tem acesso a esta informação.' });
  const { rows } = await db.query(
    `SELECT valor, fipe_venda FROM sales
      WHERE store_id = $1 AND fipe_venda IS NOT NULL AND fipe_venda > 0`,
    [req.user.storeId]
  );
  if (!rows.length) {
    return res.json({ indice: null, amostra: 0, mensagem: 'Registre vendas com o valor FIPE da época para calcular o índice da sua praça.' });
  }
  const razoes = rows.map((r) => Number(r.valor) / Number(r.fipe_venda));
  const indice = razoes.reduce((a, b) => a + b, 0) / razoes.length;
  res.json({ indice, amostra: rows.length, percentual: indice * 100 });
}));

// GET /api/sales/warranty-stats -> taxa de acionamento e impacto da garantia
router.get('/warranty-stats', asyncRoute(async (req, res) => {
  if (!pode(req, 'margens')) return res.status(403).json({ erro: 'Seu perfil não tem acesso a esta informação.' });
  const { estatisticasGarantia } = require('./postsale');
  res.json(await estatisticasGarantia(req.user.storeId));
}));

module.exports = router;
