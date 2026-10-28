import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { apFetch, ApError, toFlowView, toRunView } from "./ap.js";
import { config } from "./config.js";
import { clearSessionCookie, getSession, setSessionCookie, type Session } from "./session.js";
import { meteringActive } from "./metering/db.js";
import { authorizeAi, flowRunId, estimateTokens } from "./metering/guard.js";
import { balanceSnapshot, recentUsage } from "./metering/repo.js";
import { selectGenModel } from "./ai-gen/select.js";

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
}
