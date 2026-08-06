/* ============================================================
   carwoo · cliente da API
   ------------------------------------------------------------
   Como usar no index.html:

   1. Suba o backend (npm start).
   2. Inclua este arquivo ANTES do <script> principal do CRM:
        <script src="carwoo-api.js"></script>
   3. Ajuste API_BASE abaixo para o endereço do seu servidor.
   4. Faça login uma vez:
        await api.login('email@loja.com', 'suasenha');
   5. Troque as leituras de state.* pelas chamadas da api,
      por exemplo:
        state.vehicles = await api.vehicles.list();
   ============================================================ */

const API_BASE = 'http://localhost:3000/api';

const api = (() => {
  const CHAVE_TOKEN = 'carwoo_token';

  function getToken() {
    try { return localStorage.getItem(CHAVE_TOKEN); } catch { return null; }
  }
  function setToken(token) {
    try { localStorage.setItem(CHAVE_TOKEN, token); } catch { /* ignora */ }
  }
  function limparToken() {
    try { localStorage.removeItem(CHAVE_TOKEN); } catch { /* ignora */ }
  }

  async function request(caminho, opcoes = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opcoes.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let resposta;
    try {
      resposta = await fetch(`${API_BASE}${caminho}`, { ...opcoes, headers });
    } catch {
      throw new Error('Não foi possível falar com o servidor. Verifique se o backend está rodando.');
    }

    if (resposta.status === 401) {
      limparToken();
      throw new Error('Sua sessão expirou. Faça login novamente.');
    }
    if (resposta.status === 204) return null;

    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      const msg = dados.erro || 'Não foi possível concluir a operação.';
      const erro = new Error(msg);
      erro.detalhes = dados.erros || dados.detalhe || null;
      throw erro;
    }
    return dados;
  }

  const get = (c) => request(c);
  const post = (c, corpo) => request(c, { method: 'POST', body: JSON.stringify(corpo || {}) });
  const put = (c, corpo) => request(c, { method: 'PUT', body: JSON.stringify(corpo || {}) });
  const del = (c) => request(c, { method: 'DELETE' });

  return {
    estaLogado: () => !!getToken(),
    sair: limparToken,

    async login(email, senha) {
      const dados = await post('/auth/login', { email, senha });
      setToken(dados.token);
      return dados.user;
    },
    async registrar(nomeLoja, nome, email, senha) {
      const dados = await post('/auth/register', { nomeLoja, nome, email, senha });
      setToken(dados.token);
      return dados.user;
    },

    vehicles: {
      list: (filtros = {}) => {
        const q = new URLSearchParams(
          Object.entries(filtros).filter(([, v]) => v !== undefined && v !== '')
        ).toString();
        return get(`/vehicles${q ? '?' + q : ''}`);
      },
      get: (id) => get(`/vehicles/${id}`),
      create: (dados) => post('/vehicles', dados),
      update: (id, dados) => put(`/vehicles/${id}`, dados),
      remove: (id) => del(`/vehicles/${id}`),
      savePhotos: (id, fotos) => post(`/vehicles/${id}/photos`, { fotos }),
    },

    leads: {
      list: (filtros = {}) => {
        const q = new URLSearchParams(filtros).toString();
        return get(`/leads${q ? '?' + q : ''}`);
      },
      create: (dados) => post('/leads', dados),
      update: (id, dados) => put(`/leads/${id}`, dados),
      moverEtapa: (id, etapa) => put(`/leads/${id}`, { etapa }),
      novos: async () => {
        const r = await get('/notifications/poll');
        return r.novas.filter((n) => n.lead).map((n) => n.lead);
      },
      remove: (id) => del(`/leads/${id}`),
    },

    sales: {
      list: () => get('/sales'),
      create: (dados) => post('/sales', dados),
      marketIndex: () => get('/sales/market-index'),
      warrantyStats: () => get('/sales/warranty-stats'),
      // Custos pós-venda (garantia, retrabalho, cortesia)
      postSale: {
        list: (saleId) => get(`/sales/${saleId}/post-sale`),
        create: (saleId, dados) => post(`/sales/${saleId}/post-sale`, dados),
        remove: (saleId, custoId) => del(`/sales/${saleId}/post-sale/${custoId}`),
      },
    },

    notifications: {
      list: (apenasNaoLidas) => get(`/notifications${apenasNaoLidas ? '?apenasNaoLidas=true' : ''}`),
      poll: (desde) => get(`/notifications/poll${desde ? '?desde=' + encodeURIComponent(desde) : ''}`),
      marcarLida: (id) => put(`/notifications/${id}/read`),
      marcarTodasLidas: () => put('/notifications/read-all'),
      pushSubscribe: (inscricao) => post('/notifications/push-subscribe', inscricao),
    },

    inbound: {
      token: () => get('/inbound/config/token'),
      rotacionarToken: () => post('/inbound/config/token/rotate'),
    },

    finance: {
      list: (filtros = {}) => {
        const q = new URLSearchParams(filtros).toString();
        return get(`/finance${q ? '?' + q : ''}`);
      },
      summary: () => get('/finance/summary'),
      create: (dados) => post('/finance', dados),
      remove: (id) => del(`/finance/${id}`),
    },

    invoices: {
      list: () => get('/invoices'),
      create: (dados) => post('/invoices', dados),
      validate: (id) => post(`/invoices/${id}/validate`),
      transmit: (id) => post(`/invoices/${id}/transmit`),
      cancel: (id) => post(`/invoices/${id}/cancel`),
    },

    tasks: {
      list: (filtros = {}) => {
        const q = new URLSearchParams(filtros).toString();
        return get(`/tasks${q ? '?' + q : ''}`);
      },
      create: (dados) => post('/tasks', dados),
      update: (id, dados) => put(`/tasks/${id}`, dados),
      concluir: (id, concluida) => put(`/tasks/${id}`, { concluida }),
      remove: (id) => del(`/tasks/${id}`),
    },

    comparables: {
      list: () => get('/comparables'),
      stats: (modelo) => get(`/comparables/stats${modelo ? '?modelo=' + encodeURIComponent(modelo) : ''}`),
      create: (dados) => post('/comparables', dados),
      remove: (id) => del(`/comparables/${id}`),
    },

    integrations: {
      list: () => get('/integrations'),
      salvar: (portalId, dados) => put(`/integrations/${portalId}`, dados),
    },

    team: {
      list: () => get('/team'),
    },
  };
})();

if (typeof window !== 'undefined') window.api = api;
