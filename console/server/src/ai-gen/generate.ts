import { recordUsage, type TenantContext } from "../metering/repo.js";
import type { Capability, Unit } from "../metering/price.js";
import { selectGenModel, type GenCapability } from "./select.js";
import {
  generateImage as veniceGenerateImage,
  queueVideo as veniceQueueVideo,
  synthesizeSpeech as veniceSynthesizeSpeech,
  type ImageGenParams,
  type TtsParams,
  type VideoQueueParams,
} from "./venice.js";
import {
  generateImage as replicateGenerateImage,
  queueVideo as replicateQueueVideo,
  synthesizeSpeech as replicateSynthesizeSpeech,
} from "./replicate.js";
import { falGenerateImage } from "./fal.js";
import {
  elevenLabsConfigured,
  synthesizeSpeech as elevenSynthesizeSpeech,
} from "./elevenlabs.js";
import { config } from "../config.js";

// =============================================================================
// Dispatch della GENERAZIONE (img_out / tts / vid_out) verso Venice, con
// fallback automatico su Replicate quando Venice non risponde e, per le
// immagini, su fal.ai come terzo livello.
// Metering del consumo incluso.
// =============================================================================

export interface GenMeter {
  tenant: TenantContext;
  requestId: string;
  reservation: number;
  flowRunId?: string | null;
  /** Modello generativo richiesto (opzionale: altrimenti scelto dal catalogo). */
  model?: string;
}

export interface GenBilling {
  requestId: string;
  credits: number;
  charged: number;
  priceEur: number;
  balance: number;
  available: number;
  duplicate: boolean;
}

const UNIT_BY_CAPABILITY: Record<GenCapability, Unit> = {
  img_out: "image",
  tts: "char",
  vid_out: "video",
};

/**
 * Gli ID modello del catalogo Venice (es. "venice-sd35", "tts-kokoro") non
 * esistono su Replicate: passarli al fallback produce un 404 inutile. Si
 * inoltra al provider esterno solo un ID in forma "owner/name" (Replicate).
 */
function replicateModelId(requested: string | undefined): string | undefined {
  if (!requested) return undefined;
  return /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(requested) ? requested : undefined;
}

/**
 * Addebita un consumo generativo. La stima di prenotazione viene fornita dal
 * guard; qui si registra il consuntivo reale.
 */
