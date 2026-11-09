import { config } from "../config.js";
import { verifyTelegramIdToken } from "./telegram-idtoken.js";

// Client OAuth2 dei provider di login sociale (Google, GitHub).
//
// Il modulo non conosce Fastify: espone funzioni pure cosi' il flusso puo'
// essere verificato contro un provider finto (tools/test-social-login.mjs)
// senza toccare la rete pubblica. Gli endpoint sono sovrascrivibili via env:
// in produzione restano quelli ufficiali, nei test puntano al finto.
//
// Il `client_secret` non esce mai dal server e non viene scritto in alcun log.

export type SocialProvider = "google" | "github" | "telegram";

export interface SocialProfile {
  providerUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  picture?: string;
  /** true se l'email e' un identificativo sintetico (Telegram non espone l'email). */
  syntheticEmail?: boolean;
}

export interface SocialProviderStatus {
  id: SocialProvider;
  label: string;
  /** true se client_id, client_secret e redirect_uri sono configurati. */
  configured: boolean;
  scopes: string[];
  redirectUri: string;
  /** Ultimo errore osservato nel flusso (mostrato nella pagina di login). */
  lastError: { code: string; message: string; at: string } | null;
}

export class SocialAuthError extends Error {
  readonly code: string;
  readonly provider: SocialProvider;
  readonly status: number | null;

  constructor(provider: SocialProvider, code: string, message: string, status: number | null = null) {
    super(message);
    this.name = "SocialAuthError";
    this.provider = provider;
    this.code = code;
    this.status = status;
  }
}

interface ProviderSpec {
  id: SocialProvider;
  label: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  emailsUrl: string | null;
  scopes: string[];
}

function envUrl(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

export function socialProviderSpec(provider: SocialProvider): ProviderSpec {
  if (provider === "google") {
    return {
      id: "google",
      label: "Google",
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      redirectUri: config.googleRedirectUri,
      authorizeUrl: envUrl("GOOGLE_AUTHORIZE_URL", "https://accounts.google.com/o/oauth2/v2/auth"),
      tokenUrl: envUrl("GOOGLE_TOKEN_URL", "https://oauth2.googleapis.com/token"),
      userinfoUrl: envUrl("GOOGLE_USERINFO_URL", "https://www.googleapis.com/oauth2/v2/userinfo"),
      emailsUrl: null,
      scopes: ["openid", "email", "profile"],
    };
  }
  if (provider === "github") {
    return {
      id: "github",
      label: "GitHub",
      clientId: config.githubClientId,
      clientSecret: config.githubClientSecret,
      redirectUri: config.githubRedirectUri,
      authorizeUrl: envUrl("GITHUB_AUTHORIZE_URL", "https://github.com/login/oauth/authorize"),
      tokenUrl: envUrl("GITHUB_TOKEN_URL", "https://github.com/login/oauth/access_token"),
      userinfoUrl: envUrl("GITHUB_USERINFO_URL", "https://api.github.com/user"),
      emailsUrl: envUrl("GITHUB_USER_EMAILS_URL", "https://api.github.com/user/emails"),
      scopes: ["read:user", "user:email"],
    };
  }
  // Telegram Login: OpenID Connect su oauth.telegram.org. Client ID e Client
  // Secret arrivano da @BotFather -> Login Widget. Non esiste un endpoint
  // userinfo: i dati dell'utente sono nel JWT `id_token`, firmato da Telegram
  // (RS256) e verificato contro il JWKS ufficiale.
  return {
    id: "telegram",
    label: "Telegram",
    clientId: config.telegramClientId,
    clientSecret: config.telegramClientSecret,
    redirectUri: config.telegramRedirectUri,
    authorizeUrl: envUrl("TELEGRAM_AUTHORIZE_URL", "https://oauth.telegram.org/auth"),
    tokenUrl: envUrl("TELEGRAM_TOKEN_URL", "https://oauth.telegram.org/token"),
    userinfoUrl: envUrl("TELEGRAM_JWKS_URL", "https://oauth.telegram.org/.well-known/jwks.json"),
    emailsUrl: null,
    scopes: ["openid", "profile"],
  };
}

export function socialProviderConfigured(provider: SocialProvider): boolean {
  const spec = socialProviderSpec(provider);
  return Boolean(spec.clientId && spec.clientSecret && spec.redirectUri);
}

/** URL di autorizzazione del provider, con `state` firmato e `nonce` OIDC. */
export function socialAuthorizeUrl(
  provider: SocialProvider,
  params: { state: string; nonce: string },
): string {
  const spec = socialProviderSpec(provider);
  const query = new URLSearchParams({
    client_id: spec.clientId,
    redirect_uri: spec.redirectUri,
    response_type: "code",
    scope: spec.scopes.join(" "),
    state: params.state,
  });

  if (provider === "google") {
    // `nonce` lega la risposta OIDC allo state firmato; `select_account` evita
    // il consenso forzato (un login non deve chiedere accesso offline).
    query.set("nonce", params.nonce);
    query.set("prompt", "select_account");
    query.set("include_granted_scopes", "true");
  } else if (provider === "telegram") {
    // Telegram e' un issuer OIDC: il nonce lega l'id_token alla richiesta.
    query.set("nonce", params.nonce);
  } else {
    query.set("allow_signup", "true");
  }

  return `${spec.authorizeUrl}?${query.toString()}`;
}

/** Traduce l'errore del provider in un messaggio comprensibile per l'utente. */
function socialErrorFromPayload(
  provider: SocialProvider,
  status: number,
  payload: any,
  rawText: string,
): SocialAuthError {
  const spec = socialProviderSpec(provider);
  const code = typeof payload?.error === "string" ? payload.error : "";
  const description =
    typeof payload?.error_description === "string"
      ? payload.error_description
      : typeof payload?.message === "string"
        ? payload.message
        : "";

  if (provider === "github") {
    // GitHub risponde 404 (body {"error":"Not Found"}) quando client_id o
    // client_secret non corrispondono a un'app valida: e' il caso tipico di un
    // secret rigenerato o di un'app cancellata.
    if (status === 404 || code === "Not Found" || /not found/i.test(rawText)) {
      return new SocialAuthError(
        provider,
        "OAUTH_APP_INVALID",
        "GitHub non riconosce l'app OAuth: client_id o client_secret non validi (oppure app eliminata). Rigenera il secret in GitHub, impostazioni sviluppatore, OAuth Apps.",
        status,
      );
    }
    if (code === "bad_verification_code") {
      return new SocialAuthError(
        provider,
        "OAUTH_CODE_INVALID",
        "Il codice di autorizzazione GitHub non e' piu' valido: riavvia il login.",
        status,
      );
    }
  }

  if (code === "invalid_client") {
    return new SocialAuthError(
      provider,
      "OAUTH_CLIENT_INVALID",
      `Le credenziali OAuth di ${spec.label} non sono valide (client_id o client_secret da ricontrollare).`,
      status,
    );
  }
  if (code === "invalid_grant" || code === "bad_verification_code") {
    return new SocialAuthError(
      provider,
      "OAUTH_CODE_INVALID",
      `Il codice di autorizzazione di ${spec.label} non e' piu' valido: riavvia il login.`,
      status,
    );
  }
  if (code === "redirect_uri_mismatch") {
    return new SocialAuthError(
      provider,
      "OAUTH_REDIRECT_MISMATCH",
      `L'URI di reindirizzamento di ${spec.label} non corrisponde a quello registrato nell'app OAuth.`,
      status,
    );
  }
  if (code === "access_denied") {
    return new SocialAuthError(provider, "OAUTH_ACCESS_DENIED", "Accesso annullato.", status);
  }

  const detail = description || rawText.slice(0, 200);
  return new SocialAuthError(
    provider,
    "OAUTH_EXCHANGE_FAILED",
    detail
      ? `Accesso con ${spec.label} non riuscito: ${detail}`
      : `Accesso con ${spec.label} non riuscito (HTTP ${status}).`,
    status,
  );
}

/** Scambia il codice di autorizzazione con un access token. */
export async function exchangeSocialCode(
  provider: SocialProvider,
  code: string,
): Promise<{ accessToken: string; idToken: string | null }> {
  const spec = socialProviderSpec(provider);

  const response = await fetch(
    spec.tokenUrl,
    provider === "google"
      ? {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: spec.clientId,
            client_secret: spec.clientSecret,
            code,
            grant_type: "authorization_code",
            redirect_uri: spec.redirectUri,
          }),
        }
      : provider === "telegram"
        ? {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              // Telegram accetta `client_secret_basic` (documentazione OIDC).
              Authorization: `Basic ${Buffer.from(`${spec.clientId}:${spec.clientSecret}`).toString("base64")}`,
            },
            body: new URLSearchParams({
              client_id: spec.clientId,
              code,
              grant_type: "authorization_code",
              redirect_uri: spec.redirectUri,
            }),
          }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              client_id: spec.clientId,
              client_secret: spec.clientSecret,
              code,
              redirect_uri: spec.redirectUri,
            }),
          },
  );

  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.error) {
    throw socialErrorFromPayload(provider, response.status, payload, text);
  }

  const accessToken = typeof payload?.access_token === "string" ? payload.access_token : "";
  if (!accessToken) {
    throw new SocialAuthError(
      provider,
      "TOKEN_MISSING",
      `${spec.label} non ha restituito un token di accesso.`,
      response.status,
    );
  }
  return {
    accessToken,
    idToken: typeof payload?.id_token === "string" ? payload.id_token : null,
  };
}

async function readJson(url: string, accessToken: string): Promise<{ status: number; payload: any; text: string }> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  return { status: response.status, payload, text };
}

/** Profilo dell'utente autenticato dal provider (email sempre richiesta). */
export async function fetchSocialProfile(
  provider: SocialProvider,
  accessToken: string,
  idToken?: string | null,
): Promise<SocialProfile> {
  const spec = socialProviderSpec(provider);

  if (provider === "telegram") {
    // Telegram non espone un endpoint userinfo: i dati dell'utente sono
    // dentro l'id_token (JWT firmato da Telegram con RS256). Il token viene
    // verificato contro il JWKS ufficiale prima di usarne le dichiarazioni.
    if (!idToken) {
      throw new SocialAuthError(
        provider,
        "TOKEN_MISSING",
        "Telegram non ha restituito l'id_token necessario per completare l'accesso.",
      );
    }
    const claims = await verifyTelegramIdToken(idToken);
    const providerUserId = String(claims.id ?? claims.sub ?? "");
    if (!providerUserId) {
      throw new SocialAuthError(
        provider,
        "PROFILE_INVALID",
        "Il profilo Telegram non contiene un identificativo utente.",
      );
    }
    const fullName = typeof claims.name === "string" ? claims.name.trim() : "";
    const parts = fullName ? fullName.split(/\s+/) : [];
    const username =
      typeof claims.preferred_username === "string" ? claims.preferred_username.trim() : "";
    // Telegram non fornisce l'email: l'identita' della piattaforma e' quindi
    // sintetica e stabile (username se presente, altrimenti l'id utente).
    const handle = username || providerUserId;
    return {
      providerUserId,
      email: `tg-${handle.toLowerCase().replace(/[^a-z0-9_.-]/g, "")}@telegram.aethersy.online`,
      firstName: typeof claims.given_name === "string" ? claims.given_name : (parts[0] ?? ""),
      lastName: typeof claims.family_name === "string" ? claims.family_name : parts.slice(1).join(" "),
      picture: typeof claims.picture === "string" ? claims.picture : undefined,
      syntheticEmail: true,
    };
  }

  const info = await readJson(spec.userinfoUrl, accessToken);
  if (info.status >= 400) {
    throw socialErrorFromPayload(provider, info.status, info.payload, info.text);
  }

  if (provider === "google") {
    const email = typeof info.payload?.email === "string" ? info.payload.email : "";
    if (!email) {
      throw new SocialAuthError(
        provider,
        "NO_EMAIL",
        "Nessuna email associata all'account Google: aggiungi un'email al profilo Google.",
      );
    }
    return {
      providerUserId: String(info.payload?.id ?? email),
      email,
      firstName: typeof info.payload?.given_name === "string" ? info.payload.given_name : "",
      lastName: typeof info.payload?.family_name === "string" ? info.payload.family_name : "",
      picture: typeof info.payload?.picture === "string" ? info.payload.picture : undefined,
    };
  }

  const login = typeof info.payload?.login === "string" ? info.payload.login : "";
  let email = typeof info.payload?.email === "string" ? info.payload.email : "";
  if (!email && spec.emailsUrl) {
    const emails = await readJson(spec.emailsUrl, accessToken);
    if (emails.status < 400 && Array.isArray(emails.payload)) {
      const primary = emails.payload.find((e: any) => e?.primary && e?.verified);
      const fallback = emails.payload.find((e: any) => typeof e?.email === "string");
      email = primary?.email ?? fallback?.email ?? "";
    }
  }
  if (!email) {
    throw new SocialAuthError(
      provider,
      "NO_EMAIL",
      "Nessuna email associata all'account GitHub: rendi visibile l'email nelle impostazioni del profilo.",
    );
  }

  const fullName = typeof info.payload?.name === "string" ? info.payload.name.trim() : "";
  const parts = fullName ? fullName.split(/\s+/) : [];
  return {
    providerUserId: String(info.payload?.id ?? login ?? email),
    email,
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
    picture: typeof info.payload?.avatar_url === "string" ? info.payload.avatar_url : undefined,
  };
}

// --- Stato dei provider (ultimo errore osservato) ----------------------------

const lastErrors = new Map<SocialProvider, { code: string; message: string; at: string }>();

export function recordSocialFailure(provider: SocialProvider, code: string, message: string): void {
  lastErrors.set(provider, { code, message, at: new Date().toISOString() });
}

export function clearSocialFailure(provider: SocialProvider): void {
  lastErrors.delete(provider);
}

export function socialProviderStatus(): Record<SocialProvider, SocialProviderStatus> {
  const build = (provider: SocialProvider): SocialProviderStatus => {
    const spec = socialProviderSpec(provider);
    return {
      id: provider,
      label: spec.label,
      configured: socialProviderConfigured(provider),
      scopes: spec.scopes,
      redirectUri: spec.redirectUri,
      lastError: lastErrors.get(provider) ?? null,
    };
  };
  return { google: build("google"), github: build("github"), telegram: build("telegram") };
}
