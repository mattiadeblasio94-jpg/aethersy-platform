import crypto from "node:crypto";
import { chat } from "../ai-router.js";
import {
  estimateCredits,
  releaseReservation,
  reserveCredits,
  tenantById,
  type TenantContext,
} from "../metering/repo.js";
import { droidProfile } from "../platform/catalog.js";
import type { TaskContext, TaskExecutionResult, TaskExecutor } from "./orchestrator.js";
import { businessContext } from "../business/chat.js";

// Esecutore REALE dei task di pipeline (P2.1).
//
// Sostituisce lo stub "results dal body": per ogni task chiama il router AI con
// il modello migliore disponibile, impersonando lo specialista (droid) a cui il
// task e' assegnato, e produce un deliverable testuale reale registrato come
// asset. Ogni chiamata e' METRATA: prenota il credito stimato, delega l'addebito
// al settle di `chat()` (token-based) e rilascia la prenotazione in caso di
// fallimento del provider.
//
// Nota onesta sui limiti: i deliverable binari (immagini/video/audio) passano per
// Venice in `/api/ai/generate`; qui, per non bloccare l'orchestrazione quando la
// generazione non e' disponibile, il task produce la parte testuale (spec,
// piano, copy, struttura) e la annota in `meta`. Nessun contenuto inventato.

const PERSONA_HEADER = (droid: string): string => {
  const p = droidProfile(droid);
  if (!p) return "Sei uno specialista operativo di Aethersy.";
  return [
    `Sei ${p.name}, ${p.role} di Aethersy. ${p.tagline}`,
    `Competenze: ${p.skills.join(", ")}.`,
  ].join("\n");
};

/** Prompt per il task: specialista + stadio + titolo + brief + contesto aziendale. */
function buildPrompt(ctx: TaskContext, bizContext: string): string {
  const brief = typeof ctx.brief === "object" ? JSON.stringify(ctx.brief) : String(ctx.brief ?? "");
  const runContext = ctx.context ? JSON.stringify(ctx.context).slice(0, 2000) : "";
  const lines = [
    PERSONA_HEADER(ctx.task.droid),
    "",
    `Stai lavorando allo stadio "${ctx.stage.title}" (${ctx.stage.description}) del cliente.`,
    `Compito assegnato: ${ctx.task.title}.`,
    brief && brief !== "{}" ? `Brief del cliente: ${brief.slice(0, 2000)}` : "",
    bizContext ? `\nContesto aziendale del cliente:\n${bizContext}` : "",
    runContext && runContext !== "{}" ? `\nContesto del run: ${runContext}` : "",
    "",
    "Produci il deliverable del compito: un testo operativo, concreto e professionale, in italiano,",
    "pronto da revisionare dal cliente. Se servono dati che non possiedi, dichiara le assunzioni.",
    "Non inventare fatti verificabili. Non usare emoji. Non racchiudere tutto in un unico blocco di codice.",
  ];
  return lines.filter(Boolean).join("\n");
}

/** Titolo breve della conversazione dal primo messaggio. */
function assetName(ctx: TaskContext): string {
  const slug = ctx.task.title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${ctx.task.seq.toString().padStart(2, "0")}-${slug || "task"}.md`;
}

/**
 * Costruisce l'esecutore reale. Ogni `orchestrateRun(..., executor)` lo usa per
 * trasformare i task pianificati in lavoro effettivo e metrato.
 */
export function buildAiExecutor(): TaskExecutor {
  return async (ctx: TaskContext): Promise<TaskExecutionResult> => {
    const tenant = await tenantById(ctx.tenantId);
    if (!tenant) return { status: "failed", error: "tenant inesistente" };

    const bizContext = await businessContext(ctx.tenantId).catch(() => "");
    const prompt = buildPrompt(ctx, bizContext);

    // Deliverable binari non gestiti qui: produciamo la spec testuale e lo diciamo.
    const binaryKinds = new Set(["image", "video", "audio", "archive"]);
    const wantedBinary = ctx.stage.deliverables.some(
      (d) => d.name.includes(ctx.task.title.toLowerCase()) && binaryKinds.has(d.kind),
    );

    try {
      const answer = await meteredChat(tenant, ctx, prompt);
      const asset = {
        kind: "document" as const,
        name: assetName(ctx),
        storageKey: `inline://pipeline/${ctx.run.id}/${ctx.task.id}`,
        mime: "text/markdown",
        sizeBytes: Buffer.byteLength(answer, "utf8"),
        meta: {
          droid: ctx.task.droid,
          stage: ctx.stage.id,
          title: ctx.task.title,
          content: answer,
          inline: true,
          binaryFollowUp: wantedBinary ? "contenuto binario richiesto: generare via /api/ai/generate" : null,
        },
      };
      return {
        status: "done",
        output: {
          droid: ctx.task.droid,
          stage: ctx.stage.id,
          task: ctx.task.title,
          content: answer,
        },
        assets: [asset],
        // L'agente "propone" il deliverable: entra subito in revisione umana.
        submit: true,
      };
    } catch (err) {
      return { status: "failed", error: (err as Error).message };
    }
  };
}

/**
 * Chiamata AI metrata per un task: stima, prenota, esegue, delega l'addebito al
 * settle di `chat()`; in caso di errore rilascia la prenotazione (nessun addebito).
 */
async function meteredChat(tenant: TenantContext, ctx: TaskContext, prompt: string): Promise<string> {
  const requestId = `task:${ctx.task.id}:${crypto.randomUUID().slice(0, 8)}`;
  const est = Math.max(1, Math.ceil(prompt.length / 4));

  const estimate = await estimateCredits(tenant, {
    capability: "text",
    model: "*",
    provider: "openrouter",
    units: ["token_in", "token_out"],
    counts: { token_in: est, token_out: est },
  });

  const reservation = await reserveCredits(tenant.tenantId, requestId, estimate);
  const reserved = reservation.ok ? reservation.reserved : 0;

  try {
    const result = await chat({
      capability: "text",
      prompt,
      preferFree: true,
      meter: {
        tenant,
        requestId,
        reservation: reserved,
        flowRunId: ctx.flowRunId ?? null,
        degraded: false,
      },
    });
    return result.answer;
  } catch (err) {
    await releaseReservation(tenant.tenantId, requestId, reserved, "task executor failed").catch(() => {});
    throw err;
  }
}
