/**
 * Cobranca de assinaturas.
 *
 * POR QUE EXISTE
 * O carwoo cobra mensalidade das lojas. Dados de cartao NUNCA passam por
 * este servidor: o lojista paga na pagina do gateway, e o que guardamos
 * aqui e so o identificador da assinatura e o link de pagamento.
 *
 * DRIVER ATUAL: Asaas
 * Escolhido porque nao cobra mensalidade (so por cobranca recebida), aceita
 * Pix, boleto e cartao na mesma conta, e o Pix tem taxa fixa baixa - bem
 * mais barato que os ~3,5% do cartao numa mensalidade de algumas centenas.
 *
 * PARA TROCAR POR VINDI, IUGU OU STRIPE
 * Escreva outro driver com as mesmas funcoes (configurado, descrever,
 * criarCliente, criarAssinatura, cancelarAssinatura, traduzirWebhook) e
 * troque o que este arquivo exporta. Nada mais no sistema precisa mudar.
 */

const PROVEDOR = (process.env.BILLING_PROVIDER || '').trim().toLowerCase();
const TOKEN = (process.env.BILLING_TOKEN || '').trim();

/**
 * A chave de teste do Asaas tem "hmlg" no meio.
 *
 * Quem manda aqui e a CHAVE, nao o endereco: e ela que decide em qual conta
 * do Asaas a cobranca cai. Olhar so o endereco daria "producao" para uma
 * chave de teste apontada para outro lugar - exatamente o engano que esta
 * checagem existe para evitar (cobrar de verdade achando que esta testando).
 */
function chaveDeTeste() {
  return /hmlg/i.test(TOKEN);
}

function urlBase() {
  const informada = (process.env.BILLING_API_URL || '').trim().replace(/\/+$/, '');
  if (informada) return informada;
  return chaveDeTeste() ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
}

function configurado() {
  return Boolean(PROVEDOR && TOKEN);
}

function ambiente() {
  if (chaveDeTeste()) return 'teste';
  // Chave sem marca de teste, mas apontada para o sandbox: ainda e teste
  return urlBase().includes('sandbox') ? 'teste' : 'producao';
}

/** Resumo para a rota de diagnostico e para os avisos na tela. */
function descrever() {
  if (!configurado()) {
    return {
      ativo: false,
      provedor: null,
      motivo: 'BILLING_PROVIDER e BILLING_TOKEN nao estao preenchidos no .env',
    };
  }
  return { ativo: true, provedor: PROVEDOR, ambiente: ambiente() };
}

async function chamar(caminho, opcoes = {}) {
  if (!configurado()) throw new Error('Cobranca de assinatura nao configurada.');

  const resp = await fetch(`${urlBase()}${caminho}`, {
    ...opcoes,
    headers: {
      access_token: TOKEN,
      'Content-Type': 'application/json',
      ...(opcoes.headers || {}),
    },
  });

  const texto = await resp.text();
  let dados = {};
  try { dados = texto ? JSON.parse(texto) : {}; } catch { /* resposta nao-JSON */ }

  if (!resp.ok) {
    // O Asaas devolve os problemas em errors[].description
    const detalhe = Array.isArray(dados.errors) && dados.errors.length
      ? dados.errors.map((e) => e.description).join(' | ')
      : texto.slice(0, 200);
    const erro = new Error(`Gateway respondeu ${resp.status}: ${detalhe}`);
    erro.status = resp.status;
    throw erro;
  }
  return dados;
}

/**
 * Cria (ou reaproveita) o cliente no gateway.
 * O Asaas exige CPF ou CNPJ - sem isso nao emite cobranca.
 */
async function criarCliente({ nome, cpfCnpj, email, telefone, externalReference }) {
  const documento = String(cpfCnpj || '').replace(/\D/g, '');
  if (!documento) throw new Error('Informe o CNPJ da loja para gerar a cobranca.');

  // Se ja existe cliente com este documento, reaproveita em vez de duplicar
  const existente = await chamar(`/customers?cpfCnpj=${documento}`, { method: 'GET' });
  if (existente?.data?.length) return existente.data[0].id;

  const criado = await chamar('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: nome,
      cpfCnpj: documento,
      email: email || undefined,
      mobilePhone: telefone ? String(telefone).replace(/\D/g, '') : undefined,
      externalReference: externalReference ? String(externalReference) : undefined,
      notificationDisabled: false,   // deixa o Asaas cobrar o inadimplente
    }),
  });
  return criado.id;
}

