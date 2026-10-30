import { withTx } from "../metering/db.js";
import { balanceSnapshot, quotaState, tenantById, type QuotaState } from "../metering/repo.js";
import {
  DROIDS,
  droidProfile,
  isScheduleKind,
  isScheduleStatus,
  opportunityState,
  opportunityBucket,
  type DroidProfile,
  type OpportunityStateMeta,
  type OpportunityBucket,
  type ScheduleKind,
  type ScheduleStatus,
  OPPORTUNITY_BUCKETS,
  OPPORTUNITY_BUCKET_LABELS,
} from "./catalog.js";
import { nextRunFor, parseCron, isValidCron, isValidTimeZone, CronError } from "./cron.js";

// Repository della piattaforma "Business Pulse" (modello pazi.ai adattato).
//
// Tutte le query leggono le entita' REALI gia' esistenti (pipeline_run,
// agent_task, asset, lead) e la nuova tabella `pipeline.schedule`. Nessuna
// tabella nuova oltre a `schedule`: la piattaforma e' una VISTA sui dati che la
// pipeline gia' produce, non un secondo sistema.

// --- Schedule (Tasks & Calendar, P0.7) ---------------------------------------

export interface ScheduleRow {
  id: string;
  tenant_id: string;
  run_id: string | null;
  stage: string;
  title: string;
  kind: ScheduleKind;
  cron: string | null;
  run_at: Date | null;
  timezone: string;
  status: ScheduleStatus;
  meta: unknown;
  last_run_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateScheduleInput {
  tenantId: string;
  title: string;
  kind?: ScheduleKind;
  stage?: string;
  runId?: string | null;
  cron?: string | null;
  runAt?: Date | string | null;
  timezone?: string;
  meta?: unknown;
}

/**
 * Crea una voce di agenda. Valida in modo esplicito cio' che il DB non puo'
 * esprimere: espressione cron ben formata, timezone IANA valida e presenza di
 * almeno un riferimento temporale (`cron` o `run_at`).
 */
export async function createSchedule(input: CreateScheduleInput): Promise<ScheduleRow> {
  const kind = input.kind ?? "pipeline";
  if (!isScheduleKind(kind)) throw new Error(`kind non valido: ${kind}`);

  const cron = input.cron?.trim() || null;
  if (cron && !isValidCron(cron)) throw new Error(`espressione cron non valida: ${cron}`);

  const runAt = input.runAt ? new Date(input.runAt) : null;
  if (runAt && Number.isNaN(runAt.getTime())) throw new Error("run_at non valida");
  if (!cron && !runAt) throw new Error("serve almeno un campo fra cron e run_at");

  const timezone = input.timezone?.trim() || "Europe/Rome";
  if (!isValidTimeZone(timezone)) throw new Error(`timezone non valida: ${timezone}`);

  const { rows } = await withTx((client) =>
    client.query<ScheduleRow>(
      `INSERT INTO pipeline.schedule
         (tenant_id, run_id, stage, title, kind, cron, run_at, timezone, meta)
       VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING *`,
      [
        input.tenantId,
        input.runId ?? null,
        input.stage ?? "",
        input.title,
        kind,
        cron,
        runAt,
        timezone,
        JSON.stringify(input.meta ?? {}),
      ],
    ),
  );
  return rows[0];
}

export async function listSchedule(
  tenantId: string,
  opts: { status?: string; kind?: string; limit?: number } = {},
): Promise<ScheduleRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const { rows } = await withTx((client) =>
    client.query<ScheduleRow>(
      `SELECT * FROM pipeline.schedule
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR status = $2)
          AND ($3::text IS NULL OR kind = $3)
        ORDER BY COALESCE(run_at, created_at) ASC
        LIMIT $4`,
      [tenantId, opts.status ?? null, opts.kind ?? null, limit],
    ),
  );
  return rows;
}

