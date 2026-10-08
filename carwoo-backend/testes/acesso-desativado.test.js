/* ==============================================================
   Acesso desativado e troca de perfil

   O token do login vale 12 horas. Antes desta correção, um
   vendedor desligado continuava entrando até o token vencer, e
   um gerente rebaixado continuava vendo o financeiro.

   Estes testes provam que o servidor confere o cadastro a cada
   chamada, e não confia no que estava escrito no token.
   ============================================================== */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { criarResposta } = require('./banco-falso');

process.env.JWT_SECRET = 'segredo-so-para-teste';

// Cadastro de mentira: o teste muda o usuário aqui, como o dono faria na tela
const usuarios = {};

const caminhoDb = require.resolve('../src/db');
require.cache[caminhoDb] = {
  id: caminhoDb,
  filename: caminhoDb,
  path: path.dirname(caminhoDb),
  loaded: true,
  exports: {
    query: async (sql, valores) => {
      const u = usuarios[valores[0]];
      return { rows: u ? [{ ...u }] : [] };
    },
  },
  children: [],
  paths: [],
};

const { requireAuth } = require('../src/middleware/auth');

// Token como o login gera, com o perfil que a pessoa tinha naquele momento
function tokenDe(u) {
  return jwt.sign(
    { id: u.id, storeId: u.store_id, nome: u.nome, cargo: u.cargo, perfil: u.perfil },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

async function acessar(token) {
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = criarResposta();
  let passou = false;
  await requireAuth(req, res, () => { passou = true; });
  return { passou, req, res };
}

function cadastrar(dados) {
  usuarios[dados.id] = { store_id: 10, cargo: 'Vendedor', ativo: true, ...dados };
  return usuarios[dados.id];
}

test('usuario ativo entra normalmente', async () => {
  const u = cadastrar({ id: 1, nome: 'Ana', perfil: 'vendedor' });
  const { passou, req } = await acessar(tokenDe(u));
  assert.equal(passou, true);
  assert.equal(req.user.id, 1);
  assert.equal(req.user.storeId, 10);
});

test('vendedor desativado e barrado na hora, mesmo com token dentro do prazo', async () => {
  const u = cadastrar({ id: 2, nome: 'Bruno', perfil: 'vendedor' });
  const token = tokenDe(u);
  usuarios[2].ativo = false; // o dono desativou o acesso

  const { passou, res } = await acessar(token);
  assert.equal(passou, false);
  assert.equal(res.statusCode, 401);
});

test('usuario apagado do cadastro e barrado', async () => {
  const u = cadastrar({ id: 3, nome: 'Carla', perfil: 'vendedor' });
  const token = tokenDe(u);
  delete usuarios[3];

  const { passou, res } = await acessar(token);
  assert.equal(passou, false);
  assert.equal(res.statusCode, 401);
});

test('gerente rebaixado a vendedor perde o perfil de gerente na hora', async () => {
  const u = cadastrar({ id: 4, nome: 'Diego', perfil: 'gerente' });
  const token = tokenDe(u); // token ainda diz "gerente"
  usuarios[4].perfil = 'vendedor';

  const { passou, req } = await acessar(token);
  assert.equal(passou, true);
  assert.equal(req.user.perfil, 'vendedor');
});

test('token que aponta para outra loja e recusado', async () => {
  const u = cadastrar({ id: 5, nome: 'Eva', perfil: 'dono' });
  const token = tokenDe(u);
  usuarios[5].store_id = 99;

  const { passou, res } = await acessar(token);
  assert.equal(passou, false);
  assert.equal(res.statusCode, 401);
});

test('sem token, ou com token falsificado, continua barrando', async () => {
  const semToken = criarResposta();
  let passou = false;
  await requireAuth({ headers: {} }, semToken, () => { passou = true; });
  assert.equal(passou, false);
  assert.equal(semToken.statusCode, 401);

  const falso = jwt.sign({ id: 1, storeId: 10 }, 'outra-chave');
  const r = await acessar(falso);
  assert.equal(r.passou, false);
  assert.equal(r.res.statusCode, 401);
});
