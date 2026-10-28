import { config } from "../config.js";

// =============================================================================
// Venice — client di GENERAZIONE (img_out / tts / vid_out).
//
// OpenRouter copre solo comprensione + testo: la generazione multimodale
// (immagini, voce, video) passa da Venice. Endpoint verificati il 28/10/2026:
//   POST /image/generate   -> { id, images: [base64...], timing }
//   POST /audio/speech     -> bytes audio (o base64, a seconda del formato)
//   POST /video/queue      -> { queue_id, ... }        (asincrono)
//   POST /video/retrieve   -> { status, ... }
//
// Nessun endpoint e' hard-coded nel chiamante: isolati qui, cosi' un cambio di
// percorso (o l'aggiunta di un provider) resta confinato in un modulo.
// =============================================================================

export type GenCapability = "img_out" | "tts" | "vid_out";

export interface VeniceError extends Error {
  status?: number;
}

function veniceError(status: number, message: string): VeniceError {
  const err = new Error(message) as VeniceError;
  err.status = status;
  return err;
}

function authHeaders(): Record<string, string> {
  if (!config.veniceKey) {
    throw veniceError(503, "VENICE_API_KEY non configurata: generazione non disponibile");
  }
  return {
    Authorization: `Bearer ${config.veniceKey}`,
    "Content-Type": "application/json",
  };
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${config.veniceBase}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.message ?? data?.error ?? `Venice ${res.status}`;
    throw veniceError(res.status, String(msg));
  }
  return data as T;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

// --- Immagini ----------------------------------------------------------------

export interface ImageGenParams {
  prompt: string;
  model?: string;
  /** Larghezza/altezza in pixel (modelli SD/SDXL). Alternativa ad aspectRatio. */
  width?: number;
  height?: number;
  /** Modelli che accettano solo aspect ratio (qwen-image, nano-banana). */
  aspectRatio?: string;
  /** Modelli che accettano resolution (gpt-image-2: 1K/2K/4K). */
  resolution?: string;
  negativePrompt?: string;
  stylePreset?: string;
  /** Numero di varianti (1–4). */
  variants?: number;
  format?: "png" | "jpeg" | "webp";
  seed?: number;
  safeMode?: boolean;
}

export interface ImageGenResult {
  capability: "img_out";
  provider: "venice";
  model: string;
  /** Immagini in base64 (senza prefisso data-URL). */
  images: string[];
  format: string;
  /** Numero di immagini fatturate. */
  billableUnits: number;
  latencyMs: number;
}

export async function generateImage(p: ImageGenParams): Promise<ImageGenResult> {
  const model = p.model ?? "venice-sd35";
  const body: Record<string, unknown> = {
    model,
    prompt: p.prompt,
    format: p.format ?? "png",
    variants: Math.min(Math.max(p.variants ?? 1, 1), 4),
  };
  if (p.width) body.width = p.width;
  if (p.height) body.height = p.height;
  if (p.aspectRatio) body.aspect_ratio = p.aspectRatio;
  if (p.resolution) body.resolution = p.resolution;
  if (p.negativePrompt) body.negative_prompt = p.negativePrompt;
  if (p.stylePreset) body.style_preset = p.stylePreset;
  if (typeof p.seed === "number") body.seed = p.seed;
  if (typeof p.safeMode === "boolean") body.safe_mode = p.safeMode;

  const started = Date.now();
  const data = await postJson<any>("/image/generate", body);
  const images: string[] = Array.isArray(data?.images) ? data.images : [];
  if (!images.length) throw veniceError(502, "Venice non ha restituito immagini");

  return {
    capability: "img_out",
    provider: "venice",
    model: data?.model ?? model,
    images,
    format: p.format ?? "png",
    billableUnits: images.length,
    latencyMs: Date.now() - started,
  };
}

// --- Sintesi vocale (TTS) ----------------------------------------------------

export interface TtsParams {
  input: string;
  model?: string;
  voice?: string;
  speed?: number;
  responseFormat?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
  language?: string;
}

export interface TtsResult {
  capability: "tts";
  provider: "venice";
  model: string;
  voice: string;
  /** Audio in base64. */
  audio: string;
  format: string;
  /** Caratteri fatturati. */
  billableUnits: number;
  latencyMs: number;
}

export async function synthesizeSpeech(p: TtsParams): Promise<TtsResult> {
  if (p.input.length > 4096) throw veniceError(400, "input TTS > 4096 caratteri");
  const model = p.model ?? "tts-kokoro";
  const voice = p.voice ?? "af_sky";
  const format = p.responseFormat ?? "mp3";

  const started = Date.now();
  const res = await fetch(`${config.veniceBase}/audio/speech`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model,
      voice,
      input: p.input,
      response_format: format,
      ...(p.speed ? { speed: p.speed } : {}),
      ...(p.language ? { language: p.language } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    const data = safeJson(text);
    const msg = data?.error?.message ?? data?.message ?? `Venice ${res.status}`;
    throw veniceError(res.status, String(msg));
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return {
    capability: "tts",
    provider: "venice",
    model,
    voice,
    audio: buf.toString("base64"),
    format,
    billableUnits: p.input.length,
    latencyMs: Date.now() - started,
  };
}

// --- Video (asincrono: queue -> retrieve) ------------------------------------

export interface VideoQueueParams {
  prompt: string;
  model: string;
  duration: string;
  aspectRatio?: string;
  negativePrompt?: string;
  seed?: number;
  imageUrl?: string;
}

export interface VideoQueueResult {
  capability: "vid_out";
  provider: "venice";
  model: string;
  queueId: string;
  downloadUrl?: string;
  status: string;
}

/** Accoda una generazione video. Il video NON e' pronto: usare retrieveVideo(). */
export async function queueVideo(p: VideoQueueParams): Promise<VideoQueueResult> {
  const body: Record<string, unknown> = {
    model: p.model,
    prompt: p.prompt,
    duration: p.duration,
  };
  if (p.aspectRatio) body.aspect_ratio = p.aspectRatio;
  if (p.negativePrompt) body.negative_prompt = p.negativePrompt;
  if (typeof p.seed === "number") body.seed = p.seed;
  if (p.imageUrl) body.image_url = p.imageUrl;

  const data = await postJson<any>("/video/queue", body);
  const queueId = data?.queue_id ?? data?.id;
  if (!queueId) throw veniceError(502, "Venice non ha restituito un queue_id");

  return {
    capability: "vid_out",
    provider: "venice",
    model: p.model,
    queueId: String(queueId),
    downloadUrl: data?.download_url,
    status: String(data?.status ?? "PROCESSING"),
  };
}

export interface VideoRetrieveResult {
  status: string;
  /** Video in base64, quando il job e' completato e il modello lo incorpora. */
  video?: string;
  downloadUrl?: string;
  durationSeconds?: number;
  progress?: number;
}

/** Recupera lo stato (o il risultato) di un job video. */
export async function retrieveVideo(
  queueId: string,
  model: string,
): Promise<VideoRetrieveResult> {
  const data = await postJson<any>("/video/retrieve", { model, queue_id: queueId });
  const status = String(data?.status ?? "UNKNOWN");
  const video: string | undefined =
    typeof data?.video === "string"
      ? data.video
      : Array.isArray(data?.videos) && typeof data.videos[0] === "string"
        ? data.videos[0]
        : undefined;

  return {
    status,
    video,
    downloadUrl: data?.download_url,
    durationSeconds: typeof data?.duration === "number" ? data.duration : undefined,
    progress: typeof data?.progress === "number" ? data.progress : undefined,
  };
}
