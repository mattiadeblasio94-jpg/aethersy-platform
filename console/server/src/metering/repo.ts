import crypto from "node:crypto";
import type pg from "pg";
import { computePrice, type Capability, type Unit, type PriceBreakdown } from "./price.js";
import { withTx } from "./db.js";
import { patternScore } from "./pattern.js";
import { config } from "../config.js";

/**
 * `metering.usage_event.request_id` e' di tipo `uuid`, ma gli orchestratori
 * producono idempotenti di forma testuale (es. `chat:<conv>:<rand>`,
 * `task:<id>:<rand>`). Qui li normalizziamo a UUID con un hash deterministico:
 * lo stesso id testuale mappa sempre allo stesso UUID, cosi' il vincolo unico
 * `(request_id, attempt_no)` continua a deduplicare i retry. Gli id gia' in
 * forma UUID passano invariati.
 */
function toRequestUuid(requestId: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return requestId;
  }
  const h = crypto.createHash("sha256").update(requestId).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// =============================================================================
// Repository del metering: risoluzione tenant/prezzi e movimenti sui crediti.
//
// Garanzie:
//   - Append-only sul ledger di consumo (nessun UPDATE/DELETE su usage_event).
//   - Idempotenza su (request_id, attempt_no): un retry dopo timeout non
//     raddoppia l'addebito.
//   - Saldo clampato a zero (CHECK in DDL): l'eccedenza non addebitabile finisce
//     in `credit_ledger(kind='adjust', reason='unbilled_overflow:...')`.
//   - Fail-closed: se il DB non risponde, l'errore risale e la richiesta viene
//     rifiutata (non si regala consumo).
//
// Convenzione `credit_ledger.delta_credits`: variazione dei crediti
// **disponibili** (balance - reserved) causata dal movimento.
//   topup   +N            reserve  -stima
//   release +stima        settle   +(stima - addebitato)
//   adjust   0            (solo audit; l'importo sta nel `reason`)
// =============================================================================

export interface TenantContext {
  tenantId: string;
  tenantName: string;
  plan: string;
  markupBps: number;
  creditUnit: number;
  hardStopOnEmpty: boolean;
  apiKeyId: string | null;
  sourceTag: string;
  email: string | null;
}

interface TenantRow {
  id: string;
  name: string;
  plan: string;
  markup_bps: number;
  credit_unit: string;
  hard_stop_on_empty: boolean;
}

function toTenantContext(
  row: TenantRow,
  apiKeyId: string | null,
  sourceTag: string,
  email: string | null,
): TenantContext {
  return {
    tenantId: row.id,
    tenantName: row.name,
    plan: row.plan,
    markupBps: Number(row.markup_bps),
    creditUnit: Number(row.credit_unit),
    hardStopOnEmpty: row.hard_stop_on_empty,
    apiKeyId,
    sourceTag,
    email,
  };
}

/** sha256 esadecimale della chiave API in chiaro (mai salvata sul DB). */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Vero se il tenant e' amministrativo: il consumo viene registrato (cosi' il
 * pannello di controllo mostra il costo reale dei provider) ma non viene
 * addebitato all'utente. Due criteri, in ordine:
 *   1. `plan = 'admin'` sul tenant (impostazione esplicita nel DB);
 *   2. l'email del tenant e' in `ADMIN_EMAILS`.
 * Nessun valore di default: senza configurazione non c'e' esenzione.
 */
export function tenantIsAdmin(tenant: TenantContext): boolean {
  if (tenant.plan === "admin") return true;
  if (!tenant.email) return false;
  return config.adminEmails.includes(tenant.email.toLowerCase());
}

/** Risolve il tenant da una chiave API (console / worker / mcp / integration). */
export async function tenantFromApiKey(rawKey: string): Promise<TenantContext | null> {
  const { rows } = await withTx((client) =>
    client.query<TenantRow & { api_key_id: string; source_tag: string }>(
      `SELECT t.id, t.name, t.plan, t.markup_bps, t.credit_unit, t.hard_stop_on_empty,
              k.id AS api_key_id, k.source_tag
         FROM metering.api_key k
         JOIN metering.tenant t ON t.id = k.tenant_id
        WHERE k.key_hash = $1 AND k.revoked_at IS NULL`,
      [hashApiKey(rawKey)],
    ),
  );
  const row = rows[0];
  if (!row) return null;
  return toTenantContext(row, row.api_key_id, row.source_tag, null);
}

