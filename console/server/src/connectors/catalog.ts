// Catalogo dei connettori della piattaforma.
//
// Ogni connettore dichiara come si collega davvero:
//
//   - "google"  -> OAuth con l'app Google gia' configurata (Gmail, Drive,
//                  Calendar, ...): l'utente fa login con Google e il consenso
//                  copre gli scope richiesti;
//   - "github"  -> OAuth con l'app GitHub gia' configurata;
//   - "provider"-> OAuth con l'app dedicata del provider (Slack, Notion,
//                  Figma, Stripe, ...): il flusso e' identico (login ->
//                  consenso -> token cifrato), serve registrare l'app OAuth
//                  del provider e accreditare le sue credenziali nel VPS;
//   - "api_key" -> il provider non offre un login OAuth utile (Telegram,
//                  Cloudflare, Supabase, ...): l'utente incolla la credenziale
//                  del proprio account.
//
// Nessun connettore e' finto: se non ha credenziali configurate, la UI lo
// dichiara e il pulsante resta disabilitato.

export type ConnectorCategory =
  | "social"
  | "ads"
  | "content"
  | "productivity"
  | "communication"
  | "dev"
  | "commerce"
  | "crm"
  | "analytics"
  | "payment"
  | "media"
  | "automation"
  | "design";

export type ConnectorAuth = "google" | "github" | "provider" | "api_key";

export interface ConnectorSpec {
  id: string;
  label: string;
  category: ConnectorCategory;
  auth: ConnectorAuth;
  /** Etichetta del pulsante di login mostrato all'utente. */
  loginLabel: string;
  /** Scope OAuth richiesti (separati da spazi). */
  scopes: string[];
  /** Cosa la piattaforma puo' fare con il connettore collegato. */
  capabilities: string[];
  /** Come ottenere le credenziali (mostrato nella UI quando mancano). */
  howTo: string;
  /**
   * Tipi di credenziale che valgono come "collegamento" per questo connettore.
   * Default: `oauth` per i connettori con login, `api_key` per gli altri.
   * Slack accetta anche il canale webhook gia' salvato dal tenant.
   */
  credentialKinds?: ("oauth" | "webhook" | "api_key")[];
  /** Endpoint OAuth per i connettori con app dedicata. */
  oauth?: {
    authorizeUrl: string;
    tokenUrl: string;
    scope?: string;
    /** Richiede PKCE (client pubblico). */
    pkce?: boolean;
  };
  /** Campi da chiedere all'utente per i connettori "api_key". */
  apiKeyFields?: { key: string; label: string; secret?: boolean }[];
  /**
   * Connettore "master": un solo accesso attiva piu' servizi (Google).
   * `masterServices` elenca i servizi che ricevono lo stesso token.
   */
  master?: boolean;
  masterServices?: string[];
  /**
   * Avviso mostrato in UI: requisiti del provider che l'utente deve
   * soddisfare (per Google: account tra gli utenti di test).
   */
  notice?: string;
  /** Console del provider da aprire (schermata di consenso, API da abilitare). */
  consoleUrl?: string;
  /** Verifica reale della connessione: chiama il provider e riporta l'esito. */
  test?: (secret: Record<string, string>) => Promise<{
    ok: boolean;
    status: number;
    detail: string;
  }>;
}

export const CONNECTOR_CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  social: "Social",
  ads: "Pubblicita",
  content: "Contenuti",
  productivity: "Produttivita'",
  communication: "Comunicazione",
  dev: "Sviluppo",
  commerce: "Commerce",
  crm: "CRM",
  analytics: "Analisi",
  payment: "Pagamenti",
  media: "Media",
  automation: "Automazione",
  design: "Design",
};

async function jsonProbe(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; detail: string }> {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let detail = text.slice(0, 240);
    try {
      const data = JSON.parse(text);
      detail =
        (data?.error?.message ?? data?.message ?? data?.name ?? data?.error ?? data?.info ?? detail) &&
        String(data?.error?.message ?? data?.message ?? data?.name ?? data?.error ?? data?.info ?? detail);
    } catch {
      // risposta non JSON: si tiene il testo grezzo
    }
    return { ok: res.ok, status: res.status, detail: detail || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, status: 0, detail: (err as Error).message };
  }
}

function bearer(token: string, extra: Record<string, string> = {}): RequestInit {
  return { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...extra } };
}

const GOOGLE_BASE = "https://www.googleapis.com";

/**
 * Console sviluppatore dove il tenant crea l'app OAuth del provider.
 * La UI la mostra accanto al form di registrazione dell'app.
 */
export const CONNECTOR_SIGNUP_URLS: Record<string, string> = {
  slack: "https://api.slack.com/apps",
  notion: "https://www.notion.so/my-integrations",
  figma: "https://www.figma.com/developers/apps",
  linear: "https://linear.app/settings/api",
  canva: "https://www.canva.com/developers/integrations",
  salesforce: "https://developer.salesforce.com",
  zoom: "https://marketplace.zoom.us",
  outlook: "https://entra.microsoft.com",
  "microsoft-teams": "https://entra.microsoft.com",
  instagram: "https://developers.facebook.com",
  facebook: "https://developers.facebook.com",
  "meta-ads": "https://developers.facebook.com",
  linkedin: "https://www.linkedin.com/developers/apps",
  tiktok: "https://developers.tiktok.com",
  "tiktok-ads": "https://business-api.tiktok.com/portal/auth",
  x: "https://developer.x.com",
  reddit: "https://www.reddit.com/prefs/apps",
  wix: "https://dev.wix.com/apps",
  paypal: "https://developer.paypal.com",
  stripe: "https://dashboard.stripe.com/connect/apps",
};

/**
 * Console del progetto Google (schermata di consenso OAuth): serve per
 * aggiungere gli utenti di test senza i quali gli ambiti sensibili restano
 * bloccati.
 */
