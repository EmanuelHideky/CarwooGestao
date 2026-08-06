# carwoo · como colocar no ar

Guia na ordem em que as coisas devem ser feitas. Cada etapa termina com um teste
para você confirmar que funcionou antes de seguir.

---

## Etapa 1 · Banco de dados (15 minutos)

Use um Postgres gerenciado, não instale na mão. Os dois com plano gratuito que
funcionam bem aqui:

- **Neon** — https://neon.tech
- **Supabase** — https://supabase.com

Crie um projeto e copie a **connection string**. Ela tem este formato:

```
postgresql://usuario:senha@host.neon.tech/carwoo?sslmode=require
```

Se o provedor exigir SSL (quase todos exigem), abra `src/db.js` e ajuste:

```js
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
```

**Teste:** guarde a string. Você vai usá-la na etapa 2.

---

## Etapa 2 · Backend rodando na sua máquina (30 minutos)

Ainda não publique. Primeiro faça funcionar local.

```bash
cd carwoo-backend
npm install
cp .env.example .env
```

No `.env`, preencha o mínimo:

```
DATABASE_URL=  (a string da etapa 1)
JWT_SECRET=    (gere com: openssl rand -hex 32)
CORS_ORIGIN=http://localhost:8080
```

Crie as tabelas:

```bash
npm run migrate
```

> **Atenção:** é a primeira vez que este SQL roda contra um Postgres real.
> Se aparecer erro, quase sempre é ordem de dependência entre tabelas ou uma
> sintaxe pequena. Leia a mensagem, corrija a linha citada no `schema.sql` e rode
> de novo — o script é seguro para repetir.

Suba o servidor:

```bash
npm start
```

**Teste:**

```bash
curl http://localhost:3000/api/health
```

Deve responder `{"ok":true,...}`. Se responder, o backend e o banco estão conversando.

---

## Etapa 3 · Front-end conversando com o backend (10 minutos)

Em outro terminal:

```bash
cd carwoo-app
python3 -m http.server 8080
```

Abra `http://localhost:8080`.

Na tela de entrada, embaixo, deve aparecer **"Servidor conectado"** em verde.
Se aparecer vermelho, confira se o backend está rodando e se `CORS_ORIGIN` no
`.env` bate exatamente com `http://localhost:8080`.

Clique em **Cadastrar minha loja** e crie sua conta. Você entra como dono.

**Teste decisivo:** cadastre um veículo, **recarregue a página (F5)** e faça login
de novo. Se o veículo continuar lá, o sistema está salvando de verdade.

---

## Etapa 4 · Publicar o backend (30 minutos)

Escolha um:

| Serviço | Observação |
|---|---|
| **Railway** — railway.app | Mais simples, detecta Node sozinho |
| **Render** — render.com | Plano gratuito hiberna após inatividade |
| **Fly.io** — fly.io | Mais controle, exige mais configuração |

Em qualquer um: conecte o repositório, defina as variáveis de ambiente do `.env`
(exceto que `CORS_ORIGIN` agora aponta para o domínio do front) e faça o deploy.

**Teste:** `curl https://seu-backend.up.railway.app/api/health`

---

## Etapa 5 · Publicar o front-end (15 minutos)

O PWA precisa de HTTPS. Qualquer um destes entrega automático:

- **Netlify** — arraste a pasta `carwoo-app` em app.netlify.com/drop
- **Vercel** — `npx vercel --prod` dentro da pasta
- **Cloudflare Pages** — conecte o repositório

Antes de publicar, aponte o front para o backend. Abra o `index.html` e
adicione esta linha logo antes do `<script>` principal:

```html
<script>window.CARWOO_API = 'https://seu-backend.up.railway.app';</script>
```

Depois volte ao backend e ajuste `CORS_ORIGIN` para o endereço do front:

```
CORS_ORIGIN=https://carwoo.netlify.app
```

**Teste:** abra o endereço publicado no celular, faça login, e instale o app
(no Android aparece o aviso; no iPhone é Safari → Compartilhar → Adicionar à
Tela de Início).

---

## Etapa 6 · Recuperação de senha (20 minutos)

Sem isso, o primeiro cliente que esquecer a senha fica travado.

Crie conta em um serviço de e-mail — **Resend** (resend.com) é o mais rápido de
configurar e tem plano gratuito. Verifique seu domínio e pegue a API key.

No `.env` do backend:

```
MAIL_PROVIDER=resend
MAIL_TOKEN=re_xxxxxxxx
MAIL_FROM=nao-responda@seudominio.com.br
APP_URL=https://carwoo.netlify.app
```

Abra `src/routes/auth.js`, procure o comentário
`Ponto de integração com o serviço de e-mail` e descomente o bloco do Resend.

**Teste:** peça a recuperação com seu próprio e-mail e confirme que o link chega.

> Enquanto o e-mail não estiver configurado, o link de redefinição aparece no
> **log do servidor**. Serve para testar, mas não para clientes reais.

---

## Etapa 7 · Fotos em armazenamento de objetos

Hoje as fotos vão como base64. Funciona para testar, mas incha o banco e fica
lento com volume. Antes de ter muitos clientes, migre para:

- **Cloudflare R2** — mais barato, sem taxa de saída de dados
- **Amazon S3** — mais conhecido

O caminho é: o backend gera uma URL assinada, o navegador envia a foto direto
para o storage, e só a URL fica no banco. A rota `POST /vehicles/:id/photos` já
recebe URLs — falta trocar o `dataUrl` do front por esse fluxo.

---

## Etapa 8 · Antes de vender para alguém

### Segurança
- [ ] `JWT_SECRET` longo e diferente do de desenvolvimento
- [ ] `CORS_ORIGIN` só com o domínio real
- [ ] Backup automático diário do Postgres ativado
- [ ] Monitoramento de erros (Sentry tem plano gratuito)

### Legal
- [ ] Política de privacidade e termos de uso publicados
- [ ] Contrato de prestação de serviço com o lojista
- [ ] Processo para excluir dados quando o cliente pedir (LGPD)
- [ ] CNPJ e emissão de nota da sua assinatura

Você vai guardar CPF, telefone e nome de compradores dos seus clientes. Isso faz
de você operador de dados pessoais perante a LGPD — não é opcional.

### Regulatório
- [ ] Verificar como se tornar integrador **RENAVE** junto ao Denatran

O RENAVE virou obrigatório para revendas em junho de 2026, e concorrentes já usam
"integrador homologado" como argumento de venda. É provável que seja a primeira
pergunta de qualquer lojista.

---

## Etapa 9 · Depende de contrato com terceiros

Deixe para depois de ter os primeiros clientes usando:

| O que | Como habilitar |
|---|---|
| Cobrar as assinaturas | Contratar Asaas, Vindi, Iugu ou Stripe e preencher `BILLING_*` |
| Emitir NF-e de verdade | Provedor fiscal + certificado digital A1, preencher `FISCAL_*` |
| Publicar nos portais | Contrato comercial com cada portal, ou feed XML |
| Calendário do IPVA | Preencher na mão uma vez por ano (10 campos por estado) |

---

## Sugestão sobre a ordem

Não tente ser SaaS multi-loja de saída. Faça as etapas 1 a 6 e coloque **uma loja
real** usando — de preferência alguém que aceite ser o primeiro e dê retorno
honesto. Você vai descobrir o que os lojistas realmente pedem antes de gastar com
gateway de pagamento, provedor fiscal e integrações de portal.

As etapas 7 a 9 só valem o esforço quando houver demanda pagando.
