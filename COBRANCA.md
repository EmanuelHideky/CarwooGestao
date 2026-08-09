# carwoo · ligar a cobrança de assinatura

A implementação está pronta e testada. Este guia é o que falta fazer
quando você decidir cobrar de verdade.

Enquanto não fizer nada disto, o sistema funciona normalmente: a loja
entra em período de teste e a tela avisa que a cobrança não está ativa.
Ninguém é cobrado e nada quebra.

---

## Antes de começar

**Você precisa de CNPJ.** Nenhum gateway abre conta para cobrança
recorrente no CPF, e você vai precisar emitir nota fiscal da mensalidade.

Mas dá para **testar tudo antes**, sem CNPJ, usando o ambiente de teste do
Asaas. É o que recomendo fazer primeiro.

---

## Etapa 1 · Testar sem CNPJ (20 minutos)

1. Crie conta em **https://sandbox.asaas.com** — é o ambiente de teste,
   separado do real, com dinheiro fictício
2. No menu do perfil: **Integrações → Gerar chave de API**
3. Copie a chave (ela tem `hmlg` no meio — é assim que o sistema sabe que
   é teste e não cobra ninguém de verdade)
4. No `.env` do servidor:

```
BILLING_PROVIDER=asaas
BILLING_TOKEN=cole_a_chave_aqui
BILLING_METODO=UNDEFINED
BILLING_WEBHOOK_SECRET=invente_uma_senha_longa_aqui
```

5. Reinicie o servidor e confira em `/api/health`:

```json
"cobranca": { "ativo": true, "provedor": "asaas", "ambiente": "teste" }
```

Se aparecer `"ambiente": "producao"` com uma chave de teste, **pare** — algo
está errado e você corre risco de cobrar de verdade.

---

## Etapa 2 · Avisar o Asaas quando o pagamento cair (10 minutos)

Sem isto, o pagamento acontece mas o sistema não fica sabendo.

1. No Asaas: **Integrações → Webhooks → Adicionar**
2. **URL:** `https://SEU-SERVIDOR/api/billing/webhook`
   (o seu é `https://carwoo-api.onrender.com/api/billing/webhook`)
3. **Token de autenticação:** o mesmo valor de `BILLING_WEBHOOK_SECRET`
4. Marque os eventos de cobrança (pagamento confirmado, recebido, vencido)

---

## Etapa 3 · Testar o ciclo inteiro

1. Entre no carwoo, vá em **Planos** e assine um plano
2. Deve aparecer a tela com o link de pagamento, marcada como ambiente de teste
3. Abra o link e pague (é fictício)
4. Volte ao carwoo: a assinatura deve virar **ativa** sozinha

Teste também o cancelamento — ele precisa cancelar no Asaas, não só aqui.
Confira no painel do Asaas se a assinatura sumiu.

---

## Etapa 4 · Ir para valer

Só depois que o teste passar inteiro:

1. Crie a conta real em **https://www.asaas.com** (agora sim, com CNPJ)
2. Gere a chave de API de produção (sem `hmlg`)
3. Troque `BILLING_TOKEN` no servidor
4. Refaça o webhook apontando para a conta real
5. Confira em `/api/health` que diz `"ambiente": "producao"`
6. **Faça uma assinatura de R$ 1 em você mesmo** antes de vender para alguém

---

## Como funciona por dentro

**O teste de 14 dias é de verdade.** A primeira cobrança vence no fim do
teste, não no dia da contratação. Quem cancelar antes não paga nada.

**Dados de cartão nunca passam pelo carwoo.** O lojista escolhe a forma de
pagamento e digita os dados na página do Asaas. Aqui só fica o link e o
identificador da assinatura.

**Se o gateway falhar na hora de contratar**, a loja não trava: ela segue
no período de teste e a tela avisa. Perder uma cobrança é problema;
travar quem quis pagar é pior.

**Quando a assinatura vence**, o servidor bloqueia cadastrar veículo, lead
e venda — mas continua deixando consultar e exportar tudo. O lojista nunca
fica sem acesso aos próprios dados.

---

## Custo

O Asaas não cobra mensalidade, só por cobrança recebida:

| Forma | Taxa | Numa mensalidade de R$ 349 |
|---|---|---|
| Pix | R$ 1,99 fixo | R$ 1,99 |
| Cartão | ~3,5% | ~R$ 12 |

Deixar `BILLING_METODO=UNDEFINED` permite que o lojista escolha. Se quiser
empurrar para o Pix, que é o mais barato para você, use `BILLING_METODO=PIX`.

---

## Para trocar de gateway depois

Toda a conversa com o Asaas está em **`carwoo-backend/src/billing-gateway.js`**.
Para usar Vindi, Iugu ou Stripe, basta reescrever as funções daquele arquivo
mantendo os mesmos nomes. Nada mais no sistema precisa mudar.
