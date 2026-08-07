/* carwoo · service worker
   Guarda a interface em cache para o app abrir mesmo sem internet.
   Ao publicar uma versão nova, troque o número em CACHE_VERSION. */

// v3: icones da marca carwoo. Trocar este numero e o que faz os aparelhos
// jogarem fora o cache antigo - sem isso, quem ja abriu o app continua
// vendo os arquivos velhos para sempre.
const CACHE_VERSION = 'carwoo-v3';
// Os "?v=3" acompanham os mesmos enderecos usados no index.html e no
// manifest. Precisam ser iguais, senao o app guardaria uma copia e pediria
// outra, baixando duas vezes o mesmo arquivo.
const ARQUIVOS_BASE = [
  './',
  './manifest.json?v=3',
  './icons/icon-192.png?v=3',
  './icons/icon-512.png?v=3',
  './icons/apple-touch-icon.png?v=3',
];

// Instala e guarda os arquivos da interface
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(ARQUIVOS_BASE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

// Remove caches de versões antigas
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(
        chaves.filter((c) => c !== CACHE_VERSION).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // O config.js guarda o endereço do servidor. Se ficasse em cache, trocar
  // esse endereço não teria efeito para quem já abriu o app — o aparelho
  // continuaria procurando o servidor antigo. Sempre pela rede.
  if (url.pathname.endsWith('/config.js')) {
    evento.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => caches.match(req))
    );
    return;
  }

  // Chamadas da API e da FIPE sempre vão à rede primeiro.
  // Sem internet, devolve uma resposta clara em vez de dado velho silencioso.
  const ehApi = url.pathname.startsWith('/api/') || url.hostname.includes('parallelum');
  if (ehApi) {
    evento.respondWith(
      fetch(req).catch(() => new Response(
        JSON.stringify({ erro: 'Sem conexão. Os dados serão atualizados quando a internet voltar.', offline: true }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // Abertura da página: sempre pela rede, com o cache só como rede de segurança.
  //
  // POR QUE ASSIM
  // Servidores de arquivos (o "serve" local, o Netlify, a Vercel) redirecionam
  // endereços com ".html" para a versão sem extensão. Um redirecionamento
  // guardado no cache não pode ser devolvido para a abertura de uma página: o
  // navegador recusa e mostra "não é possível acessar esse site". Buscando
  // pela rede primeiro, o redirecionamento é seguido normalmente; o cache só
  // entra em cena quando não há internet.
  if (req.mode === 'navigate') {
    evento.respondWith(
      fetch(req)
        .then((resposta) => {
          if (resposta && resposta.ok && !resposta.redirected) {
            const copia = resposta.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copia));
          }
          return resposta;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('./')))
    );
    return;
  }

  // Demais arquivos: entrega do cache na hora e atualiza em segundo plano
  evento.respondWith(
    caches.match(req).then((cacheado) => {
      const daRede = fetch(req).then((resposta) => {
        // Resposta redirecionada não pode ir para o cache: ao ser reaproveitada
        // depois, o navegador a rejeita.
        if (resposta && resposta.status === 200 && resposta.type === 'basic' && !resposta.redirected) {
          const copia = resposta.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copia));
        }
        return resposta;
      }).catch(() => cacheado);

      return cacheado || daRede;
    })
  );
});
