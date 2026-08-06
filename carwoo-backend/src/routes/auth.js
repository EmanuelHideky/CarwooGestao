const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { asyncRoute } = require('../helpers');
const { cnpjValido, apenasDigitos } = require('../validadores');

const router = express.Router();

// POST /api/auth/register  -> cria o primeiro usuario/loja (uso administrativo)
router.post('/register', async (req, res) => {
  const { nomeLoja, cnpj, nome, email, senha } = req.body;
  if (!nomeLoja || !nome || !email || !senha) {
    return res.status(400).json({ erro: 'Preencha nomeLoja, nome, email e senha.' });
  }
  try {
    const storeResult = await db.query(
      'INSERT INTO stores (nome, cnpj) VALUES ($1, $2) RETURNING id, nome, cnpj',
      [nomeLoja, cnpj || null]
    );
    const store = storeResult.rows[0];

    const senhaHash = await bcrypt.hash(senha, 10);
    const userResult = await db.query(
      `INSERT INTO users (store_id, nome, email, senha_hash, cargo, perfil)
       VALUES ($1, $2, $3, $4, 'Gerente de vendas', 'dono')
       RETURNING id, nome, email, cargo, perfil, store_id`,
      [store.id, nome, email, senhaHash]
    );
    const user = userResult.rows[0];

    const token = signToken(user);
    res.status(201).json({ token, user, store });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Já existe um usuário com esse e-mail.' });
    }
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível criar a conta.' });
  }
});

const MAX_TENTATIVAS = 6;
const JANELA_MINUTOS = 15;

/** Conta as falhas recentes daquele e-mail para travar tentativa em série. */
async function tentativasRecentes(email) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total FROM login_attempts
      WHERE email = $1 AND sucesso = false
        AND criado_em > now() - ($2 || ' minutes')::interval`,
    [email, String(JANELA_MINUTOS)]
  );
  return rows[0].total;
}

async function registrarTentativa(email, ip, sucesso) {
  await db.query(
    'INSERT INTO login_attempts (email, ip, sucesso) VALUES ($1,$2,$3)',
    [email, ip || null, sucesso]
  );
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
  if (!email || !senha) {
    return res.status(400).json({ erro: 'Informe email e senha.' });
  }
  try {
    const falhas = await tentativasRecentes(email);
    if (falhas >= MAX_TENTATIVAS) {
      return res.status(429).json({
        erro: `Muitas tentativas. Aguarde ${JANELA_MINUTOS} minutos ou redefina sua senha.`,
      });
    }
    const result = await db.query('SELECT * FROM users WHERE email = $1 AND ativo = true', [email]);
    const user = result.rows[0];
    if (!user) {
      await registrarTentativa(email, ip, false);
      return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
    }

    const ok = await bcrypt.compare(senha, user.senha_hash);
    if (!ok) {
      await registrarTentativa(email, ip, false);
      const restantes = MAX_TENTATIVAS - falhas - 1;
      return res.status(401).json({
        erro: restantes > 0 && restantes <= 3
          ? `E-mail ou senha inválidos. ${restantes} tentativa(s) antes do bloqueio.`
          : 'E-mail ou senha inválidos.',
      });
    }

    await registrarTentativa(email, ip, true);
    const token = signToken(user);
    delete user.senha_hash;

    const loja = await db.query(
      'SELECT id, nome, cnpj, endereco, cep, cidade, estado, telefone, email, instagram, garantia_padrao_dias, avisar_garantia_dias FROM stores WHERE id = $1',
      [user.store_id]
    );
    res.json({ token, user, store: loja.rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Não foi possível autenticar agora.' });
  }
});

// GET /api/auth/me -> devolve o usuário do token (usado para restaurar a sessão)
router.get('/me', requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, nome, email, cargo, perfil, store_id FROM users WHERE id = $1 AND ativo = true',
    [req.user.id]
  );
  if (!rows[0]) return res.status(401).json({ erro: 'Usuário não encontrado.' });

  const loja = await db.query(
    'SELECT id, nome, cnpj, endereco, cep, cidade, estado, telefone, email, instagram, garantia_padrao_dias, avisar_garantia_dias FROM stores WHERE id = $1',
    [rows[0].store_id]
  );
  res.json({ user: rows[0], store: loja.rows[0] || null });
}));

// POST /api/auth/forgot-password
// Sempre responde sucesso, para não revelar quais e-mails existem na base.
router.post('/forgot-password', asyncRoute(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ erro: 'Informe o e-mail.' });

  const { rows } = await db.query('SELECT id, nome FROM users WHERE email = $1 AND ativo = true', [email]);

  if (rows[0]) {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await db.query(
      `INSERT INTO password_resets (user_id, token_hash, expira_em)
       VALUES ($1, $2, now() + INTERVAL '1 hour')`,
      [rows[0].id, hash]
    );

    const link = `${process.env.APP_URL || 'http://localhost:8080'}/?reset=${token}`;

    // ----------------------------------------------------------------
    // Ponto de integração com o serviço de e-mail.
    // Configure MAIL_PROVIDER e MAIL_TOKEN no .env e implemente o envio.
    // Opções: Resend, SendGrid, Postmark, Amazon SES, Brevo.
    //
    // Exemplo com Resend:
    //   await fetch('https://api.resend.com/emails', {
    //     method: 'POST',
    //     headers: { Authorization: `Bearer ${process.env.MAIL_TOKEN}`, 'Content-Type': 'application/json' },
    //     body: JSON.stringify({
    //       from: process.env.MAIL_FROM, to: email,
    //       subject: 'Redefinir sua senha no carwoo',
    //       html: `<p>Olá, ${rows[0].nome}. Clique para criar uma senha nova:</p><p><a href="${link}">${link}</a></p><p>O link expira em 1 hora.</p>`,
    //     }),
    //   });
    // ----------------------------------------------------------------
    if (!process.env.MAIL_PROVIDER || !process.env.MAIL_TOKEN) {
      console.warn('[carwoo] Nenhum servico de e-mail configurado. Link de redefinicao:', link);
    }
  }

  res.json({ enviado: true, mensagem: 'Se o e-mail estiver cadastrado, o link foi enviado.' });
}));

// POST /api/auth/reset-password
router.post('/reset-password', asyncRoute(async (req, res) => {
  const { token, senha } = req.body;
  if (!token || !senha) return res.status(400).json({ erro: 'Token e nova senha sao obrigatorios.' });
  if (String(senha).length < 8) return res.status(400).json({ erro: 'A senha precisa de ao menos 8 caracteres.' });

  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const { rows } = await db.query(
    `SELECT pr.id, pr.user_id FROM password_resets pr
      WHERE pr.token_hash = $1 AND pr.usado = false AND pr.expira_em > now()`,
    [hash]
  );
  if (!rows[0]) return res.status(400).json({ erro: 'Link invalido ou expirado. Peca um novo.' });

  const senhaHash = await bcrypt.hash(senha, 10);
  await db.query('UPDATE users SET senha_hash = $1 WHERE id = $2', [senhaHash, rows[0].user_id]);
  await db.query('UPDATE password_resets SET usado = true WHERE id = $1', [rows[0].id]);

  res.json({ redefinida: true });
}));

function signToken(user) {
  return jwt.sign(
    { id: user.id, storeId: user.store_id, nome: user.nome, cargo: user.cargo, perfil: user.perfil || 'vendedor' },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

module.exports = router;
