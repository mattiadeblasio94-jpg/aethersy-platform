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
import {
  insertJarvisEvent,
  listJarvisEvents,
  subscribeJarvisEvents,
  type JarvisEvent,
  type JarvisEventKind,
  type JarvisEventSeverity,
} from "./jarvis-events.js";
import {
  elevenLabsConfigured,
  transcribeSpeech as elevenTranscribeSpeech,
} from "../ai-gen/elevenlabs.js";

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

/**
 * Intenzione del turno: e' l'orientamento che Jarvis usa per decidere se
 * rispondere, eseguire o semplicemente osservare. Serve al prompt e resta
 * nei metadati della chiamata.
 */
export type JarvisIntent = "query" | "command" | "monitor" | "status";

export function detectIntent(message: string): JarvisIntent {
  const text = message.toLowerCase();
  if (/(monitora|controlla|verifica|osserva|avvisami|avvisa|segnala|notifica|sorveglia)/.test(text)) {
    return "monitor";
  }
  if (/(esegui|crea|genera|aggiungi|aggiorna|imposta|lancia|avvia|elimina|cancella|sposta|rinomina|pubblica|deploy|campagna)/.test(text)) {
    return "command";
  }
  if (/(come stai|stato|status|cosa hai fatto|ultime|riassunto|aggiornami|novit)/.test(text)) {
    return "status";
  }
  return "query";
}

/**
 * Prompt di sistema: la personalita' dell'agente vocale.
 *
 * Tre pilastri richiesti dal prodotto:
 *   1. vocalita' neurale (risposte brevi, parlabili, nessun markdown);
 *   2. ascolto continuo (ogni frase e' un comando potenziale);
 *   3. proattivita' e personalita' (gestione di progetti, agenti secondari e
 *      automazioni dell'infrastruttura).
 */
function jarvisSystemPrompt(context: Record<string, unknown>, intent: JarvisIntent): string {
  const role =
    intent === "command"
      ? "L'utente ha chiesto un'azione: eseguila con i tool disponibili e riferisci l'esito in una frase."
      : intent === "monitor"
        ? "L'utente chiede attenzione continua: imposta o verifica il monitoraggio e spiega in una frase cosa controllerai."
        : intent === "status"
          ? "L'utente chiede lo stato: rispondi con i dati reali, in una frase, e segnala solo le cose che richiedono azione."
          : "L'utente ha fatto una domanda: rispondi in modo diretto con i dati reali.";
  return (
    "Sei Jarvis, l'agente vocale di Aethersy: sempre sveglio, mai in attesa di istruzioni. " +
    "Voce: rispondi in italiano, in 1-3 frasi brevi, parlabili ad alta voce. " +
    "Niente markdown, niente elenchi puntati, niente emoji: la tua risposta viene letta ad alta voce. " +
    "Dati: usa sempre i tool per i fatti reali (numeri, ordini, lead, run, memoria). " +
    "Se un dato non e' disponibile, dillo in una parola: non inventare mai. " +
    "Proattivita': il watcher ti segnala gli eventi della piattaforma (lead, ordini, run falliti, saldi). " +
    "Quando un evento richiede attenzione, proponi l'azione concreta e chiedi solo se serve una conferma esplicita. " +
    "Gestione: coordina progetti, agenti specialisti e automazioni della piattaforma; " +
    "quando un lavoro e' lungo, delega ai tool e riferisci l'avanzamento in una riga. " +
    role +
    memoryPrompt(context)
  );
}

/**
 * Memoria del tenant inserita nel prompt di sistema: Jarvis deve partire da
 * quello che il tenant ha gia' scritto, senza dover interrogare un altro
 * account per leggerla.
 */
function memoryPrompt(context: Record<string, unknown>): string {
  const memory = Array.isArray(context.memory) ? (context.memory as { title?: string; path?: string; content?: string }[]) : [];
  if (memory.length === 0) return "";
  const lines = memory
    .slice(0, 20)
    .map((entry) => `### ${entry.title ?? "(senza titolo)"}${entry.path ? ` (${entry.path})` : ""}\n${(entry.content ?? "").slice(0, 600)}`)
    .join("\n\n");
  return `\n\nMemoria del tenant (vault Obsidian):\n${lines}`;
}

