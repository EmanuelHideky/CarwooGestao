/**
 * Validação de CPF e CNPJ com os dígitos verificadores reais.
 * Usado no cadastro da loja e na emissão de nota fiscal.
 */

function apenasDigitos(v) {
  return String(v || '').replace(/\D/g, '');
}

function cnpjValido(valor) {
  const c = apenasDigitos(valor);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (base, pesos) => {
    const soma = base.reduce((a, n, i) => a + n * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const n = c.split('').map(Number);
  if (calc(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) !== n[12]) return false;
  return calc(n.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === n[13];
}

function cpfValido(valor) {
  const c = apenasDigitos(valor);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(c[i]) * (10 - i);
  if (((soma * 10) % 11) % 10 !== Number(c[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(c[i]) * (11 - i);
  return ((soma * 10) % 11) % 10 === Number(c[10]);
}

function documentoValido(valor) {
  const c = apenasDigitos(valor);
  if (c.length === 11) return cpfValido(c);
  if (c.length === 14) return cnpjValido(c);
  return false;
}

/** Formata para exibição: 00.000.000/0000-00 ou 000.000.000-00 */
function formatarDocumento(valor) {
  const c = apenasDigitos(valor);
  if (c.length === 11) return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (c.length === 14) return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return c;
}

module.exports = { apenasDigitos, cnpjValido, cpfValido, documentoValido, formatarDocumento };
