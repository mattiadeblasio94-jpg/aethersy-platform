-- Schema `metering` - idempotente, rieseguibile a ogni avvio del BFF.
-- Vive nello stesso Postgres dello stack Activepieces ma in uno schema separato:
-- nessuna interferenza con `public` (tabelle Activepieces) ne' con i suoi upgrade.
--
-- Default decisi dal committente il 28/10/2026:
--   markup_bps  = 15000  (150% -> 60,0% margine lordo)
--   credit_unit = 0.0001 EUR (1 credito = 0,0001 EUR)
--   saldo clampato a zero (hard_stop_on_empty = true)

CREATE SCHEMA IF NOT EXISTS metering;

-- Tenant ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metering.tenant (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  plan                 text NOT NULL DEFAULT 'free',
  markup_bps           integer NOT NULL DEFAULT 15000,
  credit_unit          numeric(18,8) NOT NULL DEFAULT 0.0001,
  hard_stop_on_empty   boolean NOT NULL DEFAULT true,
  billing_customer_ref text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_credit_unit_positive CHECK (credit_unit > 0),
  CONSTRAINT tenant_markup_sane CHECK (markup_bps >= -10000 AND markup_bps <= 50000)
);

CREATE TABLE IF NOT EXISTS metering.tenant_user (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE,
  email      text NOT NULL UNIQUE,
  role       text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_user_tenant_idx ON metering.tenant_user(tenant_id);

-- API key (console / worker / mcp / integration) ------------------------------
CREATE TABLE IF NOT EXISTS metering.api_key (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE,
  key_hash   text NOT NULL UNIQUE,
  label      text NOT NULL DEFAULT '',
  source_tag text NOT NULL DEFAULT 'console',
  scopes     text[] NOT NULL DEFAULT '{}',
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_key_tenant_idx
  ON metering.api_key(tenant_id) WHERE revoked_at IS NULL;

-- Price book versionato -------------------------------------------------------
CREATE TABLE IF NOT EXISTS metering.price_book (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version            integer NOT NULL UNIQUE,
  default_markup_bps integer NOT NULL DEFAULT 15000,
  fx_usd_eur         numeric(12,6) NOT NULL DEFAULT 0.92,
  effective_from     timestamptz NOT NULL DEFAULT now(),
  effective_to       timestamptz
);

CREATE TABLE IF NOT EXISTS metering.price_book_entry (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_book_id uuid NOT NULL REFERENCES metering.price_book(id) ON DELETE CASCADE,
  capability    text NOT NULL,
  model_pattern text NOT NULL,
  provider      text NOT NULL DEFAULT '*',
  unit          text NOT NULL,
  unit_price    numeric(24,12) NOT NULL,
  markup_bps    integer,
  min_credits   integer NOT NULL DEFAULT 0,
  UNIQUE (price_book_id, capability, model_pattern, provider, unit)
);

CREATE TABLE IF NOT EXISTS metering.tenant_price_override (
  tenant_id     uuid NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE,
  capability    text NOT NULL,
  model_pattern text NOT NULL,
  markup_bps    integer NOT NULL,
  PRIMARY KEY (tenant_id, capability, model_pattern)
);

-- Ledger di consumo (APPEND-ONLY) ---------------------------------------------
CREATE TABLE IF NOT EXISTS metering.usage_event (
  id                bigserial PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES metering.tenant(id),
  api_key_id        uuid REFERENCES metering.api_key(id),
  request_id        uuid NOT NULL,
  attempt_no        smallint NOT NULL DEFAULT 1,
  flow_run_id       text,
  capability        text NOT NULL,
  provider          text NOT NULL,
  model             text NOT NULL,
  unit              text NOT NULL,
  billable_units    numeric(24,8) NOT NULL,
  input_tokens      integer,
  output_tokens     integer,
  cached_tokens     integer,
  provider_cost_usd numeric(18,10) NOT NULL DEFAULT 0,
  provider_fee_usd  numeric(18,10) NOT NULL DEFAULT 0,
  price_eur         numeric(18,10) NOT NULL DEFAULT 0,
  markup_bps        integer NOT NULL DEFAULT 0,
  credits           numeric(18,8) NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'success',
  latency_ms        integer,
  source            text NOT NULL DEFAULT 'console',
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS usage_event_dedup
  ON metering.usage_event(request_id, attempt_no);
CREATE INDEX IF NOT EXISTS usage_event_tenant_time
  ON metering.usage_event(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_event_flow_run
  ON metering.usage_event(flow_run_id) WHERE flow_run_id IS NOT NULL;

-- Saldi e movimenti -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS metering.credit_account (
  tenant_id        uuid PRIMARY KEY REFERENCES metering.tenant(id) ON DELETE CASCADE,
  balance_credits  numeric(18,8) NOT NULL DEFAULT 0,
  reserved_credits numeric(18,8) NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_account_no_overdraft CHECK (balance_credits >= 0),
  CONSTRAINT credit_account_reserved_nonneg CHECK (reserved_credits >= 0)
);

CREATE TABLE IF NOT EXISTS metering.credit_ledger (
  id             bigserial PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES metering.tenant(id),
  kind           text NOT NULL,             -- topup | reserve | settle | release | adjust
  delta_credits  numeric(18,8) NOT NULL,
  reason         text,
  usage_event_id bigint REFERENCES metering.usage_event(id),
  provider_ref   text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_ledger_tenant_time
  ON metering.credit_ledger(tenant_id, created_at DESC);

-- Quote -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metering.quota (
  tenant_id     uuid PRIMARY KEY REFERENCES metering.tenant(id) ON DELETE CASCADE,
  limit_credits numeric(18,8) NOT NULL DEFAULT 0,
  window        text NOT NULL DEFAULT 'month',
  soft_pct      integer NOT NULL DEFAULT 80,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Rollup giornaliero ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS metering.usage_daily (
  tenant_id         uuid NOT NULL REFERENCES metering.tenant(id),
  day               date NOT NULL,
  capability        text NOT NULL,
  credits           numeric(18,8) NOT NULL DEFAULT 0,
  price_eur         numeric(18,10) NOT NULL DEFAULT 0,
  provider_cost_usd numeric(18,10) NOT NULL DEFAULT 0,
  requests          integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day, capability)
);

-- Outbox verso billing esterno ------------------------------------------------
CREATE TABLE IF NOT EXISTS metering.billing_outbox (
  id              bigserial PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES metering.tenant(id),
  target          text NOT NULL,
  window_start    timestamptz NOT NULL,
  window_end      timestamptz NOT NULL,
  credits         numeric(18,8) NOT NULL,
  amount_eur      numeric(18,10) NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status          text NOT NULL DEFAULT 'pending',
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  external_ref    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);

-- Link progetto Activepieces -> tenant ---------------------------------------
CREATE TABLE IF NOT EXISTS metering.ap_project_link (
  project_id text PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE
);

-- Seed del price book v1 (solo se assente) -----------------------------------
INSERT INTO metering.price_book (version, default_markup_bps, fx_usd_eur)
VALUES (1, 15000, 0.92)
ON CONFLICT (version) DO NOTHING;

-- Snapshot listino 28/10/2026. `unit_price` e' per 1M di unita' per token/char,
-- per unita' singola per image/video/second/request. Nessun dato inventato:
-- i valori sono quelli rilevati dai listini dei provider (vedi docs sez.3.2).
INSERT INTO metering.price_book_entry
  (price_book_id, capability, model_pattern, provider, unit, unit_price, min_credits)
SELECT pb.id, v.capability, v.model_pattern, v.provider, v.unit, v.unit_price, v.min_credits
FROM metering.price_book pb
CROSS JOIN (VALUES
  -- OpenRouter - testo (per 1M token)
  ('text', 'deepseek/deepseek-flash-latest',   'openrouter', 'token_in',     0.011000, 0),
  ('text', 'deepseek/deepseek-flash-latest',   'openrouter', 'token_out',    1.800000, 0),
  ('text', 'z-ai/glm-5.2',                     'openrouter', 'token_in',     0.014000, 0),
  ('text', 'z-ai/glm-5.2',                     'openrouter', 'token_out',    7.000000, 0),
  ('text', 'openai/gpt-oss-20b',               'openrouter', 'token_in',     0.018000, 0),
  ('text', 'openai/gpt-oss-20b',               'openrouter', 'token_out',    0.090000, 0),
  ('text', 'meta-llama/llama-3.1-8b',          'openrouter', 'token_in',     0.020000, 0),
  ('text', 'meta-llama/llama-3.1-8b',          'openrouter', 'token_out',    0.040000, 0),
  ('text', 'mistralai/mistral-nemo',           'openrouter', 'token_in',     0.029000, 0),
  ('text', 'mistralai/mistral-nemo',           'openrouter', 'token_out',    0.030000, 0),
  -- Venice - testo (per 1M token)
  ('text', 'z-ai-glm-5-3-flash',               'venice',     'token_in',     0.150000, 0),
  ('text', 'z-ai-glm-5-3-flash',               'venice',     'token_out',    0.500000, 0),
  ('text', 'gemini-3-6-flash',                 'venice',     'token_in',     0.937500, 0),
  ('text', 'gemini-3-6-flash',                 'venice',     'token_out',    4.687500, 0),
  ('text', 'z-ai-glm-5-3',                     'venice',     'token_in',     1.750000, 0),
  ('text', 'z-ai-glm-5-3',                     'venice',     'token_out',    5.500000, 0),
  ('text', 'gemini-4-argon',                   'venice',     'token_in',     2.500000, 0),
  ('text', 'gemini-4-argon',                   'venice',     'token_out',   12.500000, 0),
  -- Free tier: costo provider 0 -> si applica 1 credito minimo (copre l'infra).
  ('text', '*:free',                           '*',          'token_in',     0.000000, 1),
  ('text', '*:free',                           '*',          'token_out',    0.000000, 1),
  -- Venice - generazione (per singola unita')
  ('img_out', 'venice-sd35',                   'venice',     'image',        0.010000, 0),
  ('img_out', 'flux-2-pro',                    'venice',     'image',        0.050000, 0),
  ('img_out', 'grok-imagine-image',            'venice',     'image',        0.070000, 0),
  ('img_out', 'qwen-image',                    'venice',     'image',        0.030000, 0),
  ('img_out', '*',                             'venice',     'image',        0.050000, 0),
  ('vid_out', 'veo3.1-fast-text-to-video',     'venice',     'video',        1.500000, 0),
  ('vid_out', 'kling-2.5-turbo-text-to-video', 'venice',     'video',        0.350000, 0),
  ('vid_out', '*',                             'venice',     'video',        1.500000, 0),
  ('tts',     'tts-kokoro',                    'venice',     'char',         3.500000, 0),
  ('tts',     '*',                             'venice',     'char',         3.500000, 0),
  -- Venice - trascrizione (per secondo)
  ('stt',     '*',                             'venice',     'second',       0.000167, 0),
  -- Orchestrazione non-AI (metrica per esecuzione)
  ('flow_run', '*',                            '*',          'request',      0.002000, 1)
) AS v(capability, model_pattern, provider, unit, unit_price, min_credits)
WHERE pb.version = 1
  AND pb.effective_to IS NULL
ON CONFLICT (price_book_id, capability, model_pattern, provider, unit) DO NOTHING;
