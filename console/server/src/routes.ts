import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { apFetch, ApError, toFlowView, toRunView } from "./ap.js";
import { config } from "./config.js";
import { clearSessionCookie, getSession, setSessionCookie, type Session } from "./session.js";
import { meteringActive } from "./metering/db.js";
import { authorizeAi, flowRunId, estimateTokens } from "./metering/guard.js";
import { balanceSnapshot, recentUsage } from "./metering/repo.js";
import { selectGenModel } from "./ai-gen/select.js";
import type { NotifyResult } from "./pipeline/notify.js";

// Rotte BFF:
//   POST /api/auth/login     -> sign-in Activepieces, apre la sessione (cookie httpOnly)
//   POST /api/auth/logout    -> chiude la sessione
//   GET  /api/auth/session   -> utente corrente
//   GET  /api/ap/*           -> proxy autenticato verso Activepieces
//   GET  /api/ai/catalog     -> catalogo modelli per capacita' (AI Router)
//   POST /api/ai/chat        -> esecuzione multimodale via AI Router (metrata)
//   POST /api/ai/generate    -> generazione img_out/tts/vid_out via Venice (metrata)
//   POST /api/ai/video/retrieve -> stato/risultato di un job video
//   GET  /api/ai/balance     -> saldo crediti + quota del tenant
//   GET  /api/ai/usage       -> ultimi eventi di consumo
//   POST /api/pipeline/leads -> webhook lead (Bearer key del tenant)
//   GET  /api/pipeline/leads -> elenco lead del tenant
//   PATCH /api/pipeline/leads/:id -> aggiorna lo stato del lead (funnel)
//   GET  /api/pipeline/runs/:id/export -> pacchetto JSON dei deliverable approvati

function requireSession(request: FastifyRequest, reply: FastifyReply): Session | null {
  const session = getSession(request);
  if (!session) {
    reply.code(401).send({ code: "UNAUTHENTICATED", message: "Sessione non valida" });
    return null;
  }
  return session;
}

/**
 * Identita' per le rotte AI non metrate (catalog, retrieve): con il metering
 * attivo basta un tenant valido (cookie o Bearer key); altrimenti serve la
 * sessione Console. Evita che l'accensione del metering apra rotte prima
 * protette dalla sola sessione.
 */
