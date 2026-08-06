# carwoo gestão — contexto do projeto

Este arquivo existe para dar contexto a quem for trabalhar neste código,
inclusive ao Claude Code. Leia antes de mexer em qualquer coisa.

## Quem está do outro lado

Emanuel, dono do produto, **não é programador**. Explique em português claro,
sem jargão, e diga o que cada comando faz antes de rodar. Quando algo falhar,
diga o que falhou e o que você vai tentar — não apenas "corrigindo...".

Nunca peça para ele editar código. Peça só o que depende dele: credenciais,
decisões de negócio, cliques em sites de terceiros.

## O que é o produto

CRM para lojas de veículos usadas no Brasil. Gestão de estoque, anúncios em
portais, funil de leads, vendas, garantia pós-venda, financeiro, IPVA e nota
fiscal. Cobrança por assinatura mensal.

## Estrutura

```
carwoo-app/          front-end (PWA instalável)
  index.html    aplicação inteira em um arquivo — HTML + CSS + JS
  manifest.json      identidade do app instalado
  service-worker.js  cache e modo offline
  icons/             ícones

carwoo-backend/      API
  src/server.js      monta as rotas
  src/db.js          conexão Postgres (detecta SSL sozinho)
  src/schema.sql     22 tabelas
  src/migrate.js     aplica o schema comando a comando
  src/routes/        auth, vehicles, leads, sales, postsale, finance,
                     invoices, billing, store, inbound, notifications, misc
  src/middleware/    auth (JWT), role (perfis), plan (limites do plano)
  .env               credenciais — NUNCA versionar nem mostrar o conteúdo

GUIA_WINDOWS.md      passo a passo para o Emanuel, do zero
DEPLOY.md            etapas de publicação
```

## Stack

Node.js + Express + PostgreSQL (`pg`). Sem framework no front-end: JavaScript
puro manipulando o DOM. Banco no Supabase.

## Estado atual

**Funciona:** login com JWT, cadastro de loja, as 13 telas, persistência no
Postgres, perfis de acesso (dono / gerente / vendedor), consulta real à tabela
FIPE, validação de CPF e CNPJ com dígitos verificadores, cálculo de IPVA,
garantia com baixa automática, PWA instalável.

**Ainda não funciona de verdade** (depende de contrato com terceiros):
cobrança de assinatura (falta gateway), emissão de NF-e (falta provedor fiscal
e certificado), publicação automática nos portais (falta parceria comercial),
e-mail de recuperação de senha (falta provedor de e-mail).

Em todos esses casos o código tem o ponto de integração marcado com comentário
e a interface avisa o usuário que aquilo ainda não está ativo. **Não finja que
funcionam.**

## Regras que não podem ser quebradas

1. **Não altere ids, nomes de função ou classes de estado.** O front-end é um
   arquivo só, e o JS depende de: `active`, `dragover`, `on`, `open`, `wide`,
   além dos seletores `.chip`, `.navlink`, `.sidebar-user`, `.store-plan`,
   `.view`.

2. **Duas interfaces convivem.** `data-skin="instrumento"` (padrão) e a clássica
   (sem o atributo). A troca é só CSS. Qualquer estilo novo precisa funcionar
   nas duas.

3. **Isolamento por loja.** Toda consulta filtra por `store_id`. Uma loja nunca
   pode ver dado de outra. Ao criar rota nova, mantenha isso.

4. **Dados financeiros não vão para vendedor.** `filtrarVeiculo` e
   `filtrarVenda` em `src/middleware/role.js` removem custo e margem antes de
   responder. Esconder no front não é proteção.

5. **Nada de dado de exemplo em conta real.** `limparDadosDeExemplo()` zera tudo
   antes de carregar do servidor. Tela vazia é honesta; dado falso é perigoso.

6. **O `.env` tem a senha do banco.** Não mostre o conteúdo, não versione, não
   cole em lugar nenhum.

## Tarefa: colocar no ar

Siga o `DEPLOY.md`. Ordem e critério de sucesso de cada etapa:

| # | Etapa | Como saber que deu certo |
|---|---|---|
| 1 | `npm install` em `carwoo-backend` | termina com `added N packages` |
| 2 | `.env` preenchido | `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` sem valor de exemplo |
| 3 | `npm run migrate` | imprime "Todas as 22 tabelas esperadas estao no banco" |
| 4 | `npm start` | `curl localhost:3000/api/health` responde `{"ok":true}` |
| 5 | servir o front | `npx serve -l 8080` dentro de `carwoo-app` |
| 6 | teste de ponta a ponta | cadastrar loja, cadastrar veículo, recarregar, logar, veículo continua lá |

O `migrate.js` já aponta a linha exata do `schema.sql` quando falha. Leia a
mensagem antes de tentar corrigir.

**O que depende do Emanuel, não de você:** criar conta no Supabase, copiar a
string de conexão, definir a senha do banco, criar conta no Netlify ou Railway,
autenticar as CLIs de deploy. Peça, espere, e siga.

## Erros que já apareceram

| Sintoma | Causa |
|---|---|
| `execução de scripts foi desabilitada` no Windows | rodar `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |
| `password authentication failed` | senha do banco errada, ou tem `@ # / : ?` — trocar por letras e números |
| `Servidor fora do ar` na tela de login | backend parado, ou `CORS_ORIGIN` diferente do endereço do front |
| Erro estranho no migrate | pode ser o pooler do Supabase na porta 6543; usar conexão direta |

## Depois de publicar

Pendências reais, em ordem de urgência:

1. **RENAVE** — obrigatório para revendas desde junho de 2026. Concorrentes já
   vendem "integrador homologado" como diferencial. Pesquisar credenciamento
   junto ao Denatran.
2. **Fotos em storage de objetos** — hoje vão como base64 e incham o banco.
   Migrar para Cloudflare R2 ou S3 antes de ter volume.
3. **LGPD** — o sistema guarda CPF e telefone de compradores. Falta política de
   privacidade, termos de uso e processo de exclusão de dados.
4. **E-mail de recuperação de senha** — sem isso, o primeiro cliente que
   esquecer a senha fica travado.

## Ao concluir

Diga o que funcionou, o que não funcionou e o que ficou pendente. Se algo
quebrou e você contornou, explique o contorno — o Emanuel precisa saber o que
tem no sistema dele.
