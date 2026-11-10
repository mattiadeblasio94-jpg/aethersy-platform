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
import { renderDeliverablePdf } from "./pdf.js";
import { researchContext, researchReport, topicFromBrief } from "../research/report.js";
import { checkDomains, formatDomainChecks } from "../research/domain.js";
import { releaseResearch, reserveResearch } from "../research/search.js";

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
function buildPrompt(ctx: TaskContext, bizContext: string, research: string): string {
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
    research ? `\n${research}` : "",
    "",
    "Produci il deliverable del compito: un testo operativo, concreto e professionale, in italiano,",
    "pronto da revisionare dal cliente. Se servono dati che non possiedi, dichiara le assunzioni.",
    "Non inventare fatti verificabili. Non usare emoji. Non racchiudere tutto in un unico blocco di codice.",
  ];
  return lines.filter(Boolean).join("\n");
}

/** Task che per definizione richiedono fonti reali dal web. */
const RESEARCH_TASK_RE =
  /fonti|benchmark|ricerca|competitor|competitiv|analisi (di )?mercato|mercato|trend|prezz|disponibilit/i;

function needsResearch(ctx: TaskContext): boolean {
  return ctx.task.droid === "scout" || ctx.task.droid === "vault" || RESEARCH_TASK_RE.test(ctx.task.title);
}

/** Task che devono produrre un'immagine reale (non una descrizione). */
const IMAGE_TASK_RE = /asset (visiv|grafic)|logo|immagine|visual|creativit/i;

function needsImage(ctx: TaskContext): boolean {
  return (
    IMAGE_TASK_RE.test(ctx.task.title) &&
    ctx.stage.deliverables.some((d) => d.kind === "image")
  );
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
    const topic = topicFromBrief(ctx.brief);

    // Deliverable binari non gestiti qui: produciamo la spec testuale e lo diciamo.
    const binaryKinds = new Set(["image", "video", "audio", "archive"]);
    const wantedBinary = ctx.stage.deliverables.some(
      (d) => d.name.includes(ctx.task.title.toLowerCase()) && binaryKinds.has(d.kind),
    );

    try {
      // --- Ricerca reale -----------------------------------------------------
      // I task di ricerca (scout/vault, benchmark, fonti) non chiedono al
      // modello di ricordare: interrogano il web e consegnano le fonti.
      let answer: string;
      let researchNote: string | null = null;
      const usedResearch = needsResearch(ctx) && topic.length > 0;

      if (usedResearch) {
        const requestId = `research:${ctx.task.id}:${crypto.randomUUID().slice(0, 8)}`;
        const meter = await reserveResearch(tenant, requestId, 1200, ctx.flowRunId ?? null);
        try {
          const report = await researchReport(topic, {
            questions: [ctx.task.title],
            meter,
          });
          const domainPart =
            /domin|nome|domain/i.test(ctx.task.title) && topic.length > 2
              ? formatDomainChecks(await checkDomains(topic.split(/[\s,]+/)[0]))
              : "";
          answer = [
            report.markdown,
            domainPart,
            report.degraded
              ? `\n\n_Nota: la ricerca sintetizzata non era disponibile, il contenuto sopra e' un digest di risultati reali con i relativi link._`
              : "",
          ]
            .filter(Boolean)
            .join("\n");
          if (report.degraded) researchNote = report.note;
        } catch (err) {
          await releaseResearch(meter, `research failed: ${(err as Error).message}`);
          answer = await meteredChat(
            tenant,
            ctx,
            buildPrompt(
              ctx,
              bizContext,
              "Ricerca web non disponibile per questo task: dichiara esplicitamente le assunzioni.",
            ),
          );
        }
      } else {
        // Contesto di ricerca condiviso (cached): copy, SEO e piano editoriale
        // poggiano su dati reali invece che sulla memoria del modello.
        const context = topic
          ? await researchContext(topic).catch(() => ({ text: "", sources: [], provider: "none" }))
          : { text: "", sources: [], provider: "none" };
        answer = await meteredChat(tenant, ctx, buildPrompt(ctx, bizContext, context.text));
      }

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
          research: usedResearch ? "web-research" : "grounded-context",
          researchNote,
          binaryFollowUp: wantedBinary ? "contenuto binario richiesto: generare via /api/ai/generate" : null,
        },
      };

      // Stesso deliverable in PDF professionale (server-side, pdfkit): il
      // markdown resta la sorgente editabile, il PDF e' il file da consegnare.
      // Se la generazione fallisce il task resta valido (solo il .md).
      const assets: TaskExecutionResult["assets"] = [asset];
      try {
        const pdf = await renderDeliverablePdf({
          title: ctx.task.title,
          subtitle: `${ctx.task.droid} · ${ctx.stage.title}`,
          markdown: answer,
        });
        assets.push({
          kind: "document",
          name: asset.name.replace(/\.md$/, ".pdf"),
          storageKey: `inline://pipeline/${ctx.run.id}/${ctx.task.id}/document.pdf`,
          mime: "application/pdf",
          sizeBytes: pdf.length,
          meta: {
            droid: ctx.task.droid,
            stage: ctx.stage.id,
            title: ctx.task.title,
            inline: true,
            binary: true,
            contentBase64: pdf.toString("base64"),
            source: "pdf-renderer",
          },
        });
      } catch (pdfError) {
        console.warn("[pipeline] rendering PDF non riuscito:", (pdfError as Error).message);
      }

      // --- Immagine reale ----------------------------------------------------
      // I task visuali non si fermano alla descrizione: generano il file
      // (Venice -> Replicate -> fal) e lo registrano come asset binario.
      if (needsImage(ctx)) {
        const image = await generateRealImage(tenant, ctx, topic).catch((err) => {
          console.warn("[pipeline] generazione immagine non riuscita:", (err as Error).message);
          return null;
        });
        if (image) assets.push(image);
      }

      return {
        status: "done",
        output: {
          droid: ctx.task.droid,
          stage: ctx.stage.id,
          task: ctx.task.title,
          content: answer,
        },
        assets,
        // L'agente "propone" il deliverable: entra subito in revisione umana.
        submit: true,
      };
    } catch (err) {
      return { status: "failed", error: (err as Error).message };
    }
  };
}