/**
 * Risolve il tenant dal suo id. Usato dai percorsi interni (orchestratore di
 * pipeline, cron di metering non-AI) che non hanno una richiesta HTTP da cui
 * derivare l'identita'.
 */
export async function tenantById(tenantId: string): Promise<TenantContext | null> {
  const { rows } = await withTx((client) =>
    client.query<TenantRow>(
      `SELECT id, name, plan, markup_bps, credit_unit, hard_stop_on_empty
         FROM metering.tenant WHERE id = $1`,
      [tenantId],
    ),
  );
  const row = rows[0];
  if (!row) return null;
  return toTenantContext(row, null, "pipeline", null);
}

/** Risolve il tenant dall'email dell'utente (sessione cookie). */
export async function tenantFromEmail(email: string): Promise<TenantContext | null> {
  const { rows } = await withTx((client) =>
    client.query<TenantRow>(
      `SELECT t.id, t.name, t.plan, t.markup_bps, t.credit_unit, t.hard_stop_on_empty
         FROM metering.tenant_user u
         JOIN metering.tenant t ON t.id = u.tenant_id
        WHERE lower(u.email) = lower($1)`,
      [email],
    ),
  );
  const row = rows[0];
  if (!row) return null;
  return toTenantContext(row, null, "console", email);
}

/**
 * Provisioning automatico al primo accesso della Console: crea tenant personale
 * + utente + conto credito (con eventuale grant iniziale da
 * `METERING_SIGNUP_CREDITS`, default 0). Idempotente.
 */
export async function ensureTenantForEmail(
  email: string,
  opts: { initialCredits?: number; name?: string; plan?: string } = {},
): Promise<TenantContext> {
  const existing = await tenantFromEmail(email);
  if (existing) return existing;

  const credits = Math.max(0, opts.initialCredits ?? 0);
  await withTx(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO metering.tenant (name, plan) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING id`,
      [opts.name ?? email, opts.plan ?? "free"],
    );
    let tenantId = rows[0]?.id;
    if (!tenantId) {
      const found = await client.query<{ id: string }>(
        `SELECT t.id FROM metering.tenant t
           JOIN metering.tenant_user u ON u.tenant_id = t.id
          WHERE lower(u.email) = lower($1)`,
        [email],
      );
      tenantId = found.rows[0]?.id;
    }
    if (!tenantId) throw new Error("provisioning tenant fallito");

    await client.query(
      `INSERT INTO metering.tenant_user (tenant_id, email, role) VALUES ($1, $2, 'owner')
       ON CONFLICT (email) DO NOTHING`,
      [tenantId, email],
    );
    await client.query(
      `INSERT INTO metering.credit_account (tenant_id, balance_credits)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [tenantId, credits],
    );
    if (credits > 0) {
      await client.query(
        `INSERT INTO metering.credit_ledger (tenant_id, kind, delta_credits, reason)
         VALUES ($1, 'topup', $2, 'signup grant')`,
        [tenantId, credits],
      );
    }
  });

  const created = await tenantFromEmail(email);
  if (!created) throw new Error("provisioning tenant fallito (lettura)");
  return created;
}

// --- Matching dei pattern di modello -----------------------------------------

export { patternScore };

// --- Prezzi ------------------------------------------------------------------

export interface PriceLine {
  unit: Unit;
  unitPriceUsd: number;
  markupBps: number;
  minCredits: number;
  modelPattern: string;
  provider: string;
  /** Origine del markup applicato (per audit/debug). */
  markupSource: "override" | "entry" | "tenant" | "book";
}

export interface PriceResolution {
  lines: PriceLine[];
  fxUsdEur: number;
  priceBookVersion: number | null;
}

interface EntryRow {
  unit: Unit;
  unit_price: string;
  markup_bps: number | null;
  min_credits: number;
  model_pattern: string;
  provider: string;
  default_markup_bps: number;
  fx_usd_eur: string;
  version: number;
}

