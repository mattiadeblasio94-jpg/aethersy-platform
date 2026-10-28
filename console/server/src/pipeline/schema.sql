-- Schema `pipeline` - idempotente, rieseguibile a ogni avvio del BFF.
-- Vive nello stesso Postgres dello stack Activepieces, in uno schema separato
-- da `public` (tabelle Activepieces) e da `metering` (solo con FK verso il
-- tenant). Vedi docs/platform-consumption.md sez. 2 e sez. 5.
--
-- Macchina a stati di `pipeline_run.status`:
--   draft -> in_progress -> in_review -> approved -> delivered
--   (failed e' uno stato terminale di errore; in_progress copre l'esecuzione
--    degli agent_task dello stadio).

CREATE SCHEMA IF NOT EXISTS pipeline;

-- Esecuzione di uno stadio (job di pipeline) --------------------------------
CREATE TABLE IF NOT EXISTS pipeline.pipeline_run (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE,
  stage        text NOT NULL,
  status       text NOT NULL DEFAULT 'draft',
  title        text NOT NULL DEFAULT '',
  brief        jsonb NOT NULL DEFAULT '{}'::jsonb,
  context      jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by  text,
  approved_at  timestamptz,
  delivered_at timestamptz,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pipeline_run_status CHECK (
    status IN ('draft', 'in_progress', 'in_review', 'approved', 'delivered', 'failed')
  )
);
CREATE INDEX IF NOT EXISTS pipeline_run_tenant_time
  ON pipeline.pipeline_run(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_run_stage_status
  ON pipeline.pipeline_run(tenant_id, stage, status);

-- Unita' di lavoro assegnata a un droid/stage --------------------------------
-- `flow_run_id` linka il run Activepieces che ha eseguito il task: il consumo
-- AI e' attribuito allo stadio via `metering.usage_event.flow_run_id`.
CREATE TABLE IF NOT EXISTS pipeline.agent_task (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid NOT NULL REFERENCES pipeline.pipeline_run(id) ON DELETE CASCADE,
  seq          integer NOT NULL DEFAULT 0,
  droid        text NOT NULL,
  title        text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'pending',
  flow_run_id  text,
  input        jsonb NOT NULL DEFAULT '{}'::jsonb,
  output       jsonb NOT NULL DEFAULT '{}'::jsonb,
  error        text,
  attempt_no   smallint NOT NULL DEFAULT 1,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_task_status CHECK (
    status IN ('pending', 'running', 'done', 'failed', 'skipped')
  )
);
CREATE INDEX IF NOT EXISTS agent_task_run_seq
  ON pipeline.agent_task(run_id, seq);
CREATE INDEX IF NOT EXISTS agent_task_flow_run
  ON pipeline.agent_task(flow_run_id) WHERE flow_run_id IS NOT NULL;

-- Deliverable generati (libreria asset, P0.4) --------------------------------
-- Il contenuto vive su storage esterno (`storage_key`); qui solo i metadati e
-- lo stato di approvazione. Ogni revisione incrementa `version`.
CREATE TABLE IF NOT EXISTS pipeline.asset (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE,
  run_id      uuid REFERENCES pipeline.pipeline_run(id) ON DELETE SET NULL,
  task_id     uuid REFERENCES pipeline.agent_task(id) ON DELETE SET NULL,
  kind        text NOT NULL,
  name        text NOT NULL,
  storage_key text NOT NULL,
  mime        text,
  size_bytes  bigint,
  version     integer NOT NULL DEFAULT 1,
  status      text NOT NULL DEFAULT 'draft',
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by text,
  approved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asset_kind CHECK (
    kind IN ('document', 'image', 'video', 'audio', 'code', 'link', 'dataset', 'archive')
  ),
  CONSTRAINT asset_status CHECK (
    status IN ('draft', 'in_review', 'approved', 'rejected', 'delivered')
  ),
  CONSTRAINT asset_version_positive CHECK (version > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS asset_version_uniq
  ON pipeline.asset (
    COALESCE(run_id, '00000000-0000-0000-0000-000000000000'::uuid),
    kind, name, version
  );
CREATE INDEX IF NOT EXISTS asset_tenant_time
  ON pipeline.asset(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS asset_run
  ON pipeline.asset(run_id) WHERE run_id IS NOT NULL;

-- Credenziali di integrazione (social/ads/analytics/webhook, P0.6) -----------
-- Il segreto e' cifrato a riposo (AES-256-GCM, chiave da CONSOLE_SECRETS_KEY /
-- AP_ENCRYPTION_KEY): nel DB non finisce mai il valore in chiaro.
CREATE TABLE IF NOT EXISTS pipeline.integration_credential (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE,
  provider   text NOT NULL,
  kind       text NOT NULL DEFAULT 'oauth',
  label      text NOT NULL DEFAULT '',
  secret_enc text NOT NULL,
  scopes     text[] NOT NULL DEFAULT '{}',
  status     text NOT NULL DEFAULT 'active',
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_kind CHECK (kind IN ('oauth', 'webhook', 'api_key')),
  CONSTRAINT integration_status CHECK (status IN ('active', 'revoked', 'error'))
);
CREATE UNIQUE INDEX IF NOT EXISTS integration_credential_uniq
  ON pipeline.integration_credential(tenant_id, provider, label);

-- Lead raccolti dal sito/form/webhook (P0.6) ---------------------------------
CREATE TABLE IF NOT EXISTS pipeline.lead (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE,
  run_id     uuid REFERENCES pipeline.pipeline_run(id) ON DELETE SET NULL,
  source     text NOT NULL DEFAULT 'website',
  name       text,
  email      text,
  phone      text,
  message    text,
  utm        jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  status     text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_status CHECK (
    status IN ('new', 'contacted', 'qualified', 'won', 'lost', 'spam')
  )
);
CREATE INDEX IF NOT EXISTS lead_tenant_time
  ON pipeline.lead(tenant_id, created_at DESC);
