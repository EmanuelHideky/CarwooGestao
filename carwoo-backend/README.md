# carwoo · backend

API do CRM carwoo. Node.js + Express + PostgreSQL.

---

## 1. O que você precisa instalado

- **Node.js 18 ou superior** — https://nodejs.org
- **PostgreSQL 14 ou superior** — https://www.postgresql.org/download/

Para conferir se já tem:

```bash
node --version
psql --version
```

---

## 2. Instalação

```bash
cd carwoo-backend
npm install
```

---

## 3. Criar o banco de dados

```bash
createdb carwoo
```

Se o comando acima não existir no seu sistema, entre no psql e rode `CREATE DATABASE carwoo;`.

---

## 4. Configurar o ambiente

```bash
cp .env.example .env
```

Abra o `.env` e ajuste:

- `DATABASE_URL` — usuário, senha e nome do banco que você criou
- `JWT_SECRET` — gere uma chave com `openssl rand -hex 32` e cole aqui
- `CORS_ORIGIN` — o endereço de onde o `index.html` será aberto

---

## 5. Criar as tabelas

```bash
npm run migrate
```

Deve aparecer `Schema aplicado com sucesso.`

---

## 6. Rodar o servidor

```bash
npm start        # produção
npm run dev      # desenvolvimento, reinicia ao salvar
```

Teste se subiu:

```bash
curl http://localhost:3000/api/health
```

---

## 7. Criar a primeira conta

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"nomeLoja":"Central Motors","nome":"Rafael Souza","email":"rafael@centralmotors.com.br","senha":"umaSenhaForte"}'
```

A resposta traz o `token`. Guarde-o: as rotas protegidas exigem o header
`Authorization: Bearer SEU_TOKEN`.

---

## 8. Conectar o front-end

O arquivo `carwoo-api.js` faz a ponte entre o CRM e esta API.

1. Coloque `carwoo-api.js` na mesma pasta do `index.html`
2. Ajuste `API_BASE` no topo dele, se o servidor não estiver em `localhost:3000`
3. Inclua o script no HTML, **antes** do script principal:

```html
<script src="carwoo-api.js"></script>
```

4. Faça login e troque os dados fixos pelos do servidor:

```js
await api.login('rafael@centralmotors.com.br', 'umaSenhaForte');

