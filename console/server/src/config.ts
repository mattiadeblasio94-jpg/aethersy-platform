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

  // Nome cookie di sessione.
  cookieName: "aethersy_session",
  cookieMaxAgeSec: 60 * 60 * 24 * 7,
};
