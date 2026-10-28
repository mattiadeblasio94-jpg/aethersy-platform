// Motore di prezzo (puro, senza dipendenze): trasforma il costo del provider in
// crediti cliente applicando markup e unita' di credito.
// Riferimento: docs/platform-consumption.md §3.3.
//
//   costo_provider_eur = costo_provider_usd * fx_usd_eur
//   prezzo_cliente_eur = costo_provider_eur * (1 + markup_bps/10000)
//   crediti            = round(prezzo_cliente_eur / credit_unit)   (min 1 se > 0)

export type Capability =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "img_out"
  | "tts"
  | "vid_out"
  | "stt"
  | "embedding"
  | "flow_run";

export type Unit =
  | "token_in"
  | "token_out"
  | "token_cached"
  | "char"
  | "image"
  | "video"
  | "second"
  | "request";

// Unita' il cui prezzo unitario e' espresso "per 1.000.000 di unita'"
// (token e caratteri): il motore divide per 1e6.
const PER_MILLION: ReadonlySet<Unit> = new Set<Unit>([
  "token_in",
  "token_out",
  "token_cached",
  "char",
]);

export interface PriceInput {
  capability: Capability;
  unit: Unit;
  /** Quantita' fatturata (token, caratteri, immagini, ...). */
  units: number;
  /** Prezzo in USD: per 1M di unita' se `unit` e' token/char, altrimenti per unita'. */
  unitPriceUsd: number;
  fxUsdEur: number;
  markupBps: number;
  /** 1 credito = creditUnit EUR (default 0,0001). */
  creditUnit: number;
  /** Crediti minimi addebitati quando il prezzo e' > 0 (es. 1 per il free tier). */
  minCredits?: number;
}

export interface PriceBreakdown {
  capability: Capability;
  unit: Unit;
  billableUnits: number;
  providerCostUsd: number;
  providerCostEur: number;
  priceEur: number;
  markupBps: number;
  credits: number;
}

export function computePrice(i: PriceInput): PriceBreakdown {
  const units = Math.max(0, i.units);
  const providerCostUsd = PER_MILLION.has(i.unit)
    ? (i.unitPriceUsd * units) / 1e6
    : i.unitPriceUsd * units;
  const providerCostEur = providerCostUsd * i.fxUsdEur;
  const priceEur = providerCostEur * (1 + i.markupBps / 10_000);
  return {
    capability: i.capability,
    unit: i.unit,
    billableUnits: units,
    providerCostUsd,
    providerCostEur,
    priceEur,
    markupBps: i.markupBps,
    credits: creditsFromEur(priceEur, i.creditUnit, i.minCredits),
  };
}

/** Converte un prezzo in EUR in crediti interi (min 1 quando il prezzo e' > 0). */
export function creditsFromEur(priceEur: number, creditUnit: number, minCredits = 0): number {
  if (priceEur <= 0) return 0;
  if (creditUnit <= 0) throw new Error("credit_unit deve essere > 0");
  const raw = Math.round(priceEur / creditUnit);
  return Math.max(minCredits, raw, 1);
}

/** Margine lordo implicito in un markup: m / (1 + m). */
export function marginFromMarkup(markupBps: number): number {
  const m = markupBps / 10_000;
  return m / (1 + m);
}

/** Markup necessario per ottenere un margine lordo target (0 < margin < 1). */
export function markupForMargin(margin: number): number {
  if (!(margin > 0 && margin < 1)) throw new Error("margine deve essere in (0, 1)");
  return Math.round((margin / (1 - margin)) * 10_000);
}
