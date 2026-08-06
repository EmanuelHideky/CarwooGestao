# Como usar o Claude Code para publicar o carwoo gestão

## O caminho mais fácil: o app do Claude no computador

O aplicativo do Claude para Windows tem **três abas: Chat, Code e Cowork**.
A aba **Code** é o Claude Code com interface gráfica — sem terminal, sem
linha de comando. É a mesma janela onde você já conversa comigo.

Se você já usa o app instalado, é só clicar em **Code**. Se está pelo
navegador (claude.ai), precisa baixar o app.

**Baixar:** https://claude.ai/download

Requisito: plano pago (Pro, Max, Team ou Enterprise). O plano gratuito não
libera o Claude Code.

## Passo a passo

1. Instale o app e entre com sua conta
2. Clique na aba **Code**
3. Aponte para a pasta do projeto — aquela que tem `carwoo-app` e
   `carwoo-backend` dentro
4. Ele lê sozinho o arquivo `CLAUDE.md` que está lá, com todo o contexto

## O que dizer na primeira mensagem

```
Leia o CLAUDE.md e o DEPLOY.md antes de começar.

Quero colocar o sistema no ar. Não sou programador — explique o que cada
comando faz antes de rodar, e me avise quando precisar de algo que só eu
posso fazer (criar conta, copiar credencial, autenticar site).

Comece pelas etapas 1 a 6 da tabela do CLAUDE.md, uma por vez, confirmando
o critério de sucesso de cada uma antes de seguir para a próxima.
```

## O que ele faz e o que não faz

**Faz:** instalar dependências, criar as tabelas no banco, subir o servidor,
testar as rotas, ler erros e corrigir, rodar as ferramentas de publicação.

**Não faz:** criar suas contas no Supabase, Netlify ou Railway — isso pede seu
e-mail, senha e cartão. Ele vai pedir e esperar você.

## Cuidados

- **Autorize os comandos um a um** no começo, até ganhar confiança
- **Não cole a senha do banco na conversa com ele.** Peça para abrir o `.env`
  e digite você mesmo. O `CLAUDE.md` já instrui isso
- Se ele propuser mexer em algo que você não entende, pergunte por que antes
  de aprovar

## Alternativa: terminal (só se preferir)

Existe a versão de linha de comando, instalada pelo PowerShell com
`irm https://claude.ai/install.ps1 | iex`. Faz a mesma coisa, mas exige
digitar comandos. Para o seu caso, a aba Code do app é melhor.

Documentação em português: https://code.claude.com/docs/pt/desktop-quickstart

## Se algo der errado

Traga o erro de volta para cá. Conheço as decisões do projeto inteiro e
consigo dizer se a correção proposta faz sentido ou se vai quebrar outra parte.
