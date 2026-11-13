// =============================================================================
// Pannello di controllo (admin) - Fase 35.
//
// Vista aggregata sulla piattaforma: utenti, tenant, consumi, costi reali dei
// provider e ricavi per utente. Riservata agli amministratori: la sessione deve
// avere un'email in `ADMIN_EMAILS` (o il ruolo Activepieces `owner`).
//
// L'admin e' esente dalla contabilizzazione: il suo consumo resta registrato
// (per vedere quanto costa davvero) ma non genera crediti addebitati.
// =============================================================================

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { getSession } from "../session.js";
import { meteringActive } from "../metering/db.js";
import { db } from "../metering/db.js";

/** Vero se l'identita' (email/ruolo) e' di un amministratore della piattaforma. */
export function isAdminIdentity(
  email?: string | null,
  platformRole?: string | null,
): boolean {
  const normalized = email?.trim().toLowerCase();
  if (normalized && config.adminEmails.includes(normalized)) return true;
  return (platformRole ?? "").trim().toLowerCase() === "owner";
}

/** Vero se la richiesta arriva da un amministratore della piattaforma. */
export function isAdminRequest(request: FastifyRequest): boolean {
  const session = getSession(request);
  return isAdminIdentity(session?.user?.email, session?.user?.platformRole);
}

async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  if (!meteringActive()) {
    reply.code(503).send({
      code: "METERING_DISABLED",
      message: "Il pannello di controllo richiede il metering attivo",
    });
    return false;
  }
  if (!isAdminRequest(request)) {
    reply.code(403).send({
      code: "FORBIDDEN",
      message: "Accesso riservato agli amministratori",
    });
    return false;
  }
  return true;
}

interface Overview {
  generatedAt: string;
  totals: {
    tenants: number;
    users: number;
    activeTenants30d: number;
    requests30d: number;
    revenueEur: number;
    providerCostUsd: number;
    outstandingCredits: number;
    exemptedRequests30d: number;
  };
  byProvider: Array<{
    provider: string;
    requests: number;
    priceEur: number;
    providerCostUsd: number;
    credits: number;
  }>;
  byCapability: Array<{
    capability: string;
    requests: number;
    priceEur: number;
    providerCostUsd: number;
  }>;
  topTenants: Array<{
    tenantId: string;
    tenantName: string;
    plan: string;
    users: number;
    requests30d: number;
    priceEur: number;
    providerCostUsd: number;
    balanceCredits: number;
  }>;
  topUsers: Array<{
    email: string;
    requests30d: number;
    priceEur: number;
    providerCostUsd: number;
    credits: number;
  }>;
  daily: Array<{
    day: string;
    requests: number;
    priceEur: number;
    providerCostUsd: number;
  }>;
  recent: Array<{
    id: string;
    createdAt: string;
    tenantName: string;
    userEmail: string | null;
    capability: string;
    provider: string;
    model: string;
    priceEur: number;
    providerCostUsd: number;
    credits: number;
    status: string;
    source: string;
  }>;
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/platform/admin/overview", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const pool = db();

