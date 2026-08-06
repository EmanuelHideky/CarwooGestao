const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncRoute } = require('../helpers');

const router = express.Router();

const PORTAIS_ACEITOS = ['webmotors', 'olx', 'mercadolivre', 'mobiauto', 'icarros', 'facebook', 'whatsapp', 'instagram', 'site', 'email'];

/* ==============================================================
   ENTRADA DE LEADS (rota pública, autenticada por token da loja)

   POST /api/inbound/:portal
   Header: x-carwoo-token: TOKEN_DA_LOJA
   Body:   { nome, telefone, email, mensagem, veiculoPlaca, externoId }

   Use esta rota para:
   - webhook do portal, quando o contrato oferecer esse recurso
   - encaminhamento de e-mail: um serviço como SendGrid Inbound Parse,
     Mailgun Routes ou Postmark recebe o e-mail de aviso do portal e
     chama esta rota com os dados já extraídos
   ============================================================== */
router.post('/:portal', asyncRoute(async (req, res) => {
  const portal = String(req.params.portal || '').toLowerCase();
  if (!PORTAIS_ACEITOS.includes(portal)) {
    return res.status(400).json({ erro: 'Portal não reconhecido.' });
  }

  const token = req.headers['x-carwoo-token'];
  if (!token) return res.status(401).json({ erro: 'Token de entrada ausente.' });

  const { rows: tokenRows } = await db.query('SELECT store_id FROM inbound_tokens WHERE token = $1', [token]);
  if (!tokenRows[0]) return res.status(401).json({ erro: 'Token de entrada inválido.' });
  const storeId = tokenRows[0].store_id;

  const b = req.body || {};
  const nome = (b.nome || '').trim();
  const telefone = String(b.telefone || '').replace(/\D/g, '');
  if (!nome && !telefone) {
    return res.status(400).json({ erro: 'O lead precisa ter ao menos nome ou telefone.' });
  }

  // Descobre o veículo pela placa ou pelo código enviado
  let veiculoId = null;
  if (b.veiculoPlaca) {
    const { rows } = await db.query(
      `SELECT id FROM vehicles WHERE store_id = $1 AND REPLACE(UPPER(placa),'-','') = $2 LIMIT 1`,
      [storeId, String(b.veiculoPlaca).toUpperCase().replace(/-/g, '')]
    );
    if (rows[0]) veiculoId = rows[0].id;
  }
  if (!veiculoId && b.veiculoId) veiculoId = Number(b.veiculoId) || null;

  const vendedorId = await escolherVendedor(storeId);

  // externo_id evita cadastrar o mesmo lead duas vezes se o portal reenviar
  const { rows, rowCount } = await db.query(
    `INSERT INTO leads (store_id, nome, telefone, email, veiculo_id, origem, etapa, vendedor_id, mensagem, externo_id, nao_lido)
     VALUES ($1,$2,$3,$4,$5,$6,'novo',$7,$8,$9,true)
     ON CONFLICT (store_id, externo_id) WHERE externo_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [storeId, nome || 'Contato sem nome', telefone || null, b.email || null,
     veiculoId, portal, vendedorId, b.mensagem || null, b.externoId || null]
  );

  if (!rowCount) {
    return res.status(200).json({ duplicado: true, mensagem: 'Este lead já havia sido recebido.' });
  }

  const lead = rows[0];

  // Notificação interna, que o app mostra no sino
  await db.query(
    `INSERT INTO notifications (store_id, tipo, titulo, texto, lead_id)
     VALUES ($1,'lead',$2,$3,$4)`,
    [storeId, `Novo lead: ${lead.nome}`, `${portal}${b.mensagem ? ' · ' + b.mensagem : ''}`, lead.id]
  );

  // Tarefa de retorno, para o lead não esfriar
  await db.query(
    `INSERT INTO tasks (store_id, titulo, tipo, lead_id, responsavel_id, prazo)
     VALUES ($1,$2,'followup',$3,$4, now() + INTERVAL '2 hours')`,
    [storeId, `Retornar contato de ${lead.nome}`, lead.id, vendedorId]
  );

  res.status(201).json({ recebido: true, leadId: lead.id });
}));

/* Rodízio: entrega ao vendedor com menos leads em aberto */
async function escolherVendedor(storeId) {
  const { rows } = await db.query(
    `SELECT u.id, COUNT(l.id) AS abertos
       FROM users u
       LEFT JOIN leads l ON l.vendedor_id = u.id AND l.etapa NOT IN ('ganho','perdido')
      WHERE u.store_id = $1 AND u.ativo = true
      GROUP BY u.id
      ORDER BY abertos ASC, u.id ASC
      LIMIT 1`,
    [storeId]
  );
  return rows[0] ? rows[0].id : null;
}

/* ==============================================================
   Daqui para baixo exige usuário autenticado
   ============================================================== */
router.use(requireAuth);

// GET /api/inbound/token -> mostra (ou cria) o token de entrada da loja
router.get('/config/token', asyncRoute(async (req, res) => {
  let { rows } = await db.query('SELECT token FROM inbound_tokens WHERE store_id = $1 LIMIT 1', [req.user.storeId]);

  if (!rows[0]) {
    const token = crypto.randomBytes(24).toString('hex');
    await db.query(
      'INSERT INTO inbound_tokens (token, store_id, descricao) VALUES ($1,$2,$3)',
      [token, req.user.storeId, 'Token principal de entrada de leads']
    );
    rows = [{ token }];
  }

  const base = process.env.PUBLIC_URL || 'https://seu-servidor.com.br';
  res.json({
    token: rows[0].token,
    exemploWebhook: `${base}/api/inbound/webmotors`,
    comoUsar: 'Envie POST com o header x-carwoo-token e o corpo { nome, telefone, email, mensagem, veiculoPlaca, externoId }.',
  });
}));

// POST /api/inbound/config/token/rotate -> gera um token novo e invalida o antigo
router.post('/config/token/rotate', asyncRoute(async (req, res) => {
  const token = crypto.randomBytes(24).toString('hex');
  await db.query('DELETE FROM inbound_tokens WHERE store_id = $1', [req.user.storeId]);
  await db.query(
    'INSERT INTO inbound_tokens (token, store_id, descricao) VALUES ($1,$2,$3)',
    [token, req.user.storeId, 'Token principal de entrada de leads']
  );
  res.json({ token, aviso: 'O token anterior deixou de funcionar. Atualize onde ele estava configurado.' });
}));

module.exports = router;
