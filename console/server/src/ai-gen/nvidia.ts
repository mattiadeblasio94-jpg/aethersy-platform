// NVIDIA provider — integra.api.nvidia.com (modelli gratuiti)
// =============================================================================
// Fetch live model catalog from NVIDIA and provide chat completion via
// OpenAI-compatible endpoint. Preferito per modelli gratuiti (qwen, nemotron).
// =============================================================================

import { config } from "../config.js";
import type { AiModel, AiCapability } from "../ai-router.js";

const CACHE_TTL_MS = 5 * 60_000;
let nvidiaCache: { at: number; models: AiModel[] } | null = null;

const EXCLUDE_PATTERNS = [
  /^nvidia\/nv-embed/i,
  /^nvidia\/nv-rerank/i,
  /^nvidia\/nv-ingest/i,
];

function isUsable(m: AiModel): boolean {
  return !EXCLUDE_PATTERNS.some((re) => re.test(m.id));
}

async function fetchNvidiaCatalog(): Promise<AiModel[]> {
  if (nvidiaCache && Date.now() - nvidiaCache.at < CACHE_TTL_MS) {
    return nvidiaCache.models;
  }

  // NVIDIA non espone un endpoint /models pubblico documentato.
  // Usiamo una lista curata basata sui modelli gratuiti noti (aggiornata 30/10/2026).
  // Se NVIDIA aggiungerà /models, sostituire con fetch live.
  const curated: AiModel[] = [
    // Text / Reasoning — top tier
    {
      id: "nvidia/nemotron-3-ultra-550b",
      name: "Nemotron 3 Ultra 550B",
      contextLength: 131072,
      capabilities: ["text"],
      pricing: { prompt: 0, completion: 0 },
      free: true,
      provider: "nvidia",
    },
    {
      id: "qwen/qwen3.5-122b-a10b",
      name: "Qwen 3.5 122B (MoE)",
      contextLength: 131072,
      capabilities: ["text"],
      pricing: { prompt: 0, completion: 0 },
      free: true,
      provider: "nvidia",
    },
    {
      id: "nvidia/nemotron-3.5-lightning",
      name: "Nemotron 3.5 Lightning",
      contextLength: 32768,
      capabilities: ["text"],
      pricing: { prompt: 0, completion: 0 },
      free: true,
      provider: "nvidia",
    },
    // Multimodal (vision + text)
    {
      id: "nvidia/nemotron-3.5-super-vl",
      name: "Nemotron 3.5 Super VL",
      contextLength: 131072,
      capabilities: ["text", "image"],
      pricing: { prompt: 0, completion: 0 },
      free: true,
      provider: "nvidia",
    },
    // Omni (text + vision + audio input)
    {
      id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      name: "Nemotron 3 Nano Omni 30B",
      contextLength: 131072,
      capabilities: ["text", "image", "audio", "video"],
      pricing: { prompt: 0, completion: 0 },
      free: true,
      provider: "nvidia",
    },
    // Additional free models
    {
      id: "nvidia/nemotron-3-ultra-253b",
      name: "Nemotron 3 Ultra 253B",
      contextLength: 131072,
      capabilities: ["text"],
      pricing: { prompt: 0, completion: 0 },
      free: true,
      provider: "nvidia",
    },
    {
      id: "nvidia/nemotron-4-340b",
      name: "Nemotron 4 340B",
      contextLength: 131072,
      capabilities: ["text"],
      pricing: { prompt: 0, completion: 0 },
      free: true,
      provider: "nvidia",
    },
  ];

  const models: AiModel[] = curated.filter((m) => isUsable(m));

  nvidiaCache = { at: Date.now(), models };
  return models;
}

interface NvidiaChatResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: { message?: string };
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
  // Usiamo la chiave dal config (caricata da .env)
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
      max_tokens: 32768,
      temperature: 0.7,
    }),
  });

  const latencyMs = Date.now() - started;
  const body = (await res.json()) as NvidiaChatResponse;

  if (!res.ok) {
    const msg = body?.error?.message ?? `NVIDIA ${res.status}`;
    throw new Error(msg);
  }

  const answer: string = body?.choices?.[0]?.message?.content ?? "";
  if (!answer) throw new Error("risposta vuota");

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
