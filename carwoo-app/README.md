# carwoo · app para celular e computador

O carwoo é um **PWA** (Progressive Web App): o mesmo sistema roda no navegador e
também se instala como aplicativo no celular e no computador, sem loja de apps.

---

## Arquivos desta pasta

```
index.html        o sistema
manifest.json          identidade do app (nome, ícones, cores)
service-worker.js      cache e funcionamento offline
icons/                 ícones em todos os tamanhos
```

Os quatro precisam ficar **na mesma pasta** no servidor.

---

## Requisito obrigatório: HTTPS

Um PWA só é instalável em **HTTPS**. A única exceção é `localhost`, que funciona
para testes. Se publicar em HTTP puro, o app abre mas não instala.

---

## Testar na sua máquina

```bash
cd carwoo-app
python3 -m http.server 8080
```

Abra `http://localhost:8080`.

---

## Publicar de graça

Qualquer um destes já entrega HTTPS automaticamente:

| Serviço | Como |
|---|---|
| **Netlify** | Arraste a pasta em app.netlify.com/drop |
| **Vercel** | `npx vercel --prod` dentro da pasta |
| **Cloudflare Pages** | Conecte um repositório Git |
| **GitHub Pages** | Suba a pasta e ative Pages nas configurações |

---

## Como o lojista instala

### Android (Chrome)
Abre o site → aparece o aviso "Instalar app" ou o botão laranja no canto →
toca em instalar. O ícone vai para a tela inicial.

### iPhone e iPad (Safari)
Abre o site no **Safari** → botão Compartilhar → **Adicionar à Tela de Início**.

No iOS o aviso automático não existe: precisa ser pelo menu Compartilhar, e
precisa ser o Safari. Vale explicar isso aos clientes no onboarding.

### Windows, macOS e Linux (Chrome ou Edge)
Aparece um ícone de instalar na barra de endereço, ou menu → Instalar carwoo.
O app abre em janela própria, sem abas do navegador.

---

## O que funciona offline

O service worker guarda a interface, então o app **abre** sem internet e mostra
os dados já carregados. Cadastrar ou salvar exige conexão, porque depende da API.

Para permitir cadastro offline com sincronização depois, seria preciso uma fila
local (IndexedDB) e resolução de conflitos — dá para fazer, mas é um projeto à parte.

---

## Publicar nas lojas de apps

O PWA não precisa de loja, mas se quiser presença na Play Store e App Store:

- **Play Store**: empacote com [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) (TWA). É o próprio PWA em um invólucro. Taxa única de US$ 25.
- **App Store**: use [Capacitor](https://capacitorjs.com). A Apple é mais rigorosa e costuma rejeitar apps que são só um site embrulhado — é preciso justificar recursos nativos. Custa US$ 99 por ano.

Recomendação: comece pelo PWA. Ele já cobre celular e computador, atualiza sozinho
e não paga comissão de loja. Só vá para as lojas se os clientes pedirem.

---

## Ao publicar uma versão nova

Abra `service-worker.js` e mude o número:

```js
const CACHE_VERSION = 'carwoo-v2';   // era v1
```

Sem isso, quem já instalou continua vendo a versão antiga em cache.

---

## Ajustes antes de vender

- [ ] Troque `API_BASE` em `carwoo-api.js` pelo endereço real do backend
- [ ] Substitua os ícones da pasta `icons/` pela identidade visual definitiva
- [ ] Ajuste `name` e `short_name` no `manifest.json` se mudar o nome comercial
- [ ] Teste em um iPhone real: o Safari tem particularidades que o emulador não mostra
