const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncRoute } = require('../helpers');
const gateway = require('../billing-gateway');

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

  // O gateway fala o vocabulário dele ({event, payment}); aqui vira o nosso.
  // Se vier no formato interno (teste manual), aproveita como está.
  const traduzido = gateway.traduzirWebhook(req.body);
  const { evento, cobrancaId, assinaturaId, status, valor, metodo, vencimento, link, lojaId } =
    traduzido || req.body;

  if (!evento) return res.status(400).json({ erro: 'Payload inválido.' });

  // Atualiza a cobrança. Se for uma cobrança que ainda não conhecemos (o
  // gateway gera as seguintes sozinho, mês a mês), registra agora.
  if (cobrancaId && status) {
    const { rowCount } = await db.query(
      `UPDATE charges
          SET status = $1,
              pago_em = CASE WHEN $1 = 'paga' THEN now() ELSE pago_em END,
              link_pagamento = COALESCE($3, link_pagamento)
        WHERE gateway_charge_id = $2`,
      [status, cobrancaId, link || null]
    );

    if (!rowCount && assinaturaId) {
      const { rows: assin } = await db.query(
        'SELECT id, store_id FROM subscriptions WHERE gateway_subscription_id = $1',
        [assinaturaId]
      );
      if (assin[0]) {
        await db.query(
          `INSERT INTO charges (store_id, subscription_id, valor, status, metodo, vencimento,
                                pago_em, gateway_charge_id, link_pagamento)
           VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $4 = 'paga' THEN now() ELSE NULL END, $7,$8)`,
          [assin[0].store_id, assin[0].id, valor || 0, status, metodo || null,
           vencimento || null, cobrancaId, link || null]
        );
      }
    }
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

  /* A loja sempre entra em teste de 14 dias. A cobrança só começa a valer
     no fim do teste - por isso a primeira data de vencimento é o fim dele,
     e não hoje. Assim ninguém é cobrado por experimentar. */
  const { rows } = await db.query(
    `INSERT INTO subscriptions (store_id, plan_id, status, ciclo, fim_teste, proxima_cobranca, gateway)
     VALUES ($1, $2, 'teste', $3, CURRENT_DATE + INTERVAL '14 days', CURRENT_DATE + INTERVAL '14 days', $4)
     ON CONFLICT (store_id) DO UPDATE
       SET plan_id = EXCLUDED.plan_id,
           ciclo = EXCLUDED.ciclo,
           status = CASE WHEN subscriptions.status = 'cancelada' THEN 'teste' ELSE subscriptions.status END
     RETURNING *`,
    [req.user.storeId, planId, cicloEscolhido, gateway.configurado() ? process.env.BILLING_PROVIDER : null]
  );

  const assinatura = rows[0];
  const resposta = await montarAssinatura(req.user.storeId);

  // Sem gateway o sistema continua funcionando, só não cobra. É melhor
  // dizer isso na cara do que fingir que a assinatura foi contratada.
  if (!gateway.configurado()) {
    resposta.aviso = 'Cobrança automática ainda não está ativa neste servidor. '
      + 'A loja entrou em período de teste e nenhuma cobrança será gerada.';
    return res.status(201).json(resposta);
  }

  /* Cria a cobrança no gateway. Se falhar, a loja NÃO fica travada: ela
     segue no período de teste e o dono do carwoo resolve depois. Perder a
     cobrança é problema; travar o cliente que quis pagar é pior. */
  try {
    const { rows: lojas } = await db.query('SELECT * FROM stores WHERE id = $1', [req.user.storeId]);
    const loja = lojas[0] || {};

    const clienteId = assinatura.gateway_customer_id || await gateway.criarCliente({
      nome: loja.nome,
      cpfCnpj: loja.cnpj,
      email: loja.email,
      telefone: loja.telefone,
      externalReference: req.user.storeId,
    });

    const valor = cicloEscolhido === 'anual'
      ? Number(plano.rows[0].preco_anual || plano.rows[0].preco_mensal) * 12
      : Number(plano.rows[0].preco_mensal);

    const criada = await gateway.criarAssinatura({
      clienteId,
      valor,
      ciclo: cicloEscolhido,
      descricao: `carwoo gestão · plano ${plano.rows[0].nome} (${cicloEscolhido})`,
      primeiroVencimento: assinatura.fim_teste,
      externalReference: req.user.storeId,
    });

    await db.query(
      `UPDATE subscriptions
          SET gateway_customer_id = $1, gateway_subscription_id = $2
        WHERE id = $3`,
      [clienteId, criada.id, assinatura.id]
    );

    if (criada.cobrancaId) {
      await db.query(
        `INSERT INTO charges (store_id, subscription_id, valor, status, vencimento,
                              gateway_charge_id, link_pagamento)
         VALUES ($1,$2,$3,'pendente',$4,$5,$6)`,
        [req.user.storeId, assinatura.id, valor, assinatura.fim_teste, criada.cobrancaId, criada.link]
      );
    }

    resposta.linkPagamento = criada.link;
    resposta.ambienteCobranca = gateway.ambiente();
  } catch (err) {
    console.error('Falha ao criar a assinatura no gateway:', err.message);
    resposta.aviso = 'O plano foi registrado e o período de teste começou, '
      + 'mas não foi possível gerar a cobrança agora. Tente de novo mais tarde.';
  }

  res.status(201).json(resposta);
}));

// POST /api/billing/cancel
router.post('/cancel', asyncRoute(async (req, res) => {
  // Cancela primeiro no gateway. Marcar só no nosso banco deixaria o
  // lojista sendo cobrado todo mês por um plano que ele cancelou.
  const { rows: atual } = await db.query(
    'SELECT gateway_subscription_id FROM subscriptions WHERE store_id = $1',
    [req.user.storeId]
  );
  if (!atual[0]) return res.status(404).json({ erro: 'Nenhuma assinatura ativa encontrada.' });

  let canceladaNoGateway = true;
  if (atual[0].gateway_subscription_id) {
    canceladaNoGateway = await gateway.cancelarAssinatura(atual[0].gateway_subscription_id);
  }

  const { rows } = await db.query(
    `UPDATE subscriptions SET status = 'cancelada', cancelada_em = now()
      WHERE store_id = $1 RETURNING *`,
    [req.user.storeId]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Nenhuma assinatura ativa encontrada.' });

  const resposta = {
    status: 'cancelada',
    mensagem: 'Assinatura cancelada. O acesso continua até o fim do período já pago.',
  };
  if (!canceladaNoGateway) {
    // Não esconder: alguém precisa cancelar na mão, senão a cobrança volta
    resposta.aviso = 'A assinatura foi cancelada no sistema, mas o gateway não confirmou o cancelamento. '
      + 'Confira no painel do provedor para não gerar cobrança indevida.';
  }
  res.json(resposta);
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
