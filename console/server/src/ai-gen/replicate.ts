// =============================================================================
// Replicate — client di fallback per generazione (img_out / tts / vid_out).
//
// Usato quando Venice non risponde (fallback automatico). Endpoint:
//   POST /predictions  -> { id, status, output }
//   GET  /predictions/:id -> { status, output }
//
// Replicate modelli pubblici usati:
//   img_out: stability-ai/sdxl (text-to-image)
//   tts:     none nativo -> usiamo fallback su testo se necessario
//   vid_out: none nativo -> fallback limitato
// =============================================================================

import { config } from "../config.js";

export type ReplicateCapability = "img_out" | "tts" | "vid_out";

interface ReplicateError extends Error {
  status?: number;
}

function replicateError(status: number, message: string): ReplicateError {
  const err = new Error(message) as ReplicateError;
  err.status = status;
  return err;
}

function authHeaders(): Record<string, string> {
  if (!config.replicateApiKey) {
    throw replicateError(503, "REPLICATE_API_KEY non configurata: fallback non disponibile");
  }
  return {
    Authorization: `Token ${config.replicateApiKey}`,
    "Content-Type": "application/json",
    Prefer: "wait",
  };
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${config.replicateBase}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = data?.error?.detail ?? data?.error ?? `Replicate ${res.status}`;
    throw replicateError(res.status, String(msg));
  }
  return data as T;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${config.replicateBase}${path}`, {
    headers: authHeaders(),
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = data?.error?.detail ?? data?.error ?? `Replicate ${res.status}`;
    throw replicateError(res.status, String(msg));
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

export interface ImageGenResult {
  capability: "img_out";
  provider: "replicate";
  model: string;
  images: string[];
  format: string;
  billableUnits: number;
  latencyMs: number;
}

export async function generateImage(p: {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  format?: "png" | "jpeg" | "webp";
}): Promise<ImageGenResult> {
  const started = Date.now();
  const model = p.model ?? "stability-ai/sdxl:82be395cba9e83b7c8c3b5f5c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6";

  const body: Record<string, unknown> = {
    model,
    input: {
      prompt: p.prompt,
    },
  };

  const data = await postJson<any>("/predictions", body);
  const id = data?.id;
  if (!id) throw replicateError(502, "Replicate non ha restituito un prediction id");

  // Replicate con Prefer: wait restituisce già l'output se completato entro il timeout
  let output: any = data?.output;
  let status = data?.status ?? "processing";

  if (status !== "succeeded" && id) {
    // Poll per un massimo di ~60 secondi
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await getJson<any>(`/predictions/${id}`);
      status = poll?.status ?? status;
      output = poll?.output ?? output;
      if (status === "succeeded" || status === "failed" || status === "canceled") break;
    }
  }

  if (status !== "succeeded") {
    throw replicateError(502, `Replicate generazione fallita (status: ${status})`);
  }

  const images: string[] = Array.isArray(output) ? output : output ? [output] : [];
  if (!images.length) throw replicateError(502, "Replicate non ha restituito immagini");

  return {
    capability: "img_out",
    provider: "replicate",
    model,
    images: images.map((img: string) => String(img)),
    format: p.format ?? "png",
    billableUnits: images.length,
    latencyMs: Date.now() - started,
  };
}

// --- Sintesi vocale (TTS) ----------------------------------------------------

export interface TtsResult {
  capability: "tts";
  provider: "replicate";
  model: string;
  voice: string;
  audio: string;
  format: string;
  billableUnits: number;
  latencyMs: number;
}

export async function synthesizeSpeech(p: {
  input: string;
  model?: string;
  voice?: string;
  responseFormat?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
}): Promise<TtsResult> {
  if (p.input.length > 4096) throw replicateError(400, "input TTS > 4096 caratteri");
  const started = Date.now();
  const model = p.model ?? "riffusion/riffusion";

  const body: Record<string, unknown> = {
    model,
    input: { text: p.input },
  };

  const data = await postJson<any>("/predictions", body);
  const id = data?.id;
  if (!id) throw replicateError(502, "Replicate non ha restituito un prediction id");

  let output: any = data?.output;
  let status = data?.status ?? "processing";

  if (status !== "succeeded" && id) {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await getJson<any>(`/predictions/${id}`);
      status = poll?.status ?? status;
      output = poll?.output ?? output;
      if (status === "succeeded" || status === "failed" || status === "canceled") break;
    }
  }

  if (status !== "succeeded") {
    throw replicateError(502, `Replicate TTS fallita (status: ${status})`);
  }

  const audioUrl: string | undefined = typeof output === "string" ? output : output?.url ?? output?.[0];
  if (!audioUrl) throw replicateError(502, "Replicate non ha restituito audio");

  // Scarica l'audio e convertilo in base64
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw replicateError(502, "Impossibile scaricare audio da Replicate");
  const buf = Buffer.from(await audioRes.arrayBuffer());

  return {
    capability: "tts",
    provider: "replicate",
    model,
    voice: p.voice ?? "default",
    audio: buf.toString("base64"),
    format: p.responseFormat ?? "mp3",
    billableUnits: p.input.length,
    latencyMs: Date.now() - started,
  };
}

// --- Video (asincrono) ------------------------------------------------------

export interface VideoQueueResult {
  capability: "vid_out";
  provider: "replicate";
  model: string;
  queueId: string;
  downloadUrl?: string;
  status: string;
  latencyMs: number;
}

export async function queueVideo(p: {
  prompt: string;
  model: string;
  duration: string;
  aspectRatio?: string;
}): Promise<VideoQueueResult> {
  const started = Date.now();
  const model = p.model ?? "stable-diffusion/video";

  const body: Record<string, unknown> = {
    model,
    input: {
      prompt: p.prompt,
    },
  };

  const data = await postJson<any>("/predictions", body);
  const id = data?.id;
  if (!id) throw replicateError(502, "Replicate non ha restituito un prediction id");

  return {
    capability: "vid_out",
    provider: "replicate",
    model,
    queueId: String(id),
    downloadUrl: data?.output?.url,
    status: String(data?.status ?? "PROCESSING"),
    latencyMs: Date.now() - started,
  };
}

export interface VideoRetrieveResult {
  status: string;
  video?: string;
  downloadUrl?: string;
  durationSeconds?: number;
  progress?: number;
}

export async function retrieveVideo(
  queueId: string,
  model: string,
): Promise<VideoRetrieveResult> {
  const data = await getJson<any>(`/predictions/${queueId}`);
  const status = String(data?.status ?? "UNKNOWN");
  const video: string | undefined =
    typeof data?.output === "string"
      ? data.output
      : Array.isArray(data?.output) && typeof data.output[0] === "string"
        ? data.output[0]
        : undefined;

  return {
    status,
    video,
    downloadUrl: data?.output?.url,
  };
}
