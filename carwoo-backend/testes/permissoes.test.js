/* ==============================================================
   Perfis de acesso

   Regra 4 do CLAUDE.md: dado financeiro nao vai para vendedor.
   Esconder na tela e conforto, nao protecao — quem abre as
   ferramentas do navegador ve tudo que o servidor mandou.
   Estes testes provam que o servidor nao manda.
   ============================================================== */

const { test } = require('node:test');
const assert = require('node:assert');
const {
  filtrarVeiculo, filtrarVenda, filtrarLista,
  filtroDeVendas, pode, exigirPermissao,
} = require('../src/middleware/role');

const dono     = { user: { id: 1, perfil: 'dono',     storeId: 10 } };
const gerente  = { user: { id: 2, perfil: 'gerente',  storeId: 10 } };
const vendedor = { user: { id: 3, perfil: 'vendedor', storeId: 10 } };

const VEICULO = {
  id: 7, marca: 'Fiat', modelo: 'Argo', preco: 74900,
  custo: 64000, custosExtras: [{ desc: 'Higienizacao', valor: 450 }], margem: 10900,
};

const VENDA = {
  id: 3, veiculo: 'Argo', valor: 74900, vendedorId: 3, comissao: 2247,
  custoVeiculo: 64000, lucroBruto: 10900, lucroReal: 9200,
  margemBruta: 14.5, margemReal: 12.3,
};

test('vendedor nao recebe custo, custos de preparacao nem margem do veiculo', () => {
  const r = filtrarVeiculo(VEICULO, vendedor);
  assert.equal(r.custo, undefined);
  assert.equal(r.custosExtras, undefined);
  assert.equal(r.margem, undefined);
  // ...mas continua vendo o que precisa para vender
  assert.equal(r.preco, 74900);
  assert.equal(r.modelo, 'Argo');
});

test('dono e gerente recebem o veiculo inteiro', () => {
  for (const quem of [dono, gerente]) {
    const r = filtrarVeiculo(VEICULO, quem);
    assert.equal(r.custo, 64000);
    assert.equal(r.margem, 10900);
  }
});

test('vendedor nao recebe lucro nem margem da venda', () => {
  const r = filtrarVenda(VENDA, vendedor);
  for (const campo of ['custoVeiculo', 'lucroBruto', 'lucroReal', 'margemBruta', 'margemReal']) {
    assert.equal(r[campo], undefined, `vazou o campo ${campo}`);
  }
});

test('vendedor ve a propria comissao, mas nao a dos outros', () => {
  const minha = filtrarVenda(VENDA, vendedor);
  assert.equal(minha.comissao, 2247);

  const doColega = filtrarVenda({ ...VENDA, vendedorId: 99 }, vendedor);
  assert.equal(doColega.comissao, undefined);
});

test('o filtro nao estraga o objeto original', () => {
  // Se filtrarVeiculo apagasse os campos no lugar, o proximo pedido
  // do dono viria sem custo — e ninguem entenderia por que.
  filtrarVeiculo(VEICULO, vendedor);
  assert.equal(VEICULO.custo, 64000);
});

test('a lista inteira e filtrada, nao so o primeiro', () => {
  const lista = [VEICULO, { ...VEICULO, id: 8 }, { ...VEICULO, id: 9 }];
  const r = filtrarLista(lista, vendedor, 'veiculo');
  assert.equal(r.length, 3);
  assert.ok(r.every((v) => v.custo === undefined), 'algum veiculo da lista veio com custo');
});

test('vendedor so enxerga as proprias vendas na consulta ao banco', () => {
  const f = filtroDeVendas(vendedor, 3);
  assert.match(f.sql, /vendedor_id = \$3/);
  assert.deepEqual(f.valores, [3]);

  // dono nao ganha restricao nenhuma
  assert.equal(filtroDeVendas(dono, 3).sql, '');
});

test('quem nao tem perfil reconhecido cai no mais restrito', () => {
  const estranho = { user: { id: 4, perfil: 'estagiario', storeId: 10 } };
  assert.equal(pode(estranho, 'custos'), false);
  assert.equal(filtrarVeiculo(VEICULO, estranho).custo, undefined);

  // requisicao sem usuario nenhum tambem
  assert.equal(pode({}, 'financeiro'), false);
});

test('a rota do financeiro barra o vendedor com 403', () => {
  const barreira = exigirPermissao('financeiro');
  let status = null; let corpo = null; let passou = false;
  const res = { status(s) { status = s; return this; }, json(c) { corpo = c; } };

  barreira(vendedor, res, () => { passou = true; });
  assert.equal(passou, false, 'o vendedor passou pela barreira do financeiro');
  assert.equal(status, 403);
  assert.ok(corpo.erro);

  barreira(dono, res, () => { passou = true; });
  assert.equal(passou, true, 'o dono foi barrado do proprio financeiro');
});