export async function getSchedule(tenantId: string, id: string): Promise<ScheduleRow | null> {
  const { rows } = await withTx((client) =>
    client.query<ScheduleRow>(
      `SELECT * FROM pipeline.schedule WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    ),
  );
  return rows[0] ?? null;
}

/** Aggiorna una voce di agenda. Ogni campo assente resta invariato. */
export async function updateSchedule(
  tenantId: string,
  id: string,
  patch: {
    title?: string;
    kind?: ScheduleKind;
    stage?: string;
    cron?: string | null;
    runAt?: Date | string | null;
    timezone?: string;
    status?: ScheduleStatus;
    meta?: unknown;
  },
): Promise<ScheduleRow | null> {
  const current = await getSchedule(tenantId, id);
  if (!current) return null;

  if (patch.kind !== undefined && !isScheduleKind(patch.kind)) throw new Error("kind non valido");
  if (patch.status !== undefined && !isScheduleStatus(patch.status)) throw new Error("status non valido");

  const cron = patch.cron === undefined ? current.cron : patch.cron?.trim() || null;
  if (cron && !isValidCron(cron)) throw new Error(`espressione cron non valida: ${cron}`);

  const runAt =
    patch.runAt === undefined ? current.run_at : patch.runAt ? new Date(patch.runAt) : null;
  if (runAt && Number.isNaN(runAt.getTime())) throw new Error("run_at non valida");
  if (!cron && !runAt) throw new Error("serve almeno un campo fra cron e run_at");

  const timezone = patch.timezone === undefined ? current.timezone : patch.timezone.trim();
  if (!isValidTimeZone(timezone)) throw new Error(`timezone non valida: ${timezone}`);

  const { rows } = await withTx((client) =>
    client.query<ScheduleRow>(
      `UPDATE pipeline.schedule SET
         title    = COALESCE($3, title),
         kind     = COALESCE($4, kind),
         stage    = COALESCE($5, stage),
         cron     = $6,
         run_at   = $7,
         timezone = $8,
         status   = COALESCE($9, status),
         meta     = COALESCE($10::jsonb, meta),
         updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        id,
        tenantId,
        patch.title ?? null,
        patch.kind ?? null,
        patch.stage ?? null,
        cron,
        runAt,
        timezone,
        patch.status ?? null,
        patch.meta === undefined ? null : JSON.stringify(patch.meta),
      ],
    ),
  );
  return rows[0] ?? null;
}

export async function deleteSchedule(tenantId: string, id: string): Promise<boolean> {
  const res = await withTx((client) =>
    client.query(`DELETE FROM pipeline.schedule WHERE id = $1 AND tenant_id = $2`, [id, tenantId]),
  );
  return (res.rowCount ?? 0) > 0;
}

/** Vista agenda: ogni voce con la prossima esecuzione calcolata (o `null`). */
export interface ScheduleView extends ScheduleRow {
  nextRunAt: Date | null;
}

export async function listScheduleWithNext(
  tenantId: string,
  opts: { status?: string; kind?: string; limit?: number } = {},
): Promise<ScheduleView[]> {
  const rows = await listSchedule(tenantId, opts);
  return rows.map((row) => ({ ...row, nextRunAt: nextRunAt(row) }));
}

/**
 * Prossima esecuzione di una voce: `run_at` se ancora nel futuro e voce
 * singola, altrimenti il prossimo scatto del cron. `null` per voci non attive
 * o senza riferimento temporale.
 */
export function nextRunAt(row: ScheduleRow, from: Date = new Date()): Date | null {
  if (row.status !== "scheduled") return null;
  if (row.cron) {
    try {
      return nextRunFor(row.cron, row.timezone, from);
    } catch (err) {
      if (err instanceof CronError) return null;
      throw err;
    }
  }
  if (row.run_at) {
    const t = new Date(row.run_at);
    return t.getTime() > from.getTime() ? t : null;
  }
  return null;
}

/** Valida una voce di agenda senza scrivere: usata dalle rotte per il 400. */
export function validateScheduleInput(input: {
  cron?: string | null;
  runAt?: Date | string | null;
  timezone?: string;
}): { ok: true } | { ok: false; message: string } {
  if (input.cron && !isValidCron(input.cron)) {
    return { ok: false, message: `espressione cron non valida: ${input.cron}` };
  }
  if (input.timezone && !isValidTimeZone(input.timezone)) {
    return { ok: false, message: `timezone non valida: ${input.timezone}` };
  }
  if (!input.cron && !input.runAt) {
    return { ok: false, message: "serve almeno un campo fra cron e run_at" };
  }
  return { ok: true };
}