const CICLOS = { mensal: 'MONTHLY', anual: 'YEARLY' };

/**
 * Cria a assinatura recorrente.
 * Devolve o id e o link onde o lojista paga.
 */
async function criarAssinatura({ clienteId, valor, ciclo, descricao, primeiroVencimento, externalReference }) {
  const corpo = {
    customer: clienteId,
    // UNDEFINED deixa o lojista escolher entre Pix, boleto e cartao na
    // pagina do Asaas. Da para fixar em PIX pelo .env, que e o mais barato.
    billingType: (process.env.BILLING_METODO || 'UNDEFINED').toUpperCase(),
    value: Number(valor),
    nextDueDate: primeiroVencimento,
    cycle: CICLOS[ciclo] || 'MONTHLY',
    description: descricao,
    externalReference: externalReference ? String(externalReference) : undefined,
  };

  const assinatura = await chamar('/subscriptions', { method: 'POST', body: JSON.stringify(corpo) });

  // Busca a primeira cobranca para ter o link de pagamento na hora
  let link = null;
  let cobrancaId = null;
  try {
    const cobrancas = await chamar(`/subscriptions/${assinatura.id}/payments`, { method: 'GET' });
    const primeira = cobrancas?.data?.[0];
    if (primeira) {
      link = primeira.invoiceUrl || primeira.bankSlipUrl || null;
      cobrancaId = primeira.id || null;
    }
  } catch (e) {
    // Sem o link a assinatura continua valida: o Asaas envia por e-mail
    console.error('Nao foi possivel obter o link da primeira cobranca:', e.message);
  }

  return { id: assinatura.id, link, cobrancaId, valor: Number(assinatura.value ?? valor) };
}

async function cancelarAssinatura(assinaturaId) {
  if (!configurado() || !assinaturaId) return false;
  try {
    await chamar(`/subscriptions/${assinaturaId}`, { method: 'DELETE' });
    return true;
  } catch (e) {
    console.error('Falha ao cancelar assinatura no gateway:', e.message);
    return false;
  }
}

/* Estados do Asaas -> estados que o carwoo entende */
const PAGOU = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_APPROVED_BY_RISK_ANALYSIS'];
const VENCEU = ['PAYMENT_OVERDUE', 'PAYMENT_DUNNING_REQUESTED'];
const DEVOLVEU = ['PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'];
const SUMIU = ['PAYMENT_DELETED'];

/**
 * O Asaas manda { event, payment: {...} }. O resto do sistema trabalha com
 * um formato proprio, para nao ficar amarrado ao vocabulario de um gateway.
 */
function traduzirWebhook(corpo) {
  const evento = corpo?.event;
  const p = corpo?.payment || corpo?.subscription || {};
  if (!evento) return null;

  let status = null;
  if (PAGOU.includes(evento)) status = 'paga';
  else if (VENCEU.includes(evento)) status = 'vencida';
  else if (DEVOLVEU.includes(evento)) status = 'estornada';
  else if (SUMIU.includes(evento)) status = 'cancelada';

  const metodos = { PIX: 'pix', BOLETO: 'boleto', CREDIT_CARD: 'cartao' };

  return {
    evento,
    status,                                   // null = evento que nao muda nada
    cobrancaId: p.id || null,
    assinaturaId: p.subscription || null,
    clienteId: p.customer || null,
    valor: p.value ?? null,
    metodo: metodos[p.billingType] || null,
    vencimento: p.dueDate || null,
    link: p.invoiceUrl || p.bankSlipUrl || null,
    lojaId: p.externalReference ? Number(p.externalReference) : null,
  };
}

module.exports = {
  configurado,
  descrever,
  ambiente,
  criarCliente,
  criarAssinatura,
  cancelarAssinatura,
  traduzirWebhook,
};
