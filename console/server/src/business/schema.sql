-- Schema `business` - idempotente, rieseguibile a ogni avvio del BFF (P1.1).
-- Il "substrato aziendale" della piattaforma multi-tenant: ogni impresa-cliente
-- (tenant) ha obiettivi, memoria e un catalogo di prodotti/servizi. Vive nello
-- stesso Postgres dello stack, in uno schema separato da `public`, `metering` e
-- `pipeline`, con FK verso il tenant. Vedi docs/phases.md (P1.1).

CREATE SCHEMA IF NOT EXISTS business;

-- Obiettivi dell'impresa ------------------------------------------------------
-- "Goal-driven": ogni lavoro (run, task, contenuto) dovrebbe servire un
-- obiettivo. `status` segue il ciclo di vita; `priority` ordina l'attenzione.
CREATE TABLE IF NOT EXISTS business.goal (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'active',
  priority    smallint NOT NULL DEFAULT 3,
  metric      text NOT NULL DEFAULT '',
  target_date date,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  achieved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goal_status CHECK (status IN ('active', 'achieved', 'paused', 'abandoned')),
  CONSTRAINT goal_priority_range CHECK (priority BETWEEN 1 AND 5)
);
CREATE INDEX IF NOT EXISTS goal_tenant_status
  ON business.goal(tenant_id, status, priority);
CREATE INDEX IF NOT EXISTS goal_tenant_time
  ON business.goal(tenant_id, created_at DESC);

-- Memoria dell'impresa --------------------------------------------------------
-- Fatti, note, preferenze, vincoli, decisioni e contatti che il tenant vuole
-- ricordare fra una sessione e l'altra. E' la base di conoscenza che alimenta
-- la chat centrale (P1.3): l'orchestratore legge da qui invece di indovinare.
CREATE TABLE IF NOT EXISTS business.memory (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'note',
  title      text NOT NULL DEFAULT '',
  content    text NOT NULL,
  source     text NOT NULL DEFAULT '',
  tags       text[] NOT NULL DEFAULT '{}',
  pinned     boolean NOT NULL DEFAULT false,
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memory_kind CHECK (
    kind IN ('fact', 'note', 'preference', 'constraint', 'decision', 'contact')
  )
);
CREATE INDEX IF NOT EXISTS memory_tenant_kind
  ON business.memory(tenant_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS memory_tenant_pinned
  ON business.memory(tenant_id, pinned) WHERE pinned;
CREATE INDEX IF NOT EXISTS memory_tags
  ON business.memory USING gin (tags);

-- Catalogo prodotti/servizi ----------------------------------------------------
-- Cio' che l'impresa vende o eroga. Distinta dalla libreria `pipeline.asset`
-- (che contiene i deliverable generati): qui e' l'offerta, non il lavoro.
CREATE TABLE IF NOT EXISTS business.product (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'service',
  name        text NOT NULL,
  sku         text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  price_cents bigint NOT NULL DEFAULT 0,
  currency    char(3) NOT NULL DEFAULT 'EUR',
  status      text NOT NULL DEFAULT 'draft',
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_kind CHECK (kind IN ('product', 'service')),
  CONSTRAINT product_status CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT product_price_nonnegative CHECK (price_cents >= 0)
);
CREATE INDEX IF NOT EXISTS product_tenant_status
  ON business.product(tenant_id, status, name);
CREATE UNIQUE INDEX IF NOT EXISTS product_tenant_sku_uniq
  ON business.product(tenant_id, sku) WHERE sku <> '';
