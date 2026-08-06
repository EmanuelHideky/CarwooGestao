const express = require('express');
const db = require('../db');
const { asyncRoute, buildUpdate } = require('../helpers');
const { exigirPermissao } = require('../middleware/role');
const { cnpjValido, apenasDigitos } = require('../validadores');

const router = express.Router();

function mapear(row) {
  return {
    id: row.id,
    nome: row.nome,
    cnpj: row.cnpj,
    endereco: row.endereco,
    cep: row.cep,
    cidade: row.cidade,
    estado: row.estado,
    telefone: row.telefone,
    email: row.email,
    instagram: row.instagram,
    garantiaPadraoDias: row.garantia_padrao_dias,
    avisarGarantiaDias: row.avisar_garantia_dias,
  };
}

// GET /api/store -> dados da loja do usuário logado
router.get('/', asyncRoute(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM stores WHERE id = $1', [req.user.storeId]);
  if (!rows[0]) return res.status(404).json({ erro: 'Loja não encontrada.' });
  res.json(mapear(rows[0]));
}));

// PUT /api/store -> atualiza os dados da loja
router.put('/', exigirPermissao('equipe'), asyncRoute(async (req, res) => {
  const b = req.body;
  if (b.cnpj !== undefined && b.cnpj !== null && b.cnpj !== '') {
    const limpo = apenasDigitos(b.cnpj);
    if (!cnpjValido(limpo)) return res.status(400).json({ erro: 'O CNPJ informado é inválido.' });
    const outro = await db.query('SELECT id FROM stores WHERE cnpj = $1 AND id <> $2', [limpo, req.user.storeId]);
    if (outro.rows[0]) return res.status(409).json({ erro: 'Este CNPJ já está em uso por outra loja.' });
    b.cnpj = limpo;
  }
  const campos = {
    nome: b.nome, cnpj: b.cnpj, endereco: b.endereco,
    // CEP, cidade e estado sao exigidos pelos portais (OLX pede o CEP;
    // Mercado Livre pede cidade e estado). O endereco em texto livre nao serve.
    cep: b.cep === undefined ? undefined : apenasDigitos(b.cep),
    cidade: b.cidade, estado: b.estado,
    telefone: b.telefone, email: b.email, instagram: b.instagram,
    garantia_padrao_dias: b.garantiaPadraoDias,
    avisar_garantia_dias: b.avisarGarantiaDias,
  };
  const update = buildUpdate('stores', campos, 'id = $a', [req.user.storeId]);
  if (!update) return res.status(400).json({ erro: 'Nenhum campo enviado.' });

  const { rows } = await db.query(update.sql, update.valores);
  res.json(mapear(rows[0]));
}));

module.exports = router;