export const GOOGLE_CONSOLE_URL = "https://console.cloud.google.com/apis/credentials/consent";

/** Avviso mostrato su tutti i connettori Google. */
export const GOOGLE_TEST_USER_NOTICE =
  "L'app Google non e' ancora verificata: gli ambiti sensibili (Gmail, Calendar, Docs, YouTube, Ads) si concedono solo agli utenti di test. Aggiungi il tuo account in Google Cloud Console -> Schermata di consenso OAuth -> Utenti di test. Drive funziona subito (ambito non sensibile).";

/**
 * Come si attiva il collegamento per TUTTI gli utenti della piattaforma.
 *
 *   - "platform"   -> l'app di piattaforma esiste gia': ogni utente collega
 *                     con un clic (nessun passaggio per l'utente);
 *   - "self_serve" -> l'app di piattaforma si registra in pochi minuti nella
 *                     console del provider: una volta sola, poi tutti gli
 *                     utenti collegano con un clic;
 *   - "review"     -> il provider chiede la revisione dell'app (giorni o
 *                     settimane): una volta sola per la piattaforma, poi tutti
 *                     gli utenti collegano con un clic;
 *   - "byo"        -> il provider non offre un'app multi-tenant: ogni utente
 *                     inserisce la credenziale del proprio account (unico
 *                     caso in cui l'utente deve fare qualcosa).
 *
 * In nessun caso l'utente finale deve creare un'app: quello e' compito della
 * piattaforma.
 */
export type ConnectorDistributionMode = "platform" | "self_serve" | "review" | "byo";

export interface ConnectorDistribution {
  mode: ConnectorDistributionMode;
  /** Cosa serve perche' tutti gli utenti colleghino con un clic. */
  requirement: string;
  /**
   * L'app OAuth e' di proprieta' della piattaforma: l'utente finale non
   * registra nulla, si limita a fare login e consenso.
   */
  platformApp: boolean;
}

const DISTRIBUTION_BASE: Record<string, Omit<ConnectorDistribution, "platformApp">> = {
  google: {
    mode: "review",
    requirement:
      "Verifica dell'app Google (schermata di consenso OAuth): senza verifica gli ambiti sensibili restano riservati agli utenti di test. Servono dominio verificato e privacy policy (gia' predisposta su /privacy).",
  },
  github: {
    mode: "platform",
    requirement: "App di piattaforma gia' attiva: ogni utente collega con un clic.",
  },
  slack: {
    mode: "self_serve",
    requirement:
      "App di piattaforma: si crea una volta sola in api.slack.com/apps; ogni utente la installa dal pulsante 'Accedi con Slack' nel proprio workspace.",
  },
  notion: {
    mode: "self_serve",
    requirement:
      "App di piattaforma: integrazione pubblica creata una volta sola su notion.so/my-integrations; ogni utente autorizza dal pulsante.",
  },
  linear: {
    mode: "self_serve",
    requirement:
      "App di piattaforma: OAuth app creata una volta sola in linear.app/settings/api.",
  },
  outlook: {
    mode: "self_serve",
    requirement:
      "App di piattaforma: registrazione Entra multi-tenant (entra.microsoft.com); l'utente autorizza e l'amministratore del tenant approva.",
  },
  "microsoft-teams": {
    mode: "self_serve",
    requirement:
      "Stessa app Entra di piattaforma, con i permessi Chat e ChannelMessage aggiunti.",
  },
  salesforce: {
    mode: "self_serve",
    requirement:
      "App di piattaforma: Connected App creata una volta sola su developer.salesforce.com; l'utente che autorizza deve essere amministratore Salesforce.",
  },
  figma: {
    mode: "review",
    requirement:
      "L'app Figma va pubblicata (revisione di Figma) per essere usata da altri team: una volta sola per la piattaforma.",
  },
  instagram: {
    mode: "review",
    requirement:
      "Meta richiede revisione dell'app e verifica del business: una volta sola per la piattaforma (developers.facebook.com).",
  },
  facebook: {
    mode: "review",
    requirement:
      "Meta richiede revisione dell'app e verifica del business: una volta sola per la piattaforma (developers.facebook.com).",
  },
  "meta-ads": {
    mode: "review",
    requirement:
      "Meta Ads richiede la revisione dell'app con ads_management: una volta sola per la piattaforma.",
  },
  linkedin: {
    mode: "review",
    requirement:
      "LinkedIn richiede la revisione dell'app (linkedin.com/developers/apps): una volta sola per la piattaforma.",
  },
  tiktok: {
    mode: "review",
    requirement:
      "TikTok richiede la revisione dell'app (developers.tiktok.com): una volta sola per la piattaforma.",
  },
  "tiktok-ads": {
    mode: "review",
    requirement:
      "TikTok Business API richiede la revisione dell'app: una volta sola per la piattaforma.",
  },
  x: {
    mode: "review",
    requirement:
      "X richiede un developer account con API a pagamento e revisione dell'app: una volta sola per la piattaforma.",
  },
  reddit: {
    mode: "review",
    requirement:
      "Reddit approva le app di tipo 'script' (reddit.com/prefs/apps): una volta sola per la piattaforma.",
  },
  wix: {
    mode: "review",
    requirement:
      "Wix richiede la revisione dell'app (dev.wix.com/apps): una volta sola per la piattaforma.",
  },
  paypal: {
    mode: "review",
    requirement:
      "PayPal richiede la revisione dell'app REST (developer.paypal.com): una volta sola per la piattaforma.",
  },
  stripe: {
    mode: "review",
    requirement:
      "Stripe Connect richiede la revisione dell'app (dashboard.stripe.com/connect/apps): una volta sola per la piattaforma.",
  },
  zoom: {
    mode: "review",
    requirement:
      "Zoom richiede la revisione dell'app (marketplace.zoom.us): una volta sola per la piattaforma.",
  },
  canva: {
    mode: "review",
    requirement:
      "Canva richiede l'approvazione dell'integrazione (canva.com/developers/integrations): una volta sola per la piattaforma.",
  },
  youtube: {
    mode: "review",
    requirement:
      "YouTube API: l'app va sottoposta a revisione e le API devono essere abilitate nel progetto Google: una volta sola per la piattaforma.",
  },
  "google-analytics": {
    mode: "review",
    requirement:
      "Analytics Data API: l'app va sottoposta a revisione: una volta sola per la piattaforma.",
  },
  "google-ads": {
    mode: "review",
    requirement:
      "Google Ads API: l'app va sottoposta a revisione e serve un token sviluppatore: una volta sola per la piattaforma.",
  },
  telegram: {
    mode: "byo",
    requirement:
      "Telegram non offre un login OAuth: ogni utente incolla il token del proprio bot (unico passaggio previsto dal provider).",
  },
  whatsapp: {
    mode: "byo",
    requirement:
      "Meta non consente il login diretto su WhatsApp Business: ogni utente incolla il token permanente della propria Cloud API.",
  },
  cloudflare: {
    mode: "byo",
    requirement:
      "Cloudflare usa API Token: ogni utente incolla il proprio token (previsto dal provider).",
  },
  supabase: {
    mode: "byo",
    requirement:
      "Supabase usa Personal Access Token: ogni utente incolla il proprio token (previsto dal provider).",
  },
  elevenlabs: {
    mode: "byo",
    requirement: "ElevenLabs usa API key: ogni utente incolla la propria chiave.",
  },
  mailchimp: {
    mode: "byo",
    requirement: "Mailchimp usa API key: ogni utente incolla la propria chiave e il prefisso server.",
  },
  dataforseo: {
    mode: "byo",
    requirement: "DataForSEO usa credenziali account: ogni utente incolla le proprie.",
  },
  godaddy: {
    mode: "byo",
    requirement: "GoDaddy usa API key + secret: ogni utente incolla le proprie.",
  },
  wordpress: {
    mode: "byo",
    requirement: "WordPress usa le Application Password: ogni utente incolla le proprie.",
  },
  activepieces: {
    mode: "byo",
    requirement: "Activepieces usa API key dello stack: ogni utente incolla la propria.",
  },
};

