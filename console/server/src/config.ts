// Configurazione del BFF. Tutti i valori arrivano da env (nessun segreto nel codice).
import "dotenv/config";

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

  // Replicate: fallback quando Venice non risponde (img_out / tts / vid_out).
  replicateApiKey: process.env.REPLICATE_API_KEY ?? "",
  replicateBase: (process.env.REPLICATE_BASE_URL ?? "https://api.replicate.com/v1").replace(/\/$/, ""),

  // fal.ai: terzo livello di fallback per la generazione immagini (img_out).
  // Endpoint sincroni su fal.run: la risposta porta gia' l'URL dell'immagine.
  falKey: process.env.FAL_API_KEY ?? "",
  falBase: (process.env.FAL_BASE_URL ?? "https://fal.run").replace(/\/$/, ""),

  // z.ai (Zhipu): terzo provider LLM, endpoint OpenAI-compatible.
  // Il free tier e' limitato ai modelli "*Flash" (GLM-4.5-Flash / GLM-4.7-Flash):
  // i modelli a pagamento rispondono 429 "Insufficient balance" senza credito.
  zaiKey: process.env.ZAI_API_KEY ?? "",
  zaiBase: (process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/paas/v4").replace(/\/$/, ""),
  zaiTimeoutMs: Number(process.env.ZAI_TIMEOUT_MS ?? 30_000),
  zaiMaxTokens: Number(process.env.ZAI_MAX_TOKENS ?? 4096),

  // NVIDIA (integrate.api.nvidia.com): provider di modelli gratuiti
  // (Nemotron 3.5 Bolt/Lightning, Nemotron 3 Super/Ultra, Omni/VL).
  // Se la chiave manca, NVIDIA viene saltato silenziosamente nel router.
  nvidiaApiKey: process.env.NVIDIA_API_KEY ?? "",
  nvidiaBaseUrl: (process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1").replace(/\/$/, ""),
  // Deadline per una singola chiamata NVIDIA (catalogo o chat).
  nvidiaTimeoutMs: Number(process.env.NVIDIA_TIMEOUT_MS ?? 90_000),
  // Tetto di token per la chat: i modelli "reasoning" consumano il budget con
  // il ragionamento prima di produrre il testo finale.
  nvidiaMaxTokens: Number(process.env.NVIDIA_MAX_TOKENS ?? 8192),

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

  // --- OAuth social login ----------------------------------------------------
  // URL pubblici dei due frontend: servono al redirect finale del login social
  // (allowlist chiusa: platform | console, mai un URL fornito dal client).
  platformPublicUrl: (process.env.PLATFORM_PUBLIC_URL ?? "https://platform.aethersy.online").replace(
    /\/$/,
    "",
  ),
  consolePublicUrl: (process.env.CONSOLE_PUBLIC_URL ?? "https://console.aethersy.online").replace(
    /\/$/,
    "",
  ),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri:
    (process.env.GOOGLE_REDIRECT_URI ?? "https://platform.aethersy.online/api/auth/social/google/callback").replace(/\/$/, ""),
  githubClientId: process.env.GITHUB_CLIENT_ID ?? "",
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
  githubRedirectUri:
    (process.env.GITHUB_REDIRECT_URI ?? "https://platform.aethersy.online/api/auth/social/github/callback").replace(/\/$/, ""),

  // Canale di notifica outbound (P0.6): webhook Slack a livello di stack.
  // Usato come fallback quando il tenant non ha un canale dedicato salvato in
  // `pipeline.integration_credential`. Se assente, le notifiche sono no-op.
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL ?? "",

  // Chiave per cifrare a riposo i segreti delle integrazioni (AES-256-GCM).
  // Deve essere una stringa esadecimale di 64 caratteri (32 byte): `openssl rand -hex 32`.
  // Fallback su AP_ENCRYPTION_KEY (stessa chiave dello stack Activepieces) per
  // non introdurre un secondo segreto da custodire; se assente, le funzioni di
  // cifratura delle integrazioni falliscono esplicitamente.
  secretsKey: process.env.CONSOLE_SECRETS_KEY ?? process.env.AP_ENCRYPTION_KEY ?? "",

  // Nome cookie di sessione.
  cookieName: "aethersy_session",
  cookieMaxAgeSec: 60 * 60 * 24 * 7,
  // Dominio del cookie di sessione. Vuoto = host-only (il cookie vale solo per
  // l'host che l'ha emesso). Impostandolo a `.aethersy.online` la sessione vale
  // su tutti i sottodomini (Console di backoffice + sito Platform), cosi'
  // l'utente fa login una volta sola.
  cookieDomain: process.env.CONSOLE_COOKIE_DOMAIN ?? "",
};

/** Vero se esiste una configurazione Postgres utilizzabile (DSN o parametri). */
export function hasDbConfig(): boolean {
  return Boolean(config.dbUrl) || Boolean(config.pg.host && config.pg.database);
}

/** Vero se esiste una configurazione Redis utilizzabile (URL o parametri). */
export function hasRedisConfig(): boolean {
  return Boolean(config.redisUrl) || Boolean(config.redis.host);
}
