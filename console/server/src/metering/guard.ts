import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Redis } from "ioredis";
import { config, hasRedisConfig } from "../config.js";
import { getSession } from "../session.js";
import { meteringActive } from "./db.js";
import {
  availableCredits,
  ensureTenantForEmail,
  estimateCredits,
  quotaState,
  reserveCredits,
  tenantFromApiKey,
  tenantFromEmail,
  type TenantContext,
} from "./repo.js";
import type { Capability, Unit } from "./price.js";

// =============================================================================
// Guard di metering (preHandler logico, solo /api/ai/*).
//
// Ordine (vedi docs/platform-consumption.md §4.3):
//   1. requireTenant()   cookie HMAC -> tenant_user  |  Bearer key -> api_key
//   2. rateLimit()       Redis INCR rl:{key}:{minuto}  TTL 90s        -> 429
//   3. quotaCheck()      consumo vs quota.limit_credits              -> 429/402
//   4. balanceCheck()    balance - reserved                          -> 402
//   5. degrade()         disponibile < 10% quota -> solo modelli free
//   6. reserve()         prenotazione atomica, mai oltre il disponibile
//
// `meteringActive()` falso (kill-switch o DB non configurato) => il guard e'
// trasparente: le rotte restano autenticate ma non metrate. Questo permette di
// accendere il metering senza rompere l'esistente.
// =============================================================================

export interface MeterContext {
  tenant: TenantContext;
  requestId: string;
  reservation: number;
  /** true = forza modelli gratuiti (credito quasi esaurito). */
  preferFree: boolean;
  degraded: boolean;
  availableBefore: number;
}

export interface AiPlan {
  capability: Capability;
  /** Nota: per il metering, ogni richiesta multi-unita' e' una sola prenotazione. */
  /** Modello scelto (o richiesto) per la stima di prenotazione. */
  model: string;
  provider: string;
  /** Unita' coinvolte dalla richiesta. */
  units: Unit[];
  /** Quantita' stimate per unita' (per la prenotazione). */
  counts: Partial<Record<Unit, number>>;
}

// --- Redis (rate limit) ------------------------------------------------------

let redis: Redis | null = null;

function redisClient(): Redis | null {
  if (!hasRedisConfig()) return null;
  if (!redis) {
    const opts = { lazyConnect: false, maxRetriesPerRequest: 2, enableOfflineQueue: false } as const;
    redis = config.redisUrl
      ? new Redis(config.redisUrl, opts)
      : new Redis({
          host: config.redis.host,
          port: config.redis.port,
          ...(config.redis.password ? { password: config.redis.password } : {}),
          ...opts,
        });
    redis.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("[metering] redis error:", err.message);
    });
  }
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    redis.disconnect();
    redis = null;
  }
}

/** Rate limit per chiave/tenant: finestra di 60s, contatore Redis con TTL 90s. */
async function rateLimit(bucketKey: string): Promise<{ ok: boolean; retryAfter: number }> {
  const client = redisClient();
  if (!client) return { ok: true, retryAfter: 0 };
  const limit = config.ratePerMinute;
  const window = Math.floor(Date.now() / 60_000);
  const key = `rl:${bucketKey}:${window}`;
  try {
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, 90);
    if (count > limit) return { ok: false, retryAfter: 60 - (Math.floor(Date.now() / 1000) % 60) };
    return { ok: true, retryAfter: 0 };
  } catch {
    // Redis giu': fail-open sul rate limit (il saldo resta fail-closed).
    return { ok: true, retryAfter: 0 };
  }
}

// --- Tenant ------------------------------------------------------------------

/**
 * Risolve il tenant della richiesta: cookie di sessione (Console) oppure
 * `Authorization: Bearer <api_key>` (worker/MCP/integrazioni).
 * Ritorna `undefined` se il metering e' disattivato (nessuna identita' richiesta),
 * `null` se l'autenticazione fallisce.
 */
export async function resolveTenant(
  request: FastifyRequest,
): Promise<TenantContext | null | undefined> {
  if (!meteringActive()) return undefined;

  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const key = auth.slice("Bearer ".length).trim();
    if (!key) return null;
    return tenantFromApiKey(key);
  }

  const session = getSession(request);
  if (!session?.user?.email) return null;
  const existing = await tenantFromEmail(session.user.email);
  if (existing) return existing;
  return ensureTenantForEmail(session.user.email, {
    initialCredits: config.signupCredits,
    name: session.user.email,
  });
}

