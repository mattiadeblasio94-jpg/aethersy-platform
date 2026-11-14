// =============================================================================
// ElevenLabs — voce (TTS) e comprensione italiana (STT "Scribe").
//
// Il provider e' diretto (nessun intermediario): la stessa chiave serve per
//   - sintetizzare la voce di Jarvis (modello multilingue, ottimo in italiano);
//   - trascrivere l'audio del microfono (Scribe: comprensione italiana
//     nettamente migliore di whisper-base su termini di prodotto).
//
// Se la chiave manca o il provider risponde errore, i chiamanti ricadono sui
// provider gia' presenti (Venice -> Replicate per il TTS, faster-whisper su
// Jarvis per lo STT).
// =============================================================================

import { config } from "../config.js";

export interface ElevenSpeechParams {
  text: string;
  /** ID voce ElevenLabs (default: voce italiana maschile "marco"). */
  voiceId?: string;
  /** Modello di sintesi: multilingue v2 (qualita') o turbo/flash (velocita'). */
  model?: string;
  /** Velocita' di lettura (0.7 - 1.2). */
  speed?: number;
  outputFormat?: string;
}

export interface ElevenTranscribeParams {
  /** Audio grezzo (webm/ogg/wav/mp3...). */
  audio: Buffer;
  /** Nome file con estensione (usato dal provider per il formato). */
  fileName: string;
  mimeType?: string;
  modelId?: string;
}

// Voce pubblica ElevenLabs "Brian" (multilingue, maschile): e' il default
// dell'account Aethersy. Le voci si indicano con il loro ID, non col nome.
const DEFAULT_VOICE = "nPczCjzI2devNBz1zQrb";
const DEFAULT_MODEL = "eleven_flash_v2_5";
const DEFAULT_SCRIBE = "scribe_v1";

/** Vero se il provider ElevenLabs e' configurato su questo ambiente. */
export function elevenLabsConfigured(): boolean {
  return Boolean(config.elevenLabsKey);
}

export async function synthesizeSpeech(input: ElevenSpeechParams): Promise<Buffer> {
  if (!config.elevenLabsKey) throw new Error("ELEVENLABS_API_KEY non configurata");
  // Le voci ElevenLabs sono ID esadecimali: se il chiamante passa un id di un
  // altro provider (es. "af_sky" di Venice) si usa la voce configurata qui.
  const requested = input.voiceId ?? "";
  const voice =
    /^[0-9a-f]{20}$/i.test(requested)
      ? requested
      : config.elevenLabsVoiceId || DEFAULT_VOICE;
  const model = input.model || config.elevenLabsModel || DEFAULT_MODEL;
  const format = input.outputFormat || "mp3_44100_64";
  const speed = Math.min(1.2, Math.max(0.7, input.speed ?? 1));

  const res = await fetch(`${config.elevenLabsBase}/text-to-speech/${encodeURIComponent(voice)}`, {
    method: "POST",
    headers: {
      "xi-api-key": config.elevenLabsKey,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: input.text,
      model_id: model,
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
      pronunciation_dictionary_locators: [],
      output_format: format,
speed: speed,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS ${res.status}: ${detail.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Trascrizione con Scribe: comprensione dell'italiano (e del vocabolario di
 * prodotto) superiore a whisper su CPU, e senza carico sulla VPS.
 */
export async function transcribeSpeech(input: ElevenTranscribeParams): Promise<string> {
  if (!config.elevenLabsKey) throw new Error("ELEVENLABS_API_KEY non configurata");
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(input.audio)], { type: input.mimeType || "application/octet-stream" }),
    input.fileName,
  );
  form.append("model_id", input.modelId || config.elevenLabsScribeModel || DEFAULT_SCRIBE);
  form.append("language_code", "it");
  form.append("use_speech_to_text_api", "false");

  const res = await fetch(`${config.elevenLabsBase}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": config.elevenLabsKey },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs STT ${res.status}: ${detail.slice(0, 200)}`);
  }
  const payload = (await res.json()) as { text?: string };
  return (payload.text ?? "").trim();
}