/**
 * Genera un'immagine reale per il task e la registra come asset binario
 * (base64 inline, come gli altri deliverable). Il prompt nasce dal brief e
 * dal contesto di ricerca: il risultato e' un file, non una descrizione.
 */
async function generateRealImage(
  tenant: TenantContext,
  ctx: TaskContext,
  topic: string,
): Promise<import("./orchestrator.js").TaskAsset | null> {
  const { generateImageMetered } = await import("../ai-gen/generate.js");
  const { estimateCredits, reserveCredits } = await import("../metering/repo.js");

  const brief = typeof ctx.brief === "object" ? JSON.stringify(ctx.brief) : String(ctx.brief ?? "");
  const prompt = [
    `Immagine per il task "${ctx.task.title}" dello stadio "${ctx.stage.title}".`,
    topic ? `Soggetto: ${topic}.` : "",
    brief ? `Contesto cliente: ${brief.slice(0, 800)}.` : "",
    "Stile: professionale, pulito, fotografico, adatto a un sito web aziendale.",
    "Nessun testo, nessun logo, nessun watermark.",
  ]
    .filter(Boolean)
    .join(" ");

  const requestId = `image:${ctx.task.id}:${crypto.randomUUID().slice(0, 8)}`;
  const estimate = await estimateCredits(tenant, {
    capability: "image",
    model: "*",
    provider: "fal",
    units: ["image"],
    counts: { image: 1 },
  });
  const reservation = await reserveCredits(tenant.tenantId, requestId, estimate);
  const reserved = reservation.ok ? reservation.reserved : 0;

  const result = await generateImageMetered({
    prompt,
    width: 1024,
    height: 576,
    format: "jpeg",
    meter: {
      tenant,
      requestId,
      reservation: reserved,
      flowRunId: ctx.flowRunId ?? null,
    },
  });

  const url = result.images?.[0];
  if (!url) return null;
  const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
  const extension = result.format === "png" ? "png" : result.format === "webp" ? "webp" : "jpg";

  return {
    kind: "image" as const,
    name: `${ctx.task.seq.toString().padStart(2, "0")}-${ctx.task.droid}-visivo.${extension}`,
    storageKey: `inline://pipeline/${ctx.run.id}/${ctx.task.id}/visual.${extension}`,
    mime: `image/${extension}`,
    sizeBytes: bytes.length,
    meta: {
      droid: ctx.task.droid,
      stage: ctx.stage.id,
      title: ctx.task.title,
      inline: true,
      binary: true,
      contentBase64: bytes.toString("base64"),
      source: `image-generator:${result.model}`,
    },
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