async function billGen(
  meter: GenMeter,
  capability: GenCapability,
  model: string,
  billableUnits: number,
  latencyMs: number,
  provider: "venice" | "replicate" | "fal" | "elevenlabs",
): Promise<GenBilling> {
  const unit = UNIT_BY_CAPABILITY[capability];
  const res = await recordUsage({
    tenant: meter.tenant,
    requestId: meter.requestId,
    reservation: meter.reservation,
    flowRunId: meter.flowRunId ?? null,
    capability: capability as Capability,
    provider,
    model,
    units: { [unit]: billableUnits } as Partial<Record<Unit, number>>,
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
  };
}

export interface GenerateImageInput extends Omit<ImageGenParams, "model"> {
  meter: GenMeter;
}

export async function generateImageMetered(input: GenerateImageInput) {
  const { meter, ...params } = input;
  const chosen = await selectGenModel("img_out", { requested: meter.model });

  try {
    const result = await veniceGenerateImage({ ...params, model: chosen.id });
    const billing = await billGen(meter, "img_out", result.model, result.billableUnits, result.latencyMs, "venice");
    return { ...result, billing };
  } catch (veniceErr) {
    // Fallback su Replicate se Venice non risponde
    try {
      const result = await replicateGenerateImage({
        prompt: params.prompt,
        model: replicateModelId(meter.model),
        aspectRatio: params.aspectRatio,
        format: params.format,
      });
      const billing = await billGen(
        meter,
        "img_out",
        result.model,
        result.billableUnits,
        result.latencyMs,
        "replicate",
      );
      return { ...result, billing, fallbackFrom: "venice" };
    } catch (replicateErr) {
      // Terzo livello: fal.ai (immagini, endpoint sincroni).
      const result = await falGenerateImage({
        prompt: params.prompt,
        model: "fal-ai/flux/schnell",
        negativePrompt: params.negativePrompt,
        aspectRatio: params.aspectRatio,
      });
      const billing = await billGen(
        meter,
        "img_out",
        result.model,
        result.billableUnits,
        result.latencyMs,
        "fal",
      );
      return { ...result, billing, fallbackFrom: "replicate" };
    }
  }
}

export interface SynthesizeInput extends Omit<TtsParams, "model"> {
  meter: GenMeter;
}

export async function synthesizeSpeechMetered(input: SynthesizeInput) {
  const { meter, ...params } = input;

  // ElevenLabs diretto: voce naturale in italiano (priorita' quando la chiave
  // e' presente). In caso di errore si prosegue con Venice -> Replicate.
  // Un model esplicito "elevenlabs/<id>" sceglie la voce: il default e' il
  // modello rapido (latenza minima per il dialogo), "Rileggi" puo' chiedere
  // il modello di massima fedelta'.
  const elevenModel = meter.model?.startsWith("elevenlabs/")
    ? meter.model.slice("elevenlabs/".length)
    : undefined;
  if (elevenLabsConfigured() && (!meter.model || elevenModel)) {
    try {
      const started = Date.now();
      const audio = await elevenSynthesizeSpeech({
        text: params.input,
        voiceId: params.voice,
        model: elevenModel,
        speed: params.speed,
        outputFormat: params.responseFormat === "wav" ? "pcm_44100" : "mp3_44100_64",
      });
      const billing = await billGen(
        meter,
        "tts",
        `elevenlabs/${elevenModel ?? config.elevenLabsModel}`,
        params.input.length,
        Date.now() - started,
        "elevenlabs",
      );
      return {
        capability: "tts" as const,
        provider: "elevenlabs",
        model: `elevenlabs/${elevenModel ?? config.elevenLabsModel}`,
        voice: params.voice ?? config.elevenLabsVoiceId,
        audio: audio.toString("base64"),
        format: params.responseFormat === "wav" ? "wav" : "mp3",
        billableUnits: params.input.length,
        latencyMs: Date.now() - started,
        billing,
      };
    } catch {
      // ElevenLabs non raggiungibile: si continua con la catena gia' presente.
    }
  }

  const chosen = await selectGenModel("tts", { requested: meter.model });

  try {
    const result = await veniceSynthesizeSpeech({ ...params, model: chosen.id });
    const billing = await billGen(meter, "tts", result.model, result.billableUnits, result.latencyMs, "venice");
    return { ...result, billing };
  } catch (veniceErr) {
    // Fallback su Replicate se Venice non risponde
    const result = await replicateSynthesizeSpeech({
      input: params.input,
      model: replicateModelId(meter.model),
      voice: params.voice,
      responseFormat: params.responseFormat,
    });
    const billing = await billGen(
      meter,
      "tts",
      result.model,
      result.billableUnits,
      result.latencyMs,
      "replicate",
    );
    return { ...result, billing, fallbackFrom: "venice" };
  }
}

export interface QueueVideoInput extends Omit<VideoQueueParams, "model"> {
  meter: GenMeter;
}

/**
 * Accoda una generazione video. Venice e' asincrona: l'addebito avviene al
 * QUEUE (una generazione), il risultato si recupera con `retrieveVideo`.
 */
export async function queueVideoMetered(input: QueueVideoInput) {
  const { meter, ...params } = input;
  const chosen = await selectGenModel("vid_out", { requested: meter.model });

  try {
    const result = await veniceQueueVideo({ ...params, model: chosen.id });
    const billing = await billGen(meter, "vid_out", result.model, 1, 0, "venice");
    return { ...result, billing };
  } catch (veniceErr) {
    // Fallback su Replicate se Venice non risponde
    const result = await replicateQueueVideo({
      prompt: params.prompt,
      model: replicateModelId(meter.model) ?? "minimax/video-01",
      duration: params.duration,
      aspectRatio: params.aspectRatio,
    });
    const billing = await billGen(meter, "vid_out", result.model, 1, 0, "replicate");
    return { ...result, billing, fallbackFrom: "venice" };
  }
}
