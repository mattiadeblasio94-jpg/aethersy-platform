// z.ai provider — api.z.ai/api/paas/v4 (Zhipu / GLM, endpoint OpenAI-compatible)
// =============================================================================
// Verifiche live del 05/11/2026 con la chiave di produzione:
//   - `GET /models` -> 200, catalogo: glm-4.5, glm-4.5-air, glm-4.6, glm-4.7,
//     glm-5, glm-5-turbo, glm-5.1, glm-5.2, glm-5.3, glm-5.3-flash,
//     glm-5.3-flashx, glm-5.3-flashx-legal.
//   - I modelli a pagamento (es. glm-4.5, glm-5.x) rispondono 429
//     "Insufficient balance or no resource package": senza credito sul conto
//     z.ai sono inutilizzabili.
//   - I modelli FREE sono i "*Flash" (prezzi ufficiali z.ai):
//     GLM-4.7-Flash e GLM-4.5-Flash = Free; GLM-4.7-FlashX = $0.07/$0.40.
//     `glm-4.5-flash` risponde 200 (12s), `glm-4.7-flash` risponde 200 ma
//     occasionalmente 429 "service temporarily overloaded".
//   - I "*Flash" NON compaiono in `/models`: sono curati qui sotto.
//   - Con `thinking: { type: "disabled" }` la risposta arriva in `content`; senza,
//     il modello scarica il budget di token in `reasoning_content` e lascia
//     `content` vuoto. Per questo il flag e' obbligatorio.
//
// Il provider e' un FALLBACK del router: entra nel catalogo solo se la chiave e'
// presente, e i suoi modelli sono marcati `free: true` (verificato sul listino
// ufficiale z.ai, non dedotto).
// =============================================================================

import { config } from "../config.js";
import type { AiModel, AiCapability } from "../ai-router.js";

const CACHE_TTL_MS = 5 * 60_000;
let zaiCache: { at: number; models: AiModel[] } | null = null;

/**
 * Modelli gratuiti verificati (05/11/2026). `glm-4.7-flash` e' piu' recente
 * ma piu' instabile (429 intermittenti); `glm-4.5-flash` e' il primo scelto
 * perche' risponde in modo costante.
 */
const CURATED: AiModel[] = [
  {
    id: "glm-4.5-flash",
    name: "GLM 4.5 Flash (free)",
    contextLength: 128000,
    capabilities: ["text"],
    pricing: { prompt: 0, completion: 0 },
    free: true,
    provider: "zai",
  },
  {
    id: "glm-4.7-flash",
    name: "GLM 4.7 Flash (free)",
    contextLength: 128000,
    capabilities: ["text"],
    pricing: { prompt: 0, completion: 0 },
    free: true,
    provider: "zai",
  },
];

interface ZaiChatResponse {
  model?: string;
  choices?: Array<{
    message?: { content?: string | null; reasoning_content?: string | null };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string };
}

/**
 * Catalogo z.ai: solo i modelli free verificati (vedi CURATED). I modelli
 * live non-curati non sono pubblicati: senza credito sul conto z.ai rispondono
 * 429, e il loro prezzo non e' noto al listino free -> non possono entrare in
 * un catalogo che promette modelli gratuiti.
 */
async function fetchZaiCatalog(): Promise<AiModel[]> {
  if (zaiCache && Date.now() - zaiCache.at < CACHE_TTL_MS) return zaiCache.models;
  if (!config.zaiKey) return [];
  zaiCache = { at: Date.now(), models: [...CURATED] };
  return zaiCache.models;
}

/**
 * Chat completion via z.ai (OpenAI-compatible).
 * Ritorna { model, answer, usage, latencyMs } o lancia errore con il dettaglio
 * del provider, cosi' il router puo' passare al modello successivo.
 */
export async function zaiChat(params: {
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

  const apiKey = config.zaiKey;
  if (!apiKey) throw new Error("ZAI_API_KEY non configurata");

  const messages: any[] = [{ role: "user", content: params.prompt }];
  if (params.fileUrl && params.capability === "image") {
    messages[0].content = [
      { type: "text", text: params.prompt },
      { type: "image_url", image_url: { url: params.fileUrl } },
    ];
  }

  const res = await fetch(`${config.zaiBase}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      messages,
      max_tokens: config.zaiMaxTokens,
      temperature: 0.7,
      // Necessario: senza, i "*Flash" svuotano il budget in `reasoning_content`.
      thinking: { type: "disabled" },
    }),
    signal: AbortSignal.timeout(config.zaiTimeoutMs),
  });

  const latencyMs = Date.now() - started;
  const body = (await res.json().catch(() => ({}))) as ZaiChatResponse;

  if (!res.ok) {
    const detail = body?.error?.message ?? `z.ai ${res.status}`;
    throw new Error(`z.ai ${res.status}: ${detail}`);
  }

  const message = body?.choices?.[0]?.message;
  const answer: string = (message?.content ?? message?.reasoning_content ?? "").trim();
  if (!answer) throw new Error("z.ai: risposta vuota");

  return {
    model: body?.model ?? params.model,
    answer,
    usage: {
      prompt_tokens: body?.usage?.prompt_tokens ?? 0,
      completion_tokens: body?.usage?.completion_tokens ?? 0,
      total_tokens: body?.usage?.total_tokens ?? 0,
    },
    latencyMs,
  };
}

export async function getZaiModels(): Promise<AiModel[]> {
  return fetchZaiCatalog();
}
