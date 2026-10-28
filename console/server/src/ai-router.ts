import { config } from "./config.js";
import { recordUsage, type TenantContext } from "./metering/repo.js";

// =============================================================================
// AI Router — sceglie automaticamente il modello LLM in base alla capacita'
// richiesta (testo / immagine->testo / audio->testo / video->testo), preferendo
// i modelli GRATUITI disponibili su OpenRouter.
//
// Il catalogo viene letto live da GET /models (nessuna lista hard-coded: se
// OpenRouter aggiunge/rimuove modelli, il router si adegua da solo).
// =============================================================================

export type AiCapability = "text" | "image" | "audio" | "video";

export interface AiModel {
  id: string;
  name: string;
  contextLength: number | null;
  free: boolean;
  capabilities: AiCapability[];
  pricing: { prompt: number; completion: number };
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

// Preferenze curate per capacita' (verificate live il 28/10/2026).
// Sono intersecate col catalogo live: se un modello sparisce da OpenRouter,
// viene semplicemente ignorato. L'ordine e' quello di preferenza.
const PREFERRED: Record<AiCapability, string[]> = {
  text: [
    "nvidia/nemotron-3.5-lightning:free",
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "dots-studio/dots-3-note-preview:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
  ],
  image: [
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "google/gemma-4-26b-a4b-it:free",
    "dots-studio/dots-3-note-preview:free",
    "nvidia/nemotron-3.5-super-vl:free",
  ],
  audio: [
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "google/gemma-4-26b-a4b-it:free",
  ],
  video: [
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-3.5-super-vl:free",
  ],
};

// Modelli che non sono assistenti generali: esclusi dalla selezione automatica
// anche se il catalogo li annuncia come multimodali.
const EXCLUDE_PATTERNS = [
  /lyria/i, // generazione musicale
  /content-safety/i,
  /^thinkingmachines\/inkling/i, // riservati agli "agentic harnesses"
  /whisper/i,
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

async function fetchCatalog(): Promise<AiModel[]> {
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
    };
  });

  cache = { at: Date.now(), models };
  return models;
}

/**
 * Ordina i modelli per la capacita' richiesta. Ordine di preferenza:
 *   1. modello esplicitamente richiesto (in testa, se presente)
 *   2. gratuito, poi context piu' ampio
 *   3. a pagamento piu' economico
 * Restituisce la lista completa: `chat()` la percorre finche' una chiamata
 * non riesce (fallback), perche' alcuni modelli gratuiti sono riservati a
 * specifici client ("agentic harnesses") o temporaneamente non disponibili.
 */
export async function rankModels(
  capability: AiCapability,
  opts: { requested?: string; preferFree?: boolean } = {},
): Promise<AiModel[]> {
  const preferFree = opts.preferFree !== false;
  const all = await fetchCatalog();
  const capable = all.filter((m) => m.capabilities.includes(capability) && isUsable(m));
  const pool = capable.length ? capable : all.filter(isUsable);

  const score = (m: AiModel): number => {
    const freeRank = m.free ? 0 : preferFree ? 2 : 1;
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
  const all = await fetchCatalog();
  const models = all
    .filter((m) => m.capabilities.includes(capability) && isUsable(m))
    .sort((a, b) => {
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
  const candidates = ranked.slice(0, params.model ? 4 : 5);

  const parts: ContentPart[] = [{ type: "text", text: params.prompt }];

  if (params.fileUrl) {
    switch (params.capability) {
      case "image":
        parts.push({ type: "image_url", image_url: { url: params.fileUrl } });
        break;
      case "audio":
        // OpenRouter accetta URL pubblici o data-URL base64 per l'audio.
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
    try {
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
    } catch (err) {
      attempts.push({ model: chosen.id, error: (err as Error).message });
      lastError = (err as Error).message;
      continue;
    }

    const latencyMs = Date.now() - started;

    if (!res.ok) {
      const msg = body?.error?.message ?? body?.message ?? `OpenRouter ${res.status}`;
      attempts.push({ model: chosen.id, error: String(msg) });
      lastError = String(msg);
      continue;
    }

    const answer: string = body?.choices?.[0]?.message?.content ?? "";
    if (!answer) {
      attempts.push({ model: chosen.id, error: "risposta vuota" });
      lastError = "risposta vuota";
      continue;
    }

    const usage = (body?.usage ?? null) as OpenRouterUsage | null;
    const billing = params.meter
      ? await billChat(params.meter, body?.model ?? chosen.id, usage, latencyMs)
      : undefined;

    return {
      model: body?.model ?? chosen.id,
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
 * Addebita una chat completata. Il consumo e' token-based: le chiamate
 * multimodali (vision/audio/video input) sono comunque completions a token,
 * quindi vengono prezzate come `text` (token_in/token_out).
 */
async function billChat(
  meter: MeterInfo,
  model: string,
  usage: OpenRouterUsage | null,
  latencyMs: number,
): Promise<ChatBilling> {
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  const res = await recordUsage({
    tenant: meter.tenant,
    requestId: meter.requestId,
    reservation: meter.reservation,
    flowRunId: meter.flowRunId ?? null,
    capability: "text",
    provider: "openrouter",
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
