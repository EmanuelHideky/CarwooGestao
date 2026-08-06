const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ erro: 'Token de acesso ausente. Faça login novamente.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, storeId, nome, cargo }
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido ou expirado. Faça login novamente.' });
  }
}

module.exports = { requireAuth };
