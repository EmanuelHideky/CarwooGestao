# carwoo · onde o projeto está

Última atualização: agosto de 2026.

Este arquivo existe para quem chega agora — inclusive o Claude numa conversa
nova. Diz onde as coisas estão, o que já foi resolvido, o que falta e por quê.

---

## Está no ar

| Peça | Onde | Endereço |
|---|---|---|
| Telas | Netlify | https://carwoogestao.netlify.app |
| Servidor | Render (Virgínia) | https://carwoo-api.onrender.com |
| Banco e fotos | Supabase | painel do Supabase |
| Código | GitHub, privado | github.com/EmanuelHideky/CarwooGestao |

**Fase atual:** testes. Sem cliente pagando ainda.

### Como publicar uma alteração

São dois caminhos separados:

- **Servidor:** `git push` — o Render republica sozinho em uns 3 minutos
- **Telas:** arrastar a pasta `carwoo-app` em app.netlify.com/drop

O `git push` **não** atualiza as telas.

---

## Armadilhas que já custaram tempo

Estão aqui para não morderem duas vezes.

**O banco do Supabase só existe em IPv6.** O Render não alcança IPv6. É
preciso usar a string de conexão do **pooler** (`aws-0-....pooler.supabase.com`),
não a direta (`db.xxx.supabase.co`). Sintoma: o deploy falha na migração.

**O `CORS_ORIGIN` não pode ter barra no final.** O navegador manda a origem
sem barra. Já foi corrigido no código, que agora ignora a barra — mas se
trocar de domínio, vale conferir. Sintoma: "Servidor fora do ar" com tudo
funcionando.

**`localhost` não funciona no navegador do Emanuel; `127.0.0.1` sim.** Para
testes locais, usar sempre o número.

**Cache de ícone é teimoso.** O Chrome guarda favicon num banco próprio que
`Ctrl+Shift+R` não limpa. Por isso os ícones têm `?v=` no endereço. Ao
trocá-los, subir esse número **e** o `CACHE_VERSION` do service worker.

**O plano gratuito do Render hiberna** após 15 min sem acesso. A primeira
tela do dia demora de 30 a 50 segundos. Avisar quem for testar.

---

## O padrão de defeito deste projeto

Vale conhecer antes de mexer em qualquer coisa.

A tela pede o dado, a coluna existe no banco, **e a rota do servidor ignora**.
O dado some sem nenhum aviso, e só se descobre quando alguém recarrega a
página.

Já aconteceu com: fotos, descrição do anúncio, renavam, custo da venda,
dados de garantia, comissão e contas a pagar. Todos corrigidos.

Uma varredura completa foi feita em 22 tabelas e 25 chamadas. O que restava
está resolvido. Mas **ao criar rota nova, confira os três lados**: o que a
tela envia, o que a rota grava, o que ela devolve.

Outro caso que apareceu duas vezes: **datas em formato brasileiro indo direto
para o banco**. O Postgres está em MDY — `15/03/2026` dá erro e `02/08/2026`
vira 8 de fevereiro. Use `paraDataISO()` em `src/helpers.js` sempre que uma
data vinda da tela for para uma coluna de data.

---

## Testes automáticos

Desde agosto de 2026 o backend tem testes. Rodar dentro de `carwoo-backend`:

```
npm test
```

Tem que terminar em `pass 24` e `fail 0`. Se aparecer `fail` acima de zero,
**não publique** — a mensagem diz qual campo sumiu e em qual arquivo.
Detalhes em `carwoo-backend/testes/LEIA-ME.md`.

Não precisam de banco, de internet nem do `.env`: usam um banco de mentira
que guarda o que a rota mandou gravar e devolve na leitura.

Rodam sozinhos a cada `git push`, pelo GitHub Actions (`.github/workflows`),
mas **não seguram a publicação** — o Render republica sem esperar o resultado.
O sinal vermelho avisa que quebrou; não impede que suba.

Eles já pegaram um defeito real no primeiro dia: as respostas de cadastro e
de edição de veículo não passavam pelo filtro de perfil. Um vendedor que
editasse a quilometragem de um carro recebia, na resposta, o custo de compra
que o dono lançou. Corrigido em `routes/vehicles.js` e `routes/sales.js`.

---

## O que falta, em ordem de urgência

### 1. RENAVE — o prazo é do lojista, não da carwoo

**Leia isto antes de tratar o RENAVE como urgência.** A frase "tem prazo",
que estava aqui antes, deu a entender que a carwoo estava fora da lei. Não
está.

