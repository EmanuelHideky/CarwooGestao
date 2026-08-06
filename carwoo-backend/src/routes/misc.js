const express = require('express');
const db = require('../db');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { asyncRoute, buildUpdate, paraNumero } = require('../helpers');
const { exigirPermissao } = require('../middleware/role');

const tasks = express.Router();
const comparables = express.Router();
const integrations = express.Router();
const team = express.Router();

/* ============================ TAREFAS ============================ */

function mapearTarefa(row) {
  return {
    id: row.id,
    titulo: row.titulo,
    tipo: row.tipo,
    leadId: row.lead_id,
    responsavelId: row.responsavel_id,
    responsavel: row.responsavel_nome || null,
    prazo: row.prazo,
    concluida: row.concluida,
  };
}

tasks.get('/', asyncRoute(async (req, res) => {
  const condicoes = ['t.store_id = $1'];
  const valores = [req.user.storeId];
  if (req.query.concluida !== undefined) {
    valores.push(req.query.concluida === 'true');
    condicoes.push(`t.concluida = $${valores.length}`);
  }
  const { rows } = await db.query(
    `SELECT t.*, u.nome AS responsavel_nome
       FROM tasks t LEFT JOIN users u ON u.id = t.responsavel_id
      WHERE ${condicoes.join(' AND ')}
      ORDER BY t.concluida, t.prazo NULLS LAST, t.id DESC`,
    valores
  );
  res.json(rows.map(mapearTarefa));
}));

tasks.post('/', asyncRoute(async (req, res) => {
  const b = req.body;
  if (!b.titulo) return res.status(400).json({ erro: 'Descreva o que precisa ser feito.' });
  const { rows } = await db.query(
    `INSERT INTO tasks (store_id, titulo, tipo, lead_id, responsavel_id, prazo)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.storeId, b.titulo, b.tipo || 'followup', b.leadId || null, b.responsavelId || req.user.id, b.prazo || null]
  );
  res.status(201).json(mapearTarefa(rows[0]));
}));

tasks.put('/:id', asyncRoute(async (req, res) => {
  const b = req.body;
  const campos = {
    titulo: b.titulo, tipo: b.tipo, lead_id: b.leadId,
    responsavel_id: b.responsavelId, prazo: b.prazo, concluida: b.concluida,
  };
  const update = buildUpdate('tasks', campos, 'id = $a AND store_id = $b', [req.params.id, req.user.storeId]);
  if (!update) return res.status(400).json({ erro: 'Nenhum campo enviado para atualizar.' });
  const { rows } = await db.query(update.sql, update.valores);
  if (!rows[0]) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  res.json(mapearTarefa(rows[0]));
}));

tasks.delete('/:id', asyncRoute(async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM tasks WHERE id = $1 AND store_id = $2', [req.params.id, req.user.storeId]);
  if (!rowCount) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
  res.status(204).end();
}));

/* ================= COMPARÁVEIS / VALOR DE MERCADO ================= */

function mapearComparavel(row) {
  return {
    id: row.id, modelo: row.modelo, ano: row.ano, km: row.km,
    preco: Number(row.preco), portal: row.portal, cidade: row.cidade,
  };
}

comparables.get('/', asyncRoute(async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM comparables WHERE store_id = $1 ORDER BY criado_em DESC',
    [req.user.storeId]
  );
  res.json(rows.map(mapearComparavel));
}));

comparables.post('/', asyncRoute(async (req, res) => {
  const b = req.body;
  if (!b.modelo || !b.preco) {
    return res.status(400).json({ erro: 'Informe ao menos o modelo e o preço anunciado.' });
  }
  const { rows } = await db.query(
    `INSERT INTO comparables (store_id, modelo, ano, km, preco, portal, cidade)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user.storeId, b.modelo, b.ano || null, paraNumero(b.km) || 0, paraNumero(b.preco), b.portal || null, b.cidade || null]
  );
  res.status(201).json(mapearComparavel(rows[0]));
}));

comparables.delete('/:id', asyncRoute(async (req, res) => {
  const { rowCount } = await db.query('DELETE FROM comparables WHERE id = $1 AND store_id = $2', [req.params.id, req.user.storeId]);
  if (!rowCount) return res.status(404).json({ erro: 'Anúncio não encontrado.' });
  res.status(204).end();
}));

// GET /api/comparables/stats?modelo=Argo
comparables.get('/stats', asyncRoute(async (req, res) => {
  const valores = [req.user.storeId];
  let filtro = '';
  if (req.query.modelo) {
    valores.push(`%${req.query.modelo}%`);
    filtro = ` AND modelo ILIKE $${valores.length}`;
  }
  const { rows } = await db.query(
    `SELECT preco FROM comparables WHERE store_id = $1${filtro} ORDER BY preco`,
    valores
  );
  if (!rows.length) return res.json({ total: 0 });

  const precos = rows.map((r) => Number(r.preco));
  const meio = Math.floor(precos.length / 2);
  const mediana = precos.length % 2 ? precos[meio] : (precos[meio - 1] + precos[meio]) / 2;
  res.json({
    total: precos.length,
    min: precos[0],
    max: precos[precos.length - 1],
    mediana,
    media: precos.reduce((a, b) => a + b, 0) / precos.length,
  });
}));

/* ======================== INTEGRAÇÕES ======================== */

integrations.get('/', asyncRoute(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM integrations WHERE store_id = $1', [req.user.storeId]);
  // Nunca devolve a credencial em si, apenas se existe
  res.json(rows.map((r) => ({
    id: r.portal_id,
    conectado: r.conectado,
    temCredencial: !!r.credencial,
    ultimaSync: r.ultima_sync,
  })));
}));