/**
 * Risolve le righe di prezzo per (capability, modello, provider).
 * Precedenza markup: override tenant > entry > tenant > default del price book.
 */
export async function resolvePrices(
  client: pg.PoolClient,
  ctx: Pick<TenantContext, "tenantId" | "markupBps">,
  q: { capability: Capability; model: string; provider: string; units: Unit[] },
): Promise<PriceResolution> {
  const { rows } = await client.query<EntryRow>(
    `SELECT pbe.unit, pbe.unit_price, pbe.markup_bps, pbe.min_credits,
            pbe.model_pattern, pbe.provider,
            pb.default_markup_bps, pb.fx_usd_eur, pb.version
       FROM metering.price_book pb
       JOIN metering.price_book_entry pbe ON pbe.price_book_id = pb.id
      WHERE pb.effective_to IS NULL
        AND pbe.capability = $1
        AND pbe.provider = ANY($2)
        AND pbe.unit = ANY($3)`,
    [q.capability, ["*", q.provider], q.units],
  );
  if (!rows.length) return { lines: [], fxUsdEur: 0.92, priceBookVersion: null };

  const overrides = await client.query<{ model_pattern: string; markup_bps: number }>(
    `SELECT model_pattern, markup_bps
       FROM metering.tenant_price_override
      WHERE tenant_id = $1 AND capability = $2`,
    [ctx.tenantId, q.capability],
  );

  // Per ogni unita' scegli la riga piu' specifica.
  const best = new Map<Unit, { row: EntryRow; score: number }>();
  for (const row of rows) {
    const score = patternScore(row.model_pattern, q.model);
    if (score === null) continue;
    const current = best.get(row.unit);
    if (!current || score > current.score) best.set(row.unit, { row, score });
  }

  const lines: PriceLine[] = [];
  for (const [unit, { row }] of best) {
    const override = pickOverride(overrides.rows, q.model);
    let markupBps: number;
    let markupSource: PriceLine["markupSource"];
    if (override !== null) {
      markupBps = override;
      markupSource = "override";
    } else if (row.markup_bps !== null) {
      markupBps = Number(row.markup_bps);
      markupSource = "entry";
    } else if (ctx.markupBps !== null) {
      markupBps = ctx.markupBps;
      markupSource = "tenant";
    } else {
      markupBps = Number(row.default_markup_bps);
      markupSource = "book";
    }
    lines.push({
      unit,
      unitPriceUsd: Number(row.unit_price),
      markupBps,
      minCredits: Number(row.min_credits),
      modelPattern: row.model_pattern,
      provider: row.provider,
      markupSource,
    });
  }

  const first = rows[0];
  return {
    lines,
    fxUsdEur: Number(first.fx_usd_eur),
    priceBookVersion: Number(first.version),
  };
}

function pickOverride(
  rows: { model_pattern: string; markup_bps: number }[],
  model: string,
): number | null {
  let bestScore = -1;
  let value: number | null = null;
  for (const row of rows) {
    const score = patternScore(row.model_pattern, model);
    if (score !== null && score > bestScore) {
      bestScore = score;
      value = Number(row.markup_bps);
    }
  }
  return value;
}

// --- Calcolo dei crediti -----------------------------------------------------

export interface UsageBreakdown {
  credits: number;
  priceEur: number;
  providerCostUsd: number;
  parts: PriceBreakdown[];
}

/**
 * Prezzo totale di una richiesta: somma il prezzo di ogni unita' coinvolta
 * (es. text = token_in + token_out). Il minimo di credito si applica una sola
 * volta per richiesta, non per unita'.
 */
