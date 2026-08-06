const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncRoute } = require('../helpers');

const router = express.Router();

/* --------------------------------------------------------------
   ROTAS PUBLICAS
   -------------------------------------------------------------- */

// GET /api/billing/plans  -> tabela de precos (usada na pagina de vendas)
router.get('/plans', asyncRoute(async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM plans WHERE ativo = true ORDER BY ordem'
  );
  res.json(rows.map((p) => ({
    id: p.id,
    nome: p.nome,
    precoMensal: Number(p.preco_mensal),
    precoAnual: p.preco_anual === null ? null : Number(p.preco_anual),
    limiteVeiculos: p.limite_veiculos,
    limiteUsuarios: p.limite_usuarios,
    limitePortais: p.limite_portais,
    recursos: p.recursos,
  })));
}));

// POST /api/billing/webhook -> o gateway avisa pagamento aprovado, vencido etc.
// Publica de proposito: o gateway nao tem token de usuario.
router.post('/webhook', asyncRoute(async (req, res) => {
  const segredo = req.headers['x-webhook-secret'] || req.headers['asaas-access-token'];
  if (!process.env.BILLING_WEBHOOK_SECRET || segredo !== process.env.BILLING_WEBHOOK_SECRET) {
    return res.status(401).json({ erro: 'Assinatura do webhook inválida.' });
  }

  const { evento, cobrancaId, assinaturaId, status } = req.body;
  if (!evento) return res.status(400).json({ erro: 'Payload inválido.' });

  // Atualiza a cobrança
  if (cobrancaId && status) {
    await db.query(
      `UPDATE charges
          SET status = $1,
              pago_em = CASE WHEN $1 = 'paga' THEN now() ELSE pago_em END
        WHERE gateway_charge_id = $2`,
      [status, cobrancaId]
    );
  }

  // Reflete na assinatura
  if (assinaturaId) {
    let novoStatus = null;
    if (['paga', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(status) || evento === 'pagamento_aprovado') {
      novoStatus = 'ativa';
    } else if (['vencida', 'PAYMENT_OVERDUE'].includes(status) || evento === 'pagamento_vencido') {
      novoStatus = 'inadimplente';
    } else if (evento === 'assinatura_cancelada') {
      novoStatus = 'cancelada';
    }

    if (novoStatus) {
      await db.query(
        `UPDATE subscriptions
            SET status = $1,
                proxima_cobranca = CASE
                  WHEN $1 = 'ativa' AND ciclo = 'mensal' THEN CURRENT_DATE + INTERVAL '1 month'
                  WHEN $1 = 'ativa' AND ciclo = 'anual'  THEN CURRENT_DATE + INTERVAL '1 year'
                  ELSE proxima_cobranca END,
                cancelada_em = CASE WHEN $1 = 'cancelada' THEN now() ELSE cancelada_em END
          WHERE gateway_subscription_id = $2`,
        [novoStatus, assinaturaId]
      );
    }
  }

  res.json({ recebido: true });
}));

/* --------------------------------------------------------------
   Daqui para baixo exige usuario autenticado
   -------------------------------------------------------------- */
router.use(requireAuth);

// GET /api/billing/subscription -> plano atual, uso e limites da loja
router.get('/subscription', asyncRoute(async (req, res) => {
  res.json(await montarAssinatura(req.user.storeId));
}));

// POST /api/billing/subscribe -> escolhe um plano
router.post('/subscribe', asyncRoute(async (req, res) => {
  const { planId, ciclo } = req.body;
  if (!planId) return res.status(400).json({ erro: 'Escolha um plano.' });

  const plano = await db.query('SELECT * FROM plans WHERE id = $1 AND ativo = true', [planId]);
  if (!plano.rows[0]) return res.status(404).json({ erro: 'Plano não encontrado.' });

  const cicloEscolhido = ciclo === 'anual' ? 'anual' : 'mensal';

  // ----------------------------------------------------------------
  // Ponto de integração com o gateway de pagamento.
  //
  // Cobranças recorrentes precisam de um gateway homologado. Os dados
  // do cartão NUNCA passam por este servidor: o cliente digita no
  // checkout do gateway, que devolve um identificador de assinatura.
  //
  // Opções no Brasil: Asaas, Vindi, Iugu, Pagar.me, Mercado Pago, Stripe.
  //
  // Exemplo com Asaas:
  //   const resp = await fetch(`${process.env.BILLING_API_URL}/v3/subscriptions`, {
  //     method: 'POST',
  //     headers: { access_token: process.env.BILLING_TOKEN, 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ customer, billingType: 'PIX', value, cycle: 'MONTHLY' }),
  //   });
  //   const dados = await resp.json();  // dados.id -> gateway_subscription_id
  // ----------------------------------------------------------------
  const gatewayConfigurado = !!(process.env.BILLING_PROVIDER && process.env.BILLING_TOKEN);

  const { rows } = await db.query(
    `INSERT INTO subscriptions (store_id, plan_id, status, ciclo, fim_teste, proxima_cobranca, gateway)
     VALUES ($1, $2, $3, $4, CURRENT_DATE + INTERVAL '14 days', CURRENT_DATE + INTERVAL '14 days', $5)
     ON CONFLICT (store_id) DO UPDATE
       SET plan_id = EXCLUDED.plan_id,
           ciclo = EXCLUDED.ciclo,
           status = CASE WHEN subscriptions.status = 'cancelada' THEN 'teste' ELSE subscriptions.status END
     RETURNING *`,
    [req.user.storeId, planId, gatewayConfigurado ? 'teste' : 'teste', cicloEscolhido, process.env.BILLING_PROVIDER || null]
  );

  const resposta = await montarAssinatura(req.user.storeId);
  if (!gatewayConfigurado) {
    resposta.aviso = 'Nenhum gateway de pagamento configurado. A loja entrou em período de teste, mas nenhuma cobrança será gerada até que BILLING_PROVIDER e BILLING_TOKEN sejam definidos no .env.';
  }
  res.status(201).json(resposta);
}));

// POST /api/billing/cancel
router.post('/cancel', asyncRoute(async (req, res) => {
  const { rows } = await db.query(
    `UPDATE subscriptions SET status = 'cancelada', cancelada_em = now()
      WHERE store_id = $1 RETURNING *`,
    [req.user.storeId]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Nenhuma assinatura ativa encontrada.' });
  res.json({ status: 'cancelada', mensagem: 'Assinatura cancelada. O acesso continua até o fim do período já pago.' });
}));

// GET /api/billing/charges -> histórico de cobranças
router.get('/charges', asyncRoute(async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM charges WHERE store_id = $1 ORDER BY criado_em DESC LIMIT 50',
    [req.user.storeId]
  );
  res.json(rows.map((c) => ({
    id: c.id,
    valor: Number(c.valor),
    status: c.status,
    metodo: c.metodo,
    vencimento: c.vencimento,
    pagoEm: c.pago_em,
    link: c.link_pagamento,
  })));
}));