/**
 * Provider per cui la piattaforma possiede gia' (o deve possedere) l'app
 * OAuth: l'utente finale non deve mai registrarne una.
 */
const PLATFORM_APP_PROVIDERS = new Set([
  "google",
  "gmail",
  "google-drive",
  "google-calendar",
  "google-sheets",
  "google-slides",
  "google-docs",
  "google-tasks",
  "youtube",
  "google-analytics",
  "google-ads",
  "github",
]);

/** I servizi Google ereditano lo stato di attivazione del master Google. */
const GOOGLE_SERVICES = [
  "gmail",
  "google-drive",
  "google-calendar",
  "google-sheets",
  "google-slides",
  "google-docs",
  "google-tasks",
  "youtube",
  "google-analytics",
  "google-ads",
] as const;

for (const id of GOOGLE_SERVICES) {
  if (!DISTRIBUTION_BASE[id]) {
    DISTRIBUTION_BASE[id] = {
      mode: "review",
      requirement:
        "Verifica dell'app Google (schermata di consenso OAuth): senza verifica gli ambiti sensibili restano riservati agli utenti di test. Servono dominio verificato e privacy policy (gia' predisposta su /privacy).",
    };
  }
}

export const CONNECTOR_DISTRIBUTION: Record<string, ConnectorDistribution> = Object.fromEntries(
  Object.entries(DISTRIBUTION_BASE).map(([id, value]) => [
    id,
    { ...value, platformApp: PLATFORM_APP_PROVIDERS.has(id) },
  ]),
);

