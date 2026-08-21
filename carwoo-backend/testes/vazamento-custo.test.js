/* ==============================================================
   Prova do vazamento encontrado pelos testes

   O dono cadastra o carro com o custo real. Depois o vendedor
   edita alguma coisa comum — a quilometragem — e a resposta da
   edicao devolve o custo de compra e os custos de preparacao,
   que ele nunca deveria ver.

   Regra 4 do CLAUDE.md: dado financeiro nao vai para vendedor.
   ============================================================== */

const { test } = require('node:test');
const assert = require('node:assert');
const { instalarBancoFalso, pegarHandler, chamar } = require('./banco-falso');

instalarBancoFalso();
const rotaVeiculos = require('../src/routes/vehicles');

const dono = { id: 1, perfil: 'dono', storeId: 10 };
const vendedor = { id: 3, perfil: 'vendedor', storeId: 10 };

test('vendedor que edita um carro nao recebe o custo do dono', async () => {
  // 1. O dono cadastra com custo real de 64.000
  const criar = pegarHandler(rotaVeiculos, 'post', '/');
  const criado = await chamar(criar, {
    user: dono, params: {}, query: {},
    body: {
      marca: 'Fiat', modelo: 'Argo', preco: 74900,
      custo: 64000,
      custosExtras: [{ desc: 'Higienizacao', valor: 450 }],
    },
  });
  assert.equal(criado.corpo.custo, 64000, 'o custo do dono nem chegou a ser gravado');

  // 2. O vendedor edita so a quilometragem — coisa que ele pode fazer
  const editar = pegarHandler(rotaVeiculos, 'put', '/:id');
  const res = await chamar(editar, {
    user: vendedor, params: { id: 42 }, query: {},
    body: { km: 31000 },
  });

  // 3. A resposta nao pode trazer dinheiro
  assert.equal(res.corpo.km, 31000, 'a edicao do vendedor nao funcionou');
  assert.equal(res.corpo.custo, undefined, 'VAZOU: o vendedor recebeu o custo de compra do dono');
  assert.equal(res.corpo.custosExtras, undefined, 'VAZOU: o vendedor recebeu os custos de preparacao');
});

test('vendedor que cadastra um carro tambem nao recebe campo de custo', async () => {
  const criar = pegarHandler(rotaVeiculos, 'post', '/');
  const res = await chamar(criar, {
    user: vendedor, params: {}, query: {},
    body: { marca: 'Fiat', modelo: 'Mobi', preco: 52000 },
  });
  assert.equal(res.corpo.custo, undefined, 'o campo custo apareceu na resposta ao vendedor');
});
