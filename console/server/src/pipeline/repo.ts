import crypto, { createHash } from "node:crypto";
import { withTx } from "../metering/db.js";
import {
  availableCredits,
  estimateCredits,
  recordUsage,
  releaseReservation,
  reserveCredits,
  tenantById,
  type RecordUsageResult,
} from "../metering/repo.js";
import type { Capability, Unit } from "../metering/price.js";
import {
  assetFamilyKey,
  canTransitionAsset,
  canTransitionLead,
  canTransitionRun,
  derivedRunStatus,
  isAssetDecidable,
  isLeadStatus,
  type AssetStatus,
  type LeadStatus,
  type RunStatus,
  type StageId,
  type StageSpec,
  type TaskStatus,
} from "./catalog.js";

// Repository della pipeline: run per stadio, task per droid, asset e lead.
// Tutte le query sono parametrizzate; ogni scrittura di stato passa dalla
// macchina a stati di `catalog.ts` (niente transizioni inventate sul DB).

export interface PipelineRunRow {
  id: string;
  tenant_id: string;
  stage: string;
  status: RunStatus;
  title: string;
  brief: unknown;
  context: unknown;
  approved_by: string | null;
  approved_at: Date | null;
  delivered_at: Date | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AgentTaskRow {
  id: string;
  run_id: string;
  seq: number;
  droid: string;
  title: string;
  status: TaskStatus;
  flow_run_id: string | null;
  input: unknown;
  output: unknown;
  error: string | null;
  attempt_no: number;
  started_at: Date | null;
  finished_at: Date | null;
}

export interface AssetRow {
  id: string;
  tenant_id: string;
  run_id: string | null;
  task_id: string | null;
  kind: string;
  name: string;
  storage_key: string;
  mime: string | null;
  size_bytes: string | null;
  version: number;
  status: string;
  meta: unknown;
  approved_by: string | null;
  approved_at: Date | null;
  created_at: Date;
}

// --- Run ---------------------------------------------------------------------

export interface CreateRunInput {
  tenantId: string;
  stage: StageId;
  title?: string;
  brief?: unknown;
  context?: unknown;
}

/** Crea un run `draft` per lo stadio, con i task pianificati dallo `StageSpec`. */
export async function createRun(input: CreateRunInput, spec: StageSpec): Promise<PipelineRunRow> {
  return withTx(async (client) => {
    const { rows } = await client.query<PipelineRunRow>(
      `INSERT INTO pipeline.pipeline_run (tenant_id, stage, title, brief, context)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
       RETURNING *`,
      [
        input.tenantId,
        input.stage,
        input.title ?? spec.title,
        JSON.stringify(input.brief ?? {}),
        JSON.stringify(input.context ?? {}),
      ],
    );
    const run = rows[0];

    // Pianificazione dei task: seq progressivo nell'ordine dello StageSpec.
    for (let i = 0; i < spec.tasks.length; i++) {
      const t = spec.tasks[i];
      await client.query(
        `INSERT INTO pipeline.agent_task (run_id, seq, droid, title, input)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [run.id, i + 1, t.droid, t.title, JSON.stringify({ stage: spec.id, brief: input.brief ?? {} })],
      );
    }
    return run;
  });
}

export async function getRun(tenantId: string, runId: string): Promise<PipelineRunRow | null> {
  const { rows } = await withTx((client) =>
    client.query<PipelineRunRow>(
      `SELECT * FROM pipeline.pipeline_run WHERE id = $1 AND tenant_id = $2`,
      [runId, tenantId],
    ),
  );
  return rows[0] ?? null;
}

export async function listRuns(
  tenantId: string,
  opts: { stage?: string; status?: string; limit?: number } = {},
): Promise<PipelineRunRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const { rows } = await withTx((client) =>
    client.query<PipelineRunRow>(
      `SELECT * FROM pipeline.pipeline_run
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR stage = $2)
          AND ($3::text IS NULL OR status = $3)
        ORDER BY created_at DESC
        LIMIT $4`,
      [tenantId, opts.stage ?? null, opts.status ?? null, limit],
    ),
  );
  return rows;
}

/**
 * Transizione di stato del run: valida con la macchina a stati, poi aggiorna
 * i timestamp coerenti (`approved_at`, `delivered_at`, `finished_at`).
 * Ritorna `null` se la transizione non e' ammessa.
 */
export async function transitionRun(
  tenantId: string,
  runId: string,
  to: RunStatus,
  opts: { approvedBy?: string } = {},
): Promise<PipelineRunRow | null> {
  const current = await getRun(tenantId, runId);
  if (!current) return null;
  if (!canTransitionRun(current.status, to)) return null;

  const { rows } = await withTx((client) =>
    client.query<PipelineRunRow>(
      `UPDATE pipeline.pipeline_run SET
         status      = $3,
         started_at  = CASE WHEN $3 = 'in_progress' AND started_at IS NULL THEN now() ELSE started_at END,
         approved_by = CASE WHEN $3 = 'approved' THEN COALESCE($4, approved_by) ELSE approved_by END,
         approved_at = CASE WHEN $3 = 'approved' THEN now() ELSE approved_at END,
         delivered_at = CASE WHEN $3 = 'delivered' THEN now() ELSE delivered_at END,
         finished_at = CASE WHEN $3 IN ('delivered','failed') THEN now() ELSE finished_at END,
         updated_at  = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [runId, tenantId, to, opts.approvedBy ?? null],
    ),
  );
  return rows[0] ?? null;
}

/**
 * Riallinea lo stato del run dai task (chiamato dopo l'esecuzione dei task):
 * `failed` se un task e' fallito, `in_review` se sono tutti conclusi.
 * Non riporta mai indietro un run gia' approvato/consegnato.
 */
export async function syncRunStatus(tenantId: string, runId: string): Promise<PipelineRunRow | null> {
  const current = await getRun(tenantId, runId);
  if (!current) return null;
  if (current.status === "approved" || current.status === "delivered") return current;

  const tasks = await listTasks(tenantId, runId);
  const derived = derivedRunStatus(tasks);
  if (derived === current.status) return current;
  return transitionRun(tenantId, runId, derived);
}

// --- Task --------------------------------------------------------------------

export async function listTasks(tenantId: string, runId: string): Promise<AgentTaskRow[]> {
  const { rows } = await withTx((client) =>
    client.query<AgentTaskRow>(
      `SELECT t.* FROM pipeline.agent_task t
         JOIN pipeline.pipeline_run r ON r.id = t.run_id
        WHERE t.run_id = $1 AND r.tenant_id = $2
        ORDER BY t.seq ASC`,
      [runId, tenantId],
    ),
  );
  return rows;
}

/** Marca il task come in esecuzione e registra il flow_run Activepieces. */
export async function startTask(
  tenantId: string,
  taskId: string,
  flowRunIdValue?: string | null,
): Promise<AgentTaskRow | null> {
  const { rows } = await withTx((client) =>
    client.query<AgentTaskRow>(
      // In `UPDATE ... FROM`, `pipeline_run` ha anch'esso `started_at`: senza
      // alias il riferimento e' ambiguo e Postgres rifiuta la query.
      `UPDATE pipeline.agent_task t SET
         status = 'running', started_at = COALESCE(t.started_at, now()),
         flow_run_id = COALESCE($3, t.flow_run_id), updated_at = now()
       FROM pipeline.pipeline_run r
       WHERE t.id = $1 AND r.id = t.run_id AND r.tenant_id = $2
         AND t.status IN ('pending','failed')
       RETURNING t.*`,
      [taskId, tenantId, flowRunIdValue ?? null],
    ),
  );
  return rows[0] ?? null;
}

export async function finishTask(
  tenantId: string,
  taskId: string,
  result: { output?: unknown; status?: Extract<TaskStatus, "done" | "failed" | "skipped">; error?: string | null },
): Promise<AgentTaskRow | null> {
  const status = result.status ?? "done";
  const { rows } = await withTx((client) =>
    client.query<AgentTaskRow>(
      `UPDATE pipeline.agent_task t SET
         status = $3,
         output = COALESCE($4::jsonb, t.output),
         error = $5,
         finished_at = now(),
         attempt_no = t.attempt_no + CASE WHEN $3 = 'failed' THEN 1 ELSE 0 END,
         updated_at = now()
       FROM pipeline.pipeline_run r
       WHERE t.id = $1 AND r.id = t.run_id AND r.tenant_id = $2
         AND t.status = 'running'
       RETURNING t.*`,
      [taskId, tenantId, status, result.output === undefined ? null : JSON.stringify(result.output), result.error ?? null],
    ),
  );
  return rows[0] ?? null;
}

// --- Asset -------------------------------------------------------------------

export interface RegisterAssetInput {
  tenantId: string;
  runId?: string | null;
  taskId?: string | null;
  kind: AssetRow["kind"];
  name: string;
  storageKey: string;
  mime?: string | null;
  sizeBytes?: number | null;
  meta?: unknown;
}

/**
 * Registra un deliverable. La versione e' calcolata come max+1 per
 * (run, kind, name): ogni rigenerazione produce una nuova revisione, la
 * precedente resta consultabile. L'indice unique in DDL rende l'operazione
 * sicura anche in concorrenza.
 */
export async function registerAsset(input: RegisterAssetInput): Promise<AssetRow> {
  return withTx(async (client) => {
    const runId = input.runId ?? null;
    const { rows: verRows } = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next
         FROM pipeline.asset
        WHERE tenant_id = $1 AND kind = $2 AND name = $3
          AND COALESCE(run_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = COALESCE($4::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
      [input.tenantId, input.kind, input.name, runId],
    );
    const version = Number(verRows[0]?.next ?? 1);

    const { rows } = await client.query<AssetRow>(
      `INSERT INTO pipeline.asset
         (tenant_id, run_id, task_id, kind, name, storage_key, mime, size_bytes, version, meta)
       VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::jsonb)
       RETURNING *`,
      [
        input.tenantId,
        runId,
        input.taskId ?? null,
        input.kind,
        input.name,
        input.storageKey,
        input.mime ?? null,
        input.sizeBytes ?? null,
        version,
        JSON.stringify(input.meta ?? {}),
      ],
    );
    return rows[0];
  });
}

export async function listAssets(
  tenantId: string,
  opts: { runId?: string; kind?: string; status?: string; limit?: number } = {},
): Promise<AssetRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const { rows } = await withTx((client) =>
    client.query<AssetRow>(
      `SELECT * FROM pipeline.asset
        WHERE tenant_id = $1
          AND ($2::uuid IS NULL OR run_id = $2::uuid)
          AND ($3::text IS NULL OR kind = $3)
          AND ($4::text IS NULL OR status = $4)
        ORDER BY created_at DESC
        LIMIT $5`,
      [tenantId, opts.runId ?? null, opts.kind ?? null, opts.status ?? null, limit],
    ),
  );
  return rows;
}

/** Approva (o rifiuta) un deliverable. Solo gli asset in `in_review` sono decidibili. */
export async function decideAsset(
  tenantId: string,
  assetId: string,
  decision: "approved" | "rejected",
  approvedBy: string,
): Promise<AssetRow | null> {
  return withTx(async (client) => {
    const { rows: cur } = await client.query<AssetRow>(
      `SELECT * FROM pipeline.asset WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [assetId, tenantId],
    );
    const current = cur[0];
    if (!current) return null;
    if (!isAssetDecidable(current.status as AssetStatus)) return null;
    if (!canTransitionAsset(current.status as AssetStatus, decision)) return null;

    const { rows } = await client.query<AssetRow>(
      `UPDATE pipeline.asset SET
         status = $3, approved_by = CASE WHEN $3 = 'approved' THEN $4 ELSE approved_by END,
         approved_at = CASE WHEN $3 = 'approved' THEN now() ELSE approved_at END
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [assetId, tenantId, decision, approvedBy],
    );
    return rows[0] ?? null;
  });
}

/**
 * Transizione generica di stato di un asset, filtrata dalla macchina a stati di
 * `catalog.ts`: nessuna transizione inventata sul DB. Ritorna `null` se lo stato
 * corrente non ammette quello richiesto.
 */
export async function transitionAsset(
  tenantId: string,
  assetId: string,
  to: AssetStatus,
  opts: { by?: string } = {},
): Promise<AssetRow | null> {
  return withTx(async (client) => {
    const { rows: cur } = await client.query<AssetRow>(
      `SELECT * FROM pipeline.asset WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [assetId, tenantId],
    );
    const current = cur[0];
    if (!current) return null;
    if (!canTransitionAsset(current.status as AssetStatus, to)) return null;

    const { rows } = await client.query<AssetRow>(
      `UPDATE pipeline.asset SET
         status = $3,
         approved_by = CASE WHEN $3 = 'approved' THEN COALESCE($4, approved_by) ELSE approved_by END,
         approved_at = CASE WHEN $3 = 'approved' THEN now() ELSE approved_at END
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [assetId, tenantId, to, opts.by ?? null],
    );
    return rows[0] ?? null;
  });
}

/**
 * Tutte le versioni della famiglia a cui appartiene l'asset (stesso run/kind/name),
 * dalla piu' recente. E' la vista "storico revisioni" della libreria asset.
 */
export async function listAssetVersions(
  tenantId: string,
  assetId: string,
): Promise<AssetRow[]> {
  const { rows } = await withTx(async (client) => {
    const { rows: cur } = await client.query<AssetRow>(
      `SELECT * FROM pipeline.asset WHERE id = $1 AND tenant_id = $2`,
      [assetId, tenantId],
    );
    const asset = cur[0];
    if (!asset) return { rows: [] as AssetRow[] };
    return client.query<AssetRow>(
      `SELECT * FROM pipeline.asset
        WHERE tenant_id = $1 AND kind = $2 AND name = $3
          AND COALESCE(run_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = COALESCE($4::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        ORDER BY version DESC`,
      [asset.tenant_id, asset.kind, asset.name, asset.run_id],
    );
  });
  return rows;
}

export interface AssetFamily {
  key: string;
  runId: string | null;
  kind: string;
  name: string;
  latestVersion: number;
  latestStatus: string;
  /** Id della revisione piu' recente: da qui la Console carica lo storico. */
  latestAssetId: string;
  approvedVersion: number | null;
  versions: number;
  updatedAt: Date;
}

/**
 * Elenco delle famiglie di deliverable (una per run/kind/name) con la versione
 * piu' recente, quella approvata e il numero di revisioni. E' il raggruppamento
 * che la Console mostra: una riga per deliverable, non una per revisione.
 */
export async function listAssetFamilies(
  tenantId: string,
  opts: { runId?: string; kind?: string; limit?: number } = {},
): Promise<AssetFamily[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const { rows } = await withTx((client) =>
    client.query<{
      run_id: string | null;
      kind: string;
      name: string;
      latest_version: string;
      latest_status: string;
      latest_asset_id: string;
      approved_version: string | null;
      versions: string;
      updated_at: Date;
    }>(
      `SELECT run_id, kind, name,
              MAX(version) AS latest_version,
              COUNT(*) AS versions,
              MAX(created_at) AS updated_at,
              (ARRAY_AGG(status ORDER BY version DESC))[1] AS latest_status,
              (ARRAY_AGG(id ORDER BY version DESC))[1] AS latest_asset_id,
              (ARRAY_AGG(version ORDER BY version DESC)
                 FILTER (WHERE status IN ('approved','delivered')))[1] AS approved_version
         FROM pipeline.asset
        WHERE tenant_id = $1
          AND ($2::uuid IS NULL OR run_id = $2::uuid)
          AND ($3::text IS NULL OR kind = $3)
        GROUP BY run_id, kind, name
        ORDER BY MAX(created_at) DESC
        LIMIT $4`,
      [tenantId, opts.runId ?? null, opts.kind ?? null, limit],
    ),
  );
  return rows.map((r) => ({
    key: assetFamilyKey(r.run_id, r.kind, r.name),
    runId: r.run_id,
    kind: r.kind,
    name: r.name,
    latestVersion: Number(r.latest_version),
    latestStatus: r.latest_status,
    latestAssetId: r.latest_asset_id,
    approvedVersion: r.approved_version === null ? null : Number(r.approved_version),
    versions: Number(r.versions),
    updatedAt: r.updated_at,
  }));
}

/** Marca `delivered` tutti gli asset approvati di un run (alla consegna). */
export async function deliverRunAssets(tenantId: string, runId: string): Promise<number> {
  const { rowCount } = await withTx((client) =>
    client.query(
      `UPDATE pipeline.asset SET status = 'delivered'
        WHERE tenant_id = $1 AND run_id = $2 AND status = 'approved'`,
      [tenantId, runId],
    ),
  );
  return rowCount ?? 0;
}

// --- Lead --------------------------------------------------------------------

export interface CreateLeadInput {
  tenantId: string;
  runId?: string | null;
  source?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  utm?: unknown;
  payload?: unknown;
}

export async function createLead(input: CreateLeadInput): Promise<{ id: string }> {
  const { rows } = await withTx((client) =>
    client.query<{ id: string }>(
      `INSERT INTO pipeline.lead
         (tenant_id, run_id, source, name, email, phone, message, utm, payload)
       VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
       RETURNING id`,
      [
        input.tenantId,
        input.runId ?? null,
        input.source ?? "website",
        input.name ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.message ?? null,
        JSON.stringify(input.utm ?? {}),
        JSON.stringify(input.payload ?? {}),
      ],
    ),
  );
  return rows[0];
}

export interface LeadRow {
  id: string;
  tenant_id: string;
  run_id: string | null;
  source: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  utm: unknown;
  payload: unknown;
  status: LeadStatus;
  notified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Elenco dei lead del tenant, dal piu' recente, con filtri opzionali. */
export async function listLeads(
  tenantId: string,
  opts: { status?: string; runId?: string; limit?: number } = {},
): Promise<LeadRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const { rows } = await withTx((client) =>
    client.query<LeadRow>(
      `SELECT * FROM pipeline.lead
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR status = $2)
          AND ($3::uuid IS NULL OR run_id = $3::uuid)
        ORDER BY created_at DESC
        LIMIT $4`,
      [tenantId, opts.status ?? null, opts.runId ?? null, limit],
    ),
  );
  return rows;
}

export async function getLead(tenantId: string, leadId: string): Promise<LeadRow | null> {
  const { rows } = await withTx((client) =>
    client.query<LeadRow>(
      `SELECT * FROM pipeline.lead WHERE id = $1 AND tenant_id = $2`,
      [leadId, tenantId],
    ),
  );
  return rows[0] ?? null;
}

/**
 * Aggiorna lo stato di un lead passando dalla macchina a stati di `catalog.ts`:
 * una transizione non ammessa ritorna `null` (niente stati inventati sul DB).
 */
export async function updateLeadStatus(
  tenantId: string,
  leadId: string,
  to: LeadStatus,
): Promise<LeadRow | null> {
  if (!isLeadStatus(to)) return null;
  return withTx(async (client) => {
    const { rows: cur } = await client.query<LeadRow>(
      `SELECT * FROM pipeline.lead WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [leadId, tenantId],
    );
    const current = cur[0];
    if (!current) return null;
    if (current.status === to) return current;
    if (!canTransitionLead(current.status, to)) return null;

    const { rows } = await client.query<LeadRow>(
      `UPDATE pipeline.lead
          SET status = $3, updated_at = now()
        WHERE id = $1 AND tenant_id = $2
        RETURNING *`,
      [leadId, tenantId, to],
    );
    return rows[0] ?? null;
  });
}

/** Marca un lead come inoltrato al canale outbound (idempotente). */
export async function markLeadNotified(tenantId: string, leadId: string): Promise<void> {
  await withTx((client) =>
    client.query(
      `UPDATE pipeline.lead SET notified_at = now()
        WHERE id = $1 AND tenant_id = $2 AND notified_at IS NULL`,
      [leadId, tenantId],
    ),
  );
}

/** Conteggio lead per stato (per i badge della Console). */
export async function leadStatusCounts(
  tenantId: string,
): Promise<{ status: string; count: number }[]> {
  const { rows } = await withTx((client) =>
    client.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) AS count
         FROM pipeline.lead
        WHERE tenant_id = $1
        GROUP BY status`,
      [tenantId],
    ),
  );
  return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
}

// --- Integrazioni ------------------------------------------------------------

export interface IntegrationRow {
  id: string;
  tenant_id: string;
  provider: string;
  kind: string;
  label: string;
  secret_enc: string;
  scopes: string[];
  status: string;
  meta: unknown;
  created_at: Date;
  updated_at: Date;
}

export async function saveIntegrationCredential(input: {
  tenantId: string;
  provider: string;
  kind?: "oauth" | "webhook" | "api_key";
  label?: string;
  secretEnc: string;
  scopes?: string[];
  meta?: unknown;
}): Promise<IntegrationRow> {
  const { rows } = await withTx((client) =>
    client.query<IntegrationRow>(
      `INSERT INTO pipeline.integration_credential
         (tenant_id, provider, kind, label, secret_enc, scopes, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (tenant_id, provider, label) DO UPDATE SET
         kind = EXCLUDED.kind,
         secret_enc = EXCLUDED.secret_enc,
         scopes = EXCLUDED.scopes,
         meta = EXCLUDED.meta,
         status = 'active',
         updated_at = now()
       RETURNING *`,
      [
        input.tenantId,
        input.provider,
        input.kind ?? "oauth",
        input.label ?? "",
        input.secretEnc,
        input.scopes ?? [],
        JSON.stringify(input.meta ?? {}),
      ],
    ),
  );
  return rows[0];
}

/** Credenziali senza il segreto cifrato: l'elenco e' sicuro per la Console. */
export async function listIntegrationCredentials(
  tenantId: string,
): Promise<Omit<IntegrationRow, "secret_enc">[]> {
  const { rows } = await withTx((client) =>
    client.query<IntegrationRow>(
      `SELECT id, tenant_id, provider, kind, label, scopes, status, meta, created_at, updated_at
         FROM pipeline.integration_credential
        WHERE tenant_id = $1
        ORDER BY created_at DESC`,
      [tenantId],
    ),
  );
  return rows;
}

export async function revokeIntegrationCredential(
  tenantId: string,
  id: string,
): Promise<boolean> {
  const res = await withTx((client) =>
    client.query(
      `UPDATE pipeline.integration_credential
          SET status = 'revoked', updated_at = now()
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    ),
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Credenziale attiva di un provider per il tenant (con segreto cifrato).
 * Usata dal notificatore outbound: il chiamante decifra con `decryptSecret`.
 * Ritorna `null` se non esiste o e' stata revocata.
 */
export async function findActiveIntegrationCredential(
  tenantId: string,
  provider: string,
): Promise<IntegrationRow | null> {
  const { rows } = await withTx((client) =>
    client.query<IntegrationRow>(
      `SELECT * FROM pipeline.integration_credential
        WHERE tenant_id = $1 AND provider = $2 AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 1`,
      [tenantId, provider],
    ),
  );
  return rows[0] ?? null;
}

// --- Manifest di consumo per run ---------------------------------------------

export interface RunUsageRow {
  capability: string;
  requests: number;
  credits: number;
  price_eur: number;
  provider_cost_usd: number;
}

export interface RunUsageSummary {
  /** Righe per capability, dalla piu' costosa. */
  byCapability: RunUsageRow[];
  totals: {
    requests: number;
    credits: number;
    price_eur: number;
    provider_cost_usd: number;
  };
}

/**
 * Manifest di consumo di un run: aggrega `metering.usage_event` per gli
 * `flow_run_id` registrati sui task dello stadio. E' il ponte fra pipeline e
 * banco di conto (docs sez. 5: "run_id -> unita' AI consumate").
 *
 * Il consumo e' attribuito SOLO se il task ha un `flow_run_id` e se la riga di
 * `usage_event` appartiene allo stesso tenant del run: nessuna fuga di dati fra
 * tenant e nessun consumo orfano conteggiato due volte.
 */
export async function runUsage(tenantId: string, runId: string): Promise<RunUsageRow[]> {
  const { rows } = await withTx((client) =>
    client.query<{ capability: string; requests: string; credits: string; price_eur: string; provider_cost_usd: string }>(
      `SELECT ue.capability,
              COUNT(*) AS requests,
              COALESCE(SUM(ue.credits), 0) AS credits,
              COALESCE(SUM(ue.price_eur), 0) AS price_eur,
              COALESCE(SUM(ue.provider_cost_usd), 0) AS provider_cost_usd
         FROM metering.usage_event ue
         JOIN pipeline.agent_task t ON t.flow_run_id = ue.flow_run_id
         JOIN pipeline.pipeline_run r ON r.id = t.run_id
        WHERE r.id = $1 AND r.tenant_id = $2 AND ue.tenant_id = $2
        GROUP BY ue.capability
        ORDER BY credits DESC`,
      [runId, tenantId],
    ),
  );
  return rows.map((r) => ({
    capability: r.capability,
    requests: Number(r.requests),
    credits: Number(r.credits),
    price_eur: Number(r.price_eur),
    provider_cost_usd: Number(r.provider_cost_usd),
  }));
}

/**
 * Manifest di consumo del run con i totali: e' la vista che la Console mostra
 * accanto ai deliverable ("quanto e' costato questo stadio"). Somma i consumi
 * AI (dal ledger) e il consumo di orchestrazione (`flow_run`, registrato da
 * `recordFlowRun`).
 */
export async function runUsageSummary(tenantId: string, runId: string): Promise<RunUsageSummary> {
  const byCapability = await runUsage(tenantId, runId);
  const totals = byCapability.reduce(
    (acc, r) => ({
      requests: acc.requests + r.requests,
      credits: acc.credits + r.credits,
      price_eur: acc.price_eur + r.price_eur,
      provider_cost_usd: acc.provider_cost_usd + r.provider_cost_usd,
    }),
    { requests: 0, credits: 0, price_eur: 0, provider_cost_usd: 0 },
  );
  return { byCapability, totals };
}

// --- Metering dell'orchestrazione (non-AI) -----------------------------------

/** Capability/unit del consumo non-AI: 1 esecuzione di task = 1 `request`. */
const FLOW_RUN_CAPABILITY: Capability = "flow_run";
const FLOW_RUN_UNIT: Unit = "request";

export interface RecordFlowRunInput {
  tenantId: string;
  /** Run di pipeline a cui appartiene il task (per audit/joins). */
  runId: string;
  /** Task eseguito: se presente, il suo `flow_run_id` viene riallineato. */
  taskId?: string | null;
  /** Id del flow run Activepieces (chiave di attribuzione del consumo AI). */
  flowRunId: string;
  /** Id idempotenza: default `flow_run:<flowRunId>`. */
  requestId?: string;
  attemptNo?: number;
  /** Esito dell'esecuzione: `error` registra la riga ma senza addebito pieno. */
  status?: "success" | "error";
  latencyMs?: number | null;
  source?: string;
}

export interface RecordFlowRunResult extends RecordUsageResult {
  requestId: string;
  flowRunId: string;
  /** false se il run non esiste o appartiene a un altro tenant. */
  recorded: boolean;
}

/**
 * Calcola e REGISTRA il consumo di orchestrazione di un task di pipeline:
 * 1 esecuzione = 1 unita' `request` sulla capability `flow_run`
 * (prezzo dal price book, oggi 0,0020 USD/request, min 1 credito).
 *
 * Percorso: stima -> prenotazione atomica -> `recordUsage` (che scrive
 * `usage_event` e salda la prenotazione nella stessa transazione). In caso di
 * errore la prenotazione viene rilasciata: nessun addebito senza esecuzione.
 * L'idempotenza su `(request_id, attempt_no)` rende sicuro un retry.
 */
export async function recordFlowRun(input: RecordFlowRunInput): Promise<RecordFlowRunResult> {
  // `metering.usage_event.request_id` e' `uuid`: l'id del flow run (testo, usato
  // per l'attribuzione in `flow_run_id`) va mappato su un UUID stabile. Derivarlo
  // con sha256 mantiene l'idempotenza: lo stesso flow run produce la stessa riga.
  const requestId = input.requestId ?? requestIdForFlowRun(input.flowRunId);

  const run = await getRun(input.tenantId, input.runId);
  if (!run) {
    return {
      requestId,
      flowRunId: input.flowRunId,
      recorded: false,
      credits: 0,
      charged: 0,
      overflow: 0,
      balance: 0,
      available: 0,
      duplicate: false,
      priceEur: 0,
      providerCostUsd: 0,
      markupBps: 0,
      priceBookVersion: null,
    };
  }

  const tenant = await tenantById(input.tenantId);
  if (!tenant) throw new Error(`tenant ${input.tenantId} inesistente`);

  const counts = { [FLOW_RUN_UNIT]: 1 } as Partial<Record<Unit, number>>;

  const estimate = await estimateCredits(tenant, {
    capability: FLOW_RUN_CAPABILITY,
    model: "*",
    provider: "*",
    units: [FLOW_RUN_UNIT],
    counts,
  });
  const available = await availableCredits(input.tenantId);
  const reservation = Math.max(0, Math.min(estimate, available));
  const res = await reserveCredits(input.tenantId, requestId, reservation);
  if (!res.ok) {
    // Saldo insufficiente: nessuna esecuzione addebitabile. Fail-closed.
    throw new Error("crediti insufficienti per il task di pipeline");
  }

  try {
    const settled = await recordUsage({
      tenant,
      requestId,
      reservation,
      flowRunId: input.flowRunId,
      capability: FLOW_RUN_CAPABILITY,
      provider: "*",
      model: "*",
      units: counts,
      latencyMs: input.latencyMs ?? null,
      status: input.status ?? "success",
      source: input.source ?? "pipeline",
    });

    // Riallinea il flow_run_id del task (se non gia' impostato da startTask).
    if (input.taskId) {
      await withTx((client) =>
        client.query(
          `UPDATE pipeline.agent_task t SET flow_run_id = $3, updated_at = now()
             FROM pipeline.pipeline_run r
            WHERE t.id = $1 AND r.id = t.run_id AND r.tenant_id = $2
              AND t.flow_run_id IS NULL`,
          [input.taskId, input.tenantId, input.flowRunId],
        ),
      );
    }

    return { ...settled, requestId, flowRunId: input.flowRunId, recorded: true };
  } catch (err) {
    await releaseReservation(input.tenantId, requestId, reservation, "flow_run failed").catch(
      () => {},
    );
    throw err;
  }
}

/** Flow run id generato per un task (formato stabile: stage:run:seq:random). */
export function makeFlowRunId(stage: string, runId: string, seq: number): string {
  return `${stage}:${runId}:${seq}:${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * UUID deterministico per l'idempotenza del consumo di orchestrazione.
 * `metering.usage_event.request_id` e' `uuid`: partendo dal `flow_run_id`
 * (testo) si ottiene lo stesso UUID a ogni retry, cosi' il vincolo unico
 * `(request_id, attempt_no)` continua a deduplicare.
 */
function requestIdForFlowRun(flowRunId: string): string {
  const h = createHash("sha256").update(`flow_run:${flowRunId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
