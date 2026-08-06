# carwoo · guia do zero (Windows)

Feito para quem nunca programou. Faça uma etapa por vez e confira o resultado
antes de seguir. Se algo der diferente do descrito, pare e me mostre a mensagem.

Tempo total: cerca de 1 hora, sem pressa.

---

## Antes de começar: o que é o "terminal"

Você vai digitar comandos numa janela preta ou azul chamada **PowerShell**.
Para abrir:

1. Aperte a tecla **Windows** no teclado
2. Digite `powershell`
3. Clique em **Windows PowerShell**

Abre uma janela com um texto tipo `PS C:\Users\SeuNome>` e o cursor piscando.
É ali que os comandos vão.

**Como usar:** digite (ou cole) o comando e aperte **Enter**. Para colar,
clique com o **botão direito** dentro da janela — o Ctrl+V às vezes não funciona.

Se aparecer erro em vermelho, não quebrou nada. Só me mostre o texto.

---

## Etapa 1 · Instalar o Node.js (10 minutos)

O Node é o programa que faz o carwoo funcionar. Sem ele, nada roda.

1. Abra o navegador em **https://nodejs.org**
2. Clique no botão grande que diz **LTS** (é a versão estável)
3. O arquivo `.msi` vai baixar. Clique nele duas vezes
4. Na instalação, clique **Next** em tudo, aceite os termos e clique **Install**
5. Se o Windows pedir permissão de administrador, clique **Sim**
6. Ao terminar, clique **Finish**

### Conferir se deu certo

**Feche o PowerShell e abra de novo** (importante — ele só reconhece o Node
depois de reiniciar). Digite:

```
node --version
```

**Deve aparecer** algo como `v22.11.0`. Qualquer número a partir de 18 está bom.

Se aparecer "não é reconhecido como nome de cmdlet", o Node não instalou.
Reinstale ou reinicie o computador.

---

## Etapa 2 · Organizar as pastas (5 minutos)

1. Abra o **Explorador de Arquivos** (o ícone de pasta amarela)
2. Clique em **Este Computador** e depois em **Disco Local (C:)**
3. Clique com o botão direito num espaço vazio → **Novo** → **Pasta**
4. Nomeie a pasta como `carwoo` (tudo minúsculo, sem acento)
5. Baixe os arquivos que eu te enviei e **descompacte dentro dela**

No fim, você precisa ter exatamente isto:

```
C:\carwoo\carwoo-backend\      (o servidor)
C:\carwoo\carwoo-app\          (a tela do sistema)
```

Se as pastas vieram dentro de outra pasta, arraste para que fiquem assim.

### Conferir

No PowerShell, digite:

```
cd C:\carwoo\carwoo-backend
```

Depois:

```
dir
```

**Deve listar** os arquivos `package.json`, `README.md` e a pasta `src`.
Se disser "não é possível encontrar o caminho", as pastas estão em outro lugar.

---

## Etapa 3 · Instalar as peças do projeto (5 minutos)

Ainda no PowerShell, dentro de `C:\carwoo\carwoo-backend`, digite:

```
npm install
```

Vai aparecer muito texto e levar 1 ou 2 minutos. É normal.

**Deu certo se** no fim aparecer algo como `added 95 packages`.

Se aparecerem linhas amarelas com a palavra `warn`, ignore — são avisos, não erros.

---

## Etapa 4 · Pegar a senha do banco no Supabase (5 minutos)

Você já criou o projeto no Supabase. Agora precisa da "chave" que liga o carwoo
ao banco de dados.

1. Entre em **https://supabase.com/dashboard**
2. Clique no seu projeto
3. No topo da tela, clique no botão **Connect**
4. Procure a seção **Connection string** e escolha a aba **URI**
5. Clique no ícone de copiar

Vai copiar um texto assim:

```
postgresql://postgres.abcdefghij:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

### A parte que trava todo mundo

Está escrito `[YOUR-PASSWORD]` no meio. **Você precisa trocar isso pela senha
do banco** — que é diferente da senha da sua conta Supabase.

Se não lembra qual é, redefina:

1. No Supabase, vá em **Project Settings** (engrenagem no canto)
2. Clique em **Database**
3. Procure **Database password** e clique em **Reset database password**
4. **Use só letras e números** — se a senha tiver `@`, `#`, `/` ou `:`, quebra
5. Copie a senha nova e guarde num lugar seguro

Agora monte a string final, trocando `[YOUR-PASSWORD]` (com os colchetes) pela
senha. Ficaria assim:

```
postgresql://postgres.abcdefghij:MinhaSenha123@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

Deixe esse texto anotado — você vai colar na próxima etapa.

---

## Etapa 5 · Criar o arquivo de configuração (10 minutos)

No PowerShell, dentro de `C:\carwoo\carwoo-backend`:

```
copy .env.example .env
```

Agora gere uma chave de segurança. Cole este comando exatamente assim:

```
-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
```

Vai aparecer uma sequência longa de letras e números, tipo
`a3f9c2...`. **Copie ela** — é sua chave.

Abra o arquivo de configuração:

```
notepad .env
```

Abre o Bloco de Notas com várias linhas. Você vai mexer em **três**:

**Linha 1** — encontre `DATABASE_URL=` e cole sua string do Supabase depois do `=`:

```
DATABASE_URL=postgresql://postgres.abcdefghij:MinhaSenha123@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

