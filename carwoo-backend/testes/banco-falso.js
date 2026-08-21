/* ==============================================================
   Banco de mentira

   Permite testar as rotas sem Postgres nenhum: nem banco local,
   nem .env, nem internet. Guarda o que a rota mandou gravar e
   devolve na leitura, exatamente como o banco de verdade faria.

   E assim que os testes pegam o defeito classico deste projeto:
   se a rota esquecer um campo no INSERT, ele volta vazio na
   leitura e o teste falha.
   ============================================================== */

const path = require('node:path');

// Colunas do INSERT de veiculos, na mesma ordem dos $1..$24 da rota.
const COLUNAS_VEICULO = [
  'store_id', 'marca', 'modelo', 'versao', 'ano_fab', 'ano_mod', 'km', 'cor',
  'cambio', 'combustivel', 'placa', 'renavam', 'chassi', 'portas', 'descricao',
  'preco', 'custo', 'status', 'destaque', 'entrada', 'fipe_valor', 'fipe_ref',
  'codigo_fipe', 'docs',
];

function criarBancoFalso() {
  const consultas = [];
  let veiculo = null;
  let custos = [];
  let portais = [];

  async function query(sql, valores = []) {
    consultas.push({ sql, valores });
    const texto = String(sql).replace(/\s+/g, ' ');

    if (/INSERT INTO vehicles/i.test(texto)) {
      veiculo = { id: 42 };
      COLUNAS_VEICULO.forEach((col, i) => { veiculo[col] = valores[i]; });
      // O Postgres devolve jsonb como objeto, nao como texto
      if (typeof veiculo.docs === 'string') veiculo.docs = JSON.parse(veiculo.docs);
      return { rows: [veiculo] };
    }
    if (/UPDATE vehicles/i.test(texto)) {
      const sets = [...texto.matchAll(/(\w+) = \$(\d+)/g)];
      sets.forEach(([, col, n]) => { veiculo[col] = valores[Number(n) - 1]; });
      if (typeof veiculo.docs === 'string') veiculo.docs = JSON.parse(veiculo.docs);
      return { rows: [veiculo] };
    }

    if (/DELETE FROM vehicle_costs/i.test(texto)) { custos = []; return { rows: [] }; }
    if (/INSERT INTO vehicle_costs/i.test(texto)) {
      custos.push({ id: custos.length + 1, desc: valores[1], valor: valores[2] });
      return { rows: [] };
    }
    if (/FROM vehicle_costs/i.test(texto)) return { rows: custos };

    if (/DELETE FROM vehicle_portals/i.test(texto)) { portais = []; return { rows: [] }; }
    if (/INSERT INTO vehicle_portals/i.test(texto)) {
      portais.push({ portal_id: valores[1] });
      return { rows: [] };
    }
    if (/FROM vehicle_portals/i.test(texto)) return { rows: portais };

    if (/FROM vehicle_photos/i.test(texto)) return { rows: [] };

    return { rows: [] };
  }

  return {
    query,
    pool: { query },
    consultas,
    ultimoInsertDeVeiculo: () => consultas.find((c) => /INSERT INTO vehicles/i.test(c.sql)),
  };
}

/* Coloca o banco de mentira no lugar do de verdade ANTES de a rota ser
   carregada. Sem isso, src/db.js tentaria conectar e encerraria o processo
   reclamando que falta DATABASE_URL. */
function instalarBancoFalso() {
  const falso = criarBancoFalso();
  const caminho = require.resolve('../src/db');
  require.cache[caminho] = {
    id: caminho,
    filename: caminho,
    path: path.dirname(caminho),
    loaded: true,
    exports: falso,
    children: [],
    paths: [],
  };
  return falso;
}

/* Pega o handler final de uma rota, pulando os middlewares de permissao
   e de limite de plano — que tem testes proprios. */
function pegarHandler(router, metodo, caminho) {
  const camada = router.stack.find(
    (l) => l.route && l.route.path === caminho && l.route.methods[metodo]
  );
  if (!camada) throw new Error(`Rota ${metodo.toUpperCase()} ${caminho} nao encontrada`);
  const pilha = camada.route.stack;
  return pilha[pilha.length - 1].handle;
}

/* Um res falso que guarda o que a rota respondeu. */
function criarResposta() {
  const r = { statusCode: 200, corpo: null };
  r.status = (s) => { r.statusCode = s; return r; };
  r.json = (c) => { r.corpo = c; return r; };
  return r;
}

async function chamar(handler, req) {
  const res = criarResposta();
  let erro = null;
  await handler(req, res, (e) => { erro = e; });
  if (erro) throw erro;
  return res;
}

module.exports = { instalarBancoFalso, pegarHandler, criarResposta, chamar };