// --- Roadmap / Opportunities -------------------------------------------------

export interface OpportunityRun {
  id: string;
  stage: string;
  title: string;
  status: string;
  opportunity: OpportunityStateMeta;
  approved_by: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Opportunita' del tenant = i run di pipeline, con lo stato pazi derivato.
 * Ordinate per priorita' d'azione (errore, in attesa di input, in corso, ...).
 */
export async function listOpportunities(
  tenantId: string,
  opts: { stage?: string; limit?: number } = {},
): Promise<OpportunityRun[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 300);
  const { rows } = await withTx((client) =>
    client.query<{
      id: string;
      stage: string;
      title: string;
      status: string;
      approved_by: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, stage, title, status, approved_by, created_at, updated_at
         FROM pipeline.pipeline_run
        WHERE tenant_id = $1 AND ($2::text IS NULL OR stage = $2)
        ORDER BY updated_at DESC
        LIMIT $3`,
      [tenantId, opts.stage ?? null, limit],
    ),
  );
  return rows.map((r) => ({
    ...r,
    opportunity: opportunityState(r.status as never),
  }));
}

// --- Business Pulse (overview) -----------------------------------------------

export interface PulseCounters {
  runs: { total: number; byStatus: Record<string, number>; open: number; awaitingInput: number };
  tasks: { total: number; running: number; failed: number; pending: number };
  assets: { total: number; inReview: number; approved: number; delivered: number };
  leads: { total: number; byStatus: Record<string, number>; new: number };
  schedule: { active: number; next: Date | null };
}

export interface BusinessPulse {
  tenantId: string;
  counters: PulseCounters;
  credits: { balance: number; reserved: number; available: number; quota: unknown };
  /** Prossime voci di agenda (con la prossima esecuzione calcolata). */
  upcoming: ScheduleView[];
  /** Opportunita' che richiedono un'azione umana (HITL). */
  attention: OpportunityRun[];
}

/** Riga contatore generica (`status`, `count`) dal DB. */
function toCountMap(rows: { status: string; count: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = Number(r.count);
  return out;
}

/**
 * Business Pulse: lo stato dell'azienda-cliente in un colpo d'occhio. Aggrega
 * conteggi reali da run, task, asset, lead e agenda, piu' il saldo crediti.
 * Un'unica lettura transazionale evita snapshot incoerenti fra le sezioni.
 */
export async function businessPulse(tenantId: string): Promise<BusinessPulse> {
  const counters = await withTx(async (client) => {
    const runsByStatus = await client.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) AS count FROM pipeline.pipeline_run
        WHERE tenant_id = $1 GROUP BY status`,
      [tenantId],
    );
    const runTotals = await client.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM pipeline.pipeline_run WHERE tenant_id = $1`,
      [tenantId],
    );
    const tasks = await client.query<{ status: string; count: string }>(
      `SELECT t.status, COUNT(*) AS count
         FROM pipeline.agent_task t
         JOIN pipeline.pipeline_run r ON r.id = t.run_id
        WHERE r.tenant_id = $1 GROUP BY t.status`,
      [tenantId],
    );
    const assets = await client.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) AS count FROM pipeline.asset
        WHERE tenant_id = $1 GROUP BY status`,
      [tenantId],
    );
    const leads = await client.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) AS count FROM pipeline.lead
        WHERE tenant_id = $1 GROUP BY status`,
      [tenantId],
    );
    const schedule = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM pipeline.schedule
        WHERE tenant_id = $1 AND status = 'scheduled'`,
      [tenantId],
    );

    const runsMap = toCountMap(runsByStatus.rows);
    const tasksMap = toCountMap(tasks.rows);
    const assetsMap = toCountMap(assets.rows);
    const leadsMap = toCountMap(leads.rows);

    const runTotal = Number(runTotals.rows[0]?.total ?? 0);
    return {
      runs: {
        total: runTotal,
        byStatus: runsMap,
        open: (runsMap.draft ?? 0) + (runsMap.in_progress ?? 0),
        awaitingInput: runsMap.in_review ?? 0,
      },
      tasks: {
        total: Object.values(tasksMap).reduce((a, b) => a + b, 0),
        running: tasksMap.running ?? 0,
        failed: tasksMap.failed ?? 0,
        pending: tasksMap.pending ?? 0,
      },
      assets: {
        total: Object.values(assetsMap).reduce((a, b) => a + b, 0),
        inReview: assetsMap.in_review ?? 0,
        approved: assetsMap.approved ?? 0,
        delivered: assetsMap.delivered ?? 0,
      },
      leads: {
        total: Object.values(leadsMap).reduce((a, b) => a + b, 0),
        byStatus: leadsMap,
        new: leadsMap.new ?? 0,
      },
      schedule: { active: Number(schedule.rows[0]?.count ?? 0), next: null as Date | null },
    } satisfies PulseCounters;
  });

  const [upcoming, opportunities, credits] = await Promise.all([
    listScheduleWithNext(tenantId, { status: "scheduled", limit: 10 }),
    listOpportunities(tenantId, { limit: 100 }),
    balanceSnapshot(tenantId),
  ]);

  const firstUpcoming = upcoming
    .map((u) => u.nextRunAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  counters.schedule.next = firstUpcoming;

  const attention = opportunities
    .filter((o) => o.opportunity.needsHuman || o.opportunity.state === "error")
    .slice(0, 10);

  return { tenantId, counters, credits, upcoming, attention };
}

