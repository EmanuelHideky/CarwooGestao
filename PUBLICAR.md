# carwoo · colocar no ar

Guia para a fase de testes, com pessoas de fora acessando.
Faça uma etapa por vez e confira o resultado antes de seguir.

Tempo total: cerca de 1 hora.

---

## Antes de começar: o que vai acontecer

O sistema tem duas metades, e cada uma vai para um lugar diferente:

| Metade | O que é | Onde vai |
|---|---|---|
| **carwoo-app** | as telas que o lojista vê | Netlify |
| **carwoo-backend** | o servidor que guarda os dados | Render |

O banco de dados continua no Supabase, onde já está. Nada muda lá.

**Ordem importa:** publique o servidor primeiro. O endereço dele é
necessário para configurar as telas.

---

## Etapa 1 · Enviar o código para o GitHub (20 min)

O Render precisa buscar o código de algum lugar. O GitHub é gratuito.

### 1.1 Criar a conta

1. Entre em **https://github.com** e clique em **Sign up**
2. Use seu e-mail, escolha um nome de usuário e uma senha
3. Confirme o e-mail que eles enviam

### 1.2 Criar o repositório

1. Já logado, clique no **+** no canto superior direito → **New repository**
2. **Repository name:** `carwoo`
3. Marque **Private** — o código fica só seu
4. **NÃO** marque nenhuma das caixas de "Initialize this repository"
5. Clique em **Create repository**

A página seguinte mostra alguns comandos. Ignore, use os daqui.

### 1.3 Enviar o código

No PowerShell, dentro da pasta do projeto:

```powershell
cd "C:\Users\emanu\Downloads\carwoo code"
git init
git add .
git commit -m "carwoo - primeira versao"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/carwoo.git
git push -u origin main
```

Troque `SEU-USUARIO` pelo nome de usuário que você escolheu.

Na primeira vez o Git pede login. Abre uma janela do navegador — autorize.

**Deu certo se** a página do repositório no GitHub, ao recarregar, mostrar
as pastas `carwoo-app` e `carwoo-backend`.

> **Confira uma coisa importante:** o arquivo `.env` **não pode** aparecer na
> lista. Ele guarda a senha do banco. Já existe um `.gitignore` que o impede
> de subir, mas confira com os próprios olhos.

---

## Etapa 2 · Publicar o servidor no Render (20 min)

### 2.1 Criar a conta

1. Entre em **https://render.com** → **Get Started**
2. Escolha **Sign in with GitHub** e autorize

### 2.2 Criar o serviço

1. No painel, clique em **New +** → **Blueprint**
2. Escolha o repositório `carwoo`
3. O Render lê o arquivo `render.yaml` e já monta tudo
4. Clique em **Apply**

### 2.3 Preencher as credenciais

O Render vai pedir os valores que não ficam no código. Preencha:

| Variável | O que colar |
|---|---|
| `DATABASE_URL` | a mesma do seu `.env` |
| `JWT_SECRET` | a mesma do seu `.env` |
| `SUPABASE_URL` | a mesma do seu `.env` |
| `SUPABASE_SERVICE_KEY` | a mesma do seu `.env` |
| `CORS_ORIGIN` | deixe `*` por enquanto, ajustamos na etapa 4 |

Para ver os valores do seu `.env`:

```powershell
notepad "C:\Users\emanu\Downloads\carwoo code\carwoo-backend\.env"
```

**Deu certo se**, depois de uns 3 minutos, o serviço ficar verde com
**Live**, e o endereço mostrado responder:

```
https://carwoo-api.onrender.com/api/health
```

Abrindo no navegador, deve aparecer `{"ok":true,...}`.

**Anote esse endereço.** Você vai usar na etapa 3.

> **Sobre o plano gratuito do Render:** o servidor hiberna depois de 15
> minutos sem ninguém acessar. O próximo visitante espera de 30 a 50
> segundos até a tela abrir. Para testes está de bom tamanho. Quando
> incomodar, o plano pago resolve.

---

## Etapa 3 · Apontar as telas para o servidor (2 min)

```powershell
notepad "C:\Users\emanu\Downloads\carwoo code\carwoo-app\config.js"
```

Na última linha, cole o endereço da etapa 2:

```javascript
window.CARWOO_API = "https://carwoo-api.onrender.com";
```

Com `https://`, **sem** barra no final, **sem** `/api`.

Salve e feche.

---

## Etapa 4 · Publicar as telas no Netlify (10 min)

### 4.1 Publicar

1. Entre em **https://app.netlify.com/drop**
2. Abra o Explorador de Arquivos em `C:\Users\emanu\Downloads\carwoo code`
3. **Arraste a pasta `carwoo-app` inteira** para a área indicada no site
4. Aguarde. Ao terminar, o Netlify mostra um endereço tipo
   `https://algo-aleatorio-123.netlify.app`

**Anote esse endereço.**

### 4.2 Autorizar o servidor a receber as telas

Volte ao Render:

1. Abra o serviço `carwoo-api` → aba **Environment**
2. Encontre `CORS_ORIGIN` e troque o `*` pelo endereço do Netlify
3. Salve — o Render reinicia sozinho

Exemplo: `https://algo-aleatorio-123.netlify.app`

Sem barra no final.

> Enquanto estiver `*`, qualquer site da internet pode chamar o seu
> servidor. Não deixe assim depois dos testes.

---

## Etapa 5 · Testar (10 min)

Abra o endereço do Netlify no navegador.

1. Embaixo do formulário deve aparecer **"Servidor conectado"** em verde
2. Entre com a sua conta
3. Cadastre um veículo com fotos
4. Vá em **Custos** e lance o valor de aquisição
5. Recarregue a página (F5) e confira se tudo continua lá

**Teste no celular também** — abra o mesmo endereço. No Android aparece o
convite para instalar o app; no iPhone é Safari → Compartilhar → Adicionar
à Tela de Início.

---

## Como atualizar depois

Sempre que eu mexer no código:

**Telas:** arraste a pasta `carwoo-app` de novo em app.netlify.com/drop

**Servidor:** no PowerShell:

```powershell
cd "C:\Users\emanu\Downloads\carwoo code"
git add .
git commit -m "descricao do que mudou"
git push
```

O Render publica sozinho em uns 3 minutos.

---

## O que os testadores precisam saber

Antes de convidar alguém, avise sobre o que ainda não funciona:

- **Recuperação de senha por e-mail não existe.** Quem esquecer a senha
  fica travado até você criar um acesso novo. Anote as senhas.
- **Cobrança de assinatura, nota fiscal e publicação nos portais** ainda
  não estão ativas — dependem de contrato com terceiros.
- **O servidor hiberna** no plano gratuito. A primeira tela do dia demora.

---

## Antes de aceitar dados reais de compradores

O sistema guarda **CPF, telefone e e-mail** de compradores. Isso faz de
você operador de dados pessoais perante a LGPD. Antes de um lojista real
cadastrar clientes de verdade, você precisa de:

- Política de privacidade publicada
- Termos de uso
- Um jeito de excluir os dados de alguém que peça

Para testes com conhecidos, usando dados fictícios, tudo bem seguir.
