// Configurazione del BFF. Tutti i valori arrivano da env (nessun segreto nel codice).

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Variabile d'ambiente mancante: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",

  // URL interno del container Activepieces (rete docker) o pubblico in dev.
  apUrl: (process.env.AP_INTERNAL_URL ?? "http://app:80").replace(/\/$/, ""),
  // URL pubblico, solo per i link di fallback verso l'admin UI.
  apPublicUrl: (process.env.AP_PUBLIC_URL ?? "https://app.aethersy.online").replace(/\/$/, ""),

  // Segreto per firmare il cookie di sessione. Se assente, il server non parte.
  sessionSecret: req("CONSOLE_SESSION_SECRET"),

  // Chiave OpenRouter, tenuta SOLO lato server.
  openRouterKey: req("OPENROUTER_API_KEY"),
  openRouterBase: (process.env.OPENROUTER_BASE ?? "https://openrouter.ai/api/v1").replace(/\/$/, ""),

  // Venice: usata per la GENERAZIONE (img_out / tts / vid_out), che OpenRouter
  // non offre. Se la chiave manca, le capability generative rispondono 503.
  veniceKey: process.env.VENICE_API_KEY ?? "",
  veniceBase: (process.env.VENICE_BASE_URL ?? "https://api.venice.ai/api/v1").replace(/\/$/, ""),

  // --- Metering / billing (schema Postgres `metering`, vedi docs) -------------
  // Kill-switch: se `false` il metering e' disattivato (nessuna scrittura DB).
  meteringEnabled: (process.env.METERING_ENABLED ?? "false") === "true",
  // Postgres: si accetta un DSN completo (`CONSOLE_DB_URL`) oppure i parametri
  // discreti PG*. I discreti evitano di mettere user/password dentro una URL
  // (niente segreti in chiaro nei file di config e nei log di connessione).
  dbUrl: process.env.CONSOLE_DB_URL ?? "",
  pg: {
    host: process.env.CONSOLE_PGHOST ?? "",
    port: Number(process.env.CONSOLE_PGPORT ?? 5432),
    user: process.env.CONSOLE_PGUSER ?? "",
    password: process.env.CONSOLE_PGPASSWORD ?? "",
    database: process.env.CONSOLE_PGDATABASE ?? "",
  },
  // Redis per rate limit / lock. Se assente, il rate limit viene saltato.
  redisUrl: process.env.REDIS_URL ?? "",
  redis: {
    host: process.env.CONSOLE_REDIS_HOST ?? "",
    port: Number(process.env.CONSOLE_REDIS_PORT ?? 6379),
    password: process.env.CONSOLE_REDIS_PASSWORD ?? "",
  },
  // Richieste AI per minuto e per tenant/chiave (rate limit).
  ratePerMinute: Number(process.env.METERING_RATE_PER_MINUTE ?? 120),
  // Credito di benvenuto assegnato al provisioning del primo accesso (0 = nessuno).
  signupCredits: Number(process.env.METERING_SIGNUP_CREDITS ?? 0),

  // Chiave per cifrare a riposo i segreti delle integrazioni (AES-256-GCM).
  // Deve essere una stringa esadecimale di 64 caratteri (32 byte): `openssl rand -hex 32`.
  // Fallback su AP_ENCRYPTION_KEY (stessa chiave dello stack Activepieces) per
  // non introdurre un secondo segreto da custodire; se assente, le funzioni di
  // cifratura delle integrazioni falliscono esplicitamente.
  secretsKey: process.env.CONSOLE_SECRETS_KEY ?? process.env.AP_ENCRYPTION_KEY ?? "",

  // Nome cookie di sessione.
  cookieName: "aethersy_session",
  cookieMaxAgeSec: 60 * 60 * 24 * 7,
};

/** Vero se esiste una configurazione Postgres utilizzabile (DSN o parametri). */
export function hasDbConfig(): boolean {
  return Boolean(config.dbUrl) || Boolean(config.pg.host && config.pg.database);
}

/** Vero se esiste una configurazione Redis utilizzabile (URL o parametri). */
export function hasRedisConfig(): boolean {
  return Boolean(config.redisUrl) || Boolean(config.redis.host);
}