export const CONNECTORS: ConnectorSpec[] = [
  // ------------------------------------------------- Google: un solo accesso --
  // "master": un unico login Google, con il consenso unificato, attiva tutti
  // i servizi Google elencati in `masterServices`.
  //
  // Gli scope sono quelli che il progetto Google accetta: `maps-api` e
  // `meetings.space` NON sono scope validi per questo progetto (le API Maps
  // Platform e Meet non sono abilitate) e facevano fallire l'intero consenso
  // con `invalid_scope`. Meet e Maps sono quindi servizi separati, attivabili
  // dopo aver abilitato le rispettive API nel progetto.
  {
    id: "google",
    label: "Google (tutti i servizi)",
    category: "productivity",
    auth: "google",
    loginLabel: "Collega Google con un solo accesso",
    scopes: [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/presentations",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/tasks",
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/adwords",
    ],
    capabilities: [
      "Un solo login per tutti i servizi Google",
      "Consenso unificato in una schermata",
      "Gmail, Drive, Calendar, Docs, Ads...",
    ],
    howTo:
      "Un solo accesso Google: il consenso copre tutti i servizi Google collegati. Si puo' anche attivare un servizio alla volta.",
    master: true,
    masterServices: [
      "gmail",
      "google-drive",
      "google-calendar",
      "google-sheets",
      "google-slides",
      "google-docs",
      "google-tasks",
      "youtube",
      "google-analytics",
      "google-ads",
    ],
    test: async (s) =>
      jsonProbe(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(s.access_token ?? "")}`,
        { headers: { Accept: "application/json" } },
      ),
  },

  // ---------------------------------------------------------- Google (OAuth) --
  {
    id: "gmail",
    label: "Gmail",
    category: "communication",
    auth: "google",
    loginLabel: "Accedi con Google",
    scopes: ["https://www.googleapis.com/auth/gmail.modify"],
    capabilities: ["Leggere e scrivere email", "Etichettare e archiviare", "Inviare email ai lead"],
    howTo: "Login Google: la stessa app che usi per entrare in Aethersy, con il consenso Gmail.",
    test: async (s) => {
      const res = await jsonProbe(`${GOOGLE_BASE}/gmail/v1/users/me/profile`, bearer(s.access_token));
      return { ...res, detail: res.ok ? `Casella: ${res.detail}` : res.detail };
    },
  },
  {
    id: "google-drive",
    label: "Google Drive",
    category: "productivity",
    auth: "google",
    loginLabel: "Accedi con Google",
    scopes: ["https://www.googleapis.com/auth/drive.file"],
    capabilities: ["Salvare i deliverable del cliente", "Allegare file ai run", "Condividere output"],
    howTo: "Login Google: la stessa app che usi per entrare in Aethersy, con il consenso Drive.",
    test: async (s) => jsonProbe(`${GOOGLE_BASE}/drive/v3/about?fields=user`, bearer(s.access_token)),
  },
  {
    id: "google-calendar",
    label: "Google Calendar",
    category: "productivity",
    auth: "google",
    loginLabel: "Accedi con Google",
    scopes: ["https://www.googleapis.com/auth/calendar"],
    capabilities: ["Programmare i post social", "Creare riunioni e reminder", "Sincronizzare l'agenda"],
    howTo: "Login Google: la stessa app che usi per entrare in Aethersy, con il consenso Calendar.",
    test: async (s) =>
      jsonProbe(`${GOOGLE_BASE}/calendar/v3/users/me/calendarList?maxResults=1`, bearer(s.access_token)),
  },
  {
    id: "google-sheets",
    label: "Google Sheets",
    category: "productivity",
    auth: "google",
    loginLabel: "Accedi con Google",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    capabilities: ["Esportare report in fogli", "Budget e KPI condivisi", "Pipeline in tabella"],
    howTo: "Login Google: la stessa app che usi per entrare in Aethersy, con il consenso Sheets.",
    test: async (s) =>
      jsonProbe(`${GOOGLE_BASE}/sheets/v4/spreadsheets?fields=spreadsheets.properties`, bearer(s.access_token)),
  },
  {
    id: "google-slides",
    label: "Google Slides",
    category: "content",
    auth: "google",
    loginLabel: "Accedi con Google",
    scopes: ["https://www.googleapis.com/auth/presentations"],
    capabilities: ["Creare presentazioni per i clienti", "Deck dai deliverable", "Template di pitch"],
    howTo: "Login Google: la stessa app che usi per entrare in Aethersy, con il consenso Slides.",
    test: async (s) =>
      jsonProbe(`${GOOGLE_BASE}/slides/v1/presentations?pageSize=1`, bearer(s.access_token)),
  },
  {
    id: "google-docs",
    label: "Google Docs",
    category: "content",
    auth: "google",
    loginLabel: "Accedi con Google",
    scopes: ["https://www.googleapis.com/auth/documents"],
    capabilities: ["Produrre documenti e report", "Template proposta commerciale", "Brief cliente"],
    howTo: "Login Google: la stessa app che usi per entrare in Aethersy, con il consenso Docs.",
    test: async (s) => jsonProbe(`${GOOGLE_BASE}/drive/v3/about?fields=user`, bearer(s.access_token)),
  },
  {
    id: "google-tasks",
    label: "Google Tasks",
    category: "productivity",
    auth: "google",
    loginLabel: "Accedi con Google",
    scopes: ["https://www.googleapis.com/auth/tasks"],
    capabilities: ["Creare task dal brief", "Chiudere attivita' in automatico", "Sincronizzare TODO"],
    howTo: "Login Google: la stessa app che usi per entrare in Aethersy, con il consenso Tasks.",
    test: async (s) => jsonProbe(`${GOOGLE_BASE}/tasks/v1/users/@me/lists`, bearer(s.access_token)),
  },
  {
    id: "youtube",
    label: "YouTube",
    category: "media",
    auth: "google",
    loginLabel: "Accedi con Google",
    scopes: ["https://www.googleapis.com/auth/youtube.upload"],
    capabilities: ["Pubblicare video generati", "Gestire la descrizione e i tag", "Analisi dei canali"],
    howTo: "Login Google: la stessa app che usi per entrare in Aethersy, con il consenso YouTube.",
    test: async (s) => jsonProbe(`${GOOGLE_BASE}/youtube/v3/channels?mine=true`, bearer(s.access_token)),
  },
  {
    id: "google-analytics",

    label: "Google Analytics",
    category: "analytics",
    auth: "google",
    loginLabel: "Accedi con Google",
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    capabilities: ["Lettura dei dati di traffico", "Report performance", "Confronto campagne"],
    howTo: "Login Google: la stessa app che usi per entrare in Aethersy, con il consenso Analytics.",
    test: async (s) =>
      jsonProbe(`${GOOGLE_BASE}/analytics/v1beta/properties?mine=true`, bearer(s.access_token)),
  },
  {
    id: "google-ads",
    label: "Google Ads",
    category: "ads",
    auth: "google",
    loginLabel: "Accedi con Google",
    scopes: ["https://www.googleapis.com/auth/adwords"],
    capabilities: ["Gestire campagne", "Keyword e budget", "Report sulle spese"],
    howTo: "Login Google: la stessa app che usi per entrare in Aethersy, con il consenso Ads.",
    test: async (s) =>
      jsonProbe(`${GOOGLE_BASE}/ads/googleads/v18/customers:listAccessibleCustomers`, bearer(s.access_token)),
  },

  // ---------------------------------------------------------- GitHub (OAuth) --
  {
    id: "github",
    label: "GitHub",
    category: "dev",
    auth: "github",
    loginLabel: "Accedi con GitHub",
    scopes: ["repo", "workflow"],
    capabilities: ["Creare repository per i clienti", "Aprire issue e PR", "Deploy via GitHub Actions"],
    howTo: "Login GitHub: la stessa app che usi per entrare in Aethersy, con i permessi repo e workflow.",
    test: async (s) => jsonProbe("https://api.github.com/user", bearer(s.access_token)),
  },

  // ------------------------------------------- OAuth con app dedicata (login) --
  {
    id: "slack",
    label: "Slack",
    category: "communication",
    auth: "provider",
    loginLabel: "Accedi con Slack",
    scopes: ["chat:write", "channels:read", "im:write", "users:read"],
    capabilities: ["Postare nei canali", "Rispondere ai clienti", "Notifiche operative"],
    howTo: "Serve l'app Slack Aethersy (OAuth): creala su api.slack.com/apps, poi accreditane CLIENT_ID e CLIENT_SECRET nel VPS.",
    credentialKinds: ["oauth", "webhook"],
    oauth: {
      authorizeUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
    },
    test: async (s) => {
      // Il tenant puo' avere gia' un canale webhook (fase 20) invece dell'app
      // OAuth: in quel caso la prova e' un messaggio reale sul canale.
      const raw = s.access_token ?? "";
      if (raw.startsWith("https://hooks.slack.com/")) {
        try {
          const res = await fetch(raw, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: "Test di connessione Aethersy: canale Slack operativo." }),
          });
          const text = await res.text();
          return {
            ok: res.ok && text.trim() === "ok",
            status: res.status,
            detail: res.ok ? "Messaggio di prova inviato sul canale Slack." : text.slice(0, 200),
          };
        } catch (err) {
          return { ok: false, status: 0, detail: (err as Error).message };
        }
      }
      return jsonProbe("https://slack.com/api/auth.test", bearer(raw));
    },
  },
  {
    id: "notion",
    label: "Notion",
    category: "productivity",
    auth: "provider",
    loginLabel: "Accedi con Notion",
    scopes: ["read_content", "insert_content"],
    capabilities: ["Scrivere pagine e database", "Brief e deliverable", "Knowledge base cliente"],
    howTo: "Serve l'integrazione Notion Aethersy: crea la connessione su notion.so/my-integrations e accreditane le credenziali nel VPS.",
    oauth: {
      authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
      tokenUrl: "https://api.notion.com/v1/oauth/token",
    },
    test: async (s) =>
      jsonProbe("https://api.notion.com/v1/users/me", bearer(s.access_token, { "Notion-Version": "2022-06-28" })),
  },
  {
    id: "figma",
    label: "Figma",
    category: "design",
    auth: "provider",
    loginLabel: "Accedi con Figma",
    scopes: ["file_content:read", "file_metadata:read"],
    capabilities: ["Leggere design e mockup", "Esportare frame e asset", "Brief grafici per i clienti"],
    howTo: "Serve l'app OAuth Figma Aethersy (figma.com/developers/apps) e le sue credenziali nel VPS.",
    oauth: {
      authorizeUrl: "https://www.figma.com/oauth",
      tokenUrl: "https://api.figma.com/v1/oauth/token",
    },
    test: async (s) => jsonProbe("https://api.figma.com/v1/me", bearer(s.access_token)),
  },
  {
    id: "linear",
    label: "Linear",
    category: "automation",
    auth: "provider",
    loginLabel: "Accedi con Linear",
    scopes: ["read", "write", "issues:create"],
    capabilities: ["Creare issue dal brief", "Sincronizzare backlog", "Stato lavori in tempo reale"],
    howTo: "Serve l'app OAuth Linear Aethersy (linear.app/settings/api) e le sue credenziali nel VPS.",
    oauth: {
      authorizeUrl: "https://linear.app/oauth/authorize",
      tokenUrl: "https://api.linear.app/oauth/token",
    },
    test: async (s) => jsonProbe("https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ viewer { id name email } }" }),
    }),
  },
  {
    id: "canva",
    label: "Canva",
    category: "design",
    auth: "provider",
    loginLabel: "Accedi con Canva",
    scopes: ["design:content:read", "design:content:write", "asset:read"],
    capabilities: ["Creare grafiche social", "Esportare design per i clienti", "Template del brand"],
    howTo: "Serve l'app Canva Aethersy (canva.com/developers/integrations) e le sue credenziali nel VPS.",
    oauth: {
      authorizeUrl: "https://www.canva.com/api/oauth/authorize",
      tokenUrl: "https://api.canva.com/rest/v1/oauth/token",
      pkce: true,
    },
    test: async (s) => jsonProbe("https://api.canva.com/rest/v1/users/me/profile", bearer(s.access_token)),
  },
  {
    id: "salesforce",
    label: "Salesforce",
    category: "crm",
    auth: "provider",
    loginLabel: "Accedi con Salesforce",
    scopes: ["api refresh_token"],
    capabilities: ["Sync contatti e lead", "Lettura pipeline", "Creare opportunity"],
    howTo: "Serve la Connected App Salesforce Aethersy e le sue credenziali nel VPS.",
    oauth: {
      authorizeUrl: "https://login.salesforce.com/services/oauth2/authorize",
      tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    },
    test: async (s) =>
      jsonProbe(`${s.instance_url ?? "https://login.salesforce.com"}/services/data/v60.0/query?q=SELECT+Id+FROM+Organization+limit+1`, bearer(s.access_token)),
  },
  {
    id: "zoom",
    label: "Zoom",
    category: "communication",
    auth: "provider",
    loginLabel: "Accedi con Zoom",
    scopes: ["user:read", "meeting:write"],
    capabilities: ["Creare riunioni", "Colloqui con i lead", "Pianificare demo"],
    howTo: "Serve l'app OAuth Zoom Aethersy (marketplace.zoom.us) e le sue credenziali nel VPS.",
    oauth: {
      authorizeUrl: "https://zoom.us/oauth/authorize",
      tokenUrl: "https://zoom.us/oauth/token",
    },
    test: async (s) => jsonProbe("https://api.zoom.us/v2/users/me", bearer(s.access_token)),
  },
  {
    id: "outlook",
    label: "Outlook",
    category: "communication",
    auth: "provider",
    loginLabel: "Accedi con Microsoft",
    scopes: ["offline_access", "User.Read", "Mail.ReadWrite"],
    capabilities: ["Leggere e scrivere email", "Email ai lead", "Cartelle condivise"],
    howTo: "Serve l'app Microsoft Entra Aethersy (entra.microsoft.com) con i permessi Mail.ReadWrite e User.Read.",
    oauth: {
      authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    },
    test: async (s) => jsonProbe("https://graph.microsoft.com/v1.0/me", bearer(s.access_token)),
  },
  {
    id: "microsoft-teams",
    label: "Microsoft Teams",
    category: "communication",
    auth: "provider",
    loginLabel: "Accedi con Microsoft",
    scopes: ["offline_access", "User.Read", "Chat.ReadWrite", "ChannelMessage.Send"],
    capabilities: ["Messaggi ai team", "Canali cliente", "Avvisi operativi"],
    howTo: "Serve la stessa app Microsoft Entra Aethersy, con i permessi Chat e ChannelMessage.",
    oauth: {
      authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    },
    test: async (s) => jsonProbe("https://graph.microsoft.com/v1.0/me", bearer(s.access_token)),
  },
  {
    id: "instagram",
    label: "Instagram",
    category: "social",
    auth: "provider",
    loginLabel: "Accedi con Instagram",
    scopes: ["instagram_basic", "instagram_content_publish", "pages_show_list"],
    capabilities: ["Pubblicare reels e post", "Gestire la bio", "Commenti e DM"],
    howTo: "Serve l'app Meta Aethersy (developers.facebook.com) collegata a un account Instagram professional.",
    oauth: {
      authorizeUrl: "https://www.facebook.com/v18.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v18.0/oauth/access_token",
    },
    test: async (s) =>
      jsonProbe(
        "https://graph.facebook.com/v18.0/me?fields=id,name,username",
        bearer(s.access_token),
      ),
  },
  {
    id: "facebook",
    label: "Facebook",
    category: "social",
    auth: "provider",
    loginLabel: "Accedi con Facebook",
    scopes: ["pages_show_list", "pages_manage_posts", "pages_read_engagement", "business_management"],
    capabilities: ["Pubblicare sulle pagine", "Programmare i post", "Analisi delle pagine"],
    howTo: "Serve l'app Meta Aethersy (developers.facebook.com) con i permessi Pages.",
    oauth: {
      authorizeUrl: "https://www.facebook.com/v18.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v18.0/oauth/access_token",
    },
    test: async (s) =>
      jsonProbe("https://graph.facebook.com/v18.0/me?fields=id,name", bearer(s.access_token)),
  },
  {
    id: "meta-ads",
    label: "Meta Ads",
    category: "ads",
    auth: "provider",
    loginLabel: "Accedi con Facebook",
    scopes: ["ads_read", "ads_management", "business_management"],
    capabilities: ["Gestire campagne", "Creare ad set", "Report sulle spese"],
    howTo: "Serve l'app Meta Aethersy con i permessi ads_management e business_management.",
    oauth: {
      authorizeUrl: "https://www.facebook.com/v18.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v18.0/oauth/access_token",
    },
    test: async (s) =>
      jsonProbe("https://graph.facebook.com/v18.0/me/adaccounts", bearer(s.access_token)),
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    category: "social",
    auth: "provider",
    loginLabel: "Accedi con LinkedIn",
    scopes: ["openid", "profile", "email", "w_member_social"],
    capabilities: ["Pubblicare aggiornamenti", "Profili aziendali", "Messaggi"],
    howTo: "Serve l'app LinkedIn Aethersy (linkedin.com/developers/apps) con i permessi richiesti.",
    oauth: {
      authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
      tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    },
    test: async (s) => jsonProbe("https://api.linkedin.com/v2/userinfo", bearer(s.access_token)),
  },
  {
    id: "tiktok",
    label: "TikTok",
    category: "social",
    auth: "provider",
    loginLabel: "Accedi con TikTok",
    scopes: ["user.info.basic", "video.publish"],
    capabilities: ["Pubblicare video", "Statistiche dei contenuti", "Commenti"],
    howTo: "Serve l'app TikTok Aethersy (developers.tiktok.com) con Content Posting API.",
    oauth: {
      authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
      tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
      pkce: true,
    },
    test: async (s) =>
      jsonProbe(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id",
        bearer(s.access_token),
      ),
  },
  {
    id: "tiktok-ads",
    label: "TikTok Ads",
    category: "ads",
    auth: "provider",
    loginLabel: "Accedi con TikTok Ads",
    scopes: ["ads.read", "ads.write"],
    capabilities: ["Gestire campagne", "Ad groups e creativita'", "Report"],
    howTo: "Serve l'app TikTok Business API Aethersy (business-api.tiktok.com/portal/auth) e le sue credenziali.",
    oauth: {
      authorizeUrl: "https://business-api.tiktok.com/portal/auth",
      tokenUrl: "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/",
    },
    test: async (s) =>
      jsonProbe(
        "https://business-api.tiktok.com/open_api/v1.3/advertiser/info/",
        bearer(s.access_token, { "Content-Type": "application/json" }),
      ),
  },
  {
    id: "x",
    label: "X (Twitter)",
    category: "social",
    auth: "provider",
    loginLabel: "Accedi con X",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    capabilities: ["Pubblicare post", "Leggere i DM", "Statistiche del profilo"],
    howTo: "Serve l'app X Aethersy (developer.x.com) con i permessi read+write e PKCE.",
    oauth: {
      authorizeUrl: "https://twitter.com/i/oauth2/authorize",
      tokenUrl: "https://api.x.com/2/oauth2/token",
      pkce: true,
    },
    test: async (s) => jsonProbe("https://api.x.com/2/users/me", bearer(s.access_token)),
  },
  {
    id: "reddit",
    label: "Reddit",
    category: "social",
    auth: "provider",
    loginLabel: "Accedi con Reddit",
    scopes: ["identity", "submit", "read"],
    capabilities: ["Pubblicare post", "Gestire subreddit", "Commenti e discussioni"],
    howTo: "Serve l'app Reddit Aethersy (reddit.com/prefs/apps, tipo script) e le sue credenziali.",
    oauth: {
      authorizeUrl: "https://www.reddit.com/api/v1/authorize",
      tokenUrl: "https://www.reddit.com/api/v1/access_token",
    },
    test: async (s) => jsonProbe("https://oauth.reddit.com/api/v1/me", bearer(s.access_token)),
  },
  {
    id: "wix",
    label: "Wix",
    category: "commerce",
    auth: "provider",
    loginLabel: "Accedi con Wix",
    scopes: ["wix.workspace.read", "wix.site.read", "wix.site.write"],
    capabilities: ["Siti e-commerce", "Catalogo prodotti", "Publishing"],
    howTo: "Serve l'app Wix Aethersy (dev.wix.com/apps) e le sue credenziali.",
    oauth: {
      authorizeUrl: "https://www.wix.com/oauth2/auth",
      tokenUrl: "https://www.wix.com/oauth2/token",
    },
    test: async (s) => jsonProbe("https://www.wixapis.com/oauth2/v3/account", bearer(s.access_token)),
  },
  {
    id: "paypal",
    label: "PayPal",
    category: "payment",
    auth: "provider",
    loginLabel: "Accedi con PayPal",
    scopes: ["openid", "profile", "email", "https://uri.paypal.com/services/payments/payment"],
    capabilities: ["Pagamenti", "Rimborsi", "Stato delle transazioni"],
    howTo: "Serve l'app REST PayPal Aethersy (developer.paypal.com) con le sue credenziali.",
    oauth: {
      authorizeUrl: "https://www.paypal.com/signin/connect",
      tokenUrl: "https://api-m.paypal.com/v1/oauth2/token",
    },
    test: async (s) =>
      jsonProbe(
        "https://api-m.paypal.com/v1/identity/oauth2/userinfo?schema=paypalv1.1",
        bearer(s.access_token),
      ),
  },
  {
    id: "stripe",
    label: "Stripe",
    category: "payment",
    auth: "provider",
    loginLabel: "Accedi con Stripe",
    scopes: ["read_write"],
    capabilities: ["Creare prodotti e prezzi", "Checkout e abbonamenti", "Fatture"],
    howTo: "Serve l'app Stripe Connect Aethersy (dashboard.stripe.com/connect/apps) e le sue credenziali.",
    oauth: {
      authorizeUrl: "https://connect.stripe.com/oauth/authorize",
      tokenUrl: "https://connect.stripe.com/oauth/token",
    },
    test: async (s) => jsonProbe("https://api.stripe.com/v1/account", bearer(s.access_token)),
  },

  // --------------------------------------------------- Credenziale (api_key) --
  {
    id: "telegram",
    label: "Telegram",
    category: "communication",
    auth: "api_key",
    loginLabel: "Collega il bot Telegram",
    scopes: [],
    capabilities: ["Invio messaggi", "Canali e gruppi", "Notifiche ai clienti"],
    howTo: "Telegram non offre un login OAuth: crea un bot con @BotFather e incolla il token. E' l'unica credenziale che chiede.",
    apiKeyFields: [{ key: "botToken", label: "Token del bot (da @BotFather)", secret: true }],
    test: async (s) => jsonProbe(`https://api.telegram.org/bot${s.botToken}/getMe`, {}),
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    category: "communication",
    auth: "api_key",
    loginLabel: "Collega WhatsApp Business",
    scopes: [],
    capabilities: ["Messaggi ai clienti", "Template approvati", "Conversazioni"],
    howTo: "Meta non consente il login diretto su WhatsApp Business: serve un token permanente dell'API Cloud (te lo da' Meta Business).",
    apiKeyFields: [{ key: "accessToken", label: "Token permanente WhatsApp Cloud API", secret: true }],
    test: async (s) =>
      jsonProbe(
        "https://graph.facebook.com/v18.0/me?fields=id,name",
        bearer(s.accessToken),
      ),
  },
  {
    id: "cloudflare",
    label: "Cloudflare",
    category: "dev",
    auth: "api_key",
    loginLabel: "Collega Cloudflare",
    scopes: [],
    capabilities: ["Deploy dei siti", "DNS e dominio", "Protezione e CDN"],
    howTo: "Cloudflare usa API Token (non c'e' un login OAuth per gli account): crea un token in dash.cloudflare.com con i permessi necessari.",
    apiKeyFields: [{ key: "apiToken", label: "API Token", secret: true }],
    test: async (s) =>
      jsonProbe("https://api.cloudflare.com/client/v4/user/tokens/verify", {
        headers: { Authorization: `Bearer ${s.apiToken}`, Accept: "application/json" },
      }),
  },
  {
    id: "supabase",
    label: "Supabase",
    category: "dev",
    auth: "api_key",
    loginLabel: "Collega Supabase",
    scopes: [],
    capabilities: ["Database dei clienti", "Auth e storage", "Edge functions"],
    howTo: "Supabase usa un Personal Access Token (non esiste un OAuth per gli account): generane uno in supabase.com/dashboard/account/tokens.",
    apiKeyFields: [{ key: "accessToken", label: "Personal Access Token", secret: true }],
    test: async (s) => jsonProbe("https://api.supabase.com/v1/projects", bearer(s.accessToken)),
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    category: "media",
    auth: "api_key",
    loginLabel: "Collega ElevenLabs",
    scopes: [],
    capabilities: ["Voce per i video", "Narrazione dei deliverable", "Localizzazione"],
    howTo: "ElevenLabs usa una API key: si trova in elevenlabs.io/app/settings/api-keys.",
    apiKeyFields: [{ key: "apiKey", label: "API key", secret: true }],
    test: async (s) => jsonProbe("https://api.elevenlabs.io/v1/user", bearer(s.apiKey)),
  },
  {
    id: "mailchimp",
    label: "Mailchimp",
    category: "communication",
    auth: "api_key",
    loginLabel: "Collega Mailchimp",
    scopes: [],
    capabilities: ["Campagne email", "Liste e segmenti", "Statistiche"],
    howTo: "Mailchimp permette l'accesso via OAuth (serve registrare l'app) oppure con API key + prefisso server: la UI chiede la key.",
    apiKeyFields: [
      { key: "apiKey", label: "API key", secret: true },
      { key: "serverPrefix", label: "Prefisso server (es. us21)" },
    ],
    test: async (s) =>
      jsonProbe(`https://${s.serverPrefix}.api.mailchimp.com/3.0/ping`, {
        headers: { Authorization: `Basic ${Buffer.from(`anystring:${s.apiKey}`).toString("base64")}` },
      }),
  },
  {
    id: "dataforseo",
    label: "DataForSEO",
    category: "analytics",
    auth: "api_key",
    loginLabel: "Collega DataForSEO",
    scopes: [],
    capabilities: ["Dati SEO", "Keyword e volume", "SERP e gap di mercato"],
    howTo: "DataForSEO usa credenziali account: username e password API (le trovi in app.dataforseo.com).",
    apiKeyFields: [
      { key: "login", label: "Username API" },
      { key: "password", label: "Password API", secret: true },
    ],
    test: async (s) => {
      const basic = Buffer.from(`${s.login}:${s.password}`).toString("base64");
      return jsonProbe("https://api.dataforseo.com/v3/dataforseo_labs/data/status", {
        headers: { Authorization: `Basic ${basic}` },
      });
    },
  },
  {
    id: "godaddy",
    label: "GoDaddy",
    category: "commerce",
    auth: "api_key",
    loginLabel: "Collega GoDaddy",
    scopes: [],
    capabilities: ["Domini", "DNS", "Hosting e SSL"],
    howTo: "GoDaddy usa API key + secret (developer.godaddy.com): nessun OAuth per gli account.",
    apiKeyFields: [
      { key: "apiKey", label: "API key", secret: true },
      { key: "apiSecret", label: "API secret", secret: true },
    ],
    test: async (s) =>
      jsonProbe("https://api.godaddy.com/v1/domains?statuses=ACTIVE", {
        headers: { Authorization: `sso-key ${s.apiKey}:${s.apiSecret}`, Accept: "application/json" },
      }),
  },
  {
    id: "wordpress",
    label: "WordPress",
    category: "commerce",
    auth: "api_key",
    loginLabel: "Collega WordPress",
    scopes: [],
    capabilities: ["Pubblicare pagine", "Gestire i contenuti", "Aggiornare il sito"],
    howTo: "WordPress usa le Application Password: generane una in Profilo -> Sicurezza -> Application Passwords.",
    apiKeyFields: [
      { key: "siteUrl", label: "URL del sito (https://...)" },
      { key: "applicationPassword", label: "Application password", secret: true },
    ],
    test: async (s) =>
      jsonProbe(`${s.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/users/me`, {
        headers: { Authorization: `Basic ${Buffer.from(`aethersy:${s.applicationPassword}`).toString("base64")}` },
      }),
  },
  {
    id: "activepieces",
    label: "Activepieces",
    category: "automation",
    auth: "api_key",
    loginLabel: "Collega Activepieces",
    scopes: [],
    capabilities: ["Trigger dei flow", "Esecuzione dei flow", "Automazioni interne"],
    howTo: "Su questo stack Activepieces gira gia' nel Docker: per l'API serve una API key (Impostazioni -> API keys).",
    apiKeyFields: [{ key: "apiKey", label: "API key Activepieces", secret: true }],
    test: async (s) =>
      jsonProbe("http://app:80/api/v1/flows", {
        headers: { Authorization: `Bearer ${s.apiKey}` },
      }),
  },
];

