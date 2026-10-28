import { config } from "../config.js";

// Selezione del modello Venice per la generazione, dal catalogo LIVE
// (GET /models). Nessuna lista hard-coded obbligatoria: le preferenze curate
// sono solo un suggerimento, intersecato col catalogo reale.

export type GenCapability = "img_out" | "tts" | "vid_out";

export interface VeniceModel {
  id: string;
  name: string;
  type: string;
  /** Prezzo per immagine / generazione / 1M caratteri, in USD. */
  unitPriceUsd: number;
  /** Vincoli di parametri dichiarati dal modello (se presenti). */
  constraints?: Record<string, unknown>;
}

interface VeniceRaw {
  id: string;
  model_spec?: {
    name?: string;
    capability?: { optimizedFor?: string };
    pricing?: { input?: { usd?: number }; output?: { usd?: number } };
    constraints?: Record<string, unknown>;
  };
  type?: string;
}

const CACHE_TTL_MS = 10 * 60_000;
let cache: { at: number; models: VeniceModel[] } | null = null;

// Preferenze curate (28/10/2026): modelli generativi Venice piu' economici/affidabili.
const PREFERRED: Record<GenCapability, string[]> = {
  img_out: ["venice-sd35", "flux-2-pro", "grok-imagine-image", "qwen-image"],
  tts: ["tts-kokoro", "tts-qwen3-0-6b", "tts-xai-v1", "tts-elevenlabs-turbo-v2-5"],
  vid_out: ["veo3.1-fast-text-to-video", "kling-2.5-turbo-text-to-video"],
};

const TYPE_MATCH: Record<GenCapability, string[]> = {
  img_out: ["image", "inpaint"],
  tts: ["tts"],
  vid_out: ["video"],
};

function priceOf(m: VeniceRaw): number {
  const out = m.model_spec?.pricing?.output?.usd;
  const inp = m.model_spec?.pricing?.input?.usd;
  const v = out ?? inp ?? 0;
  return Number.isFinite(v) ? Number(v) : 0;
}

export async function fetchVeniceCatalog(): Promise<VeniceModel[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.models;
  const res = await fetch(`${config.veniceBase}/models`, {
    headers: config.veniceKey ? { Authorization: `Bearer ${config.veniceKey}` } : {},
  });
  if (!res.ok) throw new Error(`Venice /models ${res.status}`);
  const body = (await res.json()) as { data?: VeniceRaw[] };
  const models: VeniceModel[] = (body.data ?? []).map((m) => ({
    id: m.id,
    name: m.model_spec?.name ?? m.id,
    type: String(m.type ?? "text"),
    unitPriceUsd: priceOf(m),
    constraints: m.model_spec?.constraints,
  }));
  cache = { at: Date.now(), models };
  return models;
}

/** Ordina i modelli Venice per la capacita' generativa richiesta. */
export async function rankGenModels(
  capability: GenCapability,
  opts: { requested?: string } = {},
): Promise<VeniceModel[]> {
  const all = await fetchVeniceCatalog();
  const types = TYPE_MATCH[capability];
  const capable = all.filter((m) => types.includes(m.type));
  const pool = capable.length ? capable : all;

  const preferred = PREFERRED[capability]
    .map((id) => pool.find((m) => m.id === id))
    .filter((m): m is VeniceModel => Boolean(m));
  const rest = pool
    .filter((m) => !preferred.includes(m))
    .sort((a, b) => a.unitPriceUsd - b.unitPriceUsd);
  const ranked = [...preferred, ...rest];

  if (opts.requested) {
    const exact = pool.find((m) => m.id === opts.requested);
    if (exact) return [exact, ...ranked.filter((m) => m.id !== exact.id)];
  }
  return ranked;
}

/** Modello generativo selezionato (con prezzo unitario) per la capability. */
export async function selectGenModel(
  capability: GenCapability,
  opts: { requested?: string } = {},
): Promise<VeniceModel> {
  return (await rankGenModels(capability, opts))[0];
}
