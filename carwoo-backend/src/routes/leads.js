const express = require('express');
const db = require('../db');
const { asyncRoute, buildUpdate } = require('../helpers');

const router = express.Router();

const ETAPAS = ['novo', 'contato', 'negociacao', 'proposta', 'ganho', 'perdido'];

function mapear(row) {
  return {
    id: row.id,
    nome: row.nome,
    telefone: row.telefone,
    email: row.email,
    veiculoId: row.veiculo_id,
    origem: row.origem,
    etapa: row.etapa,
    vendedorId: row.vendedor_id,
    vendedor: row.vendedor_nome || null,
    observacoes: row.observacoes,
    criadoEm: row.criado_em,
  };
}

// GET /api/leads?etapa=novo
router.get('/', asyncRoute(async (req, res) => {
  const condicoes = ['l.store_id = $1'];
  const valores = [req.user.storeId];
  if (req.query.etapa) {
    valores.push(req.query.etapa);
    condicoes.push(`l.etapa = $${valores.length}`);
  }
  const { rows } = await db.query(
    `SELECT l.*, u.nome AS vendedor_nome
       FROM leads l
       LEFT JOIN users u ON u.id = l.vendedor_id
      WHERE ${condicoes.join(' AND ')}
      ORDER BY l.criado_em DESC`,
    valores
  );
  res.json(rows.map(mapear));
}));

// POST /api/leads
router.post('/', asyncRoute(async (req, res) => {
  const b = req.body;
  if (!b.nome) return res.status(400).json({ erro: 'Informe o nome do cliente.' });
  if (b.etapa && !ETAPAS.includes(b.etapa)) {
    return res.status(400).json({ erro: 'Etapa inválida.' });
  }

  const { rows } = await db.query(
    `INSERT INTO leads (store_id, nome, telefone, email, veiculo_id, origem, etapa, vendedor_id, observacoes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      req.user.storeId, b.nome, b.telefone || null, b.email || null,
      b.veiculoId || null, b.origem || 'manual', b.etapa || 'novo',
      b.vendedorId || req.user.id, b.observacoes || null,
    ]
  );
  res.status(201).json(mapear(rows[0]));
}));

// PUT /api/leads/:id  (usado também para arrastar no kanban)
router.put('/:id', asyncRoute(async (req, res) => {
  const b = req.body;
  if (b.etapa && !ETAPAS.includes(b.etapa)) {
    return res.status(400).json({ erro: 'Etapa inválida.' });
  }
  const campos = {
    nome: b.nome, telefone: b.telefone, email: b.email,
    veiculo_id: b.veiculoId, origem: b.origem, etapa: b.etapa,
    vendedor_id: b.vendedorId, observacoes: b.observacoes,
    atualizado_em: new Date(),
  };
  const update = buildUpdate('leads', campos, 'id = $a AND store_id = $b', [req.params.id, req.user.storeId]);
  if (!update) return res.status(400).json({ erro: 'Nenhum campo enviado para atualizar.' });

  const { rows } = await db.query(update.sql, update.valores);
  if (!rows[0]) return res.status(404).json({ erro: 'Lead não encontrado.' });
  res.json(mapear(rows[0]));
}));

// DELETE /api/leads/:id
router.delete('/:id', asyncRoute(async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM leads WHERE id = $1 AND store_id = $2', [req.params.id, req.user.storeId]);
  if (!rowCount) return res.status(404).json({ erro: 'Lead não encontrado.' });
  res.status(204).end();
}));

module.exports = router;