state.vehicles = await api.vehicles.list();
state.leads    = await api.leads.list();
state.sales    = await api.sales.list();
renderView(state.activeView);
```

A partir daí, substitua as gravações locais pelas chamadas equivalentes:

| Ação no CRM | Chamada |
|---|---|
| Cadastrar veículo | `api.vehicles.create(dados)` |
| Editar veículo | `api.vehicles.update(id, dados)` |
| Excluir veículo | `api.vehicles.remove(id)` |
| Arrastar lead no kanban | `api.leads.moverEtapa(id, etapa)` |
| Registrar venda | `api.sales.create(dados)` |
| Concluir tarefa | `api.tasks.concluir(id, true)` |
| Índice da sua praça | `api.sales.marketIndex()` |

---

## 9. Rotas disponíveis

Tudo abaixo de `/api`. As protegidas exigem o header `Authorization`.

### Autenticação (público)
| Método | Rota | O que faz |
|---|---|---|
| POST | `/auth/register` | Cria loja e primeiro usuário |
| POST | `/auth/login` | Faz login e devolve o token |

### Veículos
| Método | Rota | O que faz |
|---|---|---|
| GET | `/vehicles?status=&busca=` | Lista com filtros |
| GET | `/vehicles/:id` | Detalhe |
| POST | `/vehicles` | Cadastra |
| PUT | `/vehicles/:id` | Atualiza |
| DELETE | `/vehicles/:id` | Remove |
| POST | `/vehicles/:id/photos` | Salva as fotos |

### Leads
| Método | Rota | O que faz |
|---|---|---|
| GET | `/leads?etapa=` | Lista o funil |
| POST | `/leads` | Cria |
| PUT | `/leads/:id` | Atualiza ou move de etapa |
| DELETE | `/leads/:id` | Remove |

### Vendas
| Método | Rota | O que faz |
|---|---|---|
| GET | `/sales` | Lista |
| POST | `/sales` | Registra a venda, marca o veículo como vendido, fecha o lead e lança a entrada no financeiro |
| GET | `/sales/market-index` | Índice da sua praça em relação à FIPE |

### Financeiro
| Método | Rota | O que faz |
|---|---|---|
| GET | `/finance?tipo=&pago=` | Lista lançamentos |
| GET | `/finance/summary` | Entradas, saídas, saldo, a pagar e a receber |
| POST | `/finance` | Cria lançamento |
| DELETE | `/finance/:id` | Remove |

### Nota fiscal
| Método | Rota | O que faz |
|---|---|---|
| GET | `/invoices` | Lista |
| POST | `/invoices` | Salva rascunho |
| POST | `/invoices/:id/validate` | Valida CPF/CNPJ e campos obrigatórios |
| POST | `/invoices/:id/transmit` | Envia ao provedor fiscal |
| POST | `/invoices/:id/cancel` | Cancela |
| POST | `/invoices/webhook` | Recebe o retorno do provedor |

### Agenda, mercado, integrações e equipe
| Método | Rota | O que faz |
|---|---|---|
| GET/POST/PUT/DELETE | `/tasks` | Tarefas e follow-ups |
| GET/POST/DELETE | `/comparables` | Anúncios concorrentes |
| GET | `/comparables/stats?modelo=` | Mínimo, mediana, máximo e média |
| GET | `/integrations` | Estado das integrações |
| PUT | `/integrations/:portalId` | Conecta ou desconecta um portal |
| GET | `/team` | Equipe com vendas e comissões do mês |


### Assinaturas e cobrança
| Método | Rota | O que faz |
|---|---|---|
| GET | `/billing/plans` | Tabela de preços (público) |
| GET | `/billing/subscription` | Plano atual, limites e uso da loja |
| POST | `/billing/subscribe` | Escolhe um plano e inicia o teste |
| POST | `/billing/cancel` | Cancela a assinatura |
| GET | `/billing/charges` | Histórico de cobranças |
| POST | `/billing/webhook` | Recebe o retorno do gateway (público, validado por segredo) |


### Pós-venda / garantia
| Método | Rota | O que faz |
|---|---|---|
| GET | `/sales/:id/post-sale` | Custos de garantia e resultado real da venda |
| POST | `/sales/:id/post-sale` | Lança um custo (também vira saída no financeiro) |
| DELETE | `/sales/:id/post-sale/:custoId` | Remove o custo |
| GET | `/sales/warranty-stats` | Taxa de acionamento, custo médio e impacto na margem |

### Entrada de leads dos portais
| Método | Rota | O que faz |
|---|---|---|
| POST | `/inbound/:portal` | Recebe o lead (público, validado pelo token da loja) |
| GET | `/inbound/config/token` | Mostra ou cria o token de entrada |
| POST | `/inbound/config/token/rotate` | Gera um token novo |

### Notificações
| Método | Rota | O que faz |
|---|---|---|
| GET | `/notifications` | Lista e contador de não lidas |
| GET | `/notifications/poll?desde=` | Novidades desde um horário (o app chama de tempos em tempos) |
| PUT | `/notifications/:id/read` | Marca como lida |
| PUT | `/notifications/read-all` | Marca todas |
| POST | `/notifications/push-subscribe` | Registra o aparelho para push |


## 10. Perfis de acesso e proteção dos seus números

Três perfis, definidos na coluna `perfil` da tabela `users`:

| Perfil | Custos e margens | Financeiro | Precificação | Assinatura | Vendas |
|---|---|---|---|---|---|
| **dono** | vê tudo | sim | sim | sim | todas |
| **gerente** | vê tudo | sim | sim | não | todas |
| **vendedor** | não vê | não | não | não | só as próprias |

### Por que isso é seguro de verdade

Esconder campos na interface é conforto de uso, **não segurança**: quem entende de
navegador consegue ver qualquer dado que o servidor tenha enviado, mesmo que a tela
não mostre.

Por isso a proteção está no servidor:

- `filtrarVeiculo()` remove `custo` e `custosExtras` antes de responder
- `filtrarVenda()` remove `custoVeiculo`, `lucroBruto`, `lucroReal` e as margens
- `filtroDeVendas()` faz o vendedor consultar apenas as próprias vendas no SQL
- `exigirPermissao('financeiro')` bloqueia `/api/finance` inteiro com `403`

Um vendedor que chame a API direto recebe:

```json
{ "id": 1, "marca": "Fiat", "modelo": "Argo", "preco": 74900, "fipeValor": 72400 }
```

Sem `custo`, sem `custosExtras`, sem margem. Os campos não existem na resposta.

Ele também vê a própria comissão, mas não a dos colegas.

### Primeiro usuário

Quem cria a loja em `/auth/register` nasce com perfil `dono`. Os demais entram como
`vendedor` e o dono promove pela tela de Configurações.

---

## 11. Garantia com baixa automática

Cada venda guarda `garantia_dias` (prazo escolhido pelo lojista) e o sistema calcula
o vencimento a partir da data da venda. A loja tem um padrão em
`stores.garantia_padrao_dias`, aplicado às vendas novas.

Estados possíveis:

- **vigente** — dentro do prazo
- **vencendo** — faltam menos dias que `avisar_garantia_dias` (padrão 15), gera aviso
- **encerrada** — passou do prazo: o sistema dá baixa sozinho, marca
  `garantia_baixada = true`, grava a data em `garantia_baixada_em` e sinaliza
  `garantia_baixa_auto = true`

O lojista também pode dar baixa antes da hora, reabrir enquanto o prazo não venceu,
ou esticar o prazo (30, 60, 90, 180, 365 dias ou um valor livre).

Ao lançar um custo de garantia em uma venda já encerrada, o sistema pede confirmação
e registra como cortesia da loja.

### Rodando a baixa automática no servidor

O app confere ao abrir e de hora em hora. Para garantir a baixa mesmo com ninguém
usando o sistema, agende no servidor:

```sql
UPDATE sales
   SET garantia_baixada = true,
       garantia_baixada_em = CURRENT_DATE,
       garantia_baixa_auto = true
 WHERE garantia_baixada = false
   AND garantia_dias IS NOT NULL
   AND data_venda + garantia_dias * INTERVAL '1 day' < CURRENT_DATE;
