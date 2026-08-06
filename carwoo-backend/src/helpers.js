// Envolve um handler async e encaminha erros para o middleware de erro,
// evitando try/catch repetido em todas as rotas.
function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

// Monta dinamicamente um UPDATE apenas com os campos enviados.
// Ex: buildUpdate('vehicles', { preco: 1000 }, 'id = $X AND store_id = $Y', [id, storeId])
function buildUpdate(tabela, campos, whereSql, whereValores) {
  const chaves = Object.keys(campos).filter((k) => campos[k] !== undefined);
  if (chaves.length === 0) return null;

  const sets = chaves.map((k, i) => `${k} = $${i + 1}`);
  const valores = chaves.map((k) => campos[k]);

  // Reindexa os placeholders do WHERE para continuarem a numeração
  let contador = chaves.length;
  const where = whereSql.replace(/\$\w+/g, () => `$${++contador}`);

  const sql = `UPDATE ${tabela} SET ${sets.join(', ')} WHERE ${where} RETURNING *`;
  return { sql, valores: [...valores, ...whereValores] };
}

function paraNumero(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Converte a data brasileira (dd/mm/aaaa) para o formato que o banco entende.
 *
 * POR QUE ISSO EXISTE
 * A tela mostra e envia a data como o brasileiro escreve: 02/08/2026 e o dia
 * 2 de agosto. O Postgres deste projeto esta configurado como MDY, entao ele
 * leria "mes 02, dia 08" - fevereiro. O resultado eram dois estragos:
 *   - dia ate 12: gravava a data errada, em silencio (agosto virava fevereiro)
 *   - dia acima de 12: o banco recusava e a operacao inteira falhava
 * Passar sempre em aaaa-mm-dd elimina qualquer ambiguidade.
 *
 * Aceita tambem quem ja mandar aaaa-mm-dd, para nao quebrar chamadas antigas.
 */
function paraDataISO(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const texto = String(valor).trim();

  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (br) {
    const [, dia, mes, ano] = br;
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);

  return null; // formato desconhecido: melhor gravar nulo do que data errada
}

module.exports = { asyncRoute, buildUpdate, paraNumero, paraDataISO };
