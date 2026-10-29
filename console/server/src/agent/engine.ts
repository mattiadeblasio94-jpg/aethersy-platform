import crypto from "node:crypto";
import { chat } from "../ai-router.js";
import {
  estimateCredits,
  releaseReservation,
  reserveCredits,
  type TenantContext,
} from "../metering/repo.js";
import { DROIDS, droidProfile } from "../platform/catalog.js";
import { STAGES, type StageId } from "../pipeline/catalog.js";
import { openRun, orchestrateRun } from "../pipeline/orchestrator.js";
import {
  appendMessage,
  businessContext,
  ensureConversation,
  recentMessages,
  type MessageRow,
} from "../business/chat.js";

// Motore degli agenti (P2.1): l'orchestratore della chat centrale.
//
// L'utente scrive in linguaggio naturale. Il motore:
//   1. legge il contesto aziendale (obiettivi, offerta, memoria) + gli ultimi turni;
//   2. classifica l'intento (chiacchierata vs. richiesta di LAVORO);
//   3. se e' lavoro: avvia un run di pipeline sullo stadio giusto (gli agenti
//      specialistici lo eseguono metrato con l'executor AI);
//   4. se e' conversazione: risponde con il modello migliore.
//
// Tutto il consumo AI e' metrato (prenotazione + settle). La risposta del motore
// dice sempre cosa e' successo (risposta diretta o run avviato), senza inventare.

export interface AgentTurn {
  conversationId: string;
  reply: MessageRow;
  action: "reply" | "run_started";
  stage?: StageId;
  runId?: string;
  credits: number;
}

interface Intent {
  kind: "chat" | "work";
  stage: StageId | null;
  title: string;
  brief: string;
}

const STAGE_KEYWORDS: { stage: StageId; words: RegExp }[] = [
  { stage: "brand", words: /brand|logo|palette|tipografia|identit|moodboard|naming|design system/i },
  { stage: "website", words: /sito|website|web|landing|pagine|homepage|wireframe|sitemap|deploy/i },
  { stage: "content", words: /contenut|articol|blog|editoriale|keyword|seo|copy|newsletter/i },
  { stage: "social", words: /social|instagram|linkedin|tiktok|facebook|reel|post|calendario/i },
];

const WORK_SIGNALS =
  /\b(fai|crea|crea(mi)?|costruisci|realizza|genera|prepara|scrivi|progetta|lancia|avvia|metti in piedi|occupati|pensaci|procedi|inizia|lavora|voglio|mi serve|servirebbe|organizza|pianifica)\b/i;

/**
 * Classificatore d'intento a costo zero (euristica): evita una chiamata AI solo
 * per decidere. Conservativo: se non e' chiaramente lavoro, risponde in chat.
 */
export function classifyIntent(text: string): Intent {
  const t = text.trim();
  const work = WORK_SIGNALS.test(t);
  let stage: StageId | null = null;
  for (const { stage: s, words } of STAGE_KEYWORDS) {
    if (words.test(t)) {
      stage = s;
      break;
    }
  }
  // "Voglio un sito" e' lavoro anche senza verbo esplicito, se c'e' uno stadio.
  const isWork = (work && (t.length > 24 || stage !== null)) || (stage !== null && /voglio|serve|mi serve|fammi|dammi/i.test(t));
  const title = t.replace(/\s+/g, " ").slice(0, 90) || "Richiesta";
  return {
    kind: isWork ? "work" : "chat",
    stage: isWork ? (stage ?? "brand") : null,
    title,
    brief: t.slice(0, 2000),
  };
}

const SYSTEM_PROMPT = `Sei l'"AI Operating Officer" di Aethersy: coordini specialisti che costruiscono e fanno crescere l'impresa del cliente.
Rispondi in italiano, in modo professionale e concreto. Non usare emoji. Non inventare dati.
Se ti mancano informazioni, chiedile in una riga. Sii breve: vai al punto.`;

/** Costruisce la cronologia per il modello dai turni recenti. */
function toHistory(messages: MessageRow[]): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "agent")
    .map((m) => ({ role: m.role === "user" ? ("user" as const) : ("assistant" as const), content: m.content }));
}

/**
 * Gestisce un turno utente: persiste il messaggio, decide, agisce e risponde.
 * `tenant` e' gia' autenticato dal guard della rotta.
 */
