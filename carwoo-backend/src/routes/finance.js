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
  };
}

// GET /api/finance?tipo=entrada&pago=false
router.get('/', asyncRoute(async (req, res) => {
  const condicoes = ['store_id = $1'];
  const valores = [req.user.storeId];

  if (req.query.tipo) {
    valores.push(req.query.tipo);
    condicoes.push(`tipo = $${valores.length}`);
  }
  if (req.query.pago !== undefined) {
    valores.push(req.query.pago === 'true');
    condicoes.push(`pago = $${valores.length}`);
  }

  const { rows } = await db.query(
    `SELECT * FROM finance_entries WHERE ${condicoes.join(' AND ')} ORDER BY data_lanc DESC, id DESC`,
    valores
  );
  res.json(rows.map(mapear));
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

  const { rows } = await db.query(
    `INSERT INTO finance_entries (store_id, tipo, descricao, categoria, valor, data_lanc, pago, vencimento)
     VALUES ($1,$2,$3,$4,$5, COALESCE($6, CURRENT_DATE), $7, $8) RETURNING *`,
    [
      req.user.storeId, b.tipo, b.desc, b.cat || null, paraNumero(b.valor),
      paraDataISO(b.data), b.pago === undefined ? true : !!b.pago, paraDataISO(b.vencimento),
    ]
  );
  res.status(201).json(mapear(rows[0]));
}));

// DELETE /api/finance/:id
router.delete('/:id', asyncRoute(async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM finance_entries WHERE id = $1 AND store_id = $2', [req.params.id, req.user.storeId]);
  if (!rowCount) return res.status(404).json({ erro: 'Lançamento não encontrado.' });
  res.status(204).end();
}));

module.exports = router;
