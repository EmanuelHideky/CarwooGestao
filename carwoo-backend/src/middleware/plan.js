const db = require('../db');

/**
 * Bloqueia o acesso quando a assinatura está cancelada ou vencida.
 * Rotas de leitura continuam liberadas para o lojista não ficar sem
 * os próprios dados; apenas a criação de coisas novas é barrada.
 */
function exigirAssinaturaAtiva(req, res, next) {
  db.query(
    `SELECT status, fim_teste FROM subscriptions WHERE store_id = $1`,
    [req.user.storeId]
  )
    .then(({ rows }) => {
      const assinatura = rows[0];

      // Loja sem plano escolhido ainda: libera (está avaliando o produto)
      if (!assinatura) return next();

      if (assinatura.status === 'cancelada') {
        return res.status(402).json({
          erro: 'Assinatura cancelada.',
          detalhe: 'Reative um plano para continuar cadastrando. Seus dados continuam disponíveis para consulta e exportação.',
          acao: 'reativar_plano',
        });
      }

      if (assinatura.status === 'inadimplente') {
        return res.status(402).json({
          erro: 'Pagamento pendente.',
          detalhe: 'Regularize a cobrança em aberto para voltar a cadastrar.',
          acao: 'regularizar_pagamento',
        });
      }

      if (assinatura.status === 'teste' && assinatura.fim_teste) {
        const acabou = new Date(assinatura.fim_teste) < new Date();
        if (acabou) {
          return res.status(402).json({
            erro: 'Período de teste encerrado.',
            detalhe: 'Escolha um plano para continuar usando o carwoo.',
            acao: 'escolher_plano',
          });
        }
      }

      next();
    })
    .catch(next);
}

/**
 * Impede ultrapassar o limite do plano.
 * Uso: router.post('/', checarLimite('veiculos'), handler)
 */
function checarLimite(recurso) {
  const consultas = {
    veiculos: {
      sql: `SELECT COUNT(*)::int AS total FROM vehicles WHERE store_id = $1 AND status <> 'vendido'`,
      coluna: 'limite_veiculos',
      nome: 'veículos em estoque',
    },
    usuarios: {
      sql: `SELECT COUNT(*)::int AS total FROM users WHERE store_id = $1 AND ativo = true`,
      coluna: 'limite_usuarios',
      nome: 'usuários',
    },
    portais: {
      sql: `SELECT COUNT(*)::int AS total FROM integrations WHERE store_id = $1 AND conectado = true`,
      coluna: 'limite_portais',
      nome: 'portais conectados',
    },
  };

  const config = consultas[recurso];

  return async function (req, res, next) {
    try {
      const { rows } = await db.query(
        `SELECT p.${config.coluna} AS limite, p.nome AS plano
           FROM subscriptions s JOIN plans p ON p.id = s.plan_id
          WHERE s.store_id = $1`,
        [req.user.storeId]
      );

      // Sem assinatura registrada ou plano sem limite: segue
      const limite = rows[0] ? rows[0].limite : null;
      if (limite === null || limite === undefined) return next();

      const uso = await db.query(config.sql, [req.user.storeId]);
      if (uso.rows[0].total >= limite) {
        return res.status(402).json({
          erro: `Limite do plano atingido.`,
          detalhe: `Seu plano ${rows[0].plano} permite até ${limite} ${config.nome}. Faça upgrade para continuar.`,
          acao: 'upgrade_plano',
          limite,
          usoAtual: uso.rows[0].total,
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { exigirAssinaturaAtiva, checarLimite };