export function connectorById(id: string): ConnectorSpec | undefined {
  return CONNECTORS.find((connector) => connector.id === id);
}

/** Connettore master Google (un solo accesso per tutti i servizi). */
export function googleMasterSpec(): ConnectorSpec | undefined {
  return CONNECTORS.find((connector) => connector.master);
}

/**
 * Servizi Google coperti dagli scope concessi: cosi' un accesso Google
 * attiva anche gli altri servizi per cui il consenso e' gia' stato dato.
 */
export function googleServicesForScopes(granted: string[]): string[] {
  const set = new Set(granted.map((scope) => scope.trim()).filter(Boolean));
  return CONNECTORS.filter(
    (connector) =>
      connector.auth === "google" &&
      !connector.master &&
      connector.scopes.length > 0 &&
      connector.scopes.every((scope) => set.has(scope)),
  ).map((connector) => connector.id);
}

/** Tipi di credenziale che valgono come collegamento per un connettore. */
export function connectorCredentialKinds(
  spec: ConnectorSpec,
): ("oauth" | "webhook" | "api_key")[] {
  if (spec.credentialKinds?.length) return spec.credentialKinds;
  return spec.auth === "api_key" ? ["api_key"] : ["oauth"];
}

export const CONNECTOR_CATEGORY_ORDER: ConnectorCategory[] = [
  "social",
  "ads",
  "content",
  "communication",
  "productivity",
  "dev",
  "commerce",
  "crm",
  "analytics",
  "payment",
  "media",
  "automation",
  "design",
];
