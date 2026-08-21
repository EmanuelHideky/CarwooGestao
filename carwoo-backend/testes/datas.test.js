/* ==============================================================
   Datas

   Este projeto ja gravou data errada duas vezes. O Postgres esta
   em MDY: 02/08/2026 seria lido como fevereiro, e 15/03/2026 seria
   recusado. Os testes abaixo travam esse comportamento para sempre.
   ============================================================== */

const { test } = require('node:test');
const assert = require('node:assert');
const { paraDataISO, paraNumero } = require('../src/helpers');

test('data brasileira vira o formato do banco', () => {
  assert.equal(paraDataISO('15/03/2026'), '2026-03-15');
});

test('dia ate 12 nao vira mes — o erro silencioso que ja aconteceu', () => {
  // 2 de agosto. Se virar 2026-02-08, o estrago volta.
  assert.equal(paraDataISO('02/08/2026'), '2026-08-02');
});

test('aceita dia e mes sem o zero na frente', () => {
  assert.equal(paraDataISO('5/3/2026'), '2026-03-05');
});

test('quem ja manda no formato do banco passa direto', () => {
  assert.equal(paraDataISO('2026-03-15'), '2026-03-15');
});

test('campo vazio vira nulo, nao data de hoje', () => {
  assert.equal(paraDataISO(''), null);
  assert.equal(paraDataISO(null), null);
  assert.equal(paraDataISO(undefined), null);
});

test('formato desconhecido grava nulo em vez de data errada', () => {
  assert.equal(paraDataISO('quinze de marco'), null);
  assert.equal(paraDataISO('15-03-2026'), null);
});

test('valor vazio nao vira zero', () => {
  // Zero e um numero valido: se '' virasse 0, um carro sem preco
  // informado apareceria como carro de graca.
  assert.equal(paraNumero(''), null);
  assert.equal(paraNumero(0), 0);
  assert.equal(paraNumero('74900'), 74900);
  assert.equal(paraNumero('abc'), null);
});
