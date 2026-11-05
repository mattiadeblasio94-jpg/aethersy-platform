// NVIDIA provider — integrate.api.nvidia.com (NIM, modelli gratuiti)
// =============================================================================
// Catalogo: letto LIVE da `GET {NVIDIA_BASE_URL}/models` (verificato: risponde
// 200 con la stessa chiave usata per le chat). La lista curata sotto e' solo il
// fallback quando l'endpoint non e' raggiungibile, e contiene ID verificati
// sul catalogo reale: gli ID storici (es. `nvidia/nemotron-3-ultra-550b`)
// non esistono piu' e ogni chiamata su di essi risponde 404.
//
// Chat: endpoint OpenAI-compatible. Alcuni modelli (es. i "reasoning") espongono
// il testo in `reasoning_content` invece di `content`: si legge il primo
// disponibile. In caso di errore si solleva un errore con status e dettaglio
// del provider, cosi' il router puo' passare al modello successivo.
// =============================================================================

import { config } from "../config.js";
import type { AiModel, AiCapability } from "../ai-router.js";

const CACHE_TTL_MS = 5 * 60_000;
let nvidiaCache: { at: number; models: AiModel[] } | null = null;

/**
 * Modelli che NON sono assistenti generali: embedding, rerank, guard, parser,
 * encoder. Esclusi dal catalogo e quindi dalla selezione automatica.
 */
const EXCLUDE_PATTERNS = [
  /embed/i,
  /rerank/i,
  /ingest/i,
  /guard/i,
  /safety/i,
  /retriever/i,
  /nvclip/i,
  /vision-encoder/i,
  /parse/i,
  /synthetic-video-detector/i,
  /ising-calibration/i,
  /content-safety/i,
];

/**
 * ID verificati sul catalogo NVIDIA (05/11/2026). Sono i modelli gratuiti realmente
 * utilizzabili con un account self-hosted: nemotron-3.5-bolt e' il piu' veloce
 * e risponde in ~2s, nemotron-3.5-lightning e' il compromesso, gli altri sono
 * i modelli piu' grandi (ragionamento piu' lento, max_tokens piu' alti).
 */
const CURATED: AiModel[] = [
  {
    id: "nvidia/nemotron-3.5-bolt-e4b",
    name: "Nemotron 3.5 Bolt (E4B)",
    contextLength: 32768,
    capabilities: ["text"],
    pricing: { prompt: 0, completion: 0 },
    free: true,
    provider: "nvidia",
  },
  {
    id: "nvidia/nemotron-3.5-lightning-30b-a3b",
    name: "Nemotron 3.5 Lightning 30B",
    contextLength: 32768,
    capabilities: ["text"],
    pricing: { prompt: 0, completion: 0 },
    free: true,
    provider: "nvidia",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b",
    name: "Nemotron 3 Super 120B",
    contextLength: 131072,
    capabilities: ["text"],
    pricing: { prompt: 0, completion: 0 },
    free: true,
    provider: "nvidia",
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b",
    name: "Nemotron 3 Ultra 550B",
    contextLength: 131072,
    capabilities: ["text"],
    pricing: { prompt: 0, completion: 0 },
    free: true,
    provider: "nvidia",
  },
  {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    name: "Nemotron 3 Nano Omni 30B",
    contextLength: 131072,
    capabilities: ["text", "image", "audio", "video"],
    pricing: { prompt: 0, completion: 0 },
    free: true,
    provider: "nvidia",
  },
  {
    id: "nvidia/nemotron-3.5-super-vl-120b-a12b",
    name: "Nemotron 3.5 Super VL 120B",
    contextLength: 131072,
    capabilities: ["text", "image"],
    pricing: { prompt: 0, completion: 0 },
    free: true,
    provider: "nvidia",
  },
  {
    id: "nvidia/nemotron-4-340b-instruct",
    name: "Nemotron 4 340B Instruct",
    contextLength: 131072,
    capabilities: ["text"],
    pricing: { prompt: 0, completion: 0 },
    free: true,
    provider: "nvidia",
  },
];

function isUsable(id: string): boolean {
  return !EXCLUDE_PATTERNS.some((re) => re.test(id));
}

/** Classifica le capacita' di un modello NVIDIA dal suo id. */
function capabilitiesFor(id: string): AiCapability[] {
  const caps: AiCapability[] = ["text"];
  if (/omni/i.test(id)) caps.push("audio", "video");
  if (/vl|vision/i.test(id)) caps.push("image");
  return caps;
}

interface NvidiaModelsResponse {
  data?: { id?: string }[];
}