// --- Guard -------------------------------------------------------------------

export interface AiAuthResult {
  ok: boolean;
  /** Presente solo se il metering e' attivo e il guard e' passato. */
  meter: MeterContext | null;
}

/**
 * Esegue il guard completo e prenota il credito stimato.
 * Se il metering e' disattivato ritorna `{ ok: true, meter: null }` (le rotte
 * restano autenticate ma non metrate). In caso di rifiuto scrive la risposta e
 * ritorna `{ ok: false }`.
 */
export async function authorizeAi(
  request: FastifyRequest,
  reply: FastifyReply,
  plan: AiPlan,
): Promise<AiAuthResult> {
  const tenant = await resolveTenant(request);
  if (tenant === undefined) return { ok: true, meter: null };
  if (tenant === null) {
    reply.code(401).send({ code: "UNAUTHENTICATED", message: "Identita' tenant non valida" });
    return { ok: false, meter: null };
  }

  const requestId = String(request.headers["x-aethersy-request-id"] ?? crypto.randomUUID());
  const bucket = tenant.apiKeyId ?? tenant.tenantId;

  const rl = await rateLimit(bucket);
  if (!rl.ok) {
    reply
      .code(429)
      .header("Retry-After", String(rl.retryAfter))
      .send({ code: "RATE_LIMITED", message: "Troppe richieste, riprova a breve" });
    return { ok: false, meter: null };
  }

  const quota = await quotaState(tenant.tenantId);
  if (quota && quota.limitCredits > 0) {
    const usedPct = (quota.consumed / quota.limitCredits) * 100;
    if (usedPct >= 100) {
      reply.code(402).send({
        code: "QUOTA_EXCEEDED",
        message: `Quota ${quota.window} esaurita (${quota.consumed}/${quota.limitCredits} crediti)`,
        quota,
      });
      return { ok: false, meter: null };
    }
    if (usedPct >= quota.softPct) {
      request.log.warn({ tenant: tenant.tenantId, quota }, "quota oltre soglia soft");
    }
  }

  const available = await availableCredits(tenant.tenantId);
  if (available <= 0 && tenant.hardStopOnEmpty) {
    reply.code(402).send({
      code: "INSUFFICIENT_CREDITS",
      message: "Crediti esauriti: ricarica per continuare",
      available,
    });
    return { ok: false, meter: null };
  }

  // Degradazione: sotto il 10% della quota (o sotto 10 crediti senza quota)
  // si forza il modello gratuito, cosi' il cliente continua a lavorare a costo ~0.
  const threshold = quota && quota.limitCredits > 0 ? quota.limitCredits * 0.1 : 10;
  const degraded = available <= threshold;

  const estimate = await estimateCredits(tenant, {
    capability: plan.capability,
    model: plan.model,
    provider: plan.provider,
    units: plan.units,
    counts: plan.counts,
  });

  // La prenotazione non supera mai il disponibile (poi il settle addebita il reale).
  const reservation = Math.max(0, Math.min(estimate, available));
  const res = await reserveCredits(tenant.tenantId, requestId, reservation);
  if (!res.ok) {
    reply.code(402).send({
      code: "INSUFFICIENT_CREDITS",
      message: "Crediti insufficienti per la prenotazione",
      available: res.available,
    });
    return { ok: false, meter: null };
  }

  return {
    ok: true,
    meter: {
      tenant,
      requestId,
      reservation,
      preferFree: degraded,
      degraded,
      availableBefore: available,
    },
  };
}

/** Numero di token stimato da un testo (approssimazione len/4). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** ID del flow run Activepieces, per l'attribuzione del consumo del worker. */
export function flowRunId(request: FastifyRequest): string | null {
  const v = request.headers["x-aethersy-flow-run"];
  return typeof v === "string" && v ? v : null;
}

/** Vero se la richiesta arriva dal worker Activepieces (chiave `worker`/`mcp`). */
export function isWorkerRequest(ctx: MeterContext): boolean {
  return ctx.tenant.sourceTag === "worker" || ctx.tenant.sourceTag === "mcp";
}
