// price-snapshot.ts — Aggiornamento automatico del price_book da listini provider + FX
//
// Esegue ogni 6h (cron: "0 */6 * * *") in timezone Europe/Rome.
// 1) Scarica i modelli da OpenRouter (GET /models) e Venice (GET /models)
// 2) Scarica il tasso USD/EUR (exchangerate.host)
// 3) Chiude il price_book attivo (effective_to = now())
// 4) Crea un nuovo price_book versione++ con fx_usd_eur aggiornato
// 5) Popola price_book_entry con i prezzi correnti dai provider

import { fetch } from 'undici';
import { config } from '../config.js';
import { db } from './db.js';
import { parseCron, isValidTimeZone, wallClockAt, zonedTimeToUtc } from '../platform/cron.js';

interface ProviderModel {
  id: string;
  name: string;
  pricing?: { prompt?: number; completion?: number; request?: number; image?: number; video?: number; audio?: number; };
  context_length?: number;
  architecture?: { modality?: string; input_modalities?: string[] };
  capabilities?: string[];
  type?: string;
}

interface FxRateResponse {
  base: string;
  date: string;
  rates: Record<string, number>;
}

const OPENROUTER_MODELS_URL = `${config.openRouterBase}/models`;
const VENICE_MODELS_URL = `${config.veniceBase}/models`;
const FX_API_URL = 'https://api.exchangerate.host/latest?base=USD&symbols=EUR';

function inferCapabilities(m: ProviderModel): string[] {
  const caps: string[] = ['text'];
  const modality = m.architecture?.modality || m.capabilities || m.type || '';
  const inputModalities = m.architecture?.input_modalities || [];

  if (typeof modality === 'string') {
    if (modality.includes('vision') || modality.includes('image')) caps.push('img_in');
    if (modality.includes('audio')) caps.push('stt');
    if (modality.includes('video')) caps.push('vid_in');
  } else if (Array.isArray(modality)) {
    if (modality.includes('vision') || modality.includes('image')) caps.push('img_in');
    if (modality.includes('audio')) caps.push('stt');
    if (modality.includes('video')) caps.push('vid_in');
  }

  if (Array.isArray(inputModalities)) {
    if (inputModalities.includes('image')) caps.push('img_in');
    if (inputModalities.includes('audio')) caps.push('stt');
    if (inputModalities.includes('video')) caps.push('vid_in');
  }

  // Generazione (inferita da id/nome)
  const idLower = m.id.toLowerCase();
  if (idLower.includes('image') || idLower.includes('flux') || idLower.includes('dall-e') || idLower.includes('gpt-image') || idLower.includes('stable-diffusion') || idLower.includes('sdxl')) caps.push('img_out');
  if (idLower.includes('tts') || idLower.includes('speech') || idLower.includes('chatterbox') || idLower.includes('elevenlabs') || idLower.includes('kokoro')) caps.push('tts');
  if (idLower.includes('video') || idLower.includes('veo') || idLower.includes('kling') || idLower.includes('wan') || idLower.includes('sora') || idLower.includes('seedance') || idLower.includes('runway') || idLower.includes('gen-4') || idLower.includes('gen4')) caps.push('vid_out');

  return [...new Set(caps)];
}

async function fetchOpenRouterModels(): Promise<ProviderModel[]> {
  if (!config.openRouterKey) return [];
  const res = await fetch(OPENROUTER_MODELS_URL, {
    headers: { Authorization: `Bearer ${config.openRouterKey}` },
  });
  if (!res.ok) throw new Error(`OpenRouter models fetch failed: ${res.status}`);
  const json = await res.json() as { data?: ProviderModel[] };
  return json.data || [];
}

async function fetchVeniceModels(): Promise<ProviderModel[]> {
  if (!config.veniceKey) return [];
  const res = await fetch(VENICE_MODELS_URL, {
    headers: { Authorization: `Bearer ${config.veniceKey}` },
  });
  if (!res.ok) throw new Error(`Venice models fetch failed: ${res.status}`);
  const json = await res.json() as { data?: ProviderModel[] };
  return json.data || [];
}

