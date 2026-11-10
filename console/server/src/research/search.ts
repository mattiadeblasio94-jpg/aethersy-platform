// research/search.ts — ricerca web REALE.
//
// Fino alla Fase 29 la piattaforma non aveva alcuna ricerca: ogni dato
// verificabile (prezzi, benchmark, fonti) era prodotto dal modello e quindi
// inventato. Questo modulo introduce un motore di ricerca con provider reali,
// verificati live:
//
//   1. perplexity/sonar via OpenRouter  -> ricerca con risposta citata
//                                           (fonti reali in message.annotations)
//   2. DuckDuckGo HTML                  -> SERP reale, nessuna chiave
//   3. Wikipedia API (it)              -> fonti enciclopediche, nessuna chiave
//
// La catena e' degrada in modo esplicito: se un provider fallisce si passa al
// successivo e il risultato dichiara quale provider ha risposto. Non viene mai
// restituito contenuto sintetico etichettato come ricerca.

import { config } from "../config.js";
import {
  estimateCredits,
  recordUsage,
  releaseReservation,
  reserveCredits,
  type TenantContext,
} from "../metering/repo.js";

export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
  provider: string;
}

export interface ResearchResult {
  query: string;
  /** Provider che ha effettivamente risposto. */
  provider: string;
  /** Risposta testuale (solo provider con risposta). */
  answer: string | null;
  sources: ResearchSource[];
  /** true se il provider primario non ha risposto e si e' usato un fallback. */
  degraded: boolean;
  note: string | null;
}

export interface ResearchMeter {
  tenant: TenantContext;
  requestId: string;
  reservation: number;
  flowRunId?: string | null;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/'|'/g, "'")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** DuckDuckGo incapsula l'URL in `uddg`: lo si decodifica per ottenere la
 *  destinazione reale, altrimenti la fonte non e' utilizzabile. */
function decodeDuckUrl(href: string): string {
  try {
    const absolute = href.startsWith("//") ? `https:${href}` : href;
    const url = new URL(absolute);
    const uddg = url.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    if (url.hostname.endsWith("duckduckgo.com")) return url.toString();
    return url.toString();
  } catch {
    return href;
  }
}

/**
 * SERP reale via DuckDuckGo: nessuna chiave richiesta.
 *
 * Il provider e' sensibile alle richieste: con header troppo "completi"
 * risponde 202 con una pagina anti-bot senza risultati. Per questo si prova
 * prima l'endpoint HTML con header minimi e, se non rende, l'endpoint "lite"
 * (che usa un markup diverso). Entrambi sono formati pubblici di DuckDuckGo.
 */
export async function duckduckgoSearch(query: string, limit = 5): Promise<ResearchSource[]> {
  const q = encodeURIComponent(query);
  const attempts: { url: string; headers: Record<string, string> }[] = [
    {
      url: `https://html.duckduckgo.com/html/?q=${q}`,
      headers: { "User-Agent": UA, "Accept-Language": "it-IT,it;q=0.9,en;q=0.8" },
    },
    {
      url: `https://lite.duckduckgo.com/lite/?q=${q}`,
      headers: { "User-Agent": UA, "Accept-Language": "it-IT,it;q=0.9,en;q=0.8" },
    },
  ];

  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        headers: attempt.headers,
        signal: AbortSignal.timeout(20_000),
      });
      const html = await res.text();
      if (res.status === 202 || res.status === 403) {
        lastError = new Error(`DuckDuckGo HTTP ${res.status} (richiesta limitata)`);
        continue;
      }
      if (!res.ok) {
        lastError = new Error(`DuckDuckGo HTTP ${res.status}`);
        continue;
      }
      const parsed = parseDuckResults(html, limit);
      if (parsed.length > 0) return parsed;
      lastError = new Error("DuckDuckGo: nessun risultato nel markup");
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw lastError ?? new Error("DuckDuckGo: nessun risultato");
}

/** Parser comune ai due formati (html e lite): l'ordine degli attributi
 *  cambia tra i due, quindi si isolano le ancore e si filtra per classe. */
function parseDuckResults(html: string, limit: number): ResearchSource[] {
  const snippets = [
    ...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g),
    ...html.matchAll(/class='result-snippet'[^>]*>([\s\S]*?)<\/td>/g),
  ].map((m) => cleanText(m[1]));

  const out: ResearchSource[] = [];
  const seen = new Set<string>();
  const linkRe = /<a\s+([^>]*?)href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = linkRe.exec(html)) && out.length < limit) {
    const attrs = `${match[1]} ${match[3]}`;
    if (!/result__a|result-link/.test(attrs)) continue;
    const href = decodeDuckUrl(match[2]);
    const title = cleanText(match[4]);
    if (!href || !title || seen.has(href)) continue;
    if (!/^https?:\/\//i.test(href)) continue;
    seen.add(href);
    out.push({
      title,
      url: href,
      snippet: snippets[index] ?? "",
      provider: "duckduckgo",
    });
    index += 1;
  }
  return out;
}