// --- Roster ------------------------------------------------------------------

export interface RosterEntry extends DroidProfile {
  /** Task totali assegnati al droid nel tenant (tutti gli stati). */
  tasks: number;
  /** Task attualmente in esecuzione. */
  running: number;
  /** Task conclusi con successo. */
  done: number;
  /** Task falliti. */
  failed: number;
  /** Ultimo task assegnato (per ordinare il roster per attivita'). */
  lastTaskAt: Date | null;
}

/**
 * Roster degli specialisti con il carico REALE del tenant: quante unita' di
 * lavoro ogni droid ha ricevuto e in che stato sono. E' l'"Agent Profile" del
 * modello pazi, alimentato dai task di pipeline realmente assegnati.
 */
export async function droidRoster(tenantId: string): Promise<RosterEntry[]> {
  const { rows } = await withTx((client) =>
    client.query<{
      droid: string;
      total: string;
      running: string;
      done: string;
      failed: string;
      last_at: Date | null;
    }>(
      `SELECT t.droid,
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE t.status = 'running') AS running,
              COUNT(*) FILTER (WHERE t.status = 'done') AS done,
              COUNT(*) FILTER (WHERE t.status = 'failed') AS failed,
              MAX(COALESCE(t.finished_at, t.started_at)) AS last_at
         FROM pipeline.agent_task t
         JOIN pipeline.pipeline_run r ON r.id = t.run_id
        WHERE r.tenant_id = $1
        GROUP BY t.droid`,
      [tenantId],
    ),
  );

  const byDroid = new Map(rows.map((r) => [r.droid, r]));
  return DROIDS.map((d) => {
    const stats = byDroid.get(d.id);
    return {
      ...d,
      tasks: Number(stats?.total ?? 0),
      running: Number(stats?.running ?? 0),
      done: Number(stats?.done ?? 0),
      failed: Number(stats?.failed ?? 0),
      lastTaskAt: stats?.last_at ?? null,
    };
  });
}

/** Scheda singola di uno specialista, con il carico del tenant. */
export async function droidDetail(tenantId: string, droidId: string): Promise<RosterEntry | null> {
  const profile = droidProfile(droidId);
  if (!profile) return null;
  const roster = await droidRoster(tenantId);
  return roster.find((r) => r.id === droidId) ?? null;
}

