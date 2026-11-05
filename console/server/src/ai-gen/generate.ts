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

// =============================================================================
// Dispatch della GENERAZIONE (img_out / tts / vid_out) verso Venice, con
// fallback automatico su Replicate quando Venice non risponde.
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
 * Addebita un consumo generativo. La stima di prenotazione viene fornita dal
 * guard; qui si registra il consuntivo reale.
 */
async function billGen(
  meter: GenMeter,
  capability: GenCapability,
  model: string,
  billableUnits: number,
  latencyMs: number,
  provider: "venice" | "replicate",
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
    const result = await replicateGenerateImage({
      prompt: params.prompt,
      model: meter.model ?? chosen.id,
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
  }
}

export interface SynthesizeInput extends Omit<TtsParams, "model"> {
  meter: GenMeter;
}

export async function synthesizeSpeechMetered(input: SynthesizeInput) {
  const { meter, ...params } = input;
  const chosen = await selectGenModel("tts", { requested: meter.model });

  try {
    const result = await veniceSynthesizeSpeech({ ...params, model: chosen.id });
    const billing = await billGen(meter, "tts", result.model, result.billableUnits, result.latencyMs, "venice");
    return { ...result, billing };
  } catch (veniceErr) {
    // Fallback su Replicate se Venice non risponde
    const result = await replicateSynthesizeSpeech({
      input: params.input,
      model: meter.model ?? chosen.id,
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
      model: meter.model ?? chosen.id,
      duration: params.duration,
      aspectRatio: params.aspectRatio,
    });
    const billing = await billGen(meter, "vid_out", result.model, 1, 0, "replicate");
    return { ...result, billing, fallbackFrom: "venice" };
  }
}