async function fetchFxRate(): Promise<number> {
  const res = await fetch(FX_API_URL);
  if (!res.ok) throw new Error(`FX rate fetch failed: ${res.status}`);
  const json = await res.json() as FxRateResponse;
  const rate = json.rates?.EUR;
  if (!rate) throw new Error('EUR rate not found in FX response');
  return rate;
}

function isFreeModel(m: ProviderModel): boolean {
  if (!m.pricing) return false;
  return (m.pricing.prompt === 0 && m.pricing.completion === 0) || m.id.endsWith(':free');
}

function getUnitPrice(m: ProviderModel, unit: 'token_in' | 'token_out' | 'image' | 'video' | 'char' | 'second'): number | null {
  if (!m.pricing) return null;
  switch (unit) {
    case 'token_in': return m.pricing.prompt ?? null;
    case 'token_out': return m.pricing.completion ?? null;
    case 'image': return m.pricing.image ?? null;
    case 'video': return m.pricing.video ?? null;
    case 'char': return m.pricing.audio ?? null; // tts pricing often under audio
    case 'second': return m.pricing.audio ?? null; // stt pricing often under audio
    default: return null;
  }
}

async function runPriceSnapshot(): Promise<void> {
  console.log('[price-snapshot] Starting price book snapshot...');

  const pg = db();

  // 1) Fetch current active price book
  const activePb = await pg.query(
    `SELECT id, version, default_markup_bps, fx_usd_eur
     FROM metering.price_book
     WHERE effective_from <= now() AND (effective_to IS NULL OR effective_to > now())
     ORDER BY version DESC LIMIT 1`
  );

  if (activePb.rowCount === 0) {
    throw new Error('No active price book found');
  }

  const currentVersion = activePb.rows[0].version;
  const defaultMarkup = activePb.rows[0].default_markup_bps;

  // 2) Fetch models from providers
  const [orModels, veniceModels, fxRate] = await Promise.all([
    fetchOpenRouterModels(),
    fetchVeniceModels(),
    fetchFxRate(),
  ]);

  console.log(`[price-snapshot] Fetched ${orModels.length} OpenRouter models, ${veniceModels.length} Venice models, FX USD/EUR = ${fxRate}`);

  // 3) Build new price book entries
  const newVersion = currentVersion + 1;
  const entries: Array<{
    capability: string;
    model_pattern: string;
    provider: string;
    unit: string;
    unit_price: number;
    min_credits: number;
  }> = [];

  // Process OpenRouter models
  for (const m of orModels) {
    const caps = inferCapabilities(m);
    const isFree = isFreeModel(m);

    for (const cap of caps) {
      if (cap === 'text') {
        const inPrice = getUnitPrice(m, 'token_in');
        const outPrice = getUnitPrice(m, 'token_out');
        if (inPrice !== null) {
          entries.push({
            capability: 'text',
            model_pattern: isFree ? '*:free' : m.id,
            provider: 'openrouter',
            unit: 'token_in',
            unit_price: isFree ? 0 : inPrice,
            min_credits: isFree ? 1 : 0,
          });
        }
        if (outPrice !== null) {
          entries.push({
            capability: 'text',
            model_pattern: isFree ? '*:free' : m.id,
            provider: 'openrouter',
            unit: 'token_out',
            unit_price: isFree ? 0 : outPrice,
            min_credits: isFree ? 1 : 0,
          });
        }
      } else if (['img_out', 'vid_out', 'tts', 'stt'].includes(cap)) {
        const unit = cap === 'img_out' ? 'image' : cap === 'vid_out' ? 'video' : cap === 'tts' ? 'char' : 'second';
        const price = getUnitPrice(m, unit);
        if (price !== null && price > 0) {
          entries.push({
            capability: cap,
            model_pattern: m.id,
            provider: 'openrouter',
            unit,
            unit_price: price,
            min_credits: 0,
          });
        }
      }
    }
  }

  // Process Venice models
  for (const m of veniceModels) {
    const caps = inferCapabilities(m);
    const isFree = isFreeModel(m);

    for (const cap of caps) {
      if (cap === 'text') {
        const inPrice = getUnitPrice(m, 'token_in');
        const outPrice = getUnitPrice(m, 'token_out');
        if (inPrice !== null) {
          entries.push({
            capability: 'text',
            model_pattern: isFree ? '*:free' : m.id,
            provider: 'venice',
            unit: 'token_in',
            unit_price: isFree ? 0 : inPrice,
            min_credits: isFree ? 1 : 0,
          });
        }
        if (outPrice !== null) {
          entries.push({
            capability: 'text',
            model_pattern: isFree ? '*:free' : m.id,
            provider: 'venice',
            unit: 'token_out',
            unit_price: isFree ? 0 : outPrice,
            min_credits: isFree ? 1 : 0,
          });
        }
      } else if (['img_out', 'vid_out', 'tts', 'stt'].includes(cap)) {
        const unit = cap === 'img_out' ? 'image' : cap === 'vid_out' ? 'video' : cap === 'tts' ? 'char' : 'second';
        const price = getUnitPrice(m, unit);
        if (price !== null && price > 0) {
          entries.push({
            capability: cap,
            model_pattern: m.id,
            provider: 'venice',
            unit,
            unit_price: price,
            min_credits: 0,
          });
        }
      }
    }
  }

  // Add catch-all entries for each provider/capability/unit
  const catchAllEntries = [
    // OpenRouter text
    { capability: 'text', model_pattern: '*', provider: 'openrouter', unit: 'token_in', unit_price: 0.15, min_credits: 0 },
    { capability: 'text', model_pattern: '*', provider: 'openrouter', unit: 'token_out', unit_price: 0.60, min_credits: 0 },
    // Venice text
    { capability: 'text', model_pattern: '*', provider: 'venice', unit: 'token_in', unit_price: 1.00, min_credits: 0 },
    { capability: 'text', model_pattern: '*', provider: 'venice', unit: 'token_out', unit_price: 3.00, min_credits: 0 },
    // Venice generation
    { capability: 'img_out', model_pattern: '*', provider: 'venice', unit: 'image', unit_price: 0.05, min_credits: 0 },
    { capability: 'vid_out', model_pattern: '*', provider: 'venice', unit: 'video', unit_price: 1.50, min_credits: 0 },
    { capability: 'tts', model_pattern: '*', provider: 'venice', unit: 'char', unit_price: 3.50, min_credits: 0 },
    { capability: 'stt', model_pattern: '*', provider: 'venice', unit: 'second', unit_price: 0.000167, min_credits: 0 },
    // Flow run (orchestration)
    { capability: 'flow_run', model_pattern: '*', provider: '*', unit: 'request', unit_price: 0.002, min_credits: 1 },
  ];

  for (const e of catchAllEntries) {
    // Only add if not already covered
    const exists = entries.some(x => x.capability === e.capability && x.provider === e.provider && x.unit === e.unit && x.model_pattern === e.model_pattern);
    if (!exists) entries.push(e);
  }

  // 4) Transaction: close old price book, create new one, insert entries
  const client = await pg.connect();
  try {
    await client.query('BEGIN');

    // Close current active price book
    await client.query(
      `UPDATE metering.price_book SET effective_to = now() WHERE id = $1`,
      [activePb.rows[0].id]
    );

    // Create new price book
    const newPb = await client.query(
      `INSERT INTO metering.price_book (version, default_markup_bps, fx_usd_eur, effective_from)
       VALUES ($1, $2, $3, now())
       RETURNING id`,
      [newVersion, defaultMarkup, fxRate]
    );

    const newPbId = newPb.rows[0].id;

    // Insert entries
    for (const e of entries) {
      await client.query(
        `INSERT INTO metering.price_book_entry (price_book_id, capability, model_pattern, provider, unit, unit_price, min_credits)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (price_book_id, capability, model_pattern, provider, unit) DO NOTHING`,
        [newPbId, e.capability, e.model_pattern, e.provider, e.unit, e.unit_price, e.min_credits]
      );
    }

    await client.query('COMMIT');
    console.log(`[price-snapshot] Price book v${newVersion} created with ${entries.length} entries, FX=${fxRate}`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Simple cron scheduler (no deps, uses platform/cron utilities)
interface ScheduledJob {
  name: string;
  spec: ReturnType<typeof parseCron>;
  timezone: string;
  handler: () => Promise<void>;
  enabled: boolean;
}

class PriceSnapshotScheduler {
  private jobs: ScheduledJob[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  schedule(name: string, cronExpr: string, timezone: string, handler: () => Promise<void>): void {
    const spec = parseCron(cronExpr);
    if (!isValidTimeZone(timezone)) throw new Error(`Invalid timezone: ${timezone}`);
    this.jobs.push({ name, spec, timezone, handler, enabled: true });
    console.log(`[price-snapshot] Scheduled job "${name}" with cron "${cronExpr}" in ${timezone}`);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const tick = async () => {
      if (!this.running) return;
      const now = new Date();
      for (const job of this.jobs) {
        if (!job.enabled) continue;
        const nextRun = this.getNextRun(job.spec, job.timezone, now);
        // If next run is within the last minute (with some tolerance), execute
        if (nextRun && nextRun.getTime() <= now.getTime() + 60_000) {
          try {
            console.log(`[price-snapshot] Executing job "${job.name}"`);
            await job.handler();
          } catch (e) {
            console.error(`[price-snapshot] Job "${job.name}" failed:`, e);
          }
        }
      }
      // Next check at the next minute boundary
      const ms = 60_000 - (now.getTime() % 60_000);
      this.timer = setTimeout(tick, ms);
    };
    tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private getNextRun(spec: ReturnType<typeof parseCron>, timezone: string, from: Date): Date | null {
    const hours = [...spec.hour.values].sort((a, b) => a - b);
    const minutes = [...spec.minute.values].sort((a, b) => a - b);
    const start = from.getTime();
    const local = wallClockAt(start, timezone);

    let cursor = Date.UTC(local.year, local.month - 1, local.day);
    for (let i = 0; i < 400; i++) {
      const date = new Date(cursor);
      const y = date.getUTCFullYear();
      const m = date.getUTCMonth() + 1;
      const d = date.getUTCDate();
      if (this.matchesDay(spec, y, m, d)) {
        for (const hour of hours) {
          for (const minute of minutes) {
            const ts = zonedTimeToUtc({ year: y, month: m, day: d, hour, minute }, timezone);
            if (ts > start) return new Date(ts);
          }
        }
      }
      cursor += 86_400_000;
    }
    return null;
  }

  private matchesDay(spec: ReturnType<typeof parseCron>, year: number, month: number, day: number): boolean {
    if (!spec.month.values.has(month)) return false;
    const domMatch = spec.dom.values.has(day);
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const dowMatch = spec.dow.values.has(dow);
    const domRestricted = !spec.dom.wildcard;
    const dowRestricted = !spec.dow.wildcard;
    if (domRestricted && dowRestricted) return domMatch || dowMatch;
    if (domRestricted) return domMatch;
    if (dowRestricted) return dowMatch;
    return true;
  }
}

export const priceSnapshotScheduler = new PriceSnapshotScheduler();

export async function schedulePriceSnapshot(): Promise<void> {
  priceSnapshotScheduler.schedule('price-snapshot', '0 */6 * * *', 'Europe/Rome', runPriceSnapshot);
  priceSnapshotScheduler.start();
}

export { runPriceSnapshot };