/** Conteggio task per droid di un run specifico (vista "chi ha lavorato qui"). */
export async function runDroidSummary(
  tenantId: string,
  runId: string,
): Promise<{ droid: string; tasks: number; done: number; failed: number }[]> {
  const { rows } = await withTx((client) =>
    client.query<{ droid: string; tasks: string; done: string; failed: string }>(
      `SELECT t.droid,
              COUNT(*) AS tasks,
              COUNT(*) FILTER (WHERE t.status = 'done') AS done,
              COUNT(*) FILTER (WHERE t.status = 'failed') AS failed
         FROM pipeline.agent_task t
         JOIN pipeline.pipeline_run r ON r.id = t.run_id
        WHERE t.run_id = $1 AND r.tenant_id = $2
        GROUP BY t.droid`,
      [runId, tenantId],
    ),
  );
  return rows.map((r) => ({
    droid: r.droid,
    tasks: Number(r.tasks),
    done: Number(r.done),
    failed: Number(r.failed),
  }));
}

export { parseCron };

// --- Kanban Opportunita ------------------------------------------------------

export interface KanbanColumn {
  bucket: OpportunityBucket;
  label: string;
  count: number;
  runs: OpportunityRun[];
}

export interface KanbanBoard {
  columns: KanbanColumn[];
  total: number;
}

/** Board Kanban: raggruppa le opportunita' per bucket (running/ahead/done). */
export async function kanbanBoard(
  tenantId: string,
  opts: { stage?: string; limit?: number } = {},
): Promise<KanbanBoard> {
  const opportunities = await listOpportunities(tenantId, opts);
  const byBucket = new Map<OpportunityBucket, OpportunityRun[]>();
  for (const o of opportunities) {
    const bucket = opportunityBucket(o.status as never);
    const arr = byBucket.get(bucket) ?? [];
    arr.push(o);
    byBucket.set(bucket, arr);
  }
  const columns: KanbanColumn[] = OPPORTUNITY_BUCKETS.map((bucket) => ({
    bucket,
    label: OPPORTUNITY_BUCKET_LABELS[bucket],
    count: byBucket.get(bucket)?.length ?? 0,
    runs: byBucket.get(bucket) ?? [],
  }));
  return { columns, total: opportunities.length };
}

// --- Libreria (Library) ------------------------------------------------------

export interface LibraryResource {
  id: string;
  kind: string;
  name: string;
  status: string;
  storage_key: string;
  mime: string | null;
  version: number;
  created_at: Date;
  run_id: string | null;
}

export interface LibraryAgent {
  id: string;
  name: string;
  role: string;
  department: string;
  tagline: string;
  skills: string[];
  stages: string[];
  tasks: number;
  running: number;
  done: number;
  failed: number;
}

export interface LibraryMessage {
  id: string;
  conversation_id: string;
  role: string;
  droid: string;
  content: string;
  credits: number;
  created_at: Date;
}

export interface LibraryInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: Date;
}

export interface LibraryData {
  risorse: LibraryResource[];
  agenti: LibraryAgent[];
  messaggi: LibraryMessage[];
  inviti: LibraryInvite[];
}

/** Dati della Libreria (pazi.ai "Libreria": Risorse / Agenti AI / Messaggi / Inviti). */
export async function libraryData(tenantId: string): Promise<LibraryData> {
  // Risorse = asset di pipeline (deliverable generati)
  const assets = await withTx((client) =>
    client.query<LibraryResource>(
      `SELECT id, kind, name, status, storage_key, mime, version, run_id, created_at
         FROM pipeline.asset
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 200`,
      [tenantId],
    ),
  );

  // Agenti AI su misura = roster con carico reale (già in droidRoster)
  const roster = await droidRoster(tenantId);
  const agenti: LibraryAgent[] = roster.map((d) => ({
    id: d.id,
    name: d.name,
    role: d.role,
    department: d.department,
    tagline: d.tagline,
    skills: d.skills,
    stages: d.stages,
    tasks: d.tasks,
    running: d.running,
    done: d.done,
    failed: d.failed,
  }));

  // Messaggi = ultimi messaggi delle conversazioni del tenant
  const messages = await withTx((client) =>
    client.query<LibraryMessage>(
      `SELECT m.id, m.conversation_id, m.role, m.droid, m.content, m.credits, m.created_at
         FROM business.message m
         JOIN business.conversation c ON c.id = m.conversation_id
        WHERE c.tenant_id = $1
        ORDER BY m.created_at DESC
        LIMIT 100`,
      [tenantId],
    ),
  );

  // Inviti = utenti del tenant (metering.tenant_user) - al momento non c'è tabella inviti dedicata
  // Usiamo tenant_user come proxy per "inviti" (membri del team)
  const inviti = await withTx((client) =>
    client.query<LibraryInvite>(
      `SELECT id, email, role, 'active' AS status, created_at
         FROM metering.tenant_user
        WHERE tenant_id = $1
        ORDER BY created_at DESC`,
      [tenantId],
    ),
  );

  return {
    risorse: assets.rows,
    agenti,
    messaggi: messages.rows,
    inviti: inviti.rows,
  };
}