```

Coloque em um cron diário (`node src/jobs/garantias.js`) ou use `pg_cron`.

---

## 12. Como os leads dos portais chegam

Nenhum portal manda o lead direto para um sistema de terceiros sem combinar antes.
São três caminhos, do mais fácil ao mais completo:

### 1. Encaminhamento de e-mail (funciona hoje, com qualquer portal)

Todo portal envia um e-mail avisando do lead. O caminho é:

1. Contrate um serviço de recebimento de e-mail: **SendGrid Inbound Parse**,
   **Mailgun Routes** ou **Postmark**
2. Crie um endereço tipo `leads-suaLoja@carwoo.com.br`
3. Configure o serviço para chamar `POST /api/inbound/email` com os dados extraídos
4. No painel do portal, mande os avisos de lead para esse endereço

É assim que boa parte dos CRMs do mercado realmente funciona, e não depende
de contrato com portal nenhum.

### 2. Webhook do portal

Se o seu contrato oferecer, aponte o webhook do portal para
`POST /api/inbound/webmotors` (ou o portal correspondente), com o header
`x-carwoo-token`. O lead entra na hora.

### 3. API do portal

Consulta periódica. Depende de parceria comercial e some no custo de manutenção.

### Testando a entrada de leads

```bash
# Pegue o token da loja
curl http://localhost:3000/api/inbound/config/token \
  -H "Authorization: Bearer SEU_TOKEN_DE_LOGIN"