async function requireIdentity(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  if (!meteringActive()) return Boolean(requireSession(request, reply));
  const { resolveTenant } = await import("./metering/guard.js");
  const tenant = await resolveTenant(request);
  if (!tenant) {
    reply.code(401).send({ code: "UNAUTHENTICATED", message: "Identita' tenant non valida" });
    return false;
  }
  return true;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // ---------------------------------------------------------------- auth ----
  app.post("/api/auth/login", async (request, reply) => {
    const { email, password } = (request.body ?? {}) as { email?: string; password?: string };
    if (!email || !password) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "Email e password richiesti" });
    }

    let response: any;
    try {
      response = await apFetch<any>("/api/v1/authentication/sign-in", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    } catch (err) {
      if (err instanceof ApError) {
        const status = err.code === "INVALID_CREDENTIALS" ? 401 : err.status;
        return reply.code(status).send({ code: err.code ?? "SIGN_IN_FAILED", message: err.message });
      }
      throw err;
    }

    if (!response?.token) {
      return reply.code(502).send({ code: "BAD_GATEWAY", message: "Risposta di sign-in inattesa" });
    }

    const session: Session = {
      token: response.token,
      user: {
        id: response.id,
        email: response.email,
        firstName: response.firstName,
        lastName: response.lastName,
        platformRole: response.platformRole,
        verified: response.verified,
        projectId: response.projectId ?? null,
      },
      exp: Math.floor(Date.now() / 1000) + config.cookieMaxAgeSec,
    };
    setSessionCookie(reply, session);
    return session.user;
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/api/auth/session", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;
    return session.user;
  });

  // ------------------------------------------------- Activepieces proxy ----
  app.get("/api/ap/projects", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;
    return apFetch<any[]>("/api/v1/projects", { token: session.token });
  });

  app.get("/api/ap/flows", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;
    const { projectId } = request.query as { projectId?: string };
    if (!projectId) return reply.code(400).send({ code: "BAD_REQUEST", message: "projectId richiesto" });
    const flows = await apFetch<any[]>(`/api/v1/flows?projectId=${encodeURIComponent(projectId)}`, {
      token: session.token,
    });
    return flows.map(toFlowView);
  });

  app.post("/api/ap/flows", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;
    const { projectId, displayName } = (request.body ?? {}) as {
      projectId?: string;
      displayName?: string;
    };
    if (!projectId || !displayName) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "projectId e displayName richiesti" });
    }
    const flow = await apFetch<any>("/api/v1/flows", {
      method: "POST",
      token: session.token,
      body: JSON.stringify({ projectId, displayName }),
    });
    return toFlowView(flow);
  });

  app.get("/api/ap/runs", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;
    const { projectId } = request.query as { projectId?: string };
    if (!projectId) return reply.code(400).send({ code: "BAD_REQUEST", message: "projectId richiesto" });

    const [runs, flows] = await Promise.all([
      apFetch<any[]>(`/api/v1/flow-runs?projectId=${encodeURIComponent(projectId)}`, {
        token: session.token,
      }),
      apFetch<any[]>(`/api/v1/flows?projectId=${encodeURIComponent(projectId)}`, {
        token: session.token,
      }).catch(() => []),
    ]);
    const names = new Map<string, string>(flows.map((f) => [f.id, f.displayName ?? "(senza nome)"]));
    return runs.map((r) => toRunView(r, names));
  });

  app.get("/api/ap/runs/count", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;
    const { projectId } = request.query as { projectId?: string };
    if (!projectId) return reply.code(400).send({ code: "BAD_REQUEST", message: "projectId richiesto" });
    return apFetch<any[]>(`/api/v1/flow-runs/count-by-status?projectId=${encodeURIComponent(projectId)}`, {
      token: session.token,
    }).catch(() => []);
  });

  app.get("/api/ap/connections", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;
    const { projectId } = request.query as { projectId?: string };
    if (!projectId) return reply.code(400).send({ code: "BAD_REQUEST", message: "projectId richiesto" });
    const conns = await apFetch<any[]>(`/api/v1/app-connections?projectId=${encodeURIComponent(projectId)}`, {
      token: session.token,
    });
    return conns.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      pieceName: c.pieceName,
      pieceDisplayName: c.pieceDisplayName,
      status: c.status,
      type: c.type,
    }));
  });

  // ------------------------------------------------------ AI Router -------
  // Tutte le rotte AI passano dal guard di metering quando METERING_ENABLED=true:
  // identita' tenant -> rate limit -> quota -> saldo -> prenotazione.
  // Con il metering spento restano protette dalla sola sessione (comportamento
  // storico), cosi' l'accensione del metering non rompe l'esistente.

  app.get("/api/ai/catalog", async (request, reply) => {
    if (!(await requireIdentity(request, reply))) return;
    const { capability = "text" } = request.query as { capability?: string };
    const { catalogFor } = await import("./ai-router.js");
    try {
      if (capability === "img_out" || capability === "tts" || capability === "vid_out") {
        const { rankGenModels } = await import("./ai-gen/select.js");
        const models = await rankGenModels(capability);
        return { capability, selected: models[0]?.id ?? null, models };
      }
      return await catalogFor(capability as any);
    } catch (err) {
      return reply.code(502).send({ code: "CATALOG_ERROR", message: (err as Error).message });
    }
  });

  app.post("/api/ai/chat", async (request, reply) => {
    const body = (request.body ?? {}) as {
      capability?: string;
      prompt?: string;
      model?: string;
      preferFree?: boolean;
      fileUrl?: string;
    };
    if (!body.prompt) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "prompt richiesto" });
    }

    const capability = (body.capability ?? "text") as "text" | "image" | "audio" | "video";
    const est = estimateTokens(body.prompt);

    const auth = await authorizeAi(request, reply, {
      capability: "text",
      model: body.model ?? "*",
      provider: "openrouter",
      units: ["token_in", "token_out"],
      counts: { token_in: est, token_out: est },
    });
    if (!auth.ok) return;
    if (!auth.meter && !requireSession(request, reply)) return;

    const { chat } = await import("./ai-router.js");
    try {
      const result = await chat({
        capability,
        prompt: body.prompt,
        model: body.model,
        preferFree: auth.meter?.preferFree ?? body.preferFree,
        fileUrl: body.fileUrl,
        meter: auth.meter
          ? {
              tenant: auth.meter.tenant,
              requestId: auth.meter.requestId,
              reservation: auth.meter.reservation,
              flowRunId: flowRunId(request),
              degraded: auth.meter.degraded,
            }
          : undefined,
      });
      return {
        ...result,
        ...(auth.meter
          ? { degraded: auth.meter.degraded, balance: result.billing?.balance ?? null }
          : {}),
      };
    } catch (err) {
      // Fallimento provider: la prenotazione va rilasciata, nessun addebito.
      if (auth.meter) {
        const { releaseReservation } = await import("./metering/repo.js");
        await releaseReservation(
          auth.meter.tenant.tenantId,
          auth.meter.requestId,
          auth.meter.reservation,
          "chat failed",
        ).catch(() => {});
      }
      return reply.code(502).send({ code: "AI_ERROR", message: (err as Error).message });
    }
  });

  app.post("/api/ai/generate", async (request, reply) => {
    const body = (request.body ?? {}) as {
      capability?: string;
      prompt?: string;
      model?: string;
      // img_out
      width?: number;
      height?: number;
      aspectRatio?: string;
      resolution?: string;
      negativePrompt?: string;
      stylePreset?: string;
      variants?: number;
      format?: string;
      seed?: number;
      safeMode?: boolean;
      // tts
      input?: string;
      voice?: string;
      speed?: number;
      responseFormat?: string;
      language?: string;
      // vid_out
      duration?: string;
      imageUrl?: string;
    };
    const capability = body.capability as "img_out" | "tts" | "vid_out" | undefined;
    if (capability !== "img_out" && capability !== "tts" && capability !== "vid_out") {
      return reply.code(400).send({
        code: "BAD_REQUEST",
        message: "capability deve essere img_out | tts | vid_out",
      });
    }

    // Validazione del payload per capability.
    const prompt = body.prompt ?? "";
    let units: "image" | "char" | "video";
    let count: number;
    if (capability === "img_out") {
      if (!prompt) {
        return reply.code(400).send({ code: "BAD_REQUEST", message: "prompt richiesto" });
      }
      units = "image";
      count = Math.min(Math.max(body.variants ?? 1, 1), 4);
    } else if (capability === "tts") {
      if (!body.input) {
        return reply.code(400).send({ code: "BAD_REQUEST", message: "input richiesto" });
      }
      if (body.input.length > 4096) {
        return reply.code(400).send({ code: "BAD_REQUEST", message: "input > 4096 caratteri" });
      }
      units = "char";
      count = body.input.length;
    } else {
      if (!prompt) {
        return reply.code(400).send({ code: "BAD_REQUEST", message: "prompt richiesto" });
      }
      units = "video";
      count = 1;
    }

    // Modello di riferimento per la stima: quello richiesto o il preferito per
    // capability. Il prezzo viene comunque risolto sul modello REALMENTE usato
    // al momento del settle (pattern specifico > wildcard).
    const fallbackModel =
      capability === "img_out"
        ? "venice-sd35"
        : capability === "tts"
          ? "tts-kokoro"
          : "veo3.1-fast-text-to-video";

    const auth = await authorizeAi(request, reply, {
      capability,
      model: body.model ?? fallbackModel,
      provider: "venice",
      units: [units],
      counts: { [units]: count },
    });
    if (!auth.ok) return;
    if (!auth.meter && !requireSession(request, reply)) return;
    if (auth.meter?.degraded && capability !== "tts") {
      // Degradazione: generazione a pagamento bloccata, resta il TTS (costo basso).
      return reply.code(402).send({
        code: "DEGRADED_MODE",
        message: "Crediti quasi esauriti: generazione sospesa. Ricarica per continuare.",
      });
    }

    const meter = auth.meter
      ? {
          tenant: auth.meter.tenant,
          requestId: auth.meter.requestId,
          reservation: auth.meter.reservation,
          flowRunId: flowRunId(request),
          model: body.model,
        }
      : null;

    try {
      const gen = await import("./ai-gen/generate.js");
      if (capability === "img_out") {
        if (!meter) {
          // Metering spento: usa il client Venice diretto (nessun addebito).
          const { generateImage } = await import("./ai-gen/venice.js");
          const chosen = await selectGenModel("img_out", { requested: body.model });
          return await generateImage({
            prompt,
            model: chosen.id,
            width: body.width,
            height: body.height,
            aspectRatio: body.aspectRatio,
            resolution: body.resolution,
            negativePrompt: body.negativePrompt,
            stylePreset: body.stylePreset,
            variants: body.variants,
            format: body.format as any,
            seed: body.seed,
            safeMode: body.safeMode,
          });
        }
        return await gen.generateImageMetered({
          prompt,
          width: body.width,
          height: body.height,
          aspectRatio: body.aspectRatio,
          resolution: body.resolution,
          negativePrompt: body.negativePrompt,
          stylePreset: body.stylePreset,
          variants: body.variants,
          format: body.format as any,
          seed: body.seed,
          safeMode: body.safeMode,
          meter,
        });
      }

      if (capability === "tts") {
        const input = body.input as string;
        if (!meter) {
          const { synthesizeSpeech } = await import("./ai-gen/venice.js");
          const chosen = await selectGenModel("tts", { requested: body.model });
          return await synthesizeSpeech({
            input,
            model: chosen.id,
            voice: body.voice,
            speed: body.speed,
            responseFormat: body.responseFormat as any,
            language: body.language,
          });
        }
        return await gen.synthesizeSpeechMetered({
          input,
          voice: body.voice,
          speed: body.speed,
          responseFormat: body.responseFormat as any,
          language: body.language,
          meter,
        });
      }

      // vid_out: accoda e addebita; il risultato si recupera con /api/ai/video/retrieve.
      if (!meter) {
        const { queueVideo } = await import("./ai-gen/venice.js");
        const chosen = await selectGenModel("vid_out", { requested: body.model });
        return await queueVideo({
          prompt,
          model: chosen.id,
          duration: body.duration ?? "5s",
          aspectRatio: body.aspectRatio,
          negativePrompt: body.negativePrompt,
          seed: body.seed,
          imageUrl: body.imageUrl,
        });
      }
      return await gen.queueVideoMetered({
        prompt,
        duration: body.duration ?? "5s",
        aspectRatio: body.aspectRatio,
        negativePrompt: body.negativePrompt,
        seed: body.seed,
        imageUrl: body.imageUrl,
        meter,
      });
    } catch (err) {
      // Fallimento provider: rilascia la prenotazione (nessun addebito).
      if (meter) {
        const { releaseReservation } = await import("./metering/repo.js");
        await releaseReservation(
          meter.tenant.tenantId,
          meter.requestId,
          meter.reservation,
          "generation failed",
        ).catch(() => {});
      }
      const status = (err as { status?: number }).status;
      return reply
        .code(typeof status === "number" && status >= 400 ? status : 502)
        .send({ code: "GEN_ERROR", message: (err as Error).message });
    }
  });

  // Recupero del job video: nessun nuovo addebito (gia' avvenuto al queue).
  app.post("/api/ai/video/retrieve", async (request, reply) => {
    if (!(await requireIdentity(request, reply))) return;
    const body = (request.body ?? {}) as { queueId?: string; model?: string };
    if (!body.queueId) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "queueId richiesto" });
    }
    try {
      const { retrieveVideo } = await import("./ai-gen/venice.js");
      return await retrieveVideo(body.queueId, body.model ?? "veo3.1-fast-text-to-video");
    } catch (err) {
      const status = (err as { status?: number }).status;
      return reply
        .code(typeof status === "number" && status >= 400 ? status : 502)
        .send({ code: "GEN_ERROR", message: (err as Error).message });
    }
  });

  // --------------------------------------------------- Billing / crediti ---
  app.get("/api/ai/balance", async (request, reply) => {
    if (!meteringActive()) {
      return { metering: false, balance: null, available: null, quota: null };
    }
    const { resolveTenant } = await import("./metering/guard.js");
    const tenant = await resolveTenant(request);
    if (!tenant) {
      return reply.code(401).send({ code: "UNAUTHENTICATED", message: "Identita' tenant non valida" });
    }
    const snap = await balanceSnapshot(tenant.tenantId);
    return { metering: true, tenant: tenant.tenantName, ...snap };
  });

  app.get("/api/ai/usage", async (request, reply) => {
    if (!meteringActive()) return { metering: false, events: [] };
    const { resolveTenant } = await import("./metering/guard.js");
    const tenant = await resolveTenant(request);
    if (!tenant) {
      return reply.code(401).send({ code: "UNAUTHENTICATED", message: "Identita' tenant non valida" });
    }
    const { limit = "50" } = request.query as { limit?: string };
    const events = await recentUsage(tenant.tenantId, Math.min(Number(limit) || 50, 200));
    return { metering: true, events };
  });

  // ------------------------------------------------------------ Pipeline ----
  // Pipeline a stadi (P0.3): Brand -> Sito -> Contenuti -> Social.
  // Richiede il metering attivo: i run vivono nello schema `pipeline` con FK
  // verso `metering.tenant`, e ogni task eseguito produce consumo `flow_run`.
  // HITL: nessun run passa a `delivered` senza approvazione esplicita.

  /**
   * Tenant della richiesta per le rotte di pipeline (cookie Console o Bearer
   * key). `null` se il metering e' spento o l'identita' non e' valida.
   */
  async function pipelineTenant(request: FastifyRequest, reply: FastifyReply) {
    if (!meteringActive()) {
      reply.code(503).send({
        code: "METERING_DISABLED",
        message: "La pipeline richiede il metering attivo (METERING_ENABLED=true)",
      });
      return null;
    }
    const { resolveTenant } = await import("./metering/guard.js");
    const tenant = await resolveTenant(request);
    if (!tenant) {
      reply.code(401).send({ code: "UNAUTHENTICATED", message: "Identita' tenant non valida" });
      return null;
    }
    return tenant;
  }

  app.get("/api/pipeline/stages", async (request, reply) => {
    if (!(await pipelineTenant(request, reply))) return;
    const { STAGES } = await import("./pipeline/catalog.js");
    return { stages: STAGES };
  });

  app.post("/api/pipeline/runs", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const body = (request.body ?? {}) as {
      stage?: string;
      title?: string;
      brief?: unknown;
      context?: unknown;
    };
    const { stageSpec } = await import("./pipeline/catalog.js");
    const spec = body.stage ? stageSpec(body.stage) : null;
    if (!spec) {
      return reply.code(400).send({
        code: "BAD_REQUEST",
        message: "stage richiesto (brand | website | content | social)",
      });
    }
    const { openRun } = await import("./pipeline/orchestrator.js");
    const run = await openRun({
      tenantId: tenant.tenantId,
      stage: spec.id,
      title: body.title,
      brief: body.brief,
      context: body.context,
    });
    return reply.code(201).send(run);
  });

  app.get("/api/pipeline/runs", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const { stage, status, limit } = request.query as {
      stage?: string;
      status?: string;
      limit?: string;
    };
    const { listRuns } = await import("./pipeline/repo.js");
    return listRuns(tenant.tenantId, {
      stage,
      status,
      limit: limit ? Number(limit) : undefined,
    });
  });

  app.get("/api/pipeline/runs/:runId", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const { runId } = request.params as { runId: string };
    const { getRun, listTasks, listAssets, runUsageSummary } = await import("./pipeline/repo.js");
    const run = await getRun(tenant.tenantId, runId);
    if (!run) return reply.code(404).send({ code: "NOT_FOUND", message: "Run inesistente" });
    const [tasks, assets, usage] = await Promise.all([
      listTasks(tenant.tenantId, runId),
      listAssets(tenant.tenantId, { runId }),
      runUsageSummary(tenant.tenantId, runId),
    ]);
    return { run, tasks, assets, usage };
  });

  app.get("/api/pipeline/runs/:runId/usage", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const { runId } = request.params as { runId: string };
    const { getRun, runUsageSummary } = await import("./pipeline/repo.js");
    const run = await getRun(tenant.tenantId, runId);
    if (!run) return reply.code(404).send({ code: "NOT_FOUND", message: "Run inesistente" });
    return runUsageSummary(tenant.tenantId, runId);
  });

  /**
   * Esecuzione assistita dei task pendenti: l'esecutore e' iniettato dal
   * chiamante (payload `results` per task). E' il punto in cui la produzione
   * sostituira' l'executor con l'accodamento su Activepieces; qui la logica di
   * stato e di metering (`flow_run`) e' gia' quella definitiva.
   */
  app.post("/api/pipeline/runs/:runId/execute", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const { runId } = request.params as { runId: string };
    const body = (request.body ?? {}) as {
      continueOnError?: boolean;
      meter?: boolean;
      results?: Record<
        string,
        {
          status?: "done" | "failed" | "skipped";
          output?: unknown;
          error?: string | null;
          assets?: Array<{ kind: string; name: string; storageKey: string; mime?: string; meta?: unknown }>;
        }
      >;
    };
    const { orchestrateRun } = await import("./pipeline/orchestrator.js");
    const results = body.results ?? {};
    const result = await orchestrateRun(
      tenant.tenantId,
      runId,
      async (ctx) => {
        const r = results[ctx.task.id];
        if (!r) {
          return { status: "failed", error: "nessun risultato fornito per il task" };
        }
        return {
          status: r.status,
          output: r.output,
          error: r.error ?? null,
          assets: (r.assets ?? []) as any,
        };
      },
      { continueOnError: body.continueOnError, meter: body.meter },
    );
    if (!result.run) return reply.code(404).send({ code: "NOT_FOUND", message: "Run inesistente" });
    return result;
  });

  app.post("/api/pipeline/runs/:runId/approve", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const { runId } = request.params as { runId: string };
    const body = (request.body ?? {}) as { approvedBy?: string };
    const approvedBy = body.approvedBy ?? tenant.email ?? tenant.tenantName;
    const { approveRun } = await import("./pipeline/orchestrator.js");
    const run = await approveRun(tenant.tenantId, runId, approvedBy);
    if (!run) {
      return reply.code(409).send({ code: "INVALID_TRANSITION", message: "Approvazione non ammessa" });
    }
    return run;
  });

  app.post("/api/pipeline/runs/:runId/deliver", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const { runId } = request.params as { runId: string };
    const { deliverRun } = await import("./pipeline/orchestrator.js");
    const run = await deliverRun(tenant.tenantId, runId);
    if (!run) {
      return reply.code(409).send({ code: "INVALID_TRANSITION", message: "Consegna non ammessa" });
    }
    // Canale outbound (P0.6): notifica best-effort, non blocca la consegna.
    const { notifyRunDelivered } = await import("./pipeline/notify.js");
    const fallback: NotifyResult = { sent: false, channel: null };
    const notified = await notifyRunDelivered(tenant.tenantId, run).catch(() => fallback);
    if (!notified.sent && notified.error) {
      request.log.warn({ runId, error: notified.error }, "notifica consegna non inviata");
    }
    return run;
  });

  app.post("/api/pipeline/runs/:runId/retry", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const { runId } = request.params as { runId: string };
    const { retryRun } = await import("./pipeline/orchestrator.js");
    const run = await retryRun(tenant.tenantId, runId);
    if (!run) {
      return reply.code(409).send({ code: "INVALID_TRANSITION", message: "Retry non ammesso" });
    }
    return run;
  });

  /**
   * Export pacchettizzato di un run consegnato (P0.6): manifest JSON con i
   * deliverable approvati/consegnati (metadati + storage key) e il consumo
   * aggregato. E' il "pacchetto consegnabile" del pilota: nessun binario viene
   * incluso, i riferimenti puntano allo storage esterno.
   */
  app.get("/api/pipeline/runs/:runId/export", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const { runId } = request.params as { runId: string };
    const { getRun } = await import("./pipeline/repo.js");
    const run = await getRun(tenant.tenantId, runId);
    if (!run) return reply.code(404).send({ code: "NOT_FOUND", message: "Run inesistente" });

    const { buildRunPackage, runPackageFilename } = await import("./pipeline/package.js");
    const pkg = await buildRunPackage(tenant.tenantId, runId);
    if (!pkg) return reply.code(404).send({ code: "NOT_FOUND", message: "Run inesistente" });

    return reply
      .header("Content-Disposition", `attachment; filename="${runPackageFilename(run)}"`)
      .type("application/json")
      .send(pkg);
  });

  // ------------------------------------------------------ Asset / lead -----
  app.get("/api/pipeline/assets", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const { runId, kind, status, limit } = request.query as {
      runId?: string;
      kind?: string;
      status?: string;
      limit?: string;
    };
    const { listAssets } = await import("./pipeline/repo.js");
    return listAssets(tenant.tenantId, {
      runId,
      kind,
      status,
      limit: limit ? Number(limit) : undefined,
    });
  });

  /**
   * Libreria deliverable raggruppata per famiglia (run/kind/name): una riga per
   * deliverable con la versione piu' recente, quella approvata e il conteggio
   * delle revisioni. E' la vista principale della libreria asset (P0.4).
   */
  app.get("/api/pipeline/assets/families", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const { runId, kind, limit } = request.query as {
      runId?: string;
      kind?: string;
      limit?: string;
    };
    const { listAssetFamilies } = await import("./pipeline/repo.js");
    return listAssetFamilies(tenant.tenantId, {
      runId,
      kind,
      limit: limit ? Number(limit) : undefined,
    });
  });

  /** Storico revisioni della famiglia a cui appartiene l'asset, dalla piu' recente. */
  app.get("/api/pipeline/assets/:assetId/versions", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const { assetId } = request.params as { assetId: string };
    const { listAssetVersions } = await import("./pipeline/repo.js");
    const versions = await listAssetVersions(tenant.tenantId, assetId);
    if (!versions.length) {
      return reply.code(404).send({ code: "NOT_FOUND", message: "Asset inesistente" });
    }
    return { versions };
  });

  /** Sottomette un deliverable alla revisione umana (`draft -> in_review`). */
  app.post("/api/pipeline/assets/:assetId/submit", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const { assetId } = request.params as { assetId: string };
    const { transitionAsset } = await import("./pipeline/repo.js");
    const asset = await transitionAsset(tenant.tenantId, assetId, "in_review", {
      by: tenant.email ?? tenant.tenantName,
    });
    if (!asset) {
      return reply
        .code(409)
        .send({ code: "INVALID_TRANSITION", message: "Sottomissione non ammessa dallo stato corrente" });
    }
    return asset;
  });

  app.post("/api/pipeline/assets/:assetId/decide", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const { assetId } = request.params as { assetId: string };
    const body = (request.body ?? {}) as { decision?: string; approvedBy?: string };
    if (body.decision !== "approved" && body.decision !== "rejected") {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "decision: approved | rejected" });
    }
    const { decideAsset } = await import("./pipeline/repo.js");
    const asset = await decideAsset(
      tenant.tenantId,
      assetId,
      body.decision,
      body.approvedBy ?? tenant.email ?? tenant.tenantName,
    );
    if (!asset) {
      return reply.code(409).send({ code: "INVALID_STATE", message: "Asset non decidibile" });
    }
    return asset;
  });

  /**
   * Webhook lead: il form del sito (o un flow Activepieces) invia qui il lead.
   * Non richiede la sessione Console ma una chiave Bearer del tenant.
   */
  app.post("/api/pipeline/leads", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const { createLead, getLead, markLeadNotified } = await import("./pipeline/repo.js");
    const created = await createLead({
      tenantId: tenant.tenantId,
      runId: (body.runId as string) ?? null,
      source: (body.source as string) ?? "website",
      name: (body.name as string) ?? null,
      email: (body.email as string) ?? null,
      phone: (body.phone as string) ?? null,
      message: (body.message as string) ?? null,
      utm: body.utm,
      payload: body,
    });
    // Canale outbound (P0.6): inoltro best-effort del lead, non blocca la 201.
    const { notifyLeadCreated } = await import("./pipeline/notify.js");
    const lead = await getLead(tenant.tenantId, created.id);
    if (lead) {
      const fallback: NotifyResult = { sent: false, channel: null };
      const notified = await notifyLeadCreated(tenant.tenantId, lead).catch(() => fallback);
      if (notified.sent) {
        await markLeadNotified(tenant.tenantId, lead.id).catch(() => undefined);
      } else if (notified.error) {
        request.log.warn({ leadId: lead.id, error: notified.error }, "notifica lead non inviata");
      }
    }
    return reply.code(201).send(created);
  });

  /** Elenco lead del tenant con filtri opzionali + conteggio per stato. */
  app.get("/api/pipeline/leads", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const q = (request.query ?? {}) as { status?: string; runId?: string; limit?: string };
    const { listLeads, leadStatusCounts } = await import("./pipeline/repo.js");
    const { isLeadStatus } = await import("./pipeline/catalog.js");
    if (q.status && !isLeadStatus(q.status)) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: `stato sconosciuto: ${q.status}` });
    }
    const limit = q.limit ? Number.parseInt(q.limit, 10) : undefined;
    const [leads, counts] = await Promise.all([
      listLeads(tenant.tenantId, {
        status: q.status,
        runId: q.runId,
        limit: Number.isFinite(limit) ? limit : undefined,
      }),
      leadStatusCounts(tenant.tenantId),
    ]);
    return { leads, counts };
  });

  /** Avanza un lead nel funnel; 409 se la transizione non e' ammessa. */
  app.patch("/api/pipeline/leads/:id", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { status?: string };
    const { isLeadStatus } = await import("./pipeline/catalog.js");
    if (!body.status || !isLeadStatus(body.status)) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "status valido richiesto" });
    }
    const { getLead, updateLeadStatus } = await import("./pipeline/repo.js");
    const before = await getLead(tenant.tenantId, id);
    if (!before) return reply.code(404).send({ code: "NOT_FOUND", message: "Lead inesistente" });
    const updated = await updateLeadStatus(tenant.tenantId, id, body.status);
    if (!updated) {
      return reply
        .code(409)
        .send({ code: "INVALID_TRANSITION", message: `${before.status} -> ${body.status} non ammessa` });
    }
    return updated;
  });

  app.get("/api/pipeline/integrations", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const { listIntegrationCredentials } = await import("./pipeline/repo.js");
    return listIntegrationCredentials(tenant.tenantId);
  });

  app.post("/api/pipeline/integrations", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const body = (request.body ?? {}) as {
      provider?: string;
      kind?: "oauth" | "webhook" | "api_key";
      label?: string;
      secret?: string;
      scopes?: string[];
      meta?: unknown;
    };
    if (!body.provider || !body.secret) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "provider e secret richiesti" });
    }
    const { hasSecretsKey, encryptSecret } = await import("./pipeline/secrets.js");
    if (!hasSecretsKey()) {
      return reply.code(503).send({
        code: "SECRETS_KEY_MISSING",
        message: "CONSOLE_SECRETS_KEY non configurata: impossibile cifrare il segreto",
      });
    }
    const { saveIntegrationCredential } = await import("./pipeline/repo.js");
    const saved = await saveIntegrationCredential({
      tenantId: tenant.tenantId,
      provider: body.provider,
      kind: body.kind,
      label: body.label,
      secretEnc: encryptSecret(body.secret),
      scopes: body.scopes,
      meta: body.meta,
    });
    const { secret_enc: _omit, ...safe } = saved;
    return reply.code(201).send(safe);
  });

  app.post("/api/pipeline/integrations/:id/revoke", async (request, reply) => {
    const tenant = await pipelineTenant(request, reply);
    if (!tenant) return;
    const { id } = request.params as { id: string };
    const { revokeIntegrationCredential } = await import("./pipeline/repo.js");
    const ok = await revokeIntegrationCredential(tenant.tenantId, id);
    if (!ok) return reply.code(404).send({ code: "NOT_FOUND", message: "Integrazione inesistente" });
    return { ok: true };
  });
}