export function priceRequest(
  resolution: PriceResolution,
  ctx: Pick<TenantContext, "creditUnit">,
  unitsByUnit: Partial<Record<Unit, number>>,
): UsageBreakdown {
  const parts: PriceBreakdown[] = [];
  let credits = 0;
  let minCredits = 0;
  for (const line of resolution.lines) {
    const units = unitsByUnit[line.unit] ?? 0;
    const bd = computePrice({
      capability: "text" as Capability,
      unit: line.unit,
      units,
      unitPriceUsd: line.unitPriceUsd,
      fxUsdEur: resolution.fxUsdEur,
      markupBps: line.markupBps,
      creditUnit: ctx.creditUnit,
      minCredits: 0,
    });
    parts.push(bd);
    credits += bd.credits;
    minCredits = Math.max(minCredits, line.minCredits);
  }
  const priceEur = parts.reduce((s, p) => s + p.priceEur, 0);
  const providerCostUsd = parts.reduce((s, p) => s + p.providerCostUsd, 0);
  // Il minimo di crediti (es. 1 credito per i modelli gratuiti) si applica
  // quando il provider E' prezzato: un modello free costa 0 USD ma deve
  // comunque coprire l'infrastruttura. Senza righe di prezzo (provider non
  // prezzato) non si addebita nulla: il costo resta al fornitore.
  if (resolution.lines.length > 0) credits = Math.max(credits, minCredits);
  if (credits > 0) credits = Math.max(credits, 1);
  return { credits, priceEur, providerCostUsd, parts };
}

// --- Saldi -------------------------------------------------------------------

export interface ReserveResult {
  ok: boolean;
  available: number;
  reserved: number;
}