    const [totals, byProvider, byCapability, topTenants, topUsers, daily, recent] = await Promise.all([
      pool.query<{
        tenants: string;
        users: string;
        active_tenants: string;
        requests: string;
        revenue: string;
        provider_cost: string;
        outstanding: string;
        exempted: string;
      }>(
        `SELECT
           (SELECT count(*) FROM metering.tenant)::bigint AS tenants,
           (SELECT count(*) FROM metering.tenant_user)::bigint AS users,
           (SELECT count(DISTINCT tenant_id) FROM metering.usage_event
              WHERE created_at >= now() - interval '30 days')::bigint AS active_tenants,
           (SELECT count(*) FROM metering.usage_event
              WHERE created_at >= now() - interval '30 days')::bigint AS requests,
           (SELECT coalesce(sum(price_eur), 0) FROM metering.usage_event
              WHERE created_at >= now() - interval '30 days')::text AS revenue,
           (SELECT coalesce(sum(provider_cost_usd), 0) FROM metering.usage_event
              WHERE created_at >= now() - interval '30 days')::text AS provider_cost,
           (SELECT coalesce(sum(balance_credits), 0) FROM metering.credit_account)::text AS outstanding,
           (SELECT count(*) FROM metering.usage_event
              WHERE created_at >= now() - interval '30 days' AND credits = 0)::bigint AS exempted`,
      ),
      pool.query<{
        provider: string;
        requests: string;
        price: string;
        cost: string;
        credits: string;
      }>(
        `SELECT provider,
                count(*)::bigint AS requests,
                coalesce(sum(price_eur), 0)::text AS price,
                coalesce(sum(provider_cost_usd), 0)::text AS cost,
                coalesce(sum(credits), 0)::text AS credits
           FROM metering.usage_event
          WHERE created_at >= now() - interval '30 days'
          GROUP BY provider
          ORDER BY requests DESC`,
      ),
      pool.query<{
        capability: string;
        requests: string;
        price: string;
        cost: string;
      }>(
        `SELECT capability,
                count(*)::bigint AS requests,
                coalesce(sum(price_eur), 0)::text AS price,
                coalesce(sum(provider_cost_usd), 0)::text AS cost
           FROM metering.usage_event
          WHERE created_at >= now() - interval '30 days'
          GROUP BY capability
          ORDER BY requests DESC`,
      ),
      pool.query<{
        tenant_id: string;
        tenant_name: string;
        plan: string;
        users: string;
        requests: string;
        price: string;
        cost: string;
        balance: string;
      }>(
        `SELECT t.id AS tenant_id,
                t.name AS tenant_name,
                t.plan,
                (SELECT count(*) FROM metering.tenant_user u WHERE u.tenant_id = t.id)::bigint AS users,
                (SELECT count(*) FROM metering.usage_event e
                  WHERE e.tenant_id = t.id AND e.created_at >= now() - interval '30 days')::bigint AS requests,
                (SELECT coalesce(sum(e.price_eur), 0) FROM metering.usage_event e
                  WHERE e.tenant_id = t.id AND e.created_at >= now() - interval '30 days')::text AS price,
                (SELECT coalesce(sum(e.provider_cost_usd), 0) FROM metering.usage_event e
                  WHERE e.tenant_id = t.id AND e.created_at >= now() - interval '30 days')::text AS cost,
                (SELECT coalesce(a.balance_credits, 0) FROM metering.credit_account a
                  WHERE a.tenant_id = t.id)::text AS balance
           FROM metering.tenant t
          ORDER BY requests DESC, price DESC
          LIMIT 20`,
      ),
      pool.query<{
        email: string;
        requests: string;
        price: string;
        cost: string;
        credits: string;
      }>(
        `SELECT user_email AS email,
                count(*)::bigint AS requests,
                coalesce(sum(price_eur), 0)::text AS price,
                coalesce(sum(provider_cost_usd), 0)::text AS cost,
                coalesce(sum(credits), 0)::text AS credits
           FROM metering.usage_event
          WHERE created_at >= now() - interval '30 days' AND user_email IS NOT NULL
          GROUP BY user_email
          ORDER BY requests DESC
          LIMIT 20`,
      ),
      pool.query<{ day: string; requests: string; price: string; cost: string }>(
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
                count(*)::bigint AS requests,
                coalesce(sum(price_eur), 0)::text AS price,
                coalesce(sum(provider_cost_usd), 0)::text AS cost
           FROM metering.usage_event
          WHERE created_at >= now() - interval '30 days'
          GROUP BY 1
          ORDER BY 1`,
      ),
      pool.query<{
        id: string;
        created_at: Date;
        tenant_name: string;
        user_email: string | null;
        capability: string;
        provider: string;
        model: string;
        price_eur: string;
        provider_cost_usd: string;
        credits: string;
        status: string;
        source: string;
      }>(
        `SELECT e.id, e.created_at, t.name AS tenant_name, e.user_email,
                e.capability, e.provider, e.model,
                e.price_eur::text, e.provider_cost_usd::text, e.credits::text,
                e.status, e.source
           FROM metering.usage_event e
           JOIN metering.tenant t ON t.id = e.tenant_id
          ORDER BY e.created_at DESC
          LIMIT 25`,
      ),
    ]);

    const t = totals.rows[0];
    const payload: Overview = {
      generatedAt: new Date().toISOString(),
      totals: {
        tenants: Number(t?.tenants ?? 0),
        users: Number(t?.users ?? 0),
        activeTenants30d: Number(t?.active_tenants ?? 0),
        requests30d: Number(t?.requests ?? 0),
        revenueEur: Number(t?.revenue ?? 0),
        providerCostUsd: Number(t?.provider_cost ?? 0),
        outstandingCredits: Number(t?.outstanding ?? 0),
        exemptedRequests30d: Number(t?.exempted ?? 0),
      },
      byProvider: byProvider.rows.map((r) => ({
        provider: r.provider,
        requests: Number(r.requests),
        priceEur: Number(r.price),
        providerCostUsd: Number(r.cost),
        credits: Number(r.credits),
      })),
      byCapability: byCapability.rows.map((r) => ({
        capability: r.capability,
        requests: Number(r.requests),
        priceEur: Number(r.price),
        providerCostUsd: Number(r.cost),
      })),
      topTenants: topTenants.rows.map((r) => ({
        tenantId: r.tenant_id,
        tenantName: r.tenant_name,
        plan: r.plan,
        users: Number(r.users),
        requests30d: Number(r.requests),
        priceEur: Number(r.price),
        providerCostUsd: Number(r.cost),
        balanceCredits: Number(r.balance),
      })),
      topUsers: topUsers.rows.map((r) => ({
        email: r.email,
        requests30d: Number(r.requests),
        priceEur: Number(r.price),
        providerCostUsd: Number(r.cost),
        credits: Number(r.credits),
      })),
      daily: daily.rows.map((r) => ({
        day: r.day,
        requests: Number(r.requests),
        priceEur: Number(r.price),
        providerCostUsd: Number(r.cost),
      })),
      recent: recent.rows.map((r) => ({
        id: String(r.id),
        createdAt: new Date(r.created_at).toISOString(),
        tenantName: r.tenant_name,
        userEmail: r.user_email,
        capability: r.capability,
        provider: r.provider,
        model: r.model,
        priceEur: Number(r.price_eur),
        providerCostUsd: Number(r.provider_cost_usd),
        credits: Number(r.credits),
        status: r.status,
        source: r.source,
      })),
    };
    return payload;
  });
}
