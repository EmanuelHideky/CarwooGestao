const express = require('express');
const db = require('../db');
const { asyncRoute } = require('../helpers');

const router = express.Router();

function mapear(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    titulo: row.titulo,
    sub: row.texto,
    leadId: row.lead_id,
    lida: row.lida,
    criadoEm: row.criado_em,
  };
}

// GET /api/notifications?apenasNaoLidas=true
router.get('/', asyncRoute(async (req, res) => {
  const condicoes = ['store_id = $1'];
  const valores = [req.user.storeId];
  if (req.query.apenasNaoLidas === 'true') condicoes.push('lida = false');

  const { rows } = await db.query(
    `SELECT * FROM notifications WHERE ${condicoes.join(' AND ')} ORDER BY criado_em DESC LIMIT 50`,
    valores
  );
  const { rows: contagem } = await db.query(
    'SELECT COUNT(*)::int AS total FROM notifications WHERE store_id = $1 AND lida = false',
    [req.user.storeId]
  );
  res.json({ notificacoes: rows.map(mapear), naoLidas: contagem[0].total });
}));

// GET /api/notifications/poll?desde=ISO_DATE
// O app chama esta rota periodicamente para saber se chegou algo novo.
router.get('/poll', asyncRoute(async (req, res) => {
  const desde = req.query.desde || new Date(Date.now() - 5 * 60000).toISOString();
  const { rows } = await db.query(
    `SELECT n.*, l.nome AS lead_nome, l.telefone, l.origem, l.veiculo_id, l.mensagem
       FROM notifications n
       LEFT JOIN leads l ON l.id = n.lead_id
      WHERE n.store_id = $1 AND n.criado_em > $2
      ORDER BY n.criado_em ASC`,
    [req.user.storeId, desde]
  );
  res.json({
    novas: rows.map((r) => ({
      ...mapear(r),
      lead: r.lead_id ? {
        id: r.lead_id, nome: r.lead_nome, telefone: r.telefone,
        origem: r.origem, veiculoId: r.veiculo_id, mensagem: r.mensagem,
      } : null,
    })),
    agora: new Date().toISOString(),
  });
}));

// PUT /api/notifications/:id/read
router.put('/:id/read', asyncRoute(async (req, res) => {
  const { rows } = await db.query(
    'UPDATE notifications SET lida = true WHERE id = $1 AND store_id = $2 RETURNING *',
    [req.params.id, req.user.storeId]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Notificação não encontrada.' });
  res.json(mapear(rows[0]));
}));

// PUT /api/notifications/read-all
router.put('/read-all', asyncRoute(async (req, res) => {
  const { rowCount } = await db.query(
    'UPDATE notifications SET lida = true WHERE store_id = $1 AND lida = false',
    [req.user.storeId]
  );
  res.json({ atualizadas: rowCount });
}));

// POST /api/notifications/push-subscribe
// Guarda a inscrição do navegador para receber push com o app fechado.
// Requer VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no .env e a biblioteca web-push.
router.post('/push-subscribe', asyncRoute(async (req, res) => {
  const s = req.body || {};
  if (!s.endpoint) return res.status(400).json({ erro: 'Inscrição inválida.' });

  await db.query(
    `INSERT INTO push_subscriptions (store_id, user_id, endpoint, p256dh, auth)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [req.user.storeId, req.user.id, s.endpoint, s.keys?.p256dh || null, s.keys?.auth || null]
  );
  res.status(201).json({ inscrito: true });
}));

module.exports = router;
