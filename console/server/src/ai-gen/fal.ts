// =============================================================================
// fal.ai — terzo livello di fallback per la generazione immagini (img_out).
//
// Usato quando Venice e Replicate falliscono entrambi. Endpoint sincroni:
//   POST https://fal.run/<endpoint-id>  -> { images: [{ url }] }
//
// Prezzi ufficiali (fal.ai/pricing, 05/11/2026): la fal fattura per megapixel
// generato. Usando l'output standard 1024x1024 = 1 megapixel esatto:
//   fal-ai/flux/schnell -> $0.003 per megapixel
//   fal-ai/flux/dev     -> $0.025 per megapixel
// Il billing del console usa l'unita' "image" con il prezzo del megapixel
// (vedi price book v2 in src/metering/schema.ts).
// =============================================================================

import { config } from "../config.js";

export interface FalImageResult {
  capability: "img_out";
  provider: "fal";
  model: string;
  /** URL assoluti delle immagini generate. */
  images: string[];
  format: string;
  /** Megapixel fatturati (1 per l'output standard 1024x1024). */
  billableUnits: number;
  latencyMs: number;
}

/** Endpoint fal usati, con il prezzo per megapixel (fonte: fal.ai/pricing). */
const FAL_MODELS = {
  "fal-ai/flux/schnell": { usdPerMegapixel: 0.003 },
  "fal-ai/flux/dev": { usdPerMegapixel: 0.025 },
} as const;

export type FalModelId = keyof typeof FAL_MODELS;

function falError(status: number, message: string): Error {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

/**
 * Genera immagini su fal.ai.
 * Restituisce { model, images, billableUnits, latencyMs } o lancia errore con
 * il dettaglio del provider (il router/generator passa al livello successivo).
 */
export async function falGenerateImage(p: {
  prompt: string;
  model?: string;
  negativePrompt?: string;
  aspectRatio?: string;
}): Promise<FalImageResult> {
  const started = Date.now();

  if (!config.falKey) {
    throw falError(503, "FAL_API_KEY non configurata: fallback non disponibile");
  }

  const model = (p.model ?? "fal-ai/flux/schnell") as FalModelId;
  if (!(model in FAL_MODELS)) {
    throw falError(400, `Modello fal non supportato: ${model}`);
  }

  // fal accetta "width"/"height" oppure "image_size"; con aspect ratio si
  // lascia il default del modello (1024x1024 = 1 megapixel).
  const body: Record<string, unknown> = {
    prompt: p.prompt,
    num_images: 1,
    image_size: { width: 1024, height: 1024 },
  };
  if (p.negativePrompt) body.negative_prompt = p.negativePrompt;

  // Un solo retry: la DNS di rete puo' fallire transientemente (EAI_AGAIN) e
  // il fallback non deve perdersi per un errore di rete non definitivo.
  let res: Response | null = null;
  let payload: {
    images?: Array<{ url?: string; width?: number; height?: number }>;
    image?: { url?: string };
    detail?: string;
    error?: string | { message?: string };
  } = {};
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${config.falBase}/${model}`, {
        method: "POST",
        headers: {
          Authorization: `Key ${config.falKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      res = r;
      payload = (await r.json().catch(() => ({}))) as typeof payload;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (!res) throw falError(503, `fal: rete non raggiungibile (${String(lastErr)})`);

  const latencyMs = Date.now() - started;

  if (!res.ok) {
    const detail =
      (typeof payload?.error === "string" ? payload.error : payload?.error?.message) ??
      payload?.detail ??
      `fal ${res.status}`;
    throw falError(res.status, `fal ${res.status}: ${detail}`);
  }

  const urls = (payload?.images ?? [])
    .map((i) => i?.url)
    .filter((u): u is string => Boolean(u));

  if (!urls.length) {
    throw falError(502, "fal: risposta senza immagini");
  }

  // 1024x1024 = 1 megapixel esatto: unita' fatturabile = 1.
  const billableUnits = 1;

  return {
    capability: "img_out",
    provider: "fal",
    model,
    images: urls,
    format: "jpeg",
    billableUnits,
    latencyMs,
  };
}
