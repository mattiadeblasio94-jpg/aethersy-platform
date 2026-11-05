import { config } from "./config.js";
import { recordUsage, type TenantContext } from "./metering/repo.js";
import { getNvidiaModels, nvidiaChat } from "./ai-gen/nvidia.js";
import { getZaiModels, zaiChat } from "./ai-gen/zai.js";

// =============================================================================
// AI Router — sceglie automaticamente il modello LLM in base alla capacita'
// richiesta (testo / immagine->testo / audio->testo / video->testo), preferendo
// i modelli GRATUITI disponibili su NVIDIA (integrate.api.nvidia.com), z.ai
// (GLM Flash free) e OpenRouter (modelli :free).
//
// Il catalogo viene letto live da OpenRouter /models e combinato con i modelli
// NVIDIA e z.ai curati. I provider restano NASCOSTI agli utenti della
// piattaforma: il router seleziona automaticamente il miglior modello gratuito
// disponibile.
// =============================================================================

export type AiCapability = "text" | "image" | "audio" | "video";

export interface AiModel {
  id: string;
  name: string;
  contextLength: number | null;
  free: boolean;
  capabilities: AiCapability[];
  pricing: { prompt: number; completion: number };
  /** Provider interno (non esposto all'utente). */
  provider: "openrouter" | "nvidia" | "zai";
}

interface OpenRouterModel {
  id: string;
  name: string;
  context_length?: number | null;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[] };
}

const CACHE_TTL_MS = 5 * 60_000;
let cache: { at: number; models: AiModel[] } | null = null;

// Preferenze curate per capacita' (aggiornate 05/11/2026 dopo la verifica
// live sul catalogo NVIDIA: gli ID precedenti non esistono piu' e rispondevano
// 404, es. `nvidia/nemotron-3-ultra-550b` -> `...-550b-a55b`).
// L'ordine e' quello di preferenza: NVIDIA diretta prima, poi OpenRouter.
const PREFERRED: Record<AiCapability, string[]> = {
  text: [
    // NVIDIA diretta (gratis, verifica live: ~2s di risposta)
    "nvidia/nemotron-3.5-bolt-e4b",
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    // z.ai free (GLM Flash): verificati live il 05/11/2026, ~12s di risposta.
    // Intercalati ai primi NVIDIA: se il blocco NVIDIA e' irraggiungibile, il
    // router ha subito un secondo provider gratuito invece di aspettare i
    // modelli OpenRouter :free in coda.
    "glm-4.5-flash",
    "glm-4.7-flash",
    "nvidia/nemotron-3-super-120b-a12b",
    "nvidia/nemotron-3-ultra-550b-a55b",
    "nvidia/nemotron-4-340b-instruct",
    // OpenRouter gratuiti (fallback)
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "dots-studio/dots-3-note-preview:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
  ],
  image: [
    // NVIDIA diretta (vision)
    "nvidia/nemotron-3.5-super-vl-120b-a12b",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    // OpenRouter gratuiti (fallback)
    "google/gemma-4-26b-a4b-it:free",
    "dots-studio/dots-3-note-preview:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  ],
  audio: [
    // NVIDIA diretta (omni audio input)
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    // OpenRouter gratuiti (fallback)
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  ],
  video: [
    // NVIDIA diretta (omni video input)
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    "nvidia/nemotron-3.5-super-vl-120b-a12b",
    // OpenRouter gratuiti (fallback)
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "nvidia/nemotron-3.5-super-vl-120b-a12b:free",
  ],
};

// Modelli che non sono assistenti generali: esclusi dalla selezione automatica
const EXCLUDE_PATTERNS = [
  /lyria/i, // generazione musicale
  /content-safety/i,
  /^thinkingmachines\/inkling/i, // riservati agli "agentic harnesses"
  /whisper/i,
  /^nvidia\/nv-embed/i,
  /^nvidia\/nv-rerank/i,
  /^nvidia\/nv-ingest/i,
];

function isUsable(m: AiModel): boolean {
  return !EXCLUDE_PATTERNS.some((re) => re.test(m.id));
}

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 1;
}

