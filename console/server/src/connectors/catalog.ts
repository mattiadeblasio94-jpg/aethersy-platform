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

export const CONNECTORS: ConnectorSpec[] = [
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
    id: "google-meet",
    label: "Google Meet",
    category: "communication",
    auth: "google",
    loginLabel: "Accedi con Google",
    scopes: ["https://www.googleapis.com/auth/meetings.space"],
    capabilities: ["Creare riunioni con il cliente", "Link di call automatici", "Colloqui generati dal CRM"],
    howTo: "Login Google: la stessa app che usi per entrare in Aethersy, con il consenso Meet.",
    test: async (s) => jsonProbe(`${GOOGLE_BASE}/meet/v2/spaces`, bearer(s.access_token)),
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
    id: "google-maps",
    label: "Google Maps",
    category: "analytics",
    auth: "google",
    loginLabel: "Accedi con Google",
    scopes: ["https://www.googleapis.com/auth/maps-api"],
    capabilities: ["Analisi della concorrenza locale", "Piani di visita", "Geolocalizzazione attivita'"],
    howTo: "Login Google: la stessa app che usi per entrare in Aethersy, con il consenso Maps.",
    test: async (s) => jsonProbe(`${GOOGLE_BASE}/geolocation/v1/geolocate`, bearer(s.access_token)),
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
