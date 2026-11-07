import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { db } from "../metering/db.js";
import { hasDbConfig } from "../config.js";
import { getSession } from "../session.js";

// Profilo e preferenze dell'identita' (schema `auth`).
//
// Sono dati REALI, salvati nel Postgres dello stack: la pagina Profilo mostra
// quello che l'utente ha scritto e la pagina Notifiche salva le preferenze
// effettive. Nessun dato di esempio: se la riga non esiste si parte da una
// scheda vuota con i default.

export interface IdentityProfile {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  roleTitle: string;
  timezone: string;
  locale: string;
}

export interface IdentityPreferences {
  emailDigest: "off" | "daily" | "weekly";
  runUpdates: boolean;
  leadAlerts: boolean;
  budgetAlerts: boolean;
  channelEmail: boolean;
  channelPush: boolean;
  quietHours: boolean;
  updatedAt: string | null;
}

const DEFAULT_PREFERENCES: Omit<IdentityPreferences, "updatedAt"> = {
  emailDigest: "daily",
  runUpdates: true,
  leadAlerts: true,
  budgetAlerts: true,
  channelEmail: true,
  channelPush: false,
  quietHours: false,
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function storeAvailable(): boolean {
  return hasDbConfig();
}

export async function loadProfile(email: string): Promise<IdentityProfile> {
  const key = normalizeEmail(email);
  const base: IdentityProfile = {
    email: key,
    firstName: "",
    lastName: "",
    company: "",
    roleTitle: "",
    timezone: "Europe/Rome",
    locale: "it",
  };
  if (!storeAvailable()) return base;

  const res = await db().query<{
    first_name: string;
    last_name: string;
    company: string;
    role_title: string;
    timezone: string;
    locale: string;
  }>(
    "SELECT first_name, last_name, company, role_title, timezone, locale FROM auth.identity_profile WHERE email = $1",
    [key],
  );
  const row = res.rows[0];
  if (!row) return base;
  return {
    email: key,
    firstName: row.first_name,
    lastName: row.last_name,
    company: row.company,
    roleTitle: row.role_title,
    timezone: row.timezone,
    locale: row.locale,
  };
}

export async function saveProfile(
  email: string,
  patch: Partial<Omit<IdentityProfile, "email">>,
): Promise<IdentityProfile> {
  const key = normalizeEmail(email);
  if (storeAvailable()) {
    await db().query(
      `INSERT INTO auth.identity_profile (email, first_name, last_name, company, role_title, timezone, locale)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO UPDATE
         SET first_name = EXCLUDED.first_name,
             last_name  = EXCLUDED.last_name,
             company    = EXCLUDED.company,
             role_title = EXCLUDED.role_title,
             timezone   = EXCLUDED.timezone,
             locale     = EXCLUDED.locale,
             updated_at = now()`,
      [
        key,
        patch.firstName ?? "",
        patch.lastName ?? "",
        patch.company ?? "",
        patch.roleTitle ?? "",
        patch.timezone ?? "Europe/Rome",
        patch.locale ?? "it",
      ],
    );
  }
  return loadProfile(key);
}

export async function loadPreferences(email: string): Promise<IdentityPreferences> {
  const key = normalizeEmail(email);
  if (!storeAvailable()) return { ...DEFAULT_PREFERENCES, updatedAt: null };

  const res = await db().query<{ prefs: Record<string, unknown>; updated_at: Date }>(
    "SELECT prefs, updated_at FROM auth.identity_preference WHERE email = $1",
    [key],
  );
  const row = res.rows[0];
  if (!row) return { ...DEFAULT_PREFERENCES, updatedAt: null };

  const prefs = (row.prefs ?? {}) as Partial<IdentityPreferences>;
  return {
    ...DEFAULT_PREFERENCES,
    ...prefs,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export async function savePreferences(
  email: string,
  patch: Partial<Omit<IdentityPreferences, "email" | "updatedAt">>,
): Promise<IdentityPreferences> {
  const key = normalizeEmail(email);
  const current = await loadPreferences(key);
  const next = { ...current, ...patch };
  const payload = {
    emailDigest: next.emailDigest,
    runUpdates: next.runUpdates,
    leadAlerts: next.leadAlerts,
    budgetAlerts: next.budgetAlerts,
    channelEmail: next.channelEmail,
    channelPush: next.channelPush,
    quietHours: next.quietHours,
  };

  if (storeAvailable()) {
    await db().query(
      `INSERT INTO auth.identity_preference (email, prefs)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (email) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = now()`,
      [key, JSON.stringify(payload)],
    );
  }
  return loadPreferences(key);
}

/** Email dell'identita' corrente (cookie di sessione Console). */
async function currentEmail(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const session = getSession(request);
  if (!session) {
    reply.code(401).send({ code: "UNAUTHENTICATED", message: "Sessione non valida" });
    return null;
  }
  return session.user.email;
}

export async function registerIdentityRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/platform/profile", async (request, reply) => {
    const email = await currentEmail(request, reply);
    if (!email) return;
    const profile = await loadProfile(email);
    return { profile };
  });

  app.patch("/api/platform/profile", async (request, reply) => {
    const email = await currentEmail(request, reply);
    if (!email) return;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const patch: Partial<Omit<IdentityProfile, "email">> = {};
    if (typeof body.firstName === "string") patch.firstName = body.firstName.trim().slice(0, 120);
    if (typeof body.lastName === "string") patch.lastName = body.lastName.trim().slice(0, 120);
    if (typeof body.company === "string") patch.company = body.company.trim().slice(0, 160);
    if (typeof body.roleTitle === "string") patch.roleTitle = body.roleTitle.trim().slice(0, 120);
    if (typeof body.timezone === "string") patch.timezone = body.timezone.trim().slice(0, 80) || "Europe/Rome";
    if (typeof body.locale === "string") patch.locale = body.locale.trim().slice(0, 10) || "it";
    const profile = await saveProfile(email, patch);
    return { profile };
  });

  app.get("/api/platform/preferences", async (request, reply) => {
    const email = await currentEmail(request, reply);
    if (!email) return;
    const preferences = await loadPreferences(email);
    return { preferences };
  });

  app.patch("/api/platform/preferences", async (request, reply) => {
    const email = await currentEmail(request, reply);
    if (!email) return;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const patch: Partial<Omit<IdentityPreferences, "email" | "updatedAt">> = {};
    if (body.emailDigest === "off" || body.emailDigest === "daily" || body.emailDigest === "weekly") {
      patch.emailDigest = body.emailDigest;
    }
    for (const key of [
      "runUpdates",
      "leadAlerts",
      "budgetAlerts",
      "channelEmail",
      "channelPush",
      "quietHours",
    ] as const) {
      if (typeof body[key] === "boolean") patch[key] = body[key] as boolean;
    }
    const preferences = await savePreferences(email, patch);
    return { preferences };
  });
}
