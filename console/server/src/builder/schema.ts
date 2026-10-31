// builder/schema.ts — DDL as string constant for bundling (tsc doesn't copy .sql)
// Generated from schema.sql — keep in sync.

export const BUILDER_SCHEMA_SQL = `-- builder schema — Universal Builder Platform (Pazi.ai clone)
-- Idempotent DDL for: tasks, steps, artifacts, projects, credit_ledger
-- Runs in a single implicit transaction (simple query protocol).

-- Enum types
DO $$ BEGIN
    CREATE TYPE builder.task_status AS ENUM (
        'pending', 'running', 'paused', 'completed', 'failed', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE builder.step_status AS ENUM (
        'pending', 'running', 'completed', 'failed', 'skipped'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE builder.artifact_kind AS ENUM (
        'code', 'design', 'document', 'image', 'video', 'audio', 'config', 'log', 'deploy', 'other'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE builder.project_type AS ENUM (
        'saas', 'ecommerce', 'marketplace', 'landing', 'mobile_app', 'api', 'internal_tool', 'other'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE builder.credit_reason AS ENUM (
        'task_execution', 'agent_step', 'sandbox_compute', 'llm_tokens', 'image_gen', 'video_gen',
        'deploy', 'stripe_recharge', 'manual_adjustment', 'refund'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Projects table
CREATE TABLE IF NOT EXISTS builder.project (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    type builder.project_type NOT NULL DEFAULT 'saas',
    spec JSONB NOT NULL DEFAULT '{}',
    repo_url TEXT,
    deploy_targets JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_builder_project_tenant ON builder.project(tenant_id);
CREATE INDEX IF NOT EXISTS idx_builder_project_status ON builder.project(status);

-- Tasks table
CREATE TABLE IF NOT EXISTS builder.task (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES builder.project(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status builder.task_status NOT NULL DEFAULT 'pending',
    spec JSONB NOT NULL DEFAULT '{}',
    result JSONB,
    cost_credits INTEGER NOT NULL DEFAULT 0,
    estimated_credits INTEGER,
    parent_task_id UUID REFERENCES builder.task(id) ON DELETE SET NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_builder_task_project ON builder.task(project_id);
CREATE INDEX IF NOT EXISTS idx_builder_task_tenant ON builder.task(tenant_id);
CREATE INDEX IF NOT EXISTS idx_builder_task_status ON builder.task(status);
CREATE INDEX IF NOT EXISTS idx_builder_task_priority ON builder.task(priority DESC);
CREATE INDEX IF NOT EXISTS idx_builder_task_parent ON builder.task(parent_task_id);

-- Task Steps table
CREATE TABLE IF NOT EXISTS builder.task_step (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES builder.task(id) ON DELETE CASCADE,
    agent TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    status builder.step_status NOT NULL DEFAULT 'pending',
    input JSONB NOT NULL DEFAULT '{}',
    output JSONB,
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_builder_task_step_task ON builder.task_step(task_id);
CREATE INDEX IF NOT EXISTS idx_builder_task_step_order ON builder.task_step(task_id, step_order);

-- Artifacts table
CREATE TABLE IF NOT EXISTS builder.artifact (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES builder.task(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES builder.project(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE,
    kind builder.artifact_kind NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    uri TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_builder_artifact_task ON builder.artifact(task_id);
CREATE INDEX IF NOT EXISTS idx_builder_artifact_project ON builder.artifact(project_id);
CREATE INDEX IF NOT EXISTS idx_builder_artifact_kind ON builder.artifact(kind);

-- Credit Ledger table
CREATE TABLE IF NOT EXISTS builder.credit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE,
    delta INTEGER NOT NULL,
    reason builder.credit_reason NOT NULL,
    task_id UUID REFERENCES builder.task(id) ON DELETE SET NULL,
    project_id UUID REFERENCES builder.project(id) ON DELETE SET NULL,
    balance_after INTEGER NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_builder_credit_ledger_tenant ON builder.credit_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_builder_credit_ledger_task ON builder.credit_ledger(task_id);
CREATE INDEX IF NOT EXISTS idx_builder_credit_ledger_created ON builder.credit_ledger(created_at DESC);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION builder.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_builder_project_updated ON builder.project;
CREATE TRIGGER trg_builder_project_updated
    BEFORE UPDATE ON builder.project
    FOR EACH ROW EXECUTE FUNCTION builder.set_updated_at();

DROP TRIGGER IF EXISTS trg_builder_task_updated ON builder.task;
CREATE TRIGGER trg_builder_task_updated
    BEFORE UPDATE ON builder.task
    FOR EACH ROW EXECUTE FUNCTION builder.set_updated_at();

-- RLS Policies (tenant isolation)
ALTER TABLE builder.project ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.task ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.task_step ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.artifact ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY builder_project_tenant_isolation ON builder.project
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY builder_task_tenant_isolation ON builder.task
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY builder_task_step_tenant_isolation ON builder.task_step
    USING (task_id IN (SELECT id FROM builder.task WHERE tenant_id = current_setting('app.current_tenant_id')::uuid));

CREATE POLICY builder_artifact_tenant_isolation ON builder.artifact
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY builder_credit_ledger_tenant_isolation ON builder.credit_ledger
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
`;
