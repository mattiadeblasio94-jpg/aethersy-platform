// research/report.ts — report di ricerca con fonti reali, riutilizzabili come
// contesto nei prompt della pipeline e come deliverable a se' stante.
//
// Il report e' un markdown pronto da leggere: sintesi, dati verificabili con
// la fonte accanto, elenco finale delle fonti con URL. Quando il provider con
// ricerca non e' raggiungibile si ricade sulla SERP (DuckDuckGo/Wikipedia) e il
// report dichiara esplicitamente che e' un digest di risultati, non una
// sintesi verificata.

import {
  perplexitySearch,
  releaseResearch,
  reserveResearch,
  webSearch,
  type ResearchMeter,
  type ResearchSource,
} from "./search.js";

export interface ResearchReport {
  topic: string;
  markdown: string;
  sources: ResearchSource[];
  provider: string;
  degraded: boolean;
  note: string | null;
}

interface CacheEntry {
  at: number;
  report: ResearchReport;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Elenco fonti finale, numerato e cliccabile. */
export function formatSources(sources: ResearchSource[]): string {
  if (sources.length === 0) return "";
  const lines = sources.map((source, index) => {
    const snippet = source.snippet ? ` — ${source.snippet.slice(0, 220)}` : "";
    return `${index + 1}. [${source.title}](${source.url})${snippet}`;
  });
  return `\n\n## Fonti verificate\n\n${lines.join("\n")}`;
}

/**
 * Report di ricerca su un tema. Se `meter` e' presente la chiamata al provider
 * e' metrata come una normale chiamata di testo.
 */
export async function researchReport(
  topic: string,
  opts: { questions?: string[]; meter?: ResearchMeter; maxSources?: number } = {},
): Promise<ResearchReport> {
  const questions = (opts.questions ?? []).filter(Boolean).slice(0, 6);
  const query = [
    `Tema: ${topic}`,
    questions.length ? `Domande da approfondire:\n${questions.map((q) => `- ${q}`).join("\n")}` : "",
    "Consegna: una sintesi operativa in italiano, in 3-6 paragrafi, con i dati verificabili e la fonte accanto a ogni dato.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const result = await perplexitySearch(query, { meter: opts.meter, maxTokens: 1500 });
    const sources = result.sources.slice(0, opts.maxSources ?? 12);
    const markdown = [
      `# Ricerca: ${topic}`,
      "",
      `_Provider: ${result.provider} · fonti: ${sources.length}_`,
      "",
      result.answer ?? "",
      formatSources(sources),
    ].join("\n");
    return {
      topic,
      markdown,
      sources,
      provider: result.provider,
      degraded: false,
      note: null,
    };
  } catch (err) {
    if (opts.meter) await releaseResearch(opts.meter, `research failed: ${(err as Error).message}`);
    const search = await webSearch(topic, 8).catch(() => null);
    if (!search || search.sources.length === 0) {
      return {
        topic,
        markdown: `# Ricerca: ${topic}\n\nRicerca non disponibile al momento: ${(err as Error).message}`,
        sources: [],
        provider: "none",
        degraded: true,
        note: `Provider di ricerca non raggiungibili: ${(err as Error).message}`,
      };
    }
    const digest = search.sources
      .map(
        (source, index) =>
          `### ${index + 1}. ${source.title}\n\n${source.snippet || "Nessun estratto disponibile."}\n\n${source.url}`,
      )
      .join("\n\n");
    return {
      topic,
      markdown: [
        `# Ricerca: ${topic}`,
        "",
        `_Provider: ${search.provider} (digest di risultati, non sintesi verificata) · fonti: ${search.sources.length}_`,
        "",
        digest,
        formatSources(search.sources),
      ].join("\n"),
      sources: search.sources,
      provider: search.provider,
      degraded: true,
      note: search.note ?? `Provider con ricerca non raggiungibile: ${(err as Error).message}`,
    };
  }
}

/**
 * Contesto compatto di ricerca da iniettare nei prompt dei task: massimo
 * 6000 caratteri per non inflare il costo dei token.
 */
export async function researchContext(
  topic: string,
  opts: { questions?: string[]; meter?: ResearchMeter } = {},
): Promise<{ text: string; sources: ResearchSource[]; provider: string }> {
  if (!topic.trim()) return { text: "", sources: [], provider: "none" };
  const key = `${slug(topic)}::${(opts.questions ?? []).join("|")}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { text: hit.report.markdown, sources: hit.report.sources, provider: hit.report.provider };
  }

  const report = await researchReport(topic, opts);
  cache.set(key, { at: Date.now(), report });

  const text = [
    "## Contesto di ricerca reale (fonti verificate)",
    "",
    "Usa questi dati per i fatti verificabili. Non contraddirli e non inventarne di nuovi:",
    "se serve un dato non coperto, dichiaralo come assunzione.",
    "",
    report.markdown.slice(0, 6000),
  ].join("\n");

  return { text, sources: report.sources, provider: report.provider };
}

/** Estrae il tema di ricerca da un brief libero (stringa o oggetto). */
export function topicFromBrief(brief: unknown): string {
  if (typeof brief === "string") return brief.trim().slice(0, 300);
  if (!brief || typeof brief !== "object") return "";
  const record = brief as Record<string, unknown>;
  const candidates = [
    record.obiettivo,
    record.goal,
    record.topic,
    record.tema,
    record.idea,
    record.brief,
    record.descrizione,
    record.description,
    record.settore,
    record.industry,
    record.business,
    record.azienda,
    record.company,
    record.nome,
    record.name,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim().slice(0, 300);
  }
  const values = Object.values(record)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 3)
    .map((value) => value.trim());
  return values[0]?.slice(0, 300) ?? "";
}
