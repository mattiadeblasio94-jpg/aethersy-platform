// platform/idea.ts — "Realizza la mia idea": dall'input concreto al risultato.
//
// Il punto di partenza e' un brief strutturato (obiettivo, pubblico, settore,
// tono, riferimenti, dominio). Da qui la piattaforma crea i run reali della
// pipeline, li esegue con l'esecutore AI vero e, per lo stadio web, pubblica
// il sito su un URL pubblico.
//
// Niente simulazioni: ogni fase produce deliverable persistiti e, quando
// esiste, un sito online con pagine reali.

import { createRun, getRun } from "../pipeline/repo.js";
import { stageSpec, type StageId } from "../pipeline/catalog.js";
import { orchestrateRun } from "../pipeline/orchestrator.js";
import { buildAiExecutor } from "../pipeline/executor.js";
import { buildAndPublishSite } from "./site-build.js";
import { publicBaseUrl } from "../public-url.js";
import { tenantById } from "../metering/repo.js";

export interface IdeaInput {
  /** Cosa vuoi realizzare: e' il campo che rende l'idea concreta. */
  objective: string;
  /** Per chi e' il risultato (clienti, utenti, stakeholder). */
  audience?: string;
  /** Settore/mercato in cui operi. */
  sector?: string;
  /** Nome del brand o dell'azienda. */
  brand?: string;
  /** Tono di voce: professionale | amichevole | tecnico | ispirato. */
  tone?: string;
  /** Lingua del contenuto (default: it). */
  language?: string;
  /** Stadi da produrre: website (default), content, social, brand. */
  outputs?: string[];
  /** Riferimenti: URL, materiali, riferimenti di mercato. */
  references?: string[];
  /** Dominio desiderato (verificato con DNS reale). */
  domain?: string;
  /** Citta'/paese per i contenuti locali. */
  location?: string;
}

export interface IdeaRunPlan {
  runId: string;
  stage: StageId;
  title: string;
  tasks: number;
}

export interface IdeaResult {
  title: string;
  brief: Record<string, unknown>;
  runs: IdeaRunPlan[];
  /** Sito pubblicato (stadio website), se la pubblicazione e' riuscita. */
  site: { slug: string; url: string; pages: number } | null;
  warnings: string[];
}

const KNOWN_STAGES: StageId[] = ["website", "content", "social", "brand"];

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanList(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => clean(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

/**
 * Normalizza l'input e produce il brief strutturato + i run da eseguire.
 * L'input e' sempre obbligatorio e concreto: senza obiettivo non si parte.
 */
export async function planIdea(
  tenantId: string,
  input: IdeaInput,
): Promise<{ title: string; brief: Record<string, unknown>; stages: StageId[]; warnings: string[] }> {
  const warnings: string[] = [];
  const objective = clean(input.objective, 2000);
  if (objective.length < 10) {
    throw new Error("Descrivi in almeno 10 caratteri cosa vuoi realizzare.");
  }

  const audience = clean(input.audience, 500);
  const sector = clean(input.sector, 300);
  const brand = clean(input.brand, 120);
  const tone = clean(input.tone, 60) || "professionale";
  const language = clean(input.language, 20) || "it";
  const location = clean(input.location, 120);
  const domain = clean(input.domain, 200);
  const references = cleanList(input.references, 10, 500);

  let stages = cleanList(input.outputs, 4, 30).filter((item): item is StageId =>
    (KNOWN_STAGES as string[]).includes(item),
  );
  if (stages.length === 0) stages = ["website"];
  if (!stages.includes("website")) {
    warnings.push("Il sito non e' fra gli output richiesti: nessun URL pubblico sara' generato.");
  }
  if (!audience) warnings.push("Pubblico non indicato: il contenuto resta generico.");
  if (!sector) warnings.push("Settore non indicato: la ricerca usa solo l'obiettivo.");

  const title = brand ? `${brand} — ${objective.slice(0, 80)}` : objective.slice(0, 120);

  const brief = {
    idea: {
      objective,
      audience,
      sector,
      brand,
      tone,
      language,
      location,
      domain,
      references,
      outputs: stages,
    },
    // Campi che l'esecutore e i deliverable leggono gia' oggi.
    objective,
    audience,
    sector,
    brand,
    tone,
    language,
    location,
    domain,
    references,
    source: "platform-idea",
  };

  return { title, brief, stages, warnings };
}

/** Crea i run (uno per stadio richiesto) senza eseguirli. */
export async function createIdeaRuns(
  tenantId: string,
  title: string,
  brief: Record<string, unknown>,
  stages: StageId[],
): Promise<IdeaRunPlan[]> {
  const plans: IdeaRunPlan[] = [];
  for (const stage of stages) {
    const spec = stageSpec(stage);
    if (!spec) continue;
    const run = await createRun({ tenantId, stage, title, brief }, spec);
    plans.push({ runId: run.id, stage, title: spec.title, tasks: spec.tasks.length });
  }
  return plans;
}

/**
 * Esegue un run con l'esecutore AI reale. Usata sia dal flusso sincrono
 * (droid) sia dal flusso "idea" in background.
 */
export async function executeIdeaRun(
  tenantId: string,
  runId: string,
): Promise<{ failed: boolean; credits: number; tasks: number }> {
  const result = await orchestrateRun(tenantId, runId, buildAiExecutor(), { continueOnError: true });
  const tasks = result.outcomes.length;
  return {
    failed: result.failed,
    credits: result.credits,
    tasks,
  };
}

/**
 * Esegue l'idea di fine: il run web e' partito, il sito e' online.
 * Usata dal worker in background.
 */
export async function publishIdeaSite(
  tenantId: string,
  runId: string,
): Promise<{ slug: string; url: string; pages: number }> {
  const run = await getRun(tenantId, runId);
  if (!run) throw new Error("run inesistente");
  if (run.stage !== "website") throw new Error("il sito si pubblica solo dallo stadio web");
  const built = await buildAndPublishSite({ tenantId, runId, baseUrl: publicBaseUrl() });
  return { slug: built.slug, url: built.url, pages: built.pages };
}

/** Verifica che il tenant esista (protezione contro run orfani). */
export async function ideaTenantExists(tenantId: string): Promise<boolean> {
  return Boolean(await tenantById(tenantId));
}
