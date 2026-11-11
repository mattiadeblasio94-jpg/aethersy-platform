// agents/droid-runner.ts — esecuzione REALE di uno specialista.
//
// Fino alla Fase 30 i 12 "droid" erano solo persona in un prompt: la pagina
// Agenti offriva solo l'attivazione dei flow Activepieces, e per gli agenti
// interni non esisteva alcun comando. Qui ogni specialista ha un'azione
// eseguibile: apre un run di pipeline mirato, esegue i propri task con
// l'esecutore reale (ricerca web, generazione immagini, copy, sito) e lascia
// i deliverable in revisione.
//
// Il comando e' sempre esplicito: niente esecuzioni in background non
// richieste, niente simulazioni.

import { droidProfile } from "../platform/catalog.js";
import { openRun, orchestrateRun, type TaskOutcome } from "../pipeline/orchestrator.js";
import { buildAiExecutor } from "../pipeline/executor.js";
import { stageSpec, type StageId } from "../pipeline/catalog.js";

export interface DroidActionSpec {
  droid: string;
  /** Stadio in cui lo specialista lavora quando l'utente non ne indica uno. */
  stage: StageId;
  /** Descrizione di cosa succede quando lo specialista viene avviato. */
  capability: string;
  /** Specialista: e' quello che il comando esegue. */
  does: string;
}

const ACTIONS: Record<string, DroidActionSpec> = {
  compass: {
    droid: "compass",
    stage: "brand",
    capability: "Apre il piano di lavoro: obiettivo, ambito, criteri di accettazione e priorita'.",
    does: "Piano operativo e roadmap del lavoro",
  },
  atlas: {
    droid: "atlas",
    stage: "social",
    capability: "Prepara il piano di pubblicazione e la coda operativa dei contenuti social.",
    does: "Coda editoriale social e scheduling",
  },
  forge: {
    droid: "forge",
    stage: "website",
    capability: "Costruisce il sito: sitemap, wireframe e pagine.",
    does: "Sitemap, wireframe e build delle pagine",
  },
  prism: {
    droid: "prism",
    stage: "brand",
    capability: "Definisce la direzione visiva e genera gli asset grafici reali del progetto.",
    does: "Moodboard, design token e immagini generate",
  },
  quill: {
    droid: "quill",
    stage: "content",
    capability: "Scrive i testi: copy delle pagine, articoli e calendario editoriale.",
    does: "Copy e contenuti editoriali",
  },
  beacon: {
    droid: "beacon",
    stage: "content",
    capability: "Analizza il mercato: keyword reali, gap di contenuto e piano SEO.",
    does: "Keyword research e piano SEO",
  },
  lens: {
    droid: "lens",
    stage: "content",
    capability: "Costruisce la mappa di linking interno tra i contenuti.",
    does: "Mappa di linking interno",
  },
  scout: {
    droid: "scout",
    stage: "brand",
    capability: "Va sul web: benchmark, prezzi di mercato, disponibilita' dei domini e fonti.",
    does: "Ricerca web con fonti verificabili",
  },
  probe: {
    droid: "probe",
    stage: "website",
    capability: "Verifica il sito: link, form, accessibilita' e prestazioni.",
    does: "Test di qualita' del sito",
  },
  orbit: {
    droid: "orbit",
    stage: "website",
    capability: "Porta online il sito: pubblicazione, sitemap e base SEO.",
    does: "Pubblicazione del sito e meta SEO",
  },
  vault: {
    droid: "vault",
    stage: "brand",
    capability: "Verifica la proprieta' intellettuale: trademark e fonti con avvertenze.",
    does: "Check trademark e fonti",
  },
  echo: {
    droid: "echo",
    stage: "social",
    capability: "Prepara le risposte a commenti e DM in base al tono di voce del brand.",
    does: "Bozze di risposta a commenti e DM",
  },
};

export interface DroidRunRequest {
  tenantId: string;
  droidId: string;
  /** Istruzione in linguaggio naturale: cosa deve fare lo specialista. */
  instruction: string;
  /** Stadio imposto dall'utente (altrimenti quello naturale del droid). */
  stage?: StageId;
  /** Contesto aggiuntivo (brand, sito, pubblico...). */
  context?: unknown;
}

export interface DroidRunResult {
  droid: string;
  runId: string;
  stage: StageId;
  title: string;
  outcomes: TaskOutcome[];
  credits: number;
  failed: boolean;
  message: string;
}

/** Elenco delle azioni eseguibili, per la UI e per la verifica. */
export function droidActions(): DroidActionSpec[] {
  return Object.values(ACTIONS);
}

/** Verifica che l'id sia uno specialista noto e che l'azione sia eseguibile. */
export function resolveDroidAction(droidId: string): DroidActionSpec | null {
  const action = ACTIONS[droidId];
  if (!action) return null;
  const profile = droidProfile(droidId);
  if (!profile) return null;
  return action;
}

/**
 * Avvia lo specialista: apre un run mirato e esegue i suoi task.
 * Il run resta in revisione umana: nessuna pubblicazione automatica.
 */
export async function runDroid(request: DroidRunRequest): Promise<DroidRunResult> {
  const action = resolveDroidAction(request.droidId);
  if (!action) throw new Error(`specialista sconosciuto: ${request.droidId}`);

  const profile = droidProfile(request.droidId);
  const stage = request.stage ?? action.stage;
  if (!stageSpec(stage)) throw new Error(`stadio sconosciuto: ${stage}`);

  const instruction = request.instruction.trim();
  if (instruction.length < 5) {
    throw new Error("Descrivi cosa deve fare lo specialista (almeno 5 caratteri).");
  }

  const run = await openRun({
    tenantId: request.tenantId,
    stage,
    title: `${profile?.name ?? request.droidId}: ${instruction.slice(0, 80)}`,
    brief: {
      request: instruction,
      droid: request.droidId,
      capability: action.capability,
      source: "droid-run",
    },
    context: {
      ...(typeof request.context === "object" && request.context !== null
        ? (request.context as Record<string, unknown>)
        : {}),
      droidRun: true,
      droidName: profile?.name ?? request.droidId,
    },
  });

  const result = await orchestrateRun(
    request.tenantId,
    run.id,
    buildAiExecutor(),
    { continueOnError: true, onlyDroid: request.droidId },
  );

  const done = result.outcomes.filter((o) => o.status === "done").length;
  const assets = result.outcomes.reduce((sum, o) => sum + o.assets, 0);

  return {
    droid: request.droidId,
    runId: run.id,
    stage,
    title: run.title,
    outcomes: result.outcomes,
    credits: result.credits,
    failed: result.failed,
    message:
      done > 0
        ? `${profile?.name ?? request.droidId} ha completato ${done} attivita' e prodotto ${assets} deliverable.`
        : `${profile?.name ?? request.droidId} non ha prodotto deliverable: ${result.outcomes[0]?.error ?? "errore sconosciuto"}`,
  };
}