function toCapabilities(mods: string[] | undefined): AiCapability[] {
  const set = new Set<AiCapability>(["text"]);
  for (const m of mods ?? []) {
    if (m === "image" || m === "audio" || m === "video") set.add(m);
  }
  return [...set];
}

async function fetchOpenRouterCatalog(): Promise<AiModel[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.models;

  const res = await fetch(`${config.openRouterBase}/models`, {
    headers: { Authorization: `Bearer ${config.openRouterKey}` },
  });
  if (!res.ok) throw new Error(`OpenRouter /models ${res.status}`);

  const body = (await res.json()) as { data: OpenRouterModel[] };
  const models: AiModel[] = body.data.map((m) => {
    const prompt = num(m.pricing?.prompt);
    const completion = num(m.pricing?.completion);
    return {
      id: m.id,
      name: m.name,
      contextLength: m.context_length ?? null,
      free: prompt === 0 && completion === 0,
      capabilities: toCapabilities(m.architecture?.input_modalities),
      pricing: { prompt, completion },
      provider: "openrouter" as const,
    };
  });

  cache = { at: Date.now(), models };
  return models;
}

async function fetchMergedCatalog(): Promise<AiModel[]> {
  // I due cataloghi sono indipendenti: un outage di OpenRouter non deve
  // disattivare NVIDIA (e viceversa). Promise.allSettled + merge dei soli
  // provider disponibili.
  const [openRouter, nvidia, zai] = await Promise.allSettled([
    fetchOpenRouterCatalog(),
    getNvidiaModels(),
    getZaiModels(),
  ]);

  const openRouterModels = openRouter.status === "fulfilled" ? openRouter.value : [];
  const nvidiaModels = nvidia.status === "fulfilled" ? nvidia.value : [];
  const zaiModels = zai.status === "fulfilled" ? zai.value : [];

  if (!openRouterModels.length && !nvidiaModels.length && !zaiModels.length) {
    const reasons = [openRouter, nvidia, zai]
      .map((r) => (r.status === "rejected" ? String(r.reason?.message ?? r.reason) : "vuoto"))
      .join(" | ");
    throw new Error(`Catalogo AI non disponibile: ${reasons}`);
  }

  // Merge: NVIDIA models take precedence for same id (direct API vs OpenRouter proxy)
  const merged = new Map<string, AiModel>();
  for (const m of openRouterModels) {
    merged.set(m.id, m);
  }
  for (const m of nvidiaModels) {
    // NVIDIA direct models override OpenRouter proxied versions
    merged.set(m.id, { ...m, provider: "nvidia" });
  }
  for (const m of zaiModels) {
    // z.ai (GLM Flash free) ha ID propri: non confligge con gli altri cataloghi.
    merged.set(m.id, { ...m, provider: "zai" });
  }

  return [...merged.values()];
}

/**
 * Ordina i modelli per la capacita' richiesta. Ordine di preferenza:
 *   1. modello esplicitamente richiesto (in testa, se presente)
 *   2. gratuito (NVIDIA diretta > OpenRouter gratuito), poi context piu' ampio
 *   3. a pagamento piu' economico
 * Restituisce la lista completa: `chat()` la percorre finche' una chiamata
 * non riesce (fallback).
 */