/**
 * Catalogo live da `GET /models`. Ritorna null se l'endpoint non e'
 * disponibile (nessuna chiave, rete assente, errore HTTP): in quel caso si
 * usa la lista curata.
 */
async function fetchLiveCatalog(): Promise<AiModel[] | null> {
  if (!config.nvidiaApiKey) return null;
  try {
    const res = await fetch(`${config.nvidiaBaseUrl}/models`, {
      headers: { Authorization: `Bearer ${config.nvidiaApiKey}` },
      signal: AbortSignal.timeout(config.nvidiaTimeoutMs),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as NvidiaModelsResponse;
    const ids = (body.data ?? [])
      .map((m) => m.id ?? "")
      .filter((id) => id.includes("/") && isUsable(id));
    if (!ids.length) return null;

    const live: AiModel[] = ids.map((id) => {
      const curated = CURATED.find((m) => m.id === id);
      return {
        id,
        name: curated?.name ?? id.split("/").pop() ?? id,
        contextLength: curated?.contextLength ?? null,
        capabilities: curated?.capabilities ?? capabilitiesFor(id),
        pricing: { prompt: 0, completion: 0 },
        free: true,
        provider: "nvidia" as const,
      };
    });

    // I modelli curati restano in testa: sono quelli verificati come
    // utilizzabili con l'account (il catalogo pubblico lista anche modelli
    // non abilitati per l'account, che rispondono 404).
    const curatedIds = new Set(CURATED.map((m) => m.id));
    return [
      ...CURATED,
      ...live.filter((m) => !curatedIds.has(m.id)),
    ];
  } catch {
    return null;
  }
}

async function fetchNvidiaCatalog(): Promise<AiModel[]> {
  if (nvidiaCache && Date.now() - nvidiaCache.at < CACHE_TTL_MS) {
    return nvidiaCache.models;
  }

  const live = await fetchLiveCatalog();
  const models = (live ?? CURATED).filter((m) => isUsable(m.id));

  nvidiaCache = { at: Date.now(), models };
  return models;
}

interface NvidiaChatResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string | null; reasoning_content?: string | null } }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: { message?: string };
  detail?: string;
  title?: string;
}

/**
 * Chat completion via NVIDIA API (OpenAI-compatible).
 * Ritorna { model, answer, usage, latencyMs } o lancia errore.
 */
export async function nvidiaChat(params: {
  capability: AiCapability;
  prompt: string;
  model: string;
  fileUrl?: string;
}): Promise<{
  model: string;
  answer: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  latencyMs: number;
}> {
  const started = Date.now();

  // NVIDIA richiede Authorization: Bearer <NVIDIA_API_KEY>
  const apiKey = config.nvidiaApiKey;
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY non configurata");
  }

  // Build messages
  const messages: any[] = [{ role: "user", content: params.prompt }];

  if (params.fileUrl) {
    switch (params.capability) {
      case "image":
        messages[0].content = [
          { type: "text", text: params.prompt },
          { type: "image_url", image_url: { url: params.fileUrl } },
        ];
        break;
      case "audio":
        // NVIDIA supporta audio input per modelli omni
        messages[0].content = [
          { type: "text", text: params.prompt },
          { type: "input_audio", input_audio: { data: params.fileUrl, format: "wav" } },
        ];
        break;
      case "video":
        // NVIDIA supporta video input per modelli omni
        messages[0].content = [
          { type: "text", text: params.prompt },
          { type: "video_url", video_url: { url: params.fileUrl } },
        ];
        break;
    }
  }

  const res = await fetch(`${config.nvidiaBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      messages,
      max_tokens: config.nvidiaMaxTokens,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(config.nvidiaTimeoutMs),
  });

  const latencyMs = Date.now() - started;
  const body = (await res.json().catch(() => ({}))) as NvidiaChatResponse;

  if (!res.ok) {
    // 404 = modello non abilitato per l'account; 410 = modello retirement.
    // Il messaggio riporta il dettaglio del provider per facilitare il debug.
    const detail = body?.error?.message ?? body?.detail ?? body?.title ?? `NVIDIA ${res.status}`;
    throw new Error(`NVIDIA ${res.status}: ${detail}`);
  }

  // I modelli "reasoning" restituiscono il testo in `reasoning_content`.
  const message = body?.choices?.[0]?.message;
  const answer: string = (message?.content ?? message?.reasoning_content ?? "").trim();
  if (!answer) throw new Error("NVIDIA: risposta vuota");

  const usage = body?.usage ?? {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  return {
    model: body?.model ?? params.model,
    answer,
    usage,
    latencyMs,
  };
}

export async function getNvidiaModels(): Promise<AiModel[]> {
  return fetchNvidiaCatalog();
}
