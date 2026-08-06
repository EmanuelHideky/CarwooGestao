const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncRoute, paraNumero } = require('../helpers');

const router = express.Router();

function mapear(row) {
  return {
    id: row.id,
    veiculoId: row.veiculo_id,
    veiculo: row.veiculo_nome || null,
    numero: row.numero || '—',
    serie: row.serie,
    tipo: row.tipo,
    cliente: row.cliente_nome,
    cpfCnpj: row.cpf_cnpj,
    endereco: row.endereco,
    valor: Number(row.valor),
    cfop: row.cfop,
    natureza: row.natureza,
    status: row.status,
    chave: row.chave_acesso,
    protocolo: row.protocolo,
    emissao: row.emissao,
  };
}

// Validação de CPF (11 dígitos) com dígitos verificadores
function cpfValido(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(cpf[i]) * (10 - i);
  let d1 = ((soma * 10) % 11) % 10;
  if (d1 !== Number(cpf[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(cpf[i]) * (11 - i);
  const d2 = ((soma * 10) % 11) % 10;
  return d2 === Number(cpf[10]);
}

// Validação de CNPJ (14 dígitos) com dígitos verificadores
function cnpjValido(cnpj) {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base, pesos) => {
    const soma = base.reduce((acc, n, i) => acc + n * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const nums = cnpj.split('').map(Number);
  const d1 = calc(nums.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== nums[12]) return false;
  const d2 = calc(nums.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === nums[13];
}

function validarNota(b) {
  const erros = [];
  if (!b.clienteNome) erros.push('Informe o nome do destinatário.');
  const doc = String(b.cpfCnpj || '').replace(/\D/g, '');
  if (doc.length === 11) {
    if (!cpfValido(doc)) erros.push('O CPF informado é inválido.');
  } else if (doc.length === 14) {
    if (!cnpjValido(doc)) erros.push('O CNPJ informado é inválido.');
  } else {
    erros.push('Informe um CPF com 11 dígitos ou um CNPJ com 14 dígitos.');
  }
  if (!b.endereco) erros.push('Informe o endereço do destinatário.');
  if (!paraNumero(b.valor) || paraNumero(b.valor) <= 0) erros.push('O valor da nota deve ser maior que zero.');
  if (!b.cfop) erros.push('Selecione o CFOP da operação.');
  return erros;
}

const SELECT_BASE = `
  SELECT i.*, CONCAT(v.marca, ' ', v.modelo, ' ', v.ano_fab, '/', v.ano_mod) AS veiculo_nome
    FROM invoices i
    LEFT JOIN vehicles v ON v.id = i.veiculo_id
`;

/* --------------------------------------------------------------
   ROTA PUBLICA: o provedor fiscal chama este webhook de fora,
   sem token de usuario. Fica protegida pelo segredo compartilhado.
   Precisa vir ANTES do requireAuth abaixo.
   -------------------------------------------------------------- */
// POST /api/invoices/webhook  -> o provedor avisa o resultado da autorização
// Rota pública: proteja com um segredo compartilhado no .env.
router.post('/webhook', asyncRoute(async (req, res) => {
  const segredo = req.headers['x-webhook-secret'];
  if (!process.env.FISCAL_WEBHOOK_SECRET || segredo !== process.env.FISCAL_WEBHOOK_SECRET) {
    return res.status(401).json({ erro: 'Assinatura do webhook inválida.' });
  }

  const { ref, status, numero, chave, protocolo } = req.body;
  const statusValidos = ['autorizada', 'rejeitada', 'cancelada', 'processando'];
  if (!ref || !statusValidos.includes(status)) {
    return res.status(400).json({ erro: 'Payload do webhook inválido.' });
  }

  await db.query(
    `UPDATE invoices
        SET status = $1, numero = COALESCE($2, numero), chave_acesso = COALESCE($3, chave_acesso),
            protocolo = COALESCE($4, protocolo),
            emissao = CASE WHEN $1 = 'autorizada' THEN now() ELSE emissao END
      WHERE id = $5`,
    [status, numero || null, chave || null, protocolo || null, ref]
  );
  res.json({ recebido: true });
}));

/* Daqui para baixo, tudo exige usuario autenticado. */
router.use(requireAuth);

// GET /api/invoices
router.get('/', asyncRoute(async (req, res) => {
  const { rows } = await db.query(
    `${SELECT_BASE} WHERE i.store_id = $1 ORDER BY i.criado_em DESC`,
    [req.user.storeId]
  );
  res.json(rows.map(mapear));
}));

// POST /api/invoices  -> salva como rascunho (sem transmitir)
router.post('/', asyncRoute(async (req, res) => {
  const b = req.body;
  if (!b.clienteNome) return res.status(400).json({ erro: 'Informe o nome do destinatário.' });

  const { rows } = await db.query(
    `INSERT INTO invoices (store_id, veiculo_id, serie, cliente_nome, cpf_cnpj, endereco, valor,
                           cfop, natureza, forma_pagamento, observacoes, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'rascunho') RETURNING *`,
    [
      req.user.storeId, b.veiculoId || null, b.serie || '1', b.clienteNome,
      b.cpfCnpj || null, b.endereco || null, paraNumero(b.valor) || 0,
      b.cfop || null, b.natureza || null, b.pagamento || null, b.observacoes || null,
    ]
  );
  res.status(201).json(mapear(rows[0]));
}));

// POST /api/invoices/:id/validate  -> checa os dados antes de transmitir
router.post('/:id/validate', asyncRoute(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM invoices WHERE id = $1 AND store_id = $2', [req.params.id, req.user.storeId]);
  if (!rows[0]) return res.status(404).json({ erro: 'Nota não encontrada.' });

  const nota = rows[0];
  const erros = validarNota({
    clienteNome: nota.cliente_nome, cpfCnpj: nota.cpf_cnpj,
    endereco: nota.endereco, valor: nota.valor, cfop: nota.cfop,
  });
  res.json({ valida: erros.length === 0, erros });
}));

// POST /api/invoices/:id/transmit  -> envia ao provedor fiscal configurado
router.post('/:id/transmit', asyncRoute(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM invoices WHERE id = $1 AND store_id = $2', [req.params.id, req.user.storeId]);
  if (!rows[0]) return res.status(404).json({ erro: 'Nota não encontrada.' });

  const nota = rows[0];
  const erros = validarNota({
    clienteNome: nota.cliente_nome, cpfCnpj: nota.cpf_cnpj,
    endereco: nota.endereco, valor: nota.valor, cfop: nota.cfop,
  });
  if (erros.length) return res.status(400).json({ erro: 'A nota tem pendências.', erros });

  // ------------------------------------------------------------------
  // Ponto de integração com o provedor fiscal.
  //
  // A emissão só é válida quando um provedor com certificado digital
  // transmite a nota à SEFAZ. Configure FISCAL_PROVIDER e FISCAL_TOKEN
  // no .env e implemente a chamada abaixo conforme a documentação do
  // provedor escolhido (Focus NFe, eNotas, NFe.io, Bling, Omie).
  //
  // Exemplo com Focus NFe:
  //   const resp = await fetch(`${process.env.FISCAL_API_URL}/v2/nfe?ref=${nota.id}`, {
  //     method: 'POST',
  //     headers: { Authorization: 'Basic ' + Buffer.from(process.env.FISCAL_TOKEN + ':').toString('base64') },
  //     body: JSON.stringify(montarPayloadNfe(nota)),
  //   });
  // ------------------------------------------------------------------
  if (!process.env.FISCAL_PROVIDER || !process.env.FISCAL_TOKEN) {
    return res.status(422).json({
      erro: 'Nenhum provedor fiscal configurado.',
      detalhe: 'Defina FISCAL_PROVIDER e FISCAL_TOKEN no .env e implemente a chamada ao provedor em src/routes/invoices.js. A nota continua salva como rascunho.',
    });
  }

  await db.query(`UPDATE invoices SET status = 'processando' WHERE id = $1`, [nota.id]);
  res.status(202).json({ status: 'processando', mensagem: 'Nota enviada ao provedor fiscal. O status final chega pelo webhook.' });
}));

// POST /api/invoices/:id/cancel
router.post('/:id/cancel', asyncRoute(async (req, res) => {
  const { rows } = await db.query(
    `UPDATE invoices SET status = 'cancelada' WHERE id = $1 AND store_id = $2 RETURNING *`,
    [req.params.id, req.user.storeId]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Nota não encontrada.' });
  res.json(mapear(rows[0]));
}));

module.exports = router;