**Linha 2** — encontre `JWT_SECRET=` e cole a chave que você gerou:

```
JWT_SECRET=a3f9c2e8d1b4...
```

**Linha 3** — encontre `CORS_ORIGIN=` e deixe exatamente assim:

```
CORS_ORIGIN=http://localhost:8080
```

> **Por que dois números diferentes?** O carwoo tem duas partes que rodam
> separadas: o servidor (porta **3000**) e a tela (porta **8080**). O
> `CORS_ORIGIN` é o servidor autorizando a tela a conversar com ele. Se você
> trocar esses números, a tela não consegue falar com o servidor.

### Regras importantes

- **Sem espaços** antes ou depois do `=`
- **Sem aspas** em volta dos valores
- Não apague as outras linhas, deixe vazias

Salve com **Ctrl+S** e feche o Bloco de Notas.

---

## Etapa 6 · Criar as tabelas no banco (2 minutos)

Este é o momento da verdade. No PowerShell:

```
npm run migrate
```

**Deu certo se** aparecer, no fim:

```
Todas as 22 tabelas esperadas estao no banco.

Proximo passo:  npm start
```

**Se der erro**, o programa mostra a linha exata do problema, o comando e a
mensagem do banco. **Copie tudo que apareceu e me mande.** Não tente adivinhar.

Os erros mais comuns e o que significam:

| Mensagem contém | O que fazer |
|---|---|
| `password authentication failed` | A senha na `DATABASE_URL` está errada. Refaça a etapa 4 |
| `Nao foi possivel conectar` | A string está incompleta ou com espaço sobrando |
| `getaddrinfo ENOTFOUND` | Faltou parte do endereço ao copiar |

---

## Etapa 7 · Ligar o servidor (2 minutos)

```
npm start
```

**Deu certo se** aparecer:

```
[carwoo] Conectando ao banco com SSL
carwoo-api rodando em http://localhost:3000
```

**Deixe essa janela aberta.** Se fechar, o sistema para. Ela precisa ficar
rodando enquanto você usa o carwoo.

Para desligar depois, aperte **Ctrl+C** dentro dela.

---

## Etapa 8 · Abrir a tela do sistema (5 minutos)

Abra uma **segunda janela** do PowerShell (tecla Windows → `powershell`),
deixando a primeira rodando.

Nessa nova janela, digite:

```
cd C:\carwoo\carwoo-app
```

Depois:

```
npx serve -l 8080
```

Na primeira vez ele pergunta `Ok to proceed? (y)` — digite **y** e Enter.

**Deu certo se** aparecer um endereço tipo `http://localhost:8080`.

Abra o navegador nesse endereço e acrescente o nome do arquivo:

```
http://localhost:8080
```

---

## Etapa 9 · Criar sua conta e testar (5 minutos)

Na tela que abriu, embaixo do formulário, deve aparecer em verde:
**"Servidor conectado"**.

Se aparecer vermelho, volte à janela do servidor e veja se há erro.

1. Clique em **Cadastrar minha loja**
2. Preencha o nome da loja, seu nome, seu e-mail e uma senha de 8+ caracteres
3. Clique em **Criar conta**

Você entra no sistema como dono.

### O teste que prova que funcionou

1. Vá em **Estoque** → **Novo veículo**
2. Preencha marca, modelo e preço. Salve
3. Aperte **F5** para recarregar a página
4. Faça login com o e-mail e senha que você criou

**Se o veículo continuar lá, está tudo funcionando.** Os dados estão no banco,
não mais na memória.

---

## Etapa 10 · Publicar na internet (depois)

Até aqui o sistema roda só no seu computador. Para acessar de qualquer lugar e
instalar no celular, é preciso publicar — mas **faça isso só depois de testar
bem localmente**. Está no arquivo `DEPLOY.md`, etapas 4 e 5.

---

## Quando algo der errado

Me mande três informações e eu resolvo:

1. **Em qual etapa** você estava
2. **O comando** que você digitou
3. **Todo o texto** que apareceu na tela (copie, não resuma)

Para copiar do PowerShell: selecione com o mouse e aperte **Enter**. O texto
vai para a área de transferência.

---

## Uma conversa honesta

Você vai conseguir seguir esses passos — foram escritos para isso. Mas é justo
você saber o que vem depois.

Manter um sistema no ar com clientes pagando envolve coisas que não estão neste
guia: atualizar dependências quando surgem falhas de segurança, restaurar backup
se algo corromper, investigar por que um cliente específico não consegue entrar,
ajustar o servidor quando o uso cresce. Isso normalmente é trabalho de alguém
técnico.

Dois caminhos que costumam funcionar:

**Validar primeiro, investir depois.** Use o botão "Ver demonstração" do sistema
para mostrar a lojistas conhecidos, sem servidor nenhum. Se três ou quatro
disserem que pagariam, aí vale contratar ajuda técnica para colocar no ar de
verdade.

**Contratar só a publicação.** Um desenvolvedor freelancer resolve as etapas 1 a
10 em poucas horas, porque o código já está pronto. Você paga uma vez e fica com
o sistema no ar, e continua conversando comigo para as mudanças no produto.

Nada disso te impede de fazer sozinho. Só não quero que você descubra a
complexidade depois de prometer prazo para um cliente.
