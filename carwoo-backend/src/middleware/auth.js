const jwt = require('jsonwebtoken');
const db = require('../db');

/* ==============================================================
   Autenticação

   O token prova QUEM a pessoa é, mas não diz se ela ainda pode
   entrar. Ele vale 12 horas: se o dono desativar um vendedor ou
   rebaixar um gerente, o token antigo continuaria valendo com o
   perfil antigo até expirar.

   Por isso, a cada chamada, o usuário é conferido no banco:
   desativado é barrado na hora, e perfil, cargo e loja passam a
   valer como estão no cadastro agora — não como estavam no login.
   ============================================================== */

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ erro: 'Token de acesso ausente. Faça login novamente.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido ou expirado. Faça login novamente.' });
  }

  try {
    const { rows } = await db.query(
      'SELECT id, store_id, nome, cargo, perfil, ativo FROM users WHERE id = $1',
      [payload.id]
    );
    const usuario = rows[0];

    // A loja também é conferida: um token nunca pode trocar de loja.
    if (!usuario || !usuario.ativo || usuario.store_id !== payload.storeId) {
      return res.status(401).json({ erro: 'Seu acesso foi desativado. Fale com o dono da loja.' });
    }

    req.user = {
      id: usuario.id,
      storeId: usuario.store_id,
      nome: usuario.nome,
      cargo: usuario.cargo,
      perfil: usuario.perfil || 'vendedor',
    };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth };
