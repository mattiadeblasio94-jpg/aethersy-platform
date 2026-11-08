import { config } from "../config.js";
import { decryptSecret, encryptSecret } from "../pipeline/secrets.js";
import type { ConnectorSpec } from "./catalog.js";
import { getConnectorApp, type ConnectorApp } from "./app-store.js";
import { pkceChallenge } from "./state.js";

// Flusso OAuth2 dei connettori.
//
// Un solo codice per tre situazioni:
//   - app Google gia' configurata (Gmail, Drive, Calendar, ...);
//   - app GitHub gia' configurata;
//   - app dedicata del provider (Slack, Notion, Figma, ...): le credenziali
//     arrivano dall'app di piattaforma (CONNECTOR_<ID>_CLIENT_ID /
//     CONNECTOR_<ID>_CLIENT_SECRET nel VPS) oppure dall'app registrata dal
//     tenant direttamente nella piattaforma.
//
// In ogni caso l'utente viene mandate alla pagina di login del provider e il
// consenso torna alla piattaforma.
//
// I token viaggiano cifrati (AES-256-GCM) e restano sul server: il frontend
// riceve solo lo stato della connessione.

export interface ConnectorClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface ConnectorConfigState {
  ok: boolean;
  reason: string | null;
  client: ConnectorClient | null;
}

function envValue(name: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : "";
}

function envName(connectorId: string, suffix: string): string {
  return `CONNECTOR_${connectorId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${suffix}`;
}

/**
 * Callback OAuth del connettore.
 *
 * Google e GitHub accettano **un solo** callback URL per app: per non
 * litigare con il login sociale, i connettori Google/GitHub usano lo stesso
 * callback gia' registrato, e il flusso si distingue dal contenuto dello
 * `state` firmato. Le app dedicate dei provider hanno invece il proprio
 * callback sotto `/api/pipeline/connectors/<id>/callback`.
 */
export function connectorRedirectUri(
  connectorId: string,
  auth?: "google" | "github" | "provider" | "api_key",
): string {
  if (auth === "google") return config.googleRedirectUri;
  if (auth === "github") return config.githubRedirectUri;
  return `${config.platformPublicUrl}/api/pipeline/connectors/${connectorId}/callback`;
}

/** Credenziali dell'app OAuth da usare per il connettore. */
export function connectorConfig(spec: ConnectorSpec): ConnectorConfigState {
  const redirectUri = connectorRedirectUri(spec.id, spec.auth);

  if (spec.auth === "google") {
    if (!config.googleClientId || !config.googleClientSecret) {
      return {
        ok: false,
        reason: "App Google non configurata nel VPS (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
        client: null,
      };
    }
    return {
      ok: true,
      reason: null,
      client: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        redirectUri,
      },
    };
  }

  if (spec.auth === "github") {
    if (!config.githubClientId || !config.githubClientSecret) {
      return {
        ok: false,
        reason: "App GitHub non configurata nel VPS (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET).",
        client: null,
      };
    }
    return {
      ok: true,
      reason: null,
      client: {
        clientId: config.githubClientId,
        clientSecret: config.githubClientSecret,
        redirectUri,
      },
    };
  }

  const clientId = envValue(envName(spec.id, "CLIENT_ID"));
  const clientSecret = envValue(envName(spec.id, "CLIENT_SECRET"));
  // I client pubblici (PKCE) non hanno un secret: e' il provider a richiedere
  // solo client_id + code_verifier.
  if (!clientId || (!clientSecret && !spec.oauth?.pkce)) {
    return {
      ok: false,
      reason: `App OAuth di ${spec.label} non ancora accreditata nel VPS (${envName(spec.id, "CLIENT_ID")} / ${envName(spec.id, "CLIENT_SECRET")}).`,
      client: null,
    };
  }
  const customRedirect = envValue(envName(spec.id, "REDIRECT_URI"));
  return {
    ok: true,
    reason: null,
    client: {
      clientId,
      clientSecret,
      redirectUri: customRedirect || redirectUri,
    },
  };
}

export function connectorConfigured(spec: ConnectorSpec): boolean {
  if (spec.auth === "api_key") return true;
  return connectorConfig(spec).ok;
}

export interface ResolvedClient {
  client: ConnectorClient | null;
  /** "env" = app di piattaforma, "tenant" = app registrata dal tenant. */
  source: "env" | "tenant" | null;
  /** Motivo per cui il connettore non e' utilizzabile. */
  reason: string | null;
}

/**
 * Client OAuth da usare per il connettore.
 *
 * Priorita': app di piattaforma (env del VPS) -> app registrata dal tenant
 * dalla piattaforma. Se il tenant ha registrato un'app, la UI permette di
 * rimuoverla per tornare all'app di piattaforma.
 */
export async function resolveConnectorClient(
  spec: ConnectorSpec,
  tenantId: string | null,
  apps?: Map<string, ConnectorApp>,
): Promise<ResolvedClient> {
  const envState = connectorConfig(spec);
  if (envState.ok && envState.client) {
    return { client: envState.client, source: "env", reason: null };
  }
  if (spec.auth !== "provider" || !tenantId) {
    return { client: null, source: null, reason: envState.reason };
  }

  const app = apps ? apps.get(spec.id) : await getConnectorApp(tenantId, spec.id);
  if (!app) {
    return {
      client: null,
      source: null,
      reason: `Registra l'app OAuth di ${spec.label} (client_id e client_secret) per attivare il login: il pulsante mandera' l'utente alla pagina di accesso di ${spec.label}.`,
    };
  }
  if (!app.valid || !app.clientId || !app.clientSecret) {
    return {
      client: null,
      source: null,
      reason: `L'app OAuth di ${spec.label} non e' piu' decifrabile: registrala di nuovo.`,
    };
  }
  const redirectUri = app.redirectUri || connectorRedirectUri(spec.id, spec.auth);
  return {
    client: { clientId: app.clientId, clientSecret: app.clientSecret, redirectUri },
    source: "tenant",
    reason: null,
  };
}

/**
 * Scope richiesti a Google.
 *
 * Il connettore master chiede il consenso unificato su tutti i servizi; se
 * Google rifiuta uno scope (scope "restricted" su app non verificate), si puo'
 * ridurre l'elenco con CONNECTOR_GOOGLE_SCOPES e collegare i servizi restanti
 * uno alla volta.
 */
export function googleScopes(spec: ConnectorSpec): string[] {
  const override = envValue("CONNECTOR_GOOGLE_SCOPES");
  if (!override) return spec.scopes;
  const scopes = override
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  return scopes.length ? scopes : spec.scopes;
}

/** URL di autorizzazione del provider (con state firmato e PKCE dove serve). */
export function connectorAuthorizeUrl(
  spec: ConnectorSpec,
  params: { state: string; codeVerifier: string },
  clientOverride?: ConnectorClient | null,
): string {
  const client = clientOverride ?? connectorConfig(spec).client;
  if (!client) throw new Error(`Connettore ${spec.id} non configurato`);

  if (spec.auth === "google") {
    const query = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: client.redirectUri,
      response_type: "code",
      scope: googleScopes(spec).join(" "),
      state: params.state,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      code_challenge: pkceChallenge(params.codeVerifier),
      code_challenge_method: "S256",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
  }

  if (spec.auth === "github") {
    const query = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: client.redirectUri,
      scope: spec.scopes.join(" "),
      state: params.state,
      allow_signup: "true",
    });
    return `https://github.com/login/oauth/authorize?${query.toString()}`;
  }

  const oauth = spec.oauth;
  if (!oauth) throw new Error(`Connettore ${spec.id} senza endpoint OAuth`);
  const query = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: "code",
    state: params.state,
  });
  if (oauth.scope) query.set("scope", oauth.scope);
  else if (spec.scopes.length) query.set("scope", spec.scopes.join(" "));
  if (oauth.pkce) {
    query.set("code_challenge", pkceChallenge(params.codeVerifier));
    query.set("code_challenge_method", "S256");
  }
  return `${oauth.authorizeUrl}?${query.toString()}`;
}