integrations.put('/:portalId', asyncRoute(async (req, res) => {
  const b = req.body;
  const { rows } = await db.query(
    `INSERT INTO integrations (store_id, portal_id, conectado, credencial)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (store_id, portal_id) DO UPDATE
       SET conectado = EXCLUDED.conectado,
           credencial = COALESCE(EXCLUDED.credencial, integrations.credencial)
     RETURNING *`,
    [req.user.storeId, req.params.portalId, !!b.conectado, b.credencial || null]
  );
  const r = rows[0];
  res.json({ id: r.portal_id, conectado: r.conectado, temCredencial: !!r.credencial, ultimaSync: r.ultima_sync });
}));

/* ========================== EQUIPE ========================== */

// POST /api/team -> cria um membro da equipe
team.post('/', exigirPermissao('equipe'), asyncRoute(async (req, res) => {
  const { nome, email, perfil, cargo, senha, meta } = req.body;
  if (!nome || !email) return res.status(400).json({ erro: 'Informe nome e e-mail.' });
  if (!['dono', 'gerente', 'vendedor'].includes(perfil || 'vendedor')) {
    return res.status(400).json({ erro: 'Perfil inválido.' });
  }

  const senhaEscolhida = senha || crypto.randomBytes(6).toString('base64url');
  if (senhaEscolhida.length < 8) {
    return res.status(400).json({ erro: 'A senha precisa de ao menos 8 caracteres.' });
  }

  const jaExiste = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (jaExiste.rows[0]) return res.status(409).json({ erro: 'Já existe um usuário com este e-mail.' });

  const senhaHash = await bcrypt.hash(senhaEscolhida, 10);
  const { rows } = await db.query(
    `INSERT INTO users (store_id, nome, email, senha_hash, cargo, perfil, meta_mensal)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, nome, email, cargo, perfil, meta_mensal`,
    [req.user.storeId, nome, email, senhaHash, cargo || 'Vendedor', perfil || 'vendedor', Number(meta) || 8]
  );

  // Devolve a senha só quando foi gerada aqui, para o dono repassar ao funcionário
  res.status(201).json({
    membro: rows[0],
    senhaProvisoria: senha ? null : senhaEscolhida,
    aviso: senha ? null : 'Anote esta senha e repasse ao funcionário. Ela não será mostrada de novo.',
  });
}));

// PUT /api/team/:id -> muda perfil, cargo ou meta
team.put('/:id', exigirPermissao('equipe'), asyncRoute(async (req, res) => {
  const b = req.body;
  if (b.perfil && !['dono', 'gerente', 'vendedor'].includes(b.perfil)) {
    return res.status(400).json({ erro: 'Perfil inválido.' });
  }

  // Impede a loja ficar sem nenhum dono
  if (b.perfil && b.perfil !== 'dono') {
    const donos = await db.query(
      "SELECT COUNT(*)::int AS total FROM users WHERE store_id = $1 AND perfil = 'dono' AND ativo = true AND id <> $2",
      [req.user.storeId, req.params.id]
    );
    if (donos.rows[0].total === 0) {
      return res.status(400).json({ erro: 'A loja precisa ter ao menos um dono. Promova outra pessoa antes.' });
    }
  }

  const campos = { nome: b.nome, cargo: b.cargo, perfil: b.perfil, meta_mensal: b.meta, ativo: b.ativo };
  const update = buildUpdate('users', campos, 'id = $a AND store_id = $b', [req.params.id, req.user.storeId]);
  if (!update) return res.status(400).json({ erro: 'Nenhum campo enviado.' });

  const { rows } = await db.query(update.sql, update.valores);
  if (!rows[0]) return res.status(404).json({ erro: 'Membro não encontrado.' });
  delete rows[0].senha_hash;
  res.json(rows[0]);
}));

// DELETE /api/team/:id -> desativa o acesso (não apaga, para preservar o histórico de vendas)
team.delete('/:id', exigirPermissao('equipe'), asyncRoute(async (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ erro: 'Você não pode remover o próprio acesso.' });
  }
  const { rowCount } = await db.query(
    'UPDATE users SET ativo = false WHERE id = $1 AND store_id = $2',
    [req.params.id, req.user.storeId]
  );
  if (!rowCount) return res.status(404).json({ erro: 'Membro não encontrado.' });
  res.status(204).end();
}));

team.get('/', asyncRoute(async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.nome, u.email, u.cargo, u.perfil, u.meta_mensal, u.ativo,
            COUNT(s.id) FILTER (WHERE date_trunc('month', s.data_venda) = date_trunc('month', CURRENT_DATE)) AS vendas_mes,
            COALESCE(SUM(s.comissao) FILTER (WHERE date_trunc('month', s.data_venda) = date_trunc('month', CURRENT_DATE)), 0) AS comissao_mes
       FROM users u
       LEFT JOIN sales s ON s.vendedor_id = u.id
      WHERE u.store_id = $1 AND u.ativo = true
      GROUP BY u.id
      ORDER BY vendas_mes DESC`,
    [req.user.storeId]
  );
  res.json(rows.map((r) => ({
    id: r.id, nome: r.nome, email: r.email, cargo: r.cargo, perfil: r.perfil, meta: r.meta_mensal,
    vendas: Number(r.vendas_mes), comissao: Number(r.comissao_mes),
  })));
}));

module.exports = { tasks, comparables, integrations, team };