/** Ricerca enciclopedica reale su Wikipedia in italiano. */
export async function wikipediaSearch(query: string, limit = 5): Promise<ResearchSource[]> {
  const url = `https://it.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query,
  )}&format=json&srlimit=${limit}&origin=*`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const body = (await res.json()) as {
    query?: { search?: { title: string; snippet: string; pageid: number }[] };
  };
  return (body.query?.search ?? []).map((hit) => ({
    title: hit.title,
    url: `https://it.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`,
    snippet: cleanText(hit.snippet),
    provider: "wikipedia",
  }));
}

interface OpenRouterCitation {
  type?: string;
  url_citation?: { url?: string; title?: string };
}

/**
 * Ricerca con risposta citata via Perplexity (OpenRouter).
 *
 * Le fonti arrivano in `message.annotations` (`url_citation`): sono URL reali
 * che il motore di ricerca ha consultato. La risposta e' metrata come una
 * normale chiamata di testo.
 */
export async function perplexitySearch(
  query: string,
  opts: { meter?: ResearchMeter; maxTokens?: number } = {},
): Promise<ResearchResult> {
  const model = config.researchModel;
  const prompt = [
    "Rispondi in italiano alla domanda usando fonti web reali e verificabili.",
    "Cita ogni dato verificabile con un link markdown alla fonte.",
    "Se un dato non e' documentato, dillo esplicitamente.",
    "",
    query,
  ].join("\n");

  const res = await fetch(`${config.openRouterBase}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openRouterKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://aethersy.online",
      "X-Title": "Aethersy Research",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: opts.maxTokens ?? 1200,
    }),
    signal: AbortSignal.timeout(config.researchTimeoutMs),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${model} HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }

  const body = (await res.json()) as {
    model?: string;
    choices?: {
      message?: { content?: string; annotations?: OpenRouterCitation[] };
    }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const message = body.choices?.[0]?.message ?? {};
  const answer = (message.content ?? "").trim();

  const sources: ResearchSource[] = [];
  const seen = new Set<string>();
  for (const annotation of message.annotations ?? []) {
    const citation = annotation.url_citation;
    const url = citation?.url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({
      title: (citation?.title ?? "").trim() || url,
      url,
      snippet: "",
      provider: "perplexity",
    });
  }

  // Fonti citate nel testo ma non nelle annotations: si recuperano dal markdown.
  for (const match of answer.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) {
    const url = match[1];
    if (seen.has(url)) continue;
    seen.add(url);
    sources.push({ title: url, url, snippet: "", provider: "perplexity" });
  }

  if (opts.meter) {
    await billResearch(opts.meter, body.model ?? model, body.usage).catch(() => undefined);
  }

  return {
    query,
    provider: "perplexity",
    answer: answer || null,
    sources,
    degraded: false,
    note: null,
  };
}

async function billResearch(
  meter: ResearchMeter,
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
): Promise<void> {
  await recordUsage({
    tenant: meter.tenant,
    requestId: meter.requestId,
    reservation: meter.reservation,
    flowRunId: meter.flowRunId ?? null,
    capability: "text",
    provider: "openrouter",
    model,
    units: {
      token_in: usage?.prompt_tokens ?? 0,
      token_out: usage?.completion_tokens ?? 0,
    },
    inputTokens: usage?.prompt_tokens ?? 0,
    source: meter.tenant.sourceTag,
  }).catch(() => undefined);
}

/**
 * Ricerca web con catena di provider: DuckDuckGo (SERP reale) e, in caso di
 * fallimento, Wikipedia. Non usa token e non consuma crediti.
 */
export async function webSearch(query: string, limit = 5): Promise<ResearchResult> {
  try {
    const sources = await duckduckgoSearch(query, limit);
    if (sources.length > 0) {
      return {
        query,
        provider: "duckduckgo",
        answer: null,
        sources,
        degraded: false,
        note: null,
      };
    }
  } catch (err) {
    const wiki = await wikipediaSearch(query, limit).catch(() => [] as ResearchSource[]);
    if (wiki.length > 0) {
      return {
        query,
        provider: "wikipedia",
        answer: null,
        sources: wiki,
        degraded: true,
        note: `DuckDuckGo non raggiungibile (${(err as Error).message}); usato Wikipedia.`,
      };
    }
    throw err;
  }

  const wiki = await wikipediaSearch(query, limit);
  return {
    query,
    provider: "wikipedia",
    answer: null,
    sources: wiki,
    degraded: true,
    note: "DuckDuckGo non ha restituito risultati; usato Wikipedia.",
  };
}

/** Prenota crediti per una ricerca e restituisce il contesto di metering. */
export async function reserveResearch(
  tenant: TenantContext,
  requestId: string,
  estimatedTokens: number,
  flowRunId?: string | null,
): Promise<ResearchMeter> {
  const estimate = await estimateCredits(tenant, {
    capability: "text",
    model: "*",
    provider: "openrouter",
    units: ["token_in", "token_out"],
    counts: { token_in: estimatedTokens, token_out: estimatedTokens },
  });
  const reservation = await reserveCredits(tenant.tenantId, requestId, estimate);
  return {
    tenant,
    requestId,
    reservation: reservation.ok ? reservation.reserved : 0,
    flowRunId: flowRunId ?? null,
  };
}

export async function releaseResearch(meter: ResearchMeter, reason: string): Promise<void> {
  if (meter.reservation <= 0) return;
  await releaseReservation(meter.tenant.tenantId, meter.requestId, meter.reservation, reason).catch(
    () => undefined,
  );
}
