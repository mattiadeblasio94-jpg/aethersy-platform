import type { FastifyInstance } from "fastify";
import { requireMeteredTenant } from "./guard.js";
import {
  DROIDS,
  SCHEDULE_KINDS,
  SCHEDULE_STATUSES,
  SCHEDULE_KIND_LABELS,
  OPPORTUNITY_BUCKETS,
  OPPORTUNITY_BUCKET_LABELS,
  LIBRARY_SECTIONS,
  LIBRARY_SECTION_LABELS,
  FAQ_CATALOG,
} from "./catalog.js";
import { CronError, isValidCron, nextRunFor } from "./cron.js";

// Rotte della piattaforma "Business Pulse" (modello pazi.ai adattato a
// Aethersy). Montate sotto /api/platform/*, registrate da `registerRoutes`.
//
//   GET    /api/platform/overview            -> Business Pulse (contatori + attenzione + tiles)
//   GET    /api/platform/opportunities       -> roadmap = run con stato pazi
//   GET    /api/platform/opportunities/kanban -> board kanban (running/ahead/done)
//   GET    /api/platform/roster              -> roster specialisti + carico reale
//   GET    /api/platform/roster/:droidId     -> scheda singolo specialista
//   GET    /api/platform/schedule            -> agenda (con prossima esecuzione)
//   POST   /api/platform/schedule            -> crea voce di agenda
//   PATCH  /api/platform/schedule/:id        -> aggiorna voce di agenda
//   POST   /api/platform/schedule/:id/pause  -> mette in pausa
//   POST   /api/platform/schedule/:id/resume -> riattiva
//   DELETE /api/platform/schedule/:id        -> elimina voce
//   GET    /api/platform/library             -> Libreria (risorse/agenti/messaggi/inviti)
//   GET    /api/platform/account             -> Abbonamento / Account summary
//   GET    /api/platform/faq                 -> Catalogo FAQ (billing/subscription/usage/general)
//   POST   /api/platform/cron/preview        -> prossime N esecuzioni di un cron
//
// Tutte richiedono il metering attivo (gli schemi vivono li').

