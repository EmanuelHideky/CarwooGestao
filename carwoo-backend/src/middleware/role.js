/* ==============================================================
   Controle de acesso por perfil

   Esconder campos na interface é conforto de uso, não segurança.
   A proteção real está aqui: o servidor simplesmente não envia
   custo, margem e resultado financeiro para quem tem perfil de
   vendedor. Mesmo que a pessoa abra as ferramentas do navegador
   ou chame a API direto, os campos não existem na resposta.
   ============================================================== */

const PERFIS = {
  dono: {
    label: 'Dono da loja',
    permissoes: { custos: true, margens: true, financeiro: true, relatorios: true, assinatura: true, equipe: true, precificacao: true, todasVendas: true },
  },
  gerente: {
    label: 'Gerente',
    permissoes: { custos: true, margens: true, financeiro: true, relatorios: true, assinatura: false, equipe: true, precificacao: true, todasVendas: true },
  },
  vendedor: {
    label: 'Vendedor',
    permissoes: { custos: false, margens: false, financeiro: false, relatorios: false, assinatura: false, equipe: false, precificacao: false, todasVendas: false },
  },
};

function perfilDe(req) {
  return PERFIS[req.user?.perfil] || PERFIS.vendedor;
}

function pode(req, chave) {
  return !!perfilDe(req).permissoes[chave];
}

/** Bloqueia a rota inteira para quem não tem a permissão. */
function exigirPermissao(chave) {
  return function (req, res, next) {
    if (pode(req, chave)) return next();
    res.status(403).json({
      erro: 'Seu perfil não tem acesso a esta informação.',
      detalhe: 'Fale com o dono da loja se precisar dessa permissão.',
    });
  };
}

/** Remove os campos financeiros de um veículo antes de enviar. */
function filtrarVeiculo(veiculo, req) {
  if (pode(req, 'custos')) return veiculo;
  const copia = { ...veiculo };
  delete copia.custo;
  delete copia.custosExtras;
  delete copia.margem;
  return copia;
}

/** Remove os campos financeiros de uma venda antes de enviar. */
function filtrarVenda(venda, req) {
  if (pode(req, 'margens')) return venda;
  const copia = { ...venda };
  delete copia.custoVeiculo;
  delete copia.lucroBruto;
  delete copia.lucroReal;
  delete copia.margemBruta;
  delete copia.margemReal;
  // O vendedor vê apenas a própria comissão
  if (venda.vendedorId !== req.user.id) delete copia.comissao;
  return copia;
}

/** Aplica os dois filtros em uma lista. */
function filtrarLista(lista, req, tipo) {
  const fn = tipo === 'venda' ? filtrarVenda : filtrarVeiculo;
  return lista.map((item) => fn(item, req));
}

/**
 * Vendedor só enxerga as próprias vendas.
 * Devolve o trecho de SQL e os valores a acrescentar na consulta.
 */
function filtroDeVendas(req, indiceProximoParametro) {
  if (pode(req, 'todasVendas')) return { sql: '', valores: [] };
  return { sql: ` AND s.vendedor_id = $${indiceProximoParametro}`, valores: [req.user.id] };
}

module.exports = {
  PERFIS,
  pode,
  perfilDe,
  exigirPermissao,
  filtrarVeiculo,
  filtrarVenda,
  filtrarLista,
  filtroDeVendas,
};
