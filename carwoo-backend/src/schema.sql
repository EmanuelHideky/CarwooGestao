-- ============================================================
-- carwoo · schema do banco de dados (PostgreSQL)
-- Aplicar uma vez:  npm run migrate
-- ============================================================

-- ---------- Lojas ----------
CREATE TABLE IF NOT EXISTS stores (
  id            SERIAL PRIMARY KEY,
  nome          TEXT NOT NULL,
  cnpj          TEXT,
  endereco      TEXT,
  telefone      TEXT,
  email         TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Usuarios / equipe ----------
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER REFERENCES stores(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  senha_hash    TEXT NOT NULL,
  cargo         TEXT NOT NULL DEFAULT 'Vendedor',
  meta_mensal   INTEGER NOT NULL DEFAULT 8,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Veiculos ----------
CREATE TABLE IF NOT EXISTS vehicles (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER REFERENCES stores(id) ON DELETE CASCADE,
  marca         TEXT NOT NULL,
  modelo        TEXT NOT NULL,
  versao        TEXT,
  ano_fab       INTEGER,
  ano_mod       INTEGER,
  km            INTEGER DEFAULT 0,
  cor           TEXT,
  cambio        TEXT,
  combustivel   TEXT,
  placa         TEXT,
  preco         NUMERIC(12,2) NOT NULL DEFAULT 0,
  custo         NUMERIC(12,2) DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'disponivel'
                CHECK (status IN ('disponivel','reservado','preparacao','vendido')),
  destaque      BOOLEAN DEFAULT false,
  entrada       DATE NOT NULL DEFAULT CURRENT_DATE,
  fipe_valor    NUMERIC(12,2),
  fipe_ref      TEXT,
  codigo_fipe   TEXT,
  docs          JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_store  ON vehicles(store_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);

-- ---------- Fotos dos veiculos ----------
CREATE TABLE IF NOT EXISTS vehicle_photos (
  id            SERIAL PRIMARY KEY,
  vehicle_id    INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  nome          TEXT,
  url           TEXT,
  ordem         INTEGER NOT NULL DEFAULT 0,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_photos_vehicle ON vehicle_photos(vehicle_id);

-- ---------- Custos de preparacao ----------
CREATE TABLE IF NOT EXISTS vehicle_costs (
  id            SERIAL PRIMARY KEY,
  vehicle_id    INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  descricao     TEXT NOT NULL,
  valor         NUMERIC(12,2) NOT NULL DEFAULT 0,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_costs_vehicle ON vehicle_costs(vehicle_id);

-- ---------- Publicacao por portal ----------
CREATE TABLE IF NOT EXISTS vehicle_portals (
  vehicle_id         INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  portal_id          TEXT NOT NULL,
  anuncio_externo_id TEXT,
  publicado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (vehicle_id, portal_id)
);

-- ---------- Leads / funil ----------
CREATE TABLE IF NOT EXISTS leads (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER REFERENCES stores(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  telefone      TEXT,
  email         TEXT,
  veiculo_id    INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  origem        TEXT NOT NULL DEFAULT 'manual',
  etapa         TEXT NOT NULL DEFAULT 'novo'
                CHECK (etapa IN ('novo','contato','negociacao','proposta','ganho','perdido')),
  vendedor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  observacoes   TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_store ON leads(store_id);
CREATE INDEX IF NOT EXISTS idx_leads_etapa ON leads(etapa);

-- ---------- Vendas ----------
CREATE TABLE IF NOT EXISTS sales (
  id              SERIAL PRIMARY KEY,
  store_id        INTEGER REFERENCES stores(id) ON DELETE CASCADE,
  veiculo_id      INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  lead_id         INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  vendedor_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cliente_nome    TEXT NOT NULL,
  valor           NUMERIC(12,2) NOT NULL,
  fipe_venda      NUMERIC(12,2),
  comissao        NUMERIC(12,2) DEFAULT 0,
  forma_pagamento TEXT DEFAULT 'A vista',
  data_venda      DATE NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX IF NOT EXISTS idx_sales_store ON sales(store_id);

-- ---------- Financeiro ----------
CREATE TABLE IF NOT EXISTS finance_entries (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER REFERENCES stores(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN ('entrada','saida')),
  descricao     TEXT NOT NULL,
  categoria     TEXT,
  valor         NUMERIC(12,2) NOT NULL,
  data_lanc     DATE NOT NULL DEFAULT CURRENT_DATE,
  pago          BOOLEAN DEFAULT true,
  vencimento    DATE
);
CREATE INDEX IF NOT EXISTS idx_finance_store ON finance_entries(store_id);

-- ---------- Notas fiscais ----------
CREATE TABLE IF NOT EXISTS invoices (
  id             SERIAL PRIMARY KEY,
  store_id       INTEGER REFERENCES stores(id) ON DELETE CASCADE,
  veiculo_id     INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  numero         TEXT,
  serie          TEXT DEFAULT '1',
  tipo           TEXT DEFAULT 'NF-e',
  cliente_nome   TEXT NOT NULL,
  cpf_cnpj       TEXT,
  endereco       TEXT,
  valor          NUMERIC(12,2) NOT NULL,
  cfop           TEXT,
  natureza       TEXT,
  forma_pagamento TEXT,
  observacoes    TEXT,
  status         TEXT NOT NULL DEFAULT 'rascunho'
                 CHECK (status IN ('rascunho','processando','autorizada','rejeitada','cancelada')),
  chave_acesso   TEXT,
  protocolo      TEXT,
  emissao        TIMESTAMPTZ,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_store ON invoices(store_id);

-- ---------- Tarefas / agenda ----------
CREATE TABLE IF NOT EXISTS tasks (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER REFERENCES stores(id) ON DELETE CASCADE,
  titulo        TEXT NOT NULL,
  tipo          TEXT NOT NULL DEFAULT 'followup',
  lead_id       INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  responsavel_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  prazo         TIMESTAMPTZ,
  concluida     BOOLEAN NOT NULL DEFAULT false,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_store ON tasks(store_id);

-- ---------- Anuncios concorrentes (comparativo de mercado) ----------
CREATE TABLE IF NOT EXISTS comparables (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER REFERENCES stores(id) ON DELETE CASCADE,
  modelo        TEXT NOT NULL,
  ano           TEXT,
  km            INTEGER DEFAULT 0,
  preco         NUMERIC(12,2) NOT NULL,
  portal        TEXT,
  cidade        TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comparables_store ON comparables(store_id);

-- ---------- Integracoes com portais ----------
CREATE TABLE IF NOT EXISTS integrations (
  store_id      INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  portal_id     TEXT NOT NULL,
  conectado     BOOLEAN NOT NULL DEFAULT false,
  credencial    TEXT,
  ultima_sync   TIMESTAMPTZ,
  PRIMARY KEY (store_id, portal_id)
);

-- ============================================================
-- ASSINATURAS / COBRANCA
-- ============================================================

-- Planos oferecidos pela plataforma
CREATE TABLE IF NOT EXISTS plans (
  id              TEXT PRIMARY KEY,          -- 'essencial', 'profissional', 'rede'
  nome            TEXT NOT NULL,
  preco_mensal    NUMERIC(10,2) NOT NULL,
  preco_anual     NUMERIC(10,2),             -- valor por mes no plano anual
  limite_veiculos INTEGER,                   -- NULL = ilimitado
  limite_usuarios INTEGER,
  limite_portais  INTEGER,
  recursos        JSONB NOT NULL DEFAULT '[]'::jsonb,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  ordem           INTEGER NOT NULL DEFAULT 0
);

-- Assinatura de cada loja
CREATE TABLE IF NOT EXISTS subscriptions (
  id                SERIAL PRIMARY KEY,
  store_id          INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  plan_id           TEXT NOT NULL REFERENCES plans(id),
  status            TEXT NOT NULL DEFAULT 'teste'
                    CHECK (status IN ('teste','ativa','inadimplente','cancelada','suspensa')),
  ciclo             TEXT NOT NULL DEFAULT 'mensal' CHECK (ciclo IN ('mensal','anual')),
  inicio            DATE NOT NULL DEFAULT CURRENT_DATE,
  fim_teste         DATE,
  proxima_cobranca  DATE,
  cancelada_em      TIMESTAMPTZ,
  gateway           TEXT,                    -- 'asaas', 'stripe', 'mercadopago'...
  gateway_customer_id     TEXT,
  gateway_subscription_id TEXT,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id)
);
CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions(status);

-- Historico de cobrancas
CREATE TABLE IF NOT EXISTS charges (
  id                SERIAL PRIMARY KEY,
  store_id          INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  subscription_id   INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
  valor             NUMERIC(10,2) NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','paga','vencida','estornada','cancelada')),
  metodo            TEXT,                    -- 'pix', 'boleto', 'cartao'
  vencimento        DATE,
  pago_em           TIMESTAMPTZ,
  gateway_charge_id TEXT,
  link_pagamento    TEXT,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_charges_store ON charges(store_id);

-- Planos iniciais (ajuste os valores conforme sua estrategia)
INSERT INTO plans (id, nome, preco_mensal, preco_anual, limite_veiculos, limite_usuarios, limite_portais, recursos, ordem) VALUES
 ('essencial', 'Essencial', 149.00, 119.00, 30, 2, 2,
  '["Estoque e CRM","Anuncios em 2 portais","Simulador de financiamento","App para celular","Suporte por e-mail"]'::jsonb, 1),
 ('profissional', 'Profissional', 349.00, 279.00, 150, 6, 99,
  '["Tudo do Essencial","Anuncios ilimitados","Emissao de NF-e","Avaliacao e valor de mercado","Relatorios completos","Suporte por WhatsApp"]'::jsonb, 2),
 ('rede', 'Rede', 799.00, 649.00, NULL, NULL, 99,
  '["Tudo do Profissional","Veiculos e usuarios ilimitados","Multiplas lojas","Acesso a API","Gerente de contas dedicado"]'::jsonb, 3)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- POS-VENDA (GARANTIA) E CAPTACAO DE LEADS
-- ============================================================

-- Custos que aparecem DEPOIS da venda e comem a margem
CREATE TABLE IF NOT EXISTS post_sale_costs (
  id          SERIAL PRIMARY KEY,
  sale_id     INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  store_id    INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL DEFAULT 'garantia'
              CHECK (tipo IN ('garantia','retrabalho','cortesia','juridico','outros')),
  descricao   TEXT NOT NULL,
  valor       NUMERIC(12,2) NOT NULL DEFAULT 0,
  data_custo  DATE NOT NULL DEFAULT CURRENT_DATE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_posvenda_sale ON post_sale_costs(sale_id);

-- Colunas de garantia e custo real na venda
ALTER TABLE sales ADD COLUMN IF NOT EXISTS custo_veiculo NUMERIC(12,2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS garantia_ate  DATE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS telefone      TEXT;

-- Notificacoes internas do sistema
CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL DEFAULT 'sync',
  titulo      TEXT NOT NULL,
  texto       TEXT,
  lead_id     INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  lida        BOOLEAN NOT NULL DEFAULT false,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_store ON notifications(store_id, lida);

-- Token secreto por loja: identifica de quem e o lead que chega
CREATE TABLE IF NOT EXISTS inbound_tokens (
  token       TEXT PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  descricao   TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Identificador do lead no portal de origem, evita duplicar o mesmo contato
ALTER TABLE leads ADD COLUMN IF NOT EXISTS externo_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS mensagem   TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS nao_lido   BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_externo ON leads(store_id, externo_id) WHERE externo_id IS NOT NULL;

-- Assinaturas para notificacao push (PWA)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT,
  auth        TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PERFIS DE ACESSO E GARANTIA CONFIGURAVEL
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS perfil TEXT NOT NULL DEFAULT 'vendedor'
  CHECK (perfil IN ('dono','gerente','vendedor'));

-- Prazo de garantia em dias e controle de baixa
ALTER TABLE sales ADD COLUMN IF NOT EXISTS garantia_dias        INTEGER;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS garantia_baixada     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS garantia_baixada_em  DATE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS garantia_baixa_auto  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS garantia_avisada     BOOLEAN NOT NULL DEFAULT false;

-- Preferencias da loja (prazo padrao de garantia, aviso de vencimento)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS garantia_padrao_dias INTEGER NOT NULL DEFAULT 90;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS avisar_garantia_dias INTEGER NOT NULL DEFAULT 15;

-- O primeiro usuario da loja e o dono
UPDATE users SET perfil = 'dono' WHERE perfil = 'vendedor' AND id IN (
  SELECT MIN(id) FROM users GROUP BY store_id
);

-- ============================================================
-- REDEFINICAO DE SENHA E PROTECAO DE LOGIN
-- ============================================================

CREATE TABLE IF NOT EXISTS password_resets (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expira_em   TIMESTAMPTZ NOT NULL,
  usado       BOOLEAN NOT NULL DEFAULT false,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reset_token ON password_resets(token_hash);

-- Registro de tentativas de login, para bloquear forca bruta
CREATE TABLE IF NOT EXISTS login_attempts (
  id          SERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  ip          TEXT,
  sucesso     BOOLEAN NOT NULL DEFAULT false,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attempts_email ON login_attempts(email, criado_em);

ALTER TABLE stores ADD COLUMN IF NOT EXISTS instagram TEXT;

-- CNPJ unico por loja (permite nulo enquanto o lojista nao preencher)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_cnpj ON stores(cnpj) WHERE cnpj IS NOT NULL;

-- ============================================================
-- Campos exigidos pelos portais de anuncio
-- ------------------------------------------------------------
-- Mercado Livre exige placa E chassi desde outubro de 2024, alem do
-- numero de portas. OLX exige o CEP do anuncio; o Mercado Livre exige
-- cidade e estado. O endereco da loja era texto livre e nao servia.
-- ============================================================
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS chassi TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS portas INTEGER;

ALTER TABLE stores ADD COLUMN IF NOT EXISTS cep    TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS cidade TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS estado TEXT;

-- ============================================================
-- Campos que a tela ja pedia mas nunca eram gravados
-- ------------------------------------------------------------
-- A descricao e o texto que vai para o anuncio nos portais, e o
-- renavam e exigido pelo RENAVE. Ambos eram digitados e perdidos ao
-- recarregar a pagina, porque nao existia coluna para guarda-los.
-- ============================================================
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS descricao TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS renavam   TEXT;

-- ============================================================
-- Prazo das tarefas: de data/hora para texto
-- ------------------------------------------------------------
-- O campo da Agenda sempre foi texto livre ("Sem prazo", "Hoje, 16:00",
-- "Amanha, 14:00"), mas a coluna era TIMESTAMPTZ. O banco recusava esses
-- valores e a tarefa simplesmente nao era salva - por isso a tabela estava
-- vazia. A coluna agora guarda o mesmo texto que o lojista escreve.
-- ============================================================
ALTER TABLE tasks ALTER COLUMN prazo TYPE TEXT USING prazo::text;

-- ============================================================
-- Dados do comprador
-- ------------------------------------------------------------
-- A venda so guardava nome e telefone. Para acionar garantia, emitir nota
-- e cumprir a transferencia junto ao Detran, a loja precisa do CPF. O
-- e-mail serve para enviar o comprovante e o termo de garantia.
-- Sao dados pessoais: ver a pendencia de LGPD no DEPLOY.md.
-- ============================================================
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cpf   TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS email TEXT;