export async function rankModels(
  capability: AiCapability,
  opts: { requested?: string; preferFree?: boolean } = {},
): Promise<AiModel[]> {
  const preferFree = opts.preferFree !== false;
  const all = await fetchMergedCatalog();
  const capable = all.filter((m) => m.capabilities.includes(capability) && isUsable(m));
  const pool = capable.length ? capable : all.filter(isUsable);

  const score = (m: AiModel): number => {
    const isNvidiaDirect = m.provider === "nvidia" && m.free;
    const freeRank = m.free ? (isNvidiaDirect ? 0 : 1) : (preferFree ? 2 : 1);
    const ctxRank = -(m.contextLength ?? 0);
    const costRank = m.pricing.prompt + m.pricing.completion;
    return freeRank * 1e9 + ctxRank + costRank;
  };

  // 1) prima i modelli curati (nell'ordine dichiarato), 2) poi il resto per score.
  const preferred = PREFERRED[capability]
    .map((id) => pool.find((m) => m.id === id))
    .filter((m): m is AiModel => Boolean(m));
  const rest = pool.filter((m) => !preferred.includes(m)).sort((a, b) => score(a) - score(b));
  const ranked = [...preferred, ...rest];

  if (opts.requested) {
    const exact = all.find((m) => m.id === opts.requested);
    if (exact) return [exact, ...ranked.filter((m) => m.id !== exact.id)];
  }
  return ranked;
}

/** Seleziona il modello migliore per la capacita' richiesta. */
export async function selectModel(
  capability: AiCapability,
  opts: { requested?: string; preferFree?: boolean } = {},
): Promise<AiModel> {
  return (await rankModels(capability, opts))[0];
}

export async function catalogFor(capability: AiCapability): Promise<{
  capability: AiCapability;
  selected: string;
  models: AiModel[];
}> {
  const all = await fetchMergedCatalog();
  const models = all
    .filter((m) => m.capabilities.includes(capability) && isUsable(m))
    .sort((a, b) => {
      // NVIDIA direct free first, then other free, then paid by context
      const aDirect = a.provider === "nvidia" && a.free;
      const bDirect = b.provider === "nvidia" && b.free;
      if (aDirect !== bDirect) return aDirect ? -1 : 1;
      if (a.free !== b.free) return a.free ? -1 : 1;
      return (b.contextLength ?? 0) - (a.contextLength ?? 0);
    });
  const selected = (await selectModel(capability)).id;
  return { capability, selected, models };
}

// --- Esecuzione: chat completion multimodale --------------------------------

type ContentPart = Record<string, unknown>;

export interface ChatResult {
  model: string;
  capability: AiCapability;
  answer: string;
  usage: unknown;
  latencyMs: number;
  /** Modelli provati e scartati per errore, con motivo. */
  attempts: { model: string; error: string }[];
  /** Addebito effettivo (assente se il metering e' disattivato). */
  billing?: ChatBilling;
}

export interface ChatBilling {
  requestId: string;
  credits: number;
  charged: number;
  priceEur: number;
  balance: number;
  available: number;
  duplicate: boolean;
  degraded: boolean;
}

/** Attribuzione del consumo a un tenant (fornita dal guard di metering). */
export interface MeterInfo {
  tenant: TenantContext;
  requestId: string;
  reservation: number;
  flowRunId?: string | null;
  /** true = il guard ha forzato i modelli gratuiti (credito quasi esaurito). */
  degraded?: boolean;
}

interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export async function chat(params: {
  capability: AiCapability;
  prompt: string;
  model?: string;
  preferFree?: boolean;
  fileUrl?: string;
  meter?: MeterInfo;
}): Promise<ChatResult> {
  const ranked = await rankModels(params.capability, {
    requested: params.model,
    preferFree: params.preferFree,
  });

  // Limita il fallback: il modello richiesto (se presente) + i primi N gratuiti.
  // 8 candidati: copre la catena NVIDIA -> z.ai free -> OpenRouter :free.
  const candidates = ranked.slice(0, params.model ? 4 : 8);

  const parts: ContentPart[] = [{ type: "text", text: params.prompt }];

  if (params.fileUrl) {
    switch (params.capability) {
      case "image":
        parts.push({ type: "image_url", image_url: { url: params.fileUrl } });
        break;
      case "audio":
        parts.push({ type: "input_audio", input_audio: { data: params.fileUrl, format: "wav" } });
        break;
      case "video":
        parts.push({ type: "video_url", video_url: { url: params.fileUrl } });
        break;
      default:
        break;
    }
  }

  const attempts: { model: string; error: string }[] = [];
  let lastError = "Nessun modello disponibile";

  for (const chosen of candidates) {
    const started = Date.now();
    let body: any;
    let res: Response;
    let answer: string;
    let usage: OpenRouterUsage | null = null;
    let modelId: string;
    let latencyMs: number;

    try {
      if (chosen.provider === "nvidia" && config.nvidiaApiKey) {
        // NVIDIA direct API
        const result = await nvidiaChat({
          capability: params.capability,
          prompt: params.prompt,
          model: chosen.id,
          fileUrl: params.fileUrl,
        });
        modelId = result.model;
        answer = result.answer;
        usage = {
          prompt_tokens: result.usage.prompt_tokens,
          completion_tokens: result.usage.completion_tokens,
          total_tokens: result.usage.total_tokens,
        };
        latencyMs = result.latencyMs;
      } else if (chosen.provider === "zai" && config.zaiKey) {
        // z.ai (GLM Flash free), endpoint OpenAI-compatible
        const result = await zaiChat({
          capability: params.capability,
          prompt: params.prompt,
          model: chosen.id,
          fileUrl: params.fileUrl,
        });
        modelId = result.model;
        answer = result.answer;
        usage = {
          prompt_tokens: result.usage.prompt_tokens,
          completion_tokens: result.usage.completion_tokens,
          total_tokens: result.usage.total_tokens,
        };
        latencyMs = result.latencyMs;
      } else {
        // OpenRouter
        res = await fetch(`${config.openRouterBase}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.openRouterKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": config.apPublicUrl,
            "X-Title": "Aethersy Console",
          },
          body: JSON.stringify({
            model: chosen.id,
            messages: [
              { role: "user", content: params.capability === "text" ? params.prompt : parts },
            ],
          }),
        });
        body = await res.json();

        latencyMs = Date.now() - started;

        if (!res.ok) {
          const msg = body?.error?.message ?? body?.message ?? `OpenRouter ${res.status}`;
          attempts.push({ model: chosen.id, error: String(msg) });
          lastError = String(msg);
          continue;
        }

        modelId = body?.model ?? chosen.id;
        answer = body?.choices?.[0]?.message?.content ?? "";
        if (!answer) {
          attempts.push({ model: chosen.id, error: "risposta vuota" });
          lastError = "risposta vuota";
          continue;
        }
        usage = (body?.usage ?? null) as OpenRouterUsage | null;
        latencyMs = Date.now() - started;
      }
    } catch (err) {
      attempts.push({ model: chosen.id, error: (err as Error).message });
      lastError = (err as Error).message;
      continue;
    }

    const billing = params.meter
      ? await billChat(params.meter, modelId, usage, latencyMs, chosen.provider)
      : undefined;

    return {
      model: modelId,
      capability: params.capability,
      answer,
      usage,
      latencyMs,
      attempts,
      billing,
    };
  }

  throw new Error(lastError);
}

/**
 * Addebita una chat completata.
 */
async function billChat(
  meter: MeterInfo,
  model: string,
  usage: OpenRouterUsage | null,
  latencyMs: number,
  provider: "openrouter" | "nvidia" | "zai",
): Promise<ChatBilling> {
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  const res = await recordUsage({
    tenant: meter.tenant,
    requestId: meter.requestId,
    reservation: meter.reservation,
    flowRunId: meter.flowRunId ?? null,
    capability: "text",
    provider,
    model,
    units: { token_in: inputTokens, token_out: outputTokens },
    inputTokens,
    outputTokens,
    latencyMs,
    source: meter.tenant.sourceTag,
  });
  return {
    requestId: meter.requestId,
    credits: res.credits,
    charged: res.charged,
    priceEur: res.priceEur,
    balance: res.balance,
    available: res.available,
    duplicate: res.duplicate,
    degraded: false,
  };
}
