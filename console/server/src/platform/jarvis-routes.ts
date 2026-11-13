// =============================================================================
// Jarvis — punto d'ingresso vocale della piattaforma (Fase 35).
//
// La piattaforma non ospita il modello: inoltra a Jarvis (VPS dedicato,
// API OpenAI-compatibile) la chat e l'audio da trascrivere. Jarvis agisce poi
// sulla piattaforma con i suoi tool (aethersy_control, aethersy_change, ...),
// autenticandosi con le credenziali del tenant.
//
// Tre rotte:
//   GET  /api/platform/jarvis/status    -> Jarvis e' raggiungibile?
//   POST /api/platform/jarvis/chat      -> domanda (testo) -> risposta
//   POST /api/platform/jarvis/transcribe -> audio (binary) -> testo
//
// Nessuna rotta e' attiva se `JARVIS_BASE_URL` non e' configurata.
// =============================================================================

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { requireMeteredTenant } from "./guard.js";

function jarvisDisabled(reply: FastifyReply): void {
  reply.code(503).send({
    code: "JARVIS_DISABLED",
    message: "Jarvis non e' configurato su questo ambiente (JARVIS_BASE_URL assente).",
  });
}

function jarvisHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.jarvisApiKey) headers.authorization = `Bearer ${config.jarvisApiKey}`;
  return headers;
}

/** Contesto del tenant passato a Jarvis: chi e' l'utente e cosa puo' fare. */
async function jarvisContext(
  tenant: { tenantId: string; email: string | null },
): Promise<Record<string, unknown>> {
  const { listMemory } = await import("../business/repo.js");
  const memory = await listMemory(tenant.tenantId, { limit: 40 }).catch(() => []);
  return {
    tenantId: tenant.tenantId,
    userEmail: tenant.email,
    memory: memory.map((entry) => ({
      title: entry.title,
      path: entry.path,
      kind: entry.kind,
      pinned: entry.pinned,
      content: entry.content.slice(0, 1200),
    })),
  };
}

export async function registerJarvisRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/platform/jarvis/status", async (_request, reply) => {
    if (!config.jarvisBaseUrl) {
      return reply.send({
        enabled: false,
        reachable: false,
        message: "Jarvis non configurato su questo ambiente.",
      });
    }
    try {
      const res = await fetch(`${config.jarvisBaseUrl}/v1/speech/health`, {
        headers: jarvisHeaders(),
        signal: AbortSignal.timeout(8000),
      });
      return reply.send({
        enabled: true,
        reachable: res.ok,
        speech: res.ok ? await res.json().catch(() => null) : null,
      });
    } catch {
      return reply.send({ enabled: true, reachable: false, speech: null });
    }
  });

  app.post("/api/platform/jarvis/chat", async (request, reply) => {
    if (!config.jarvisBaseUrl) return jarvisDisabled(reply);
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;

    const body = (request.body ?? {}) as { message?: string; history?: unknown[] };
    const message = body.message?.trim();
    if (!message) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "Scrivi il messaggio per Jarvis." });
    }

    const context = await jarvisContext(tenant);
    try {
      const res = await fetch(`${config.jarvisBaseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: jarvisHeaders(),
        body: JSON.stringify({
          model: config.jarvisModel,
          messages: [
            {
              role: "system",
              content:
                "Sei Jarvis, l'assistente della piattaforma Aethersy. Rispondi in italiano, in breve, " +
                "usando i tool a disposizione per i dati reali (mai inventare numeri). " +
                "Il contesto memoria del tenant e' la sua base di conoscenza.",
            },
            ...(Array.isArray(body.history) ? body.history : []),
            { role: "user", content: message },
          ],
          user: context.userEmail,
          metadata: context,
        }),
        signal: AbortSignal.timeout(config.jarvisTimeoutMs),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        return reply.code(res.status >= 400 && res.status < 600 ? res.status : 502).send({
          code: "JARVIS_ERROR",
          message:
            (payload as { error?: { message?: string } } | null)?.error?.message ??
            `Jarvis ha risposto ${res.status}`,
        });
      }
      return reply.send(payload);
    } catch (err) {
      return reply.code(502).send({
        code: "JARVIS_UNREACHABLE",
        message: (err as Error).message,
      });
    }
  });

  // Trascrizione vocale: l'audio arriva grezzo (webm/ogg/wav) e viene passato
  // a Jarvis (faster-whisper locale sul suo VPS).
  app.post("/api/platform/jarvis/transcribe", async (request, reply) => {
    if (!config.jarvisBaseUrl) return jarvisDisabled(reply);
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;

    const body = request.body as Buffer | undefined;
    if (!body || body.length === 0) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "Audio mancante." });
    }
    const contentType = String(request.headers["content-type"] ?? "audio/webm");
    try {
      const res = await fetch(`${config.jarvisBaseUrl}/v1/speech/transcribe`, {
        method: "POST",
        headers: {
          ...(config.jarvisApiKey ? { authorization: `Bearer ${config.jarvisApiKey}` } : {}),
          "content-type": contentType,
        },
        body: new Uint8Array(body),
        signal: AbortSignal.timeout(config.jarvisTimeoutMs),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        return reply.code(res.status >= 400 && res.status < 600 ? res.status : 502).send({
          code: "JARVIS_TRANSCRIBE_FAILED",
          message:
            (payload as { detail?: string } | null)?.detail ??
            (payload as { message?: string } | null)?.message ??
            `Trascrizione fallita (${res.status})`,
        });
      }
      return reply.send(payload);
    } catch (err) {
      return reply.code(502).send({
        code: "JARVIS_UNREACHABLE",
        message: (err as Error).message,
      });
    }
  });
}