export async function handleTurn(
  tenant: TenantContext,
  input: { conversationId?: string | null; text: string; autoStartRun?: boolean },
): Promise<AgentTurn> {
  const text = input.text.trim();
  if (!text) throw new Error("testo mancante");

  const conversation = await ensureConversation(tenant.tenantId, input.conversationId, text.slice(0, 80));
  await appendMessage({
    tenantId: tenant.tenantId,
    conversationId: conversation.id,
    role: "user",
    content: text,
  });

  const intent = classifyIntent(text);

  if (intent.kind === "work" && input.autoStartRun !== false && intent.stage) {
    const run = await openRun({
      tenantId: tenant.tenantId,
      stage: intent.stage,
      title: intent.title,
      brief: { request: intent.brief, source: "chat" },
      context: { conversationId: conversation.id },
    });
    const spec = STAGES.find((s) => s.id === intent.stage);
    const replyText = [
      `Ho aperto uno stadio "${spec?.title ?? intent.stage}" per la tua richiesta.`,
      `Gli specialisti assegnati (${(spec?.droids ?? []).map((d) => droidProfile(d)?.name ?? d).join(", ")}) lo eseguiranno`,
      `e ti presenteranno i deliverable per l'approvazione.`,
      `Run: ${run.id}`,
    ].join(" ");
    const reply = await appendMessage({
      tenantId: tenant.tenantId,
      conversationId: conversation.id,
      role: "agent",
      content: replyText,
      meta: { action: "run_started", stage: intent.stage, runId: run.id },
    });
    // Esegue il run in background: gli agenti lavorano davvero (metrato) senza
    // far attendere la risposta HTTP. Il run resta consultabile via /api/pipeline.
    void runInBackground(tenant.tenantId, run.id, conversation.id);
    return { conversationId: conversation.id, reply, action: "run_started", stage: intent.stage, runId: run.id, credits: 0 };
  }

  // Conversazione: risposta con contesto aziendale + cronologia.
  const [biz, history] = await Promise.all([
    businessContext(tenant.tenantId).catch(() => ""),
    recentMessages(tenant.tenantId, conversation.id, 12),
  ]);
  const prompt = [
    biz ? `Contesto del cliente:\n${biz}\n` : "",
    `Richieste recenti e risposte:\n${toHistory(history)
      .map((h) => `${h.role === "user" ? "Utente" : "Tu"}: ${h.content}`)
      .join("\n")}`,
    `\nMessaggio attuale dell'utente: ${text}`,
  ]
    .filter(Boolean)
    .join("\n");

  const requestId = `chat:${conversation.id}:${crypto.randomUUID().slice(0, 8)}`;
  const est = Math.max(1, Math.ceil(prompt.length / 4));
  const estimate = await estimateCredits(tenant, {
    capability: "text",
    model: "*",
    provider: "openrouter",
    units: ["token_in", "token_out"],
    counts: { token_in: est, token_out: est },
  });
  const res = await reserveCredits(tenant.tenantId, requestId, estimate);
  const reserved = res.ok ? res.reserved : 0;

  let answer: string;
  let credits = 0;
  try {
    const result = await chat({
      capability: "text",
      prompt: `${SYSTEM_PROMPT}\n\n${prompt}`,
      preferFree: true,
      meter: { tenant, requestId, reservation: reserved, flowRunId: null, degraded: false },
    });
    answer = result.answer;
    credits = result.billing?.credits ?? 0;
  } catch (err) {
    await releaseReservation(tenant.tenantId, requestId, reserved, "chat turn failed").catch(() => {});
    throw err;
  }

  const reply = await appendMessage({
    tenantId: tenant.tenantId,
    conversationId: conversation.id,
    role: "agent",
    content: answer,
    credits,
    meta: { action: "reply" },
  });
  return { conversationId: conversation.id, reply, action: "reply", credits };
}

/**
 * Esegue un run di pipeline con l'executor AI reale, in background. Non deve mai
 * far fallire la richiesta HTTP: gli errori vengono annotati come messaggio di
 * sistema nella conversazione (l'utente vede cosa e' successo).
 */
async function runInBackground(tenantId: string, runId: string, conversationId: string): Promise<void> {
  try {
    const { buildAiExecutor } = await import("../pipeline/executor.js");
    const result = await orchestrateRun(tenantId, runId, buildAiExecutor(), { continueOnError: true });
    const done = result.outcomes.filter((o) => o.status === "done").length;
    const failed = result.outcomes.filter((o) => o.status === "failed").length;
    await appendMessage({
      tenantId,
      conversationId,
      role: "system",
      content: [
        `Esecuzione completata: ${done} task riusciti${failed ? `, ${failed} falliti` : ""}.`,
        `Deliverable pronti per la revisione.`,
      ].join(" "),
      credits: result.credits,
      meta: { action: "run_finished", runId, outcomes: result.outcomes },
    });
  } catch (err) {
    await appendMessage({
      tenantId,
      conversationId,
      role: "system",
      content: `Esecuzione interrotta: ${(err as Error).message}`,
      meta: { action: "run_error", runId },
    }).catch(() => {});
  }
}

/** Roster arricchito per la UI (droid + reparto), con lo stadio corrente. */
export function rosterView(): {
  id: string;
  name: string;
  role: string;
  department: string;
  tagline: string;
  skills: string[];
  stages: string[];
}[] {
  return DROIDS.map((d) => ({
    id: d.id,
    name: d.name,
    role: d.role,
    department: d.department,
    tagline: d.tagline,
    skills: [...d.skills],
    stages: [...d.stages],
  }));
}
