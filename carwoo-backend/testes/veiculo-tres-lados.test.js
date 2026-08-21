/* ==============================================================
   O defeito recorrente deste projeto

   Regra 7 do CLAUDE.md: a tela pede o dado, a coluna existe no
   banco, e a rota do servidor ignora. O dado some sem aviso e so
   se descobre quando alguem recarrega a pagina.

   Ja aconteceu com: fotos, descricao do anuncio, renavam, custo
   da venda, dados de garantia, comissao e contas a pagar.

   Este arquivo cadastra um veiculo com TODOS os campos que a tela
   envia (index.html, funcao saveVehicle) e confere que cada um
   volta igual na resposta. Se alguem acrescentar um campo na tela
   e esquecer da rota, o teste falha aqui e nao na loja do cliente.
   ============================================================== */

const { test } = require('node:test');
const assert = require('node:assert');
const { instalarBancoFalso, pegarHandler, chamar } = require('./banco-falso');

const banco = instalarBancoFalso();          // tem que vir ANTES do require da rota
const rotaVeiculos = require('../src/routes/vehicles');

const dono = { id: 1, perfil: 'dono', storeId: 10 };
const vendedor = { id: 3, perfil: 'vendedor', storeId: 10 };

/* Exatamente o que saveVehicle() monta e manda em POST /api/vehicles. */
function veiculoDaTela() {
  return {
    marca: 'Fiat',
    modelo: 'Argo',
    versao: 'Drive 1.0 Flex',
    anoFab: 2022,
    anoMod: 2023,
    km: 28500,
    cor: 'Branco',
    cambio: 'Manual',
    combustivel: 'Flex',
    placa: 'RVX4A21',
    renavam: '04210072454',
    chassi: '9BWZZZ377VT004251',
    portas: 4,
    descricao: 'Unico dono, revisoes em concessionaria.',
    preco: 74900,
    custo: 64000,
    status: 'disponivel',
    destaque: true,
    entrada: '2026-06-18',
    fipeValor: 72400,
    fipeRef: 'julho/2026',
    codigoFipe: '001234-5',
    docs: { crlv: true, ipva: true, laudo: true, transferencia: false },
    custosExtras: [{ desc: 'Higienizacao', valor: 450 }],
    portais: ['webmotors', 'olx'],
  };
}

test('cadastro de veiculo: tudo que a tela envia volta na resposta', async () => {
  const enviado = veiculoDaTela();
  const handler = pegarHandler(rotaVeiculos, 'post', '/');
  const res = await chamar(handler, { user: dono, body: enviado, params: {}, query: {} });

  assert.equal(res.statusCode, 201, 'o cadastro nao respondeu 201');
  const volta = res.corpo;

  // Campos simples: um a um, com nome, para a falha dizer qual sumiu
  const simples = {
    marca: 'Fiat', modelo: 'Argo', versao: 'Drive 1.0 Flex',
    anoFab: 2022, anoMod: 2023, km: 28500, cor: 'Branco',
    cambio: 'Manual', combustivel: 'Flex', placa: 'RVX4A21',
    renavam: '04210072454', chassi: '9BWZZZ377VT004251', portas: 4,
    descricao: 'Unico dono, revisoes em concessionaria.',
    preco: 74900, custo: 64000, status: 'disponivel', destaque: true,
    entrada: '2026-06-18', fipeValor: 72400, fipeRef: 'julho/2026',
    codigoFipe: '001234-5',
  };
  for (const [campo, esperado] of Object.entries(simples)) {
    assert.deepEqual(volta[campo], esperado, `o campo "${campo}" nao voltou igual ao enviado`);
  }

  // Campos compostos
  assert.deepEqual(volta.docs, enviado.docs, 'os documentos do veiculo nao voltaram');
  assert.deepEqual(volta.custosExtras, [{ desc: 'Higienizacao', valor: 450 }], 'os custos de preparacao nao voltaram');
  assert.deepEqual(volta.portais.sort(), ['olx', 'webmotors'], 'os portais nao voltaram');
});