export async function ensureAccount(client: pg.PoolClient, tenantId: string): Promise<void> {
  await client.query(
    `INSERT INTO metering.credit_account (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [tenantId],
  );
}

export async function availableCredits(tenantId: string): Promise<number> {
  return withTx(async (client) => {
    await ensureAccount(client, tenantId);
    const { rows } = await client.query<{ available: string }>(
      `SELECT balance_credits - reserved_credits AS available
         FROM metering.credit_account WHERE tenant_id = $1`,
      [tenantId],
    );
    return Number(rows[0]?.available ?? 0);
  });
}

/**
 * Prenota credito in modo atomico. La prenotazione non supera mai il
 * disponibile: se la stima eccede, viene ridotta al disponibile (la richiesta
 * resta possibile e il settle addebita il reale).
 */
export async function reserveCredits(
  tenantId: string,
  requestId: string,
  estimate: number,
): Promise<ReserveResult> {
  return withTx(async (client) => {
    await ensureAccount(client, tenantId);
    if (estimate <= 0) {
      const { rows } = await client.query<{ available: string }>(
        `SELECT balance_credits - reserved_credits AS available
           FROM metering.credit_account WHERE tenant_id = $1`,
        [tenantId],
      );
      return { ok: true, available: Number(rows[0]?.available ?? 0), reserved: 0 };
    }
    const { rows } = await client.query<{ available: string; reserved_credits: string }>(
      `UPDATE metering.credit_account
          SET reserved_credits = reserved_credits + $2, updated_at = now()
        WHERE tenant_id = $1 AND balance_credits - reserved_credits >= $2
        RETURNING balance_credits - reserved_credits AS available, reserved_credits`,
      [tenantId, estimate],
    );
    if (!rows.length) {
      const cur = await client.query<{ available: string }>(
        `SELECT balance_credits - reserved_credits AS available
           FROM metering.credit_account WHERE tenant_id = $1`,
        [tenantId],
      );
      return { ok: false, available: Number(cur.rows[0]?.available ?? 0), reserved: 0 };
    }
    await client.query(
      `INSERT INTO metering.credit_ledger (tenant_id, kind, delta_credits, reason, provider_ref)
       VALUES ($1, 'reserve', $2, $3, $4)`,
      [tenantId, -estimate, "request reserve", requestId],
    );
    return {
      ok: true,
      available: Number(rows[0].available),
      reserved: Number(rows[0].reserved_credits),
    };
  });
}

/** Rilascia una prenotazione senza addebitare (richiesta fallita). */
export async function releaseReservation(
  tenantId: string,
  requestId: string,
  reservation: number,
  reason: string,
): Promise<void> {
  if (reservation <= 0) return;
  await withTx(async (client) => {
    await ensureAccount(client, tenantId);
    await client.query(
      `UPDATE metering.credit_account
          SET reserved_credits = GREATEST(reserved_credits - $2, 0), updated_at = now()
        WHERE tenant_id = $1`,
      [tenantId, reservation],
    );
    await client.query(
      `INSERT INTO metering.credit_ledger (tenant_id, kind, delta_credits, reason, provider_ref)
       VALUES ($1, 'release', $2, $3, $4)`,
      [tenantId, reservation, reason, requestId],
    );
  });
}

/** Accredito manuale/pagamento (top-up). Usato anche dal webhook di pagamento. */
export async function topupCredits(
  tenantId: string,
  credits: number,
  reason: string,
  providerRef?: string,
): Promise<number> {
  if (credits <= 0) throw new Error("credits deve essere > 0");
  return withTx(async (client) => {
    await ensureAccount(client, tenantId);
    const { rows } = await client.query<{ balance_credits: string }>(
      `UPDATE metering.credit_account
          SET balance_credits = balance_credits + $2, updated_at = now()
        WHERE tenant_id = $1
        RETURNING balance_credits`,
      [tenantId, credits],
    );
    await client.query(
      `INSERT INTO metering.credit_ledger (tenant_id, kind, delta_credits, reason, provider_ref)
       VALUES ($1, 'topup', $2, $3, $4)`,
      [tenantId, credits, reason, providerRef ?? null],
    );
    return Number(rows[0]?.balance_credits ?? 0);
  });
}

// --- Consumo (settle) --------------------------------------------------------

export interface UsageEventInput {
  tenantId: string;
  apiKeyId: string | null;
  requestId: string;
  attemptNo: number;
  flowRunId: string | null;
  capability: string;
  provider: string;
  model: string;
  unit: string;
  billableUnits: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
  providerCostUsd: number;
  providerFeeUsd?: number;
  priceEur: number;
  markupBps: number;
  credits: number;
  status?: string;
  latencyMs?: number | null;
  source?: string;
  /** Email dell'utente che ha generato la richiesta (sessione console). */
  userEmail?: string | null;
}

export interface SettleResult {
  credits: number;
  charged: number;
  overflow: number;
  balance: number;
  available: number;
  duplicate: boolean;
}

/** Scrive la riga di consumo e salda la prenotazione DENTRO una transazione. */
async function settleUsageTx(
  client: pg.PoolClient,
  u: UsageEventInput,
  reservation: number,
): Promise<SettleResult> {
  await ensureAccount(client, u.tenantId);

  const ins = await client.query<{ id: string }>(
    `INSERT INTO metering.usage_event (
       tenant_id, api_key_id, request_id, attempt_no, flow_run_id,
       capability, provider, model, unit, billable_units,
       input_tokens, output_tokens, cached_tokens,
       provider_cost_usd, provider_fee_usd, price_eur, markup_bps, credits,
       status, latency_ms, source, user_email
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
     )
     ON CONFLICT (request_id, attempt_no) DO NOTHING
     RETURNING id`,
    [
      u.tenantId, u.apiKeyId, toRequestUuid(u.requestId), u.attemptNo, u.flowRunId,
      u.capability, u.provider, u.model, u.unit, u.billableUnits,
      u.inputTokens ?? null, u.outputTokens ?? null, u.cachedTokens ?? null,
      u.providerCostUsd, u.providerFeeUsd ?? 0, u.priceEur, u.markupBps, u.credits,
      u.status ?? "success", u.latencyMs ?? null, u.source ?? "console", u.userEmail ?? null,
    ],
  );

  const cur = await client.query<{ balance_credits: string; reserved_credits: string }>(
    `SELECT balance_credits, reserved_credits
       FROM metering.credit_account WHERE tenant_id = $1 FOR UPDATE`,
    [u.tenantId],
  );
  const balance = Number(cur.rows[0]?.balance_credits ?? 0);
  const reserved = Number(cur.rows[0]?.reserved_credits ?? 0);

  if (!ins.rows.length) {
    // Duplicato: la prenotazione di questo tentativo va solo rilasciata.
    const newReserved = Math.max(reserved - reservation, 0);
    await client.query(
      `UPDATE metering.credit_account
          SET reserved_credits = $2, updated_at = now() WHERE tenant_id = $1`,
      [u.tenantId, newReserved],
    );
    return {
      credits: u.credits,
      charged: 0,
      overflow: 0,
      balance,
      available: balance - newReserved,
      duplicate: true,
    };
  }

  const charged = Math.min(u.credits, balance);
  const overflow = Math.max(u.credits - charged, 0);
  const newBalance = balance - charged;
  const newReserved = Math.max(reserved - reservation, 0);

  await client.query(
    `UPDATE metering.credit_account
        SET balance_credits = $2, reserved_credits = $3, updated_at = now()
      WHERE tenant_id = $1`,
    [u.tenantId, newBalance, newReserved],
  );
  await client.query(
    `INSERT INTO metering.credit_ledger
       (tenant_id, kind, delta_credits, reason, usage_event_id, provider_ref)
     VALUES ($1, 'settle', $2, $3, $4, $5)`,
    [
      u.tenantId,
      reservation - charged,
      `settle ${u.capability}/${u.model}`,
      ins.rows[0].id,
      u.requestId,
    ],
  );
  if (overflow > 0) {
    await client.query(
      `INSERT INTO metering.credit_ledger
         (tenant_id, kind, delta_credits, reason, usage_event_id)
       VALUES ($1, 'adjust', 0, $2, $3)`,
      [u.tenantId, `unbilled_overflow:${overflow}`, ins.rows[0].id],
    );
  }

  return {
    credits: u.credits,
    charged,
    overflow,
    balance: newBalance,
    available: newBalance - newReserved,
    duplicate: false,
  };
}

/** Registra il consumo e salda la prenotazione (transazione dedicata). */
export async function settleUsage(
  input: UsageEventInput,
  reservation: number,
): Promise<SettleResult> {
  return withTx((client) => settleUsageTx(client, input, reservation));
}

export interface RecordUsageInput {
  tenant: TenantContext;
  requestId: string;
  reservation: number;
  flowRunId?: string | null;
  capability: Capability;
  provider: string;
  model: string;
  /** Quantita' fatturate per unita' (es. { token_in: 1200, token_out: 800 }). */
  units: Partial<Record<Unit, number>>;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
  latencyMs?: number | null;
  status?: string;
  source?: string;
}

export interface RecordUsageResult extends SettleResult {
  priceEur: number;
  providerCostUsd: number;
  markupBps: number;
  priceBookVersion: number | null;
}

/**
 * Percorso completo di consumo: risolve il prezzo dal price book, calcola i
 * crediti, scrive `usage_event` e salda la prenotazione in UNA transazione.
 */
export async function recordUsage(input: RecordUsageInput): Promise<RecordUsageResult> {
  return withTx(async (client) => {
    const resolution = await resolvePrices(client, input.tenant, {
      capability: input.capability,
      model: input.model,
      provider: input.provider,
      units: Object.keys(input.units) as Unit[],
    });
    const breakdown = priceRequest(resolution, input.tenant, input.units);
    const markupBps = resolution.lines[0]?.markupBps ?? input.tenant.markupBps;
    const billableUnits = Object.values(input.units).reduce((s, n) => (s + (n ?? 0)), 0);
    const unit = (Object.keys(input.units)[0] ?? "request") as string;
    // Esenzione admin: il costo provider resta registrato (visibile nel
    // pannello di controllo) ma i crediti addebitati all'utente sono zero.
    const adminExempt = tenantIsAdmin(input.tenant);
    const credits = adminExempt ? 0 : breakdown.credits;

    const settled = await settleUsageTx(
      client,
      {
        tenantId: input.tenant.tenantId,
        apiKeyId: input.tenant.apiKeyId,
        requestId: input.requestId,
        attemptNo: 1,
        flowRunId: input.flowRunId ?? null,
        capability: input.capability,
        provider: input.provider,
        model: input.model,
        unit,
        billableUnits,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        cachedTokens: input.cachedTokens ?? null,
        providerCostUsd: breakdown.providerCostUsd,
        priceEur: breakdown.priceEur,
        markupBps,
        credits,
        status: input.status ?? "success",
        latencyMs: input.latencyMs ?? null,
        source: input.source ?? input.tenant.sourceTag,
        userEmail: input.tenant.email ?? null,
      },
      input.reservation,
    );

    return {
      ...settled,
      priceEur: breakdown.priceEur,
      providerCostUsd: breakdown.providerCostUsd,
      markupBps,
      priceBookVersion: resolution.priceBookVersion,
    };
  });
}

/** Stima di credito per la prenotazione (prima della chiamata al provider). */
export async function estimateCredits(
  tenant: TenantContext,
  q: { capability: Capability; model: string; provider: string; units: Unit[]; counts: Partial<Record<Unit, number>> },
): Promise<number> {
  return withTx(async (client) => {
    const resolution = await resolvePrices(client, tenant, q);
    if (!resolution.lines.length) return 1;
    return priceRequest(resolution, tenant, q.counts).credits;
  });
}

// --- Quota -------------------------------------------------------------------

export interface QuotaState {
  limitCredits: number;
  window: "day" | "month";
  softPct: number;
  consumed: number;
}

export async function quotaState(tenantId: string): Promise<QuotaState | null> {
  return withTx(async (client) => {
    const { rows } = await client.query<{
      limit_credits: string;
      window: string;
      soft_pct: number;
    }>(
      // La colonna e' `quota_window` perche' `window` e' keyword riservata (PG14).
      `SELECT limit_credits, quota_window AS window, soft_pct
         FROM metering.quota WHERE tenant_id = $1`,
      [tenantId],
    );
    const q = rows[0];
    if (!q) return null;
    const consumed = await client.query<{ total: string }>(
      q.window === "day"
        ? `SELECT COALESCE(SUM(credits),0) AS total FROM metering.usage_event
             WHERE tenant_id = $1 AND created_at >= date_trunc('day', now())`
        : `SELECT COALESCE(SUM(credits),0) AS total FROM metering.usage_event
             WHERE tenant_id = $1 AND created_at >= date_trunc('month', now())`,
      [tenantId],
    );
    return {
      limitCredits: Number(q.limit_credits),
      window: q.window === "day" ? "day" : "month",
      softPct: Number(q.soft_pct),
      consumed: Number(consumed.rows[0]?.total ?? 0),
    };
  });
}

/** Rollup giornaliero idempotente (chiamato dal cron; non sul percorso critico). */
export async function rollupDay(day: string): Promise<number> {
  return withTx(async (client) => {
    const res = await client.query(
      `INSERT INTO metering.usage_daily (tenant_id, day, capability, credits, price_eur, provider_cost_usd, requests)
       SELECT tenant_id, $1::date, capability,
              SUM(credits), SUM(price_eur), SUM(provider_cost_usd), COUNT(*)
         FROM metering.usage_event
        WHERE created_at >= $1::date AND created_at < ($1::date + interval '1 day')
        GROUP BY tenant_id, capability
       ON CONFLICT (tenant_id, day, capability) DO UPDATE
          SET credits = EXCLUDED.credits,
              price_eur = EXCLUDED.price_eur,
              provider_cost_usd = EXCLUDED.provider_cost_usd,
              requests = EXCLUDED.requests`,
      [day],
    );
    return res.rowCount ?? 0;
  });
}

/** Ultimi eventi di consumo di un tenant (per la dashboard Console). */
export async function recentUsage(tenantId: string, limit = 50): Promise<any[]> {
  return withTx(async (client) => {
    const { rows } = await client.query(
      `SELECT id, created_at, capability, provider, model, unit, billable_units,
              input_tokens, output_tokens, price_eur, credits, status, latency_ms,
              source, flow_run_id, request_id
         FROM metering.usage_event
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [tenantId, limit],
    );
    return rows;
  });
}

/** Saldo + disponibile + quota per la dashboard Console. */
export async function balanceSnapshot(tenantId: string): Promise<{
  balance: number;
  reserved: number;
  available: number;
  quota: QuotaState | null;
}> {
  const snap = await withTx(async (client) => {
    await ensureAccount(client, tenantId);
    const { rows } = await client.query<{ balance_credits: string; reserved_credits: string }>(
      `SELECT balance_credits, reserved_credits FROM metering.credit_account WHERE tenant_id = $1`,
      [tenantId],
    );
    const balance = Number(rows[0]?.balance_credits ?? 0);
    const reserved = Number(rows[0]?.reserved_credits ?? 0);
    return { balance, reserved, available: balance - reserved };
  });
  return { ...snap, quota: await quotaState(tenantId) };
}