A Resolução CONTRAN 1.026/2026, publicada em 30 de junho de 2026, deu 90
dias de adaptação — vencendo em **28 de setembro de 2026**. Revendas passam a
registrar entrada, saída, transferência e consignação de veículos por meio de
uma **integradora homologada pela Senatran**.

**A obrigação é da loja, não do software.** A carwoo não é entidade regulada
e não é multada. O lojista tem essa obrigação use ele a carwoo, um
concorrente ou um caderno.

O que afeta a carwoo é **comercial, não legal**: se o lojista registra o
estoque no sistema da integradora, ele cadastra o mesmo carro duas vezes — e
o sistema da integradora começa a parecer o estoque de verdade. O risco é a
carwoo virar a ferramenta redundante, não a carwoo virar ilegal.

Virar integradora é processo longo; o caminho realista é parceria com uma já
homologada.

**Depende do Emanuel**, não de código: é conversa comercial. E a primeira
conversa é com os próprios lojistas — perguntar como eles estão resolvendo o
RENAVE hoje. "O sistema da integradora já cuida do meu estoque" é sinal de
alerta; "é um saco, cadastro tudo duas vezes" é a brecha comercial.

### 2. CNPJ

Trava três frentes ao mesmo tempo: cobrança de assinatura, cadastro de
desenvolvedor no Mercado Livre e negociação com integradora RENAVE.

### 3. Recuperação de senha por e-mail

Hoje quem esquece a senha fica travado até o dono criar outro acesso. Com dois
ou três funcionários, resolve-se na hora. Com clientes reais, vira problema.

Precisa de domínio próprio (`carwoo.com.br`) e provedor de e-mail (Resend tem
plano gratuito). O ponto de integração está marcado em `src/routes/auth.js`.

### 4. LGPD

O sistema guarda CPF, telefone e e-mail de compradores. Faltam política de
privacidade, termos de uso e um processo de exclusão de dados. Para testes com
dados fictícios, tudo bem seguir.

### 5. Integração com portais

Pesquisa já feita:

- **XML não serve para veículos.** Na OLX, XML é só para imóveis. Carro exige
  API com envio ativo (JSON + OAuth).
- **Mercado Livre** tem a documentação mais completa; é o melhor primeiro alvo.
- **Webmotors** tem o caminho certo ("Integração Revendedor"), mas exige
  cadastro no portal de desenvolvedor para ver a documentação.
- **Cada lojista precisa ter plano empresarial** no portal. Não dá para
  publicar em nome de quem tem plano básico.

Os campos que faltavam no cadastro (chassi, portas, CEP/cidade/estado) já
foram criados.

---

## Decisões tomadas, para não refazer a discussão

**Cobrança de assinatura fica desligada até haver clientes.** O código está
pronto e testado (`COBRANCA.md`), mas com os primeiros dois ou três lojistas
cobrar por Pix na mão funciona, custa zero e obriga a conversar com cada um
todo mês — que é como se descobre se estão usando de verdade.

**Convite de vendedor não usa e-mail.** O sistema gera a senha e monta a
mensagem pronta para o dono mandar no WhatsApp. É mais confiável que e-mail
(que cai em spam) e não exige domínio nem provedor.

**Fotos ficam no Supabase Storage.** Já funciona. Quando o tráfego apertar
(5 GB/mês no plano gratuito), o caminho é o Cloudflare R2, que não cobra
saída de dados. O driver está isolado em `src/storage.js`.

**Contas a pagar e a receber são lançamentos não pagos**, não uma lista
separada. O que está em aberto não entra no resultado do mês — só conta
depois da baixa.

**A ficha do veículo não mostra custo nem margem**, nem para o dono. É
documento para o comprador ver.

---

## As 15 telas

Dashboard · Estoque · Anúncios · CRM/Leads · Vendas · **Comissões** ·
Nota fiscal · Agenda · Ferramentas · **Custos** · Financeiro · IPVA ·
Relatórios · Planos · Configurações

As duas em negrito são recentes. **Custos** e **Financeiro** só abrem para
dono e gerente; **Comissões** abre para todos, mostrando a cada um o que lhe
cabe.

---

## Como o Emanuel trabalha

Não é programador. Explicar em português claro, dizer o que cada comando faz
antes de rodar, e nunca pedir para ele editar código — só o que depende dele:
credenciais, decisões de negócio, cliques em sites de terceiros.

Quando algo falhar, dizer o que falhou e o que será tentado. Ele prefere
saber do problema a receber "corrigindo...".