/** Estensione del file audio dal content-type del browser (webm/opus, wav, ogg...). */
function audioExtension(contentType: string): string {
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (type.includes("webm")) return "webm";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("mp4") || type.includes("m4a")) return "m4a";
  return "webm";
}

/**
 * Chiamata a Jarvis con catena di modelli: il primario (es. Gemini) viene
 * provato per primo con un budget di tempo, il fallback (NVIDIA) risponde se
 * il primario e' lento o fallisce. In una conversazione in tempo reale la
 * rapidita' conta piu' del modello piu' bravo.
 */
async function askJarvis(
  messages: unknown[],
  metadata: Record<string, unknown>,
): Promise<{ payload: unknown; model: string; fallbackFrom?: string }> {
  const models = [config.jarvisModel, config.jarvisModelFallback].filter(
    (model, index, all) => model && all.indexOf(model) === index,
  );
  let lastError: unknown = null;
  for (let index = 0; index < models.length; index++) {
    const model = models[index];
    const budget =
      index === 0 ? config.jarvisPrimaryTimeoutMs : config.jarvisTimeoutMs;
    try {
      const res = await fetch(`${config.jarvisBaseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: jarvisHeaders(),
        body: JSON.stringify({ model, messages, user: metadata.userEmail, metadata }),
        signal: AbortSignal.timeout(budget),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        lastError = new Error(
          (payload as { error?: { message?: string } } | null)?.error?.message ??
            `Jarvis ha risposto ${res.status}`,
        );
        continue;
      }
      return {
        payload,
        model,
        ...(index > 0 ? { fallbackFrom: models[0] } : {}),
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Jarvis non raggiungibile");
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
    const intent = detectIntent(message);
    const messages = [
      {
        role: "system",
        content: jarvisSystemPrompt(context, intent),
      },
      ...(Array.isArray(body.history) ? body.history : []),
      { role: "user", content: message },
    ];
    try {
      const result = await askJarvis(messages, context);
      const payload = result.payload as Record<string, unknown>;
      if (result.fallbackFrom) {
        return reply.send({
          ...payload,
          aethersy_model_fallback: { from: result.fallbackFrom, to: result.model },
        });
      }
      return reply.send(payload);
    } catch (err) {
      // Degradazione: se il cervello di Jarvis non risponde (quota provider
      // esaurita, rete, timeout) l'agente vocale non deve morire. Si
      // restituisce una risposta parlabile e il flag "degraded", cosi' la
      // UI puo' mostrarlo e Jarvis riprende da solo al turno successivo.
      return reply.send({
        id: `jarvis-degraded-${Date.now()}`,
        object: "chat.completion",
        model: "degraded",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content:
                "Sto ancora ripristinando il collegamento con il mio cervello, riprova tra un momento.",
            },
          },
        ],
        aethersy_degraded: {
          reason: (err as Error).message,
          models: [config.jarvisModel, config.jarvisModelFallback].filter(Boolean),
        },
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
    const extension = audioExtension(contentType);
    // Segmento parziale: il file audio non e' ancora completo, quindi solo il
    // provider cloud lo puo' leggere (whisper fallirebbe sul container roto).
    const partial = String((request.query as { partial?: string } | undefined)?.partial ?? "") === "1";

    // ElevenLabs Scribe: comprensione italiana superiore a whisper su CPU e
    // nessun carico sulla VPS. Se fallisce, si ricade su faster-whisper.
    if (elevenLabsConfigured() && config.elevenLabsSttEnabled) {
      try {
        const text = await elevenTranscribeSpeech({
          audio: body,
          fileName: `audio.${extension}`,
          mimeType: contentType.split(";")[0].trim(),
        });
        if (text) return reply.send({ text, provider: "elevenlabs" });
        if (partial) return reply.send({ text: "", provider: "elevenlabs", partial: true });
      } catch (err) {
        if (partial) {
          // Un segmento parziale non valido non deve fermare la conversazione.
          return reply.send({ text: "", provider: "elevenlabs", partial: true });
        }
        // ElevenLabs non raggiungibile: si continua con il whisper locale.
      }
    }

    try {
      // OpenJarvis accetta il comando come multipart/form-data con il campo
      // "file": il corpo grezzo verrebbe rifiutato ("Missing 'file' field").
      const form = new FormData();
      form.append(
        "file",
        new Blob([new Uint8Array(body)], { type: contentType.split(";")[0].trim() }),
        `audio.${extension}`,
      );
      const res = await fetch(`${config.jarvisBaseUrl}/v1/speech/transcribe`, {
        method: "POST",
        headers: {
          ...(config.jarvisApiKey ? { authorization: `Bearer ${config.jarvisApiKey}` } : {}),
        },
        body: form,
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
      // Degradazione: se il cervello di Jarvis non risponde (quota provider
      // esaurita, rete, timeout) l'agente vocale non deve morire. Si
      // restituisce una risposta parlabile e il flag "degraded", cosi' la
      // UI puo' mostrarlo e Jarvis riprende da solo al turno successivo.
      return reply.send({
        id: `jarvis-degraded-${Date.now()}`,
        object: "chat.completion",
        model: "degraded",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content:
                "Sto ancora ripristinando il collegamento con il mio cervello, riprova tra un momento.",
            },
          },
        ],
        aethersy_degraded: {
          reason: (err as Error).message,
          models: [config.jarvisModel, config.jarvisModelFallback].filter(Boolean),
        },
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Eventi proattivi: il watcher sul VPS dedicato segnala tutto quello che
  // merita attenzione; la pagina /jarvis li riceve in streaming e li annuncia.
  // ---------------------------------------------------------------------------

  /** Ingestione dal watcher: token condiviso + sessione del tenant. */
  app.post("/api/platform/jarvis/events", async (request, reply) => {
    if (!config.jarvisEventsToken) {
      return reply.code(503).send({
        code: "JARVIS_EVENTS_DISABLED",
        message: "JARVIS_EVENTS_TOKEN non configurato: l'ingestione e' disabilitata.",
      });
    }
    const token = String(request.headers["x-jarvis-token"] ?? "");
    if (token !== config.jarvisEventsToken) {
      return reply.code(401).send({ code: "UNAUTHENTICATED", message: "Token evento non valido" });
    }
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;

    const body = (request.body ?? {}) as {
      kind?: string;
      severity?: string;
      title?: string;
      message?: string;
      source?: string;
      meta?: Record<string, unknown>;
    };
    const title = body.title?.trim();
    if (!title) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "Titolo evento mancante." });
    }
    const kinds: JarvisEventKind[] = ["notice", "alert", "task", "insight", "system"];
    const severities: JarvisEventSeverity[] = ["info", "warning", "critical"];
    const event = await insertJarvisEvent({
      tenantId: tenant.tenantId,
      kind: kinds.includes(body.kind as JarvisEventKind) ? (body.kind as JarvisEventKind) : "notice",
      severity: severities.includes(body.severity as JarvisEventSeverity)
        ? (body.severity as JarvisEventSeverity)
        : "info",
      title,
      message: body.message ?? "",
      source: body.source ?? "jarvis",
      meta: body.meta ?? {},
    });
    return reply.code(201).send({ ok: true, event });
  });

  /** Ultimi eventi proattivi del tenant (la UI li carica all'avvio). */
  app.get("/api/platform/jarvis/events", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const query = request.query as { limit?: string } | undefined;
    const limit = Number(query?.limit ?? 30);
    const events = await listJarvisEvents(tenant.tenantId, { limit });
    return reply.send({ events });
  });

  /** Stream SSE: gli eventi proattivi arrivano alla pagina senza polling. */
  app.get("/api/platform/jarvis/stream", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;

    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });

    const write = (event: JarvisEvent) => {
      reply.raw.write(`event: jarvis\ndata: ${JSON.stringify(event)}\n\n`);
    };
    // Gli ultimi eventi riempiono il buffer: chi apre la pagina vede subito
    // cio' che e' successo mentre era chiusa.
    for (const event of await listJarvisEvents(tenant.tenantId, { limit: 5 })) write(event);
    reply.raw.write(": pronto\n\n");

    const unsubscribe = subscribeJarvisEvents(tenant.tenantId, write);
    const heartbeat = setInterval(() => {
      if (!reply.raw.writableEnded) reply.raw.write(": ping\n\n");
    }, 20_000);
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