export interface ConnectorTokenBundle {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  /** Epoch ms di scadenza, calcolato dal provider. */
  expires_at?: number;
  id_token?: string;
  /** Dati extra restituiti dal provider (Slack team, Notion workspace...). */
  extra?: Record<string, unknown>;
}

/** Scambia il codice di autorizzazione con i token. */
export async function exchangeConnectorCode(
  spec: ConnectorSpec,
  code: string,
  codeVerifier: string,
  clientOverride?: ConnectorClient | null,
): Promise<ConnectorTokenBundle> {
  const client = clientOverride ?? connectorConfig(spec).client;
  if (!client) throw new Error(`Connettore ${spec.id} non configurato`);

  const tokenUrl =
    spec.auth === "google"
      ? (process.env.GOOGLE_CONNECTOR_TOKEN_URL ?? "https://oauth2.googleapis.com/token")
      : spec.auth === "github"
        ? (process.env.GITHUB_CONNECTOR_TOKEN_URL ?? "https://github.com/login/oauth/access_token")
        : (envValue(envName(spec.id, "TOKEN_URL")) || spec.oauth?.tokenUrl);
  if (!tokenUrl) throw new Error(`Connettore ${spec.id} senza token endpoint`);

  const body = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    code,
    grant_type: "authorization_code",
  });
  if (client.clientSecret) body.set("client_secret", client.clientSecret);
  if (spec.oauth?.pkce || spec.auth === "google") body.set("code_verifier", codeVerifier);

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.error) {
    const detail =
      payload?.error_description ??
      payload?.error ??
      payload?.message ??
      `HTTP ${response.status}`;
    throw new Error(`Collegamento a ${spec.label} fallito: ${detail}`);
  }

  const accessToken = typeof payload?.access_token === "string" ? payload.access_token : "";
  if (!accessToken) throw new Error(`${spec.label} non ha restituito un token di accesso`);

  const bundle: ConnectorTokenBundle = {
    access_token: accessToken,
    refresh_token:
      typeof payload?.refresh_token === "string" ? payload.refresh_token : undefined,
    token_type: typeof payload?.token_type === "string" ? payload.token_type : undefined,
    scope:
      typeof payload?.scope === "string"
        ? payload.scope
        : typeof payload?.scope === "object" && Array.isArray(payload.scope)
          ? payload.scope.join(" ")
          : undefined,
    expires_in: typeof payload?.expires_in === "number" ? payload.expires_in : undefined,
    id_token: typeof payload?.id_token === "string" ? payload.id_token : undefined,
  };
  if (bundle.expires_in) bundle.expires_at = Date.now() + bundle.expires_in * 1000;

  const extra: Record<string, unknown> = {};
  if (spec.id === "slack" && payload?.team) extra.team = payload.team;
  if (spec.id === "notion" && payload?.workspace_id) extra.workspace_id = payload.workspace_id;
  if (spec.id === "slack" && payload?.incoming_webhook) {
    extra.incoming_webhook = payload.incoming_webhook;
  }
  if (Object.keys(extra).length) bundle.extra = extra;

  return bundle;
}

/** Cifra il pacchetto token per il database. */
export function encryptBundle(bundle: ConnectorTokenBundle | Record<string, string>): string {
  return encryptSecret(JSON.stringify(bundle));
}

/** Decifra il pacchetto salvato (token OAuth oppure credenziali api_key). */
export function decryptBundle(secretEnc: string): Record<string, any> {
  const raw = decryptSecret(secretEnc);
  try {
    return JSON.parse(raw) as Record<string, any>;
  } catch {
    return { access_token: raw };
  }
}
