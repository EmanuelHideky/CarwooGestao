require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { requireAuth } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const vehicleRoutes = require('./routes/vehicles');
const leadRoutes = require('./routes/leads');
const saleRoutes = require('./routes/sales');
const financeRoutes = require('./routes/finance');
const invoiceRoutes = require('./routes/invoices');
const { tasks, comparables, integrations, team } = require('./routes/misc');
const { router: billingRoutes } = require('./routes/billing');
const storeRoutes = require('./routes/store');
const { router: postSaleRoutes, estatisticasGarantia } = require('./routes/postsale');
const inboundRoutes = require('./routes/inbound');
const notificationRoutes = require('./routes/notifications');
const { exigirAssinaturaAtiva, checarLimite } = require('./middleware/plan');
const { exigirPermissao } = require('./middleware/role');

const app = express();

// Aceita apenas as origens listadas no .env (separadas por vírgula).
//
// A barra do final é removida de propósito: o navegador manda a origem
// SEM barra ("https://loja.netlify.app"), mas ao copiar o endereço da
// barra do navegador vem COM barra. Sem esta limpeza, o site é bloqueado
// e a tela diz "Servidor fora do ar" mesmo com tudo funcionando.
const semBarraFinal = (v) => String(v || '').trim().replace(/\/+$/, '');

const origensPermitidas = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(semBarraFinal)
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Requisições sem origin (Postman, curl, apps nativos) passam
    if (!origin || origensPermitidas.length === 0 || origensPermitidas.includes(semBarraFinal(origin))) {
      return callback(null, true);
    }
    callback(new Error('Origem não autorizada pelo CORS.'));
  },
}));

app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  // "fotos" diz se o armazenamento de imagens esta ligado. A tela usa isso
  // para avisar o lojista quando as fotos ainda nao ficam salvas de verdade.
  res.json({
    ok: true,
    servico: 'carwoo-api',
    horario: new Date().toISOString(),
    fotos: require('./storage').descrever(),
  });
});

// Público
app.use('/api/auth', authRoutes);

// As rotas de nota fiscal cuidam da própria autenticação: só o webhook do
// provedor é público (validado por segredo), o resto exige token.
app.use('/api/invoices', invoiceRoutes);

// Assinaturas: /plans e /webhook são públicos, o resto exige token
// (o próprio módulo cuida disso internamente).
app.use('/api/billing', billingRoutes);   // /plans e /webhook publicos; assinatura exige perfil dono

// Protegido por token. exigirAssinaturaAtiva barra quem está com
// pagamento pendente ou teste vencido; checarLimite aplica o teto do plano.
app.use('/api/vehicles', requireAuth, exigirAssinaturaAtiva, vehicleRoutes);
app.use('/api/leads', requireAuth, exigirAssinaturaAtiva, leadRoutes);
app.use('/api/sales', requireAuth, exigirAssinaturaAtiva, saleRoutes);
// Custos pos-venda (garantia) ficam sob a venda correspondente
app.use('/api/sales/:saleId/post-sale', requireAuth, exigirAssinaturaAtiva, postSaleRoutes);
// Entrada de leads dos portais: /:portal e publico (token da loja), o resto exige login
app.use('/api/inbound', inboundRoutes);
app.use('/api/notifications', requireAuth, notificationRoutes);
app.use('/api/finance', requireAuth, exigirAssinaturaAtiva, exigirPermissao('financeiro'), financeRoutes);
app.use('/api/tasks', requireAuth, exigirAssinaturaAtiva, tasks);
app.use('/api/comparables', requireAuth, exigirPermissao('precificacao'), comparables);
app.use('/api/integrations', requireAuth, integrations);
app.use('/api/team', requireAuth, team);
app.use('/api/store', requireAuth, storeRoutes);

// Rota não encontrada
app.use((req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

// Tratamento central de erros
app.use((err, req, res, next) => {
  console.error(err);
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ erro: 'Origem não autorizada.' });
  }
  if (err.code === '23505') {
    return res.status(409).json({ erro: 'Já existe um registro com esses dados.' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ erro: 'Registro relacionado não encontrado.' });
  }
  res.status(500).json({ erro: 'Erro interno no servidor.' });
});

const porta = process.env.PORT || 3000;
app.listen(porta, () => {
  console.log(`carwoo-api rodando em http://localhost:${porta}`);
});

module.exports = app;