// --- Account / Abbonamento ---------------------------------------------------

export interface AccountSummary {
  tenantId: string;
  tenantName: string;
  plan: string;
  balance: number;
  reserved: number;
  available: number;
  quota: QuotaState | null;
  markupBps: number;
  creditUnit: number;
  hardStopOnEmpty: boolean;
  billingCustomerRef: string | null;
}

export async function accountSummary(tenantId: string): Promise<AccountSummary> {
  const [tenant, credits, quota] = await Promise.all([
    tenantById(tenantId),
    balanceSnapshot(tenantId),
    quotaState(tenantId),
  ]);
  if (!tenant) throw new Error("Tenant non trovato");
  return {
    tenantId: tenant.tenantId,
    tenantName: tenant.tenantName,
    plan: tenant.plan,
    balance: credits.balance,
    reserved: credits.reserved,
    available: credits.available,
    quota,
    markupBps: tenant.markupBps,
    creditUnit: tenant.creditUnit,
    hardStopOnEmpty: tenant.hardStopOnEmpty,
    billingCustomerRef: null, // TODO: join with tenant table when billing_customer_ref is added
  };
}

// --- Business Pulse arricchito (overview) ------------------------------------

export interface AreaTile {
  id: string;
  title: string;
  description: string;
  icon: string;
  count: number;
  route: string;
  state: "active" | "empty" | "attention";
}

/** Tiles "Aree dell'attività" per la home Pulse (pazi.ai parity). */
export function areaTiles(counters: PulseCounters): AreaTile[] {
  return [
    {
      id: "library",
      title: "Libreria",
      description: "Risorse, agenti, messaggi, inviti",
      icon: "folder-open",
      count: counters.assets.total,
      route: "/library",
      state: counters.assets.total > 0 ? "active" : "empty",
    },
    {
      id: "outreach",
      title: "Outreach",
      description: "Posta in arrivo e lead",
      icon: "mail",
      count: counters.leads.new,
      route: "/outreach",
      state: counters.leads.new > 0 ? "attention" : "empty",
    },
    {
      id: "website",
      title: "Sito web",
      description: "Pagine, deploy, form lead",
      icon: "globe",
      count: counters.runs.byStatus.in_progress ?? 0,
      route: "/website",
      state: (counters.runs.byStatus.in_progress ?? 0) > 0 ? "active" : "empty",
    },
    {
      id: "social",
      title: "Social media",
      description: "Calendario, asset, pubblicazione",
      icon: "share-2",
      count: counters.schedule.active,
      route: "/social-media",
      state: counters.schedule.active > 0 ? "active" : "empty",
    },
    {
      id: "analytics",
      title: "Analisi",
      description: "Metriche, report, keyword",
      icon: "bar-chart-2",
      count: counters.tasks.total,
      route: "/analytics",
      state: counters.tasks.total > 0 ? "active" : "empty",
    },
    {
      id: "opportunities",
      title: "Opportunità",
      description: "Run in corso, da approvare, completati",
      icon: "target",
      count: counters.runs.open + counters.runs.awaitingInput,
      route: "/opportunities",
      state: counters.runs.awaitingInput > 0 ? "attention" : "active",
    },
  ];
}