/* --------------------------------------------------------------
   Funcoes auxiliares
   -------------------------------------------------------------- */

async function montarAssinatura(storeId) {
  const { rows } = await db.query(
    `SELECT s.*, p.nome AS plano_nome, p.preco_mensal, p.preco_anual,
            p.limite_veiculos, p.limite_usuarios, p.limite_portais, p.recursos
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
      WHERE s.store_id = $1`,
    [storeId]
  );

  const uso = await contarUso(storeId);

  if (!rows[0]) {
    return { assinatura: null, uso, mensagem: 'Esta loja ainda não escolheu um plano.' };
  }

  const s = rows[0];
  const diasRestantesTeste = s.fim_teste
    ? Math.ceil((new Date(s.fim_teste) - new Date()) / 86400000)
    : null;

  return {
    assinatura: {
      plano: s.plan_id,
      planoNome: s.plano_nome,
      status: s.status,
      ciclo: s.ciclo,
      precoMensal: Number(s.preco_mensal),
      precoAnual: s.preco_anual === null ? null : Number(s.preco_anual),
      inicio: s.inicio,
      fimTeste: s.fim_teste,
      diasRestantesTeste: diasRestantesTeste > 0 ? diasRestantesTeste : 0,
      proximaCobranca: s.proxima_cobranca,
      recursos: s.recursos,
    },
    limites: {
      veiculos: s.limite_veiculos,
      usuarios: s.limite_usuarios,
      portais: s.limite_portais,
    },
    uso,
  };
}

async function contarUso(storeId) {
  const { rows } = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM vehicles WHERE store_id = $1 AND status <> 'vendido') AS veiculos,
       (SELECT COUNT(*) FROM users    WHERE store_id = $1 AND ativo = true)        AS usuarios,
       (SELECT COUNT(*) FROM integrations WHERE store_id = $1 AND conectado = true) AS portais`,
    [storeId]
  );
  return {
    veiculos: Number(rows[0].veiculos),
    usuarios: Number(rows[0].usuarios),
    portais: Number(rows[0].portais),
  };
}

module.exports = { router, montarAssinatura, contarUso };