export async function registerPlatformRoutes(app: FastifyInstance): Promise<void> {
  // ---------------------------------------------------------- catalogo ----
  app.get("/api/platform/catalog", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    return {
      droids: DROIDS,
      scheduleKinds: SCHEDULE_KINDS.map((k) => ({ id: k, label: SCHEDULE_KIND_LABELS[k] })),
      scheduleStatuses: SCHEDULE_STATUSES,
      opportunityBuckets: OPPORTUNITY_BUCKETS.map((b) => ({ id: b, label: OPPORTUNITY_BUCKET_LABELS[b] })),
      librarySections: LIBRARY_SECTIONS.map((s) => ({ id: s, label: LIBRARY_SECTION_LABELS[s] })),
    };
  });

  // ---------------------------------------------------- business pulse ----
  app.get("/api/platform/overview", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { businessPulse, areaTiles } = await import("./repo.js");
    const pulse = await businessPulse(tenant.tenantId);
    return { ...pulse, areaTiles: areaTiles(pulse.counters) };
  });

  // ------------------------------------------------ roadmap/opportunity ----
  app.get("/api/platform/opportunities", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { stage, limit } = request.query as { stage?: string; limit?: string };
    const { listOpportunities } = await import("./repo.js");
    return listOpportunities(tenant.tenantId, {
      stage,
      limit: limit ? Number(limit) : undefined,
    });
  });

  app.get("/api/platform/opportunities/kanban", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { stage, limit } = request.query as { stage?: string; limit?: string };
    const { kanbanBoard } = await import("./repo.js");
    return kanbanBoard(tenant.tenantId, {
      stage,
      limit: limit ? Number(limit) : undefined,
    });
  });

  // --------------------------------------------------------- roster ----
  app.get("/api/platform/roster", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { droidRoster } = await import("./repo.js");
    return droidRoster(tenant.tenantId);
  });

  app.get("/api/platform/roster/:droidId", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { droidId } = request.params as { droidId: string };
    const { droidDetail } = await import("./repo.js");
    const droid = await droidDetail(tenant.tenantId, droidId);
    if (!droid) return reply.code(404).send({ code: "NOT_FOUND", message: "Specialista inesistente" });
    return droid;
  });

  // --------------------------------------------- tasks & calendar ----
  app.get("/api/platform/schedule", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { status, kind, limit } = request.query as {
      status?: string;
      kind?: string;
      limit?: string;
    };
    const { listScheduleWithNext } = await import("./repo.js");
    return listScheduleWithNext(tenant.tenantId, {
      status,
      kind,
      limit: limit ? Number(limit) : undefined,
    });
  });

  app.post("/api/platform/schedule", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const body = (request.body ?? {}) as {
      title?: string;
      kind?: string;
      stage?: string;
      runId?: string | null;
      cron?: string | null;
      runAt?: string | null;
      timezone?: string;
      meta?: unknown;
    };
    if (!body.title) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "title richiesto" });
    }
    const { createSchedule, validateScheduleInput, nextRunAt } = await import("./repo.js");
    const check = validateScheduleInput({
      cron: body.cron,
      runAt: body.runAt,
      timezone: body.timezone,
    });
    if (!check.ok) return reply.code(400).send({ code: "BAD_REQUEST", message: check.message });
    try {
      const created = await createSchedule({
        tenantId: tenant.tenantId,
        title: body.title,
        kind: body.kind as never,
        stage: body.stage,
        runId: body.runId ?? null,
        cron: body.cron ?? null,
        runAt: body.runAt ?? null,
        timezone: body.timezone,
        meta: body.meta,
      });
      return reply.code(201).send({ ...created, nextRunAt: nextRunAt(created) });
    } catch (err) {
      const message = err instanceof CronError ? err.message : (err as Error).message;
      return reply.code(400).send({ code: "BAD_REQUEST", message });
    }
  });

  app.patch("/api/platform/schedule/:id", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as {
      title?: string;
      kind?: string;
      stage?: string;
      cron?: string | null;
      runAt?: string | null;
      timezone?: string;
      status?: string;
      meta?: unknown;
    };
    const { updateSchedule, nextRunAt } = await import("./repo.js");
    try {
      const updated = await updateSchedule(tenant.tenantId, id, {
        title: body.title,
        kind: body.kind as never,
        stage: body.stage,
        cron: body.cron,
        runAt: body.runAt,
        timezone: body.timezone,
        status: body.status as never,
        meta: body.meta,
      });
      if (!updated) return reply.code(404).send({ code: "NOT_FOUND", message: "Voce inesistente" });
      return { ...updated, nextRunAt: nextRunAt(updated) };
    } catch (err) {
      const message = err instanceof CronError ? err.message : (err as Error).message;
      return reply.code(400).send({ code: "BAD_REQUEST", message });
    }
  });

  for (const [action, status] of [
    ["pause", "paused"],
    ["resume", "scheduled"],
  ] as const) {
    app.post(`/api/platform/schedule/:id/${action}`, async (request, reply) => {
      const tenant = await requireMeteredTenant(request, reply);
      if (!tenant) return;
      const { id } = request.params as { id: string };
      const { updateSchedule, nextRunAt } = await import("./repo.js");
      const updated = await updateSchedule(tenant.tenantId, id, { status });
      if (!updated) return reply.code(404).send({ code: "NOT_FOUND", message: "Voce inesistente" });
      return { ...updated, nextRunAt: nextRunAt(updated) };
    });
  }

  app.delete("/api/platform/schedule/:id", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { id } = request.params as { id: string };
    const { deleteSchedule } = await import("./repo.js");
    const ok = await deleteSchedule(tenant.tenantId, id);
    if (!ok) return reply.code(404).send({ code: "NOT_FOUND", message: "Voce inesistente" });
    return { ok: true };
  });

  // --------------------------------------------------------- libreria ----
  app.get("/api/platform/library", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { libraryData } = await import("./repo.js");
    return libraryData(tenant.tenantId);
  });

  // Contenuto di una risorsa della libreria (asset di pipeline, tenant scoped).
  app.get<{ Params: { assetId: string } }>("/api/platform/library/:assetId", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { withTx } = await import("../metering/db.js");
    const { rows } = await withTx((client) =>
      client.query<{
        id: string;
        kind: string;
        name: string;
        mime: string | null;
        storage_key: string;
        status: string;
        run_id: string | null;
        version: number;
        meta: unknown;
        created_at: Date;
      }>(
        `SELECT id, kind, name, mime, storage_key, status, run_id, version, meta, created_at
           FROM pipeline.asset
          WHERE id = $1 AND tenant_id = $2`,
        [request.params.assetId, tenant.tenantId],
      ),
    );
    const asset = rows[0];
    if (!asset) {
      return reply.code(404).send({ code: "NOT_FOUND", message: "Risorsa non trovata" });
    }

    const meta = (asset.meta ?? {}) as Record<string, unknown>;
    const content = typeof meta.content === "string" ? meta.content : null;
    // Gli asset binari (es. PDF) portano i byte in base64 dentro i metadati:
    // vengono restituiti cosi' il download e' fedele, non un testo corrotto.
    const contentBase64 = typeof meta.contentBase64 === "string" ? meta.contentBase64 : null;
    return {
      asset: {
        id: asset.id,
        kind: asset.kind,
        name: asset.name,
        mime: asset.mime,
        storageKey: asset.storage_key,
        status: asset.status,
        runId: asset.run_id,
        version: asset.version,
        createdAt: asset.created_at,
      },
      content,
      contentBase64,
      meta,
    };
  });

  // Sito pubblico del run "website": HTML reale servito dal BFF, ricavato dai
  // deliverable prodotti dal modello. URL stabile: /api/platform/sites/:runId.
  app.get<{ Params: { runId: string } }>("/api/platform/sites/:runId", async (request, reply) => {
    // Pubblico: il sito e' il deliverable che il cliente riceve via link.
    const { renderSitePage } = await import("./site.js");
    const site = await renderSitePage(request.params.runId);
    if (!site) {
      return reply
        .code(404)
        .send({ code: "NOT_FOUND", message: "Sito non disponibile per questo run" });
    }
    return reply
      .header("content-type", "text/html; charset=utf-8")
      .header("cache-control", "public, max-age=60")
      .send(site.html);
  });

  // Lead dal form del sito pubblicato: il visitatore non ha sessione, il lead
  // viene attribuito al tenant del run e inoltrato al canale outbound (Slack).
  app.post<{ Params: { runId: string } }>("/api/platform/sites/:runId/leads", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    // Honeypot: i bot compilano il campo "website", l'utente no. Risposta
    // identica a quella reale, ma nessun lead viene creato.
    if (String(body.website ?? "").trim()) {
      return reply.code(201).send({
        id: null,
        message: "Richiesta inviata. Rispondiamo entro 24 ore.",
      });
    }
    const { createSiteLead } = await import("./site.js");
    try {
      const created = await createSiteLead(request.params.runId, {
        name: typeof body.name === "string" ? body.name : undefined,
        email: typeof body.email === "string" ? body.email : undefined,
        phone: typeof body.phone === "string" ? body.phone : undefined,
        message: typeof body.message === "string" ? body.message : undefined,
        website: typeof body.website === "string" ? body.website : undefined,
        utm: (body.utm ?? {}) as Record<string, unknown>,
        payload: { origin: request.headers.origin ?? null, user_agent: request.headers["user-agent"] ?? null },
      });
      if (!created) {
        return reply.code(404).send({ code: "NOT_FOUND", message: "Sito non trovato" });
      }
      const { publishNotification } = await import("../pipeline/notifications.js");
      const { notifyWebhookEvent } = await import("../pipeline/notify.js");
      await publishNotification({
        tenantId: created.tenantId,
        kind: "lead.created",
        severity: "success",
        title: `Nuovo lead dal sito: ${typeof body.name === "string" && body.name ? body.name : typeof body.email === "string" ? body.email : "senza nome"}`,
        body:
          typeof body.message === "string" && body.message
            ? body.message.slice(0, 300)
            : "Richiesta dal modulo contatti del sito pubblicato.",
        link: "/website",
        meta: { runId: request.params.runId, email: body.email ?? null },
      }).catch(() => undefined);
      await notifyWebhookEvent(created.tenantId, "lead.created", {
        id: created.id,
        source: "website",
        name: typeof body.name === "string" ? body.name : null,
        email: typeof body.email === "string" ? body.email : null,
        message: typeof body.message === "string" ? body.message : null,
        site_url: `/api/platform/sites/${request.params.runId}`,
      }).catch(() => undefined);
      return reply.code(201).send({
        id: created.id,
        message: "Richiesta inviata. Rispondiamo entro 24 ore.",
      });
    } catch (error) {
      const message = (error as Error).message;
      request.log.warn({ error: message }, "lead dal sito rifiutato");
      return reply.code(400).send({ code: "BAD_REQUEST", message });
    }
  });

  // ------------------------------------------------------------ Notifiche --
  // Notifiche in-app reali: eventi di pipeline, lead e deploy. La lista
  // contiene le notifiche del tenant piu' quelle di piattaforma.

  app.get("/api/platform/notifications", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { listNotifications, unreadNotificationCount } = await import(
      "../pipeline/notifications.js"
    );
    const query = (request.query ?? {}) as { limit?: string };
    const limit = query.limit ? Math.min(Number.parseInt(query.limit, 10) || 50, 200) : 50;
    const [notifications, unread] = await Promise.all([
      listNotifications(tenant.tenantId, limit),
      unreadNotificationCount(tenant.tenantId),
    ]);
    return {
      notifications: notifications.map((item) => ({
        id: item.id,
        scope: item.scope,
        kind: item.kind,
        severity: item.severity,
        title: item.title,
        body: item.body,
        link: item.link,
        meta: item.meta,
        read: item.read_at !== null,
        readAt: item.read_at,
        createdAt: item.created_at,
      })),
      unread,
    };
  });

  app.post("/api/platform/notifications/:id/read", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { id } = request.params as { id: string };
    const { markNotificationRead } = await import("../pipeline/notifications.js");
    const ok = await markNotificationRead(tenant.tenantId, id);
    if (!ok) {
      return reply.code(404).send({ code: "NOT_FOUND", message: "Notifica non trovata" });
    }
    return { ok: true };
  });

  app.post("/api/platform/notifications/read-all", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { markAllNotificationsRead } = await import("../pipeline/notifications.js");
    const updated = await markAllNotificationsRead(tenant.tenantId);
    return { ok: true, updated };
  });

  // ------------------------------------------------------- account/FAQ ----
  app.get("/api/platform/account", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { accountSummary } = await import("./repo.js");
    return accountSummary(tenant.tenantId);
  });

  app.get("/api/platform/faq", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { category } = request.query as { category?: string };
    let faqs = FAQ_CATALOG;
    if (category) {
      faqs = faqs.filter((f) => f.category === category);
    }
    return { faqs };
  });

  // ---------------------------------------------------- cron preview ----
  app.post("/api/platform/cron/preview", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const body = (request.body ?? {}) as { cron?: string; timezone?: string; count?: number };
    if (!body.cron) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "cron richiesto" });
    }
    if (!isValidCron(body.cron)) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: `cron non valido: ${body.cron}` });
    }
    const timezone = body.timezone?.trim() || "Europe/Rome";
    const count = Math.min(Math.max(body.count ?? 5, 1), 20);
    const runs: string[] = [];
    let cursor = new Date();
    try {
      for (let i = 0; i < count; i++) {
        const next = nextRunFor(body.cron, timezone, cursor);
        if (!next) break;
        runs.push(next.toISOString());
        cursor = next;
      }
    } catch (err) {
      const message = err instanceof CronError ? err.message : (err as Error).message;
      return reply.code(400).send({ code: "BAD_REQUEST", message });
    }
    return { cron: body.cron, timezone, runs };
  });
}
