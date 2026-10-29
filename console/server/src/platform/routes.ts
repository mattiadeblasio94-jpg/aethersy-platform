import type { FastifyInstance } from "fastify";
import { requireMeteredTenant } from "./guard.js";
import { DROIDS, SCHEDULE_KINDS, SCHEDULE_STATUSES, SCHEDULE_KIND_LABELS } from "./catalog.js";
import { CronError, isValidCron, nextRunFor } from "./cron.js";

// Rotte della piattaforma "Business Pulse" (modello pazi.ai adattato a
// Aethersy). Montate sotto /api/platform/*, registrate da `registerRoutes`.
//
//   GET    /api/platform/overview            -> Business Pulse (contatori + attenzione)
//   GET    /api/platform/opportunities       -> roadmap = run con stato pazi
//   GET    /api/platform/roster              -> roster specialisti + carico reale
//   GET    /api/platform/roster/:droidId     -> scheda singolo specialista
//   GET    /api/platform/schedule            -> agenda (con prossima esecuzione)
//   POST   /api/platform/schedule            -> crea voce di agenda
//   PATCH  /api/platform/schedule/:id        -> aggiorna voce di agenda
//   POST   /api/platform/schedule/:id/pause  -> mette in pausa
//   POST   /api/platform/schedule/:id/resume -> riattiva
//   DELETE /api/platform/schedule/:id        -> elimina voce
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
    };
  });

  // ---------------------------------------------------- business pulse ----
  app.get("/api/platform/overview", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { businessPulse } = await import("./repo.js");
    return businessPulse(tenant.tenantId);
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