test('nenhum campo enviado pela tela fica de fora do INSERT', async () => {
  const enviado = veiculoDaTela();
  const handler = pegarHandler(rotaVeiculos, 'post', '/');
  await chamar(handler, { user: dono, body: enviado, params: {}, query: {} });

  const insert = banco.ultimoInsertDeVeiculo();
  assert.ok(insert, 'a rota nao chegou a gravar o veiculo');

  // Valores que sao unicos o bastante para procurar na lista do INSERT
  const marcadores = [
    ['renavam', '04210072454'],
    ['chassi', '9BWZZZ377VT004251'],
    ['descricao', 'Unico dono, revisoes em concessionaria.'],
    ['placa', 'RVX4A21'],
    ['fipeRef', 'julho/2026'],
    ['codigoFipe', '001234-5'],
    ['entrada', '2026-06-18'],
  ];
  for (const [campo, valor] of marcadores) {
    assert.ok(
      insert.valores.includes(valor),
      `o campo "${campo}" saiu da tela mas nao entrou no INSERT — e o defeito classico do projeto`
    );
  }
});

test('a loja do usuario e sempre o primeiro valor gravado', async () => {
  // Regra 3 do CLAUDE.md: isolamento por loja. Se o store_id nao for
  // gravado, o veiculo fica orfao e pode aparecer para outra loja.
  const handler = pegarHandler(rotaVeiculos, 'post', '/');
  await chamar(handler, { user: dono, body: veiculoDaTela(), params: {}, query: {} });

  const insert = banco.ultimoInsertDeVeiculo();
  assert.equal(insert.valores[0], 10, 'o store_id nao foi para o INSERT');
  assert.match(insert.sql, /store_id/);
});

test('vendedor nao consegue gravar custo, e nao recebe custo de volta', async () => {
  const handler = pegarHandler(rotaVeiculos, 'post', '/');
  const res = await chamar(handler, {
    user: vendedor,
    body: { ...veiculoDaTela(), custo: 99999 },
    params: {}, query: {},
  });

  assert.equal(res.corpo.custo, undefined, 'o custo vazou para o vendedor');
  assert.equal(res.corpo.custosExtras, undefined, 'os custos de preparacao vazaram para o vendedor');
  // e o valor que ele tentou mandar nao foi parar no banco
  assert.equal(res.corpo.preco, 74900, 'o resto do cadastro deveria funcionar normalmente');
});

test('cadastro sem marca ou modelo e recusado com aviso claro', async () => {
  const handler = pegarHandler(rotaVeiculos, 'post', '/');
  const res = await chamar(handler, { user: dono, body: { modelo: 'Argo' }, params: {}, query: {} });

  assert.equal(res.statusCode, 400);
  assert.match(res.corpo.erro, /marca/i);
});

test('edicao de veiculo tambem devolve os campos que a tela mandou', async () => {
  const criar = pegarHandler(rotaVeiculos, 'post', '/');
  await chamar(criar, { user: dono, body: veiculoDaTela(), params: {}, query: {} });

  const editar = pegarHandler(rotaVeiculos, 'put', '/:id');
  const res = await chamar(editar, {
    user: dono,
    params: { id: 42 },
    query: {},
    body: {
      ...veiculoDaTela(),
      km: 31000,
      preco: 72900,
      descricao: 'Revisado, pneus novos.',
    },
  });

  assert.equal(res.corpo.km, 31000, 'a quilometragem editada nao voltou');
  assert.equal(res.corpo.preco, 72900, 'o preco editado nao voltou');
  assert.equal(res.corpo.descricao, 'Revisado, pneus novos.', 'a descricao editada nao voltou');
  assert.equal(res.corpo.renavam, '04210072454', 'o renavam sumiu na edicao');
});