# Simule um lead chegando do Webmotors
curl -X POST http://localhost:3000/api/inbound/webmotors \
  -H "Content-Type: application/json" \
  -H "x-carwoo-token: TOKEN_DA_LOJA" \
  -d '{"nome":"Carlos Souza","telefone":"11988887777","mensagem":"Ainda tem esse carro?","veiculoPlaca":"RVX4A21","externoId":"wm-12345"}'
```

O lead entra no funil, gera notificação, cria a tarefa de retorno e é
distribuído ao vendedor com menos leads em aberto.

---

## 13. Como os planos são aplicados

Dois middlewares cuidam disso:

- `exigirAssinaturaAtiva` — bloqueia quem está inadimplente, cancelado ou com teste
  vencido. Só barra criação: consultar e exportar os próprios dados continua liberado.
- `checarLimite('veiculos')` — impede passar do teto do plano, devolvendo `402` com
  a mensagem de upgrade.

Os planos ficam na tabela `plans`; para mudar preços ou limites, basta um `UPDATE` —
não precisa mexer no código.

### Cobrança recorrente de verdade

A rota `/billing/subscribe` cria a assinatura no banco e inicia o teste de 14 dias,
mas **não cobra sozinha**. Enquanto `BILLING_PROVIDER` e `BILLING_TOKEN` estiverem
vazios, nenhuma cobrança é gerada — e a resposta avisa isso claramente.

Para ativar:

1. Contrate um gateway (Asaas, Vindi, Iugu, Pagar.me, Mercado Pago ou Stripe)
2. Preencha as variáveis `BILLING_*` no `.env`
3. Implemente a chamada no ponto marcado em `src/routes/billing.js`
4. Aponte o webhook do gateway para `POST /api/billing/webhook`

**Importante sobre segurança:** dados de cartão nunca devem passar por este servidor.
O cliente digita no checkout do próprio gateway, que devolve apenas um identificador.
Guardar número de cartão exige certificação PCI-DSS e não compensa.

---

## 14. Sobre a emissão de nota fiscal

A rota `/invoices/:id/transmit` **valida e prepara** a nota, mas não emite sozinha.
Emissão válida exige certificado digital A1 ou A3 e transmissão à SEFAZ, o que é
feito por um provedor homologado. Enquanto `FISCAL_PROVIDER` e `FISCAL_TOKEN`
estiverem vazios no `.env`, a rota responde `422` e a nota fica como rascunho —
de propósito, para não dar a impressão de que a nota foi emitida.

Para ativar de verdade:

1. Contrate um provedor (Focus NFe, eNotas, NFe.io, Bling ou Omie)
2. Preencha `FISCAL_PROVIDER`, `FISCAL_TOKEN`, `FISCAL_API_URL` e `FISCAL_WEBHOOK_SECRET`
3. Implemente a chamada ao provedor no ponto marcado em `src/routes/invoices.js`
4. Aponte o webhook do provedor para `POST /api/invoices/webhook`

---

## 15. Integração com os portais de anúncio

`/integrations` guarda as credenciais e o estado da conexão, mas a publicação
automática depende de contrato comercial com cada portal:

- **Mercado Livre** — API pública com OAuth2, é a mais acessível de integrar sozinho
- **Webmotors** — API para parceiros, liberada após contrato (portal de desenvolvedores da Sensedia)
- **OLX, iCarros, Mobiauto** — normalmente por feed XML de estoque mediante parceria

O caminho mais rápido costuma ser gerar um **feed XML** do estoque, porque o mesmo
arquivo costuma servir para vários portais ao mesmo tempo.

---

## 16. Antes de colocar no ar

- [ ] `JWT_SECRET` longo e aleatório, diferente do de desenvolvimento
- [ ] `CORS_ORIGIN` apenas com o domínio real do seu front-end
- [ ] HTTPS ativado (use um proxy como Nginx ou Caddy)
- [ ] Backup automático do PostgreSQL
- [ ] Rate limiting nas rotas de login (`express-rate-limit`)
- [ ] Fotos em armazenamento de objetos (S3, Cloudflare R2) em vez de base64
