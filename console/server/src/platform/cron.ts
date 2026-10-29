// Motore cron minimale (5 campi: minuto ora giorno-mese mese giorno-settimana)
// con calcolo della prossima esecuzione in una timezone IANA.
//
// Nessuna dipendenza esterna: usa `Intl.DateTimeFormat` sia per leggere l'ora
// locale di un istante, sia per riconvertire un orario "da parete" locale in
// UTC (con un secondo passaggio che assorbe il cambio di ora legale).
//
// Sintassi supportata: `*`, liste `a,b`, range `a-b`, step `*/n` e `a-b/n`,
// nomi inglesi per mese (`jan`..`dec`) e giorno (`sun`..`sat`). La semantica
// giorno-mese / giorno-settimana segue il cron classico (Vixie): se entrambi i
// campi sono ristretti, la data corrisponde se corrisponde ALMENO uno dei due.

export class CronError extends Error {}

interface CronField {
  values: Set<number>;
  /** true solo per `*`: serve alla semantica "either" di dom/dow. */
  wildcard: boolean;
}

export interface CronSpec {
  minute: CronField;
  hour: CronField;
  dom: CronField;
  month: CronField;
  dow: CronField;
  /** Espressione originale normalizzata. */
  raw: string;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const DOW_NAMES: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function toValue(token: string, min: number, max: number, names?: Record<string, number>): number {
  const key = token.trim().toLowerCase();
  const named = names?.[key];
  const value = named ?? Number(key);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new CronError(`valore non valido: "${token}" (atteso ${min}-${max})`);
  }
  return value;
}

function parseField(raw: string, min: number, max: number, names?: Record<string, number>): CronField {
  const text = raw.trim().toLowerCase();
  if (!text) throw new CronError("campo vuoto");
  const wildcard = text === "*";
  const values = new Set<number>();

  for (const part of text.split(",")) {
    const [base, stepRaw] = part.split("/");
    let step = 1;
    if (stepRaw !== undefined) {
      step = Number(stepRaw);
      if (!Number.isInteger(step) || step < 1) throw new CronError(`step non valido: "${part}"`);
    }

    let lo: number;
    let hi: number;
    if (base === "*" || base === "") {
      lo = min;
      hi = max;
    } else if (base.includes("-")) {
      const [a, b] = base.split("-");
      lo = toValue(a, min, max, names);
      hi = toValue(b, min, max, names);
      if (lo > hi) throw new CronError(`range non valido: "${part}"`);
    } else {
      const single = toValue(base, min, max, names);
      if (stepRaw !== undefined) {
        lo = single;
        hi = max;
      } else {
        lo = single;
        hi = single;
      }
    }

    for (let v = lo; v <= hi; v += step) values.add(v);
  }

  if (values.size === 0) throw new CronError(`campo senza valori: "${raw}"`);
  return { values, wildcard };
}

/** Analizza un'espressione cron a 5 campi. Lancia `CronError` se non valida. */
export function parseCron(expr: string): CronSpec {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new CronError(`attesi 5 campi, trovati ${parts.length}`);
  }
  const [mi, ho, dom, mo, dw] = parts;
  const minute = parseField(mi, 0, 59);
  const hour = parseField(ho, 0, 23);
  const domField = parseField(dom, 1, 31);
  const month = parseField(mo, 1, 12, MONTH_NAMES);
  const dow = parseField(dw, 0, 7, DOW_NAMES);
  // 7 e' un alias di domenica (0).
  if (dow.values.has(7)) {
    dow.values.delete(7);
    dow.values.add(0);
  }
  return { minute, hour, dom: domField, month, dow, raw: expr.trim() };
}

/** Vero se l'espressione e' un cron a 5 campi valido. */
export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr);
    return true;
  } catch {
    return false;
  }
}

// --- Timezone (Intl) ---------------------------------------------------------

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let cached = formatterCache.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, cached);
  }
  return cached;
}

/** Vero se la stringa e' una timezone IANA riconosciuta dal runtime. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClockAt(ts: number, timeZone: string): WallClock {
  const parts = formatter(timeZone).formatToParts(new Date(ts));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Scostamento (ms) fra l'ora locale in `timeZone` e l'UTC all'istante `ts`. */
function tzOffsetMs(ts: number, timeZone: string): number {
  const t = Math.floor(ts / 1000) * 1000;
  const w = wallClockAt(t, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - t;
}

/** Converte un orario locale "da parete" in UTC, assorbendo l'ora legale. */
function zonedTimeToUtc(
  w: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): number {
  const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, 0, 0);
  const off1 = tzOffsetMs(guess, timeZone);
  let ts = guess - off1;
  const off2 = tzOffsetMs(ts, timeZone);
  if (off2 !== off1) ts = guess - off2;
  return ts;
}

function matchesDay(spec: CronSpec, year: number, month: number, day: number): boolean {
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

/**
 * Prossima esecuzione (strettamente dopo `from`) dell'espressione cron nella
 * timezone indicata. `null` se non cade entro 400 giorni (es. 30 febbraio).
 */
export function nextCronRun(spec: CronSpec, timeZone: string, from: Date = new Date()): Date | null {
  if (!isValidTimeZone(timeZone)) throw new CronError(`timezone non valida: ${timeZone}`);
  const hours = [...spec.hour.values].sort((a, b) => a - b);
  const minutes = [...spec.minute.values].sort((a, b) => a - b);
  const start = from.getTime();
  const local = wallClockAt(start, timeZone);

  let cursor = Date.UTC(local.year, local.month - 1, local.day);
  for (let i = 0; i < 400; i++) {
    const date = new Date(cursor);
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    if (matchesDay(spec, y, m, d)) {
      for (const hour of hours) {
        for (const minute of minutes) {
          const ts = zonedTimeToUtc({ year: y, month: m, day: d, hour, minute }, timeZone);
          if (ts > start) return new Date(ts);
        }
      }
    }
    cursor += 86_400_000;
  }
  return null;
}

/** Scorciatoia: prossima esecuzione da un'espressione testuale. */
export function nextRunFor(expr: string, timeZone: string, from: Date = new Date()): Date | null {
  return nextCronRun(parseCron(expr), timeZone, from);
}
