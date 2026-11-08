import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { apFetch, ApError } from "../ap.js";
import { config } from "../config.js";
import { setSessionCookie, type Session } from "../session.js";
import { loadIdentityCredential, saveIdentityCredential } from "./identity-store.js";
import {
  createOAuthState,
  OAUTH_STATE_COOKIE,
  oauthLoginUrl,
  oauthSuccessUrl,
  verifyOAuthState,
  type OAuthTarget,
} from "./oauth-state.js";
import {
  clearSocialFailure,
  exchangeSocialCode,
  fetchSocialProfile,
  recordSocialFailure,
  socialAuthorizeUrl,
  socialProviderConfigured,
  socialProviderStatus,
  SocialAuthError,
  type SocialProvider,
} from "./social.js";
import { connectorById } from "../connectors/catalog.js";
import { completeConnectorAuthorization } from "../connectors/complete.js";
import {
  CONNECTOR_STATE_COOKIE,
  parseSignedState,
  verifyConnectorState,
} from "../connectors/state.js";

// Login sociale (Google, GitHub): avvio del flusso, callback e stato dei
// provider.
//
// Regola di progetto: il login non deve mai "bloccarsi". Ogni errore (provider
// che rifiuta, codice scaduto, Activepieces non raggiungibile, archivio
// credenziali non disponibile) finisce sulla pagina di login con un messaggio
// leggibile, e la sessione della piattaforma viene aperta anche quando il
// token Activepieces non e' disponibile.

interface SocialAccount {
  token: string | null;
  apUserId: string | null;
  apResponse: any;
  /** Motivo per cui il token Activepieces non e' disponibile (null = ok). */
  apIssue: string | null;
}

/**
 * Risolve l'account Activepieces dell'utente sociale.
 *
 * Ordine delle prove:
 *  1. credenziale archiviata (password nota): sign-in -> token completo;
 *  2. account inesistente: sign-up con password casuale -> token archiviato
 *     cifrato per i prossimi accessi;
 *  3. qualunque altro esito (account gia' esistente senza password nota,
 *     Activepieces non raggiungibile, database non disponibile): si prosegue
 *     con una sessione senza token Activepieces. Il tenant e' risolto via
 *     email, quindi la piattaforma resta usabile.
 */
async function resolveSocialAccount(params: {
  email: string;
  firstName: string;
  lastName: string;
  provider: SocialProvider;
}): Promise<SocialAccount> {
  const { email, firstName, lastName, provider } = params;

  let stored: Awaited<ReturnType<typeof loadIdentityCredential>> = null;
  try {
    stored = await loadIdentityCredential(email);
  } catch {
    // Archivio non disponibile: si prosegue con sign-up o sessione senza token.
    stored = null;
  }

  if (stored?.password) {
    try {
      const signedIn = await apFetch<any>("/api/v1/authentication/sign-in", {
        method: "POST",
        body: JSON.stringify({ email, password: stored.password }),
      });
      if (signedIn?.token) {
        try {
          await saveIdentityCredential(email, null, provider, signedIn.id ?? stored.apUserId);
        } catch {
          // Archivio non disponibile: il token di questa sessione basta.
        }
        return { token: signedIn.token, apUserId: signedIn.id ?? stored.apUserId, apResponse: signedIn, apIssue: null };
      }
    } catch {
      // Password archiviata non piu' valida: si prosegue con sign-up o sessione.
    }
  }

  const randomPassword = `Aa1${crypto.randomUUID().replace(/-/g, "")}`;
  try {
    const created = await apFetch<any>("/api/v1/authentication/sign-up", {
      method: "POST",
      body: JSON.stringify({
        email,
        password: randomPassword,
        firstName,
        lastName,
        trackEvents: false,
        newsLetter: false,
      }),
    });
    if (created?.token) {
      try {
        await saveIdentityCredential(email, randomPassword, provider, created.id ?? null);
      } catch {
        // Archivio non disponibile: la sessione resta valida per questa visita.
      }
      return { token: created.token, apUserId: created.id ?? null, apResponse: created, apIssue: null };
    }
    return {
      token: null,
      apUserId: created?.id ?? null,
      apResponse: created,
      apIssue: "ACTIVEPIECES_TOKEN_MISSING",
    };
  } catch (err) {
    const issue =
      err instanceof ApError ? err.code ?? `ACTIVEPIECES_${err.status}` : "ACTIVEPIECES_UNAVAILABLE";
    return { token: null, apUserId: stored?.apUserId ?? null, apResponse: null, apIssue: issue };
  }
}

function setOAuthStateCookie(reply: FastifyReply, nonce: string): void {
  reply.setCookie(OAUTH_STATE_COOKIE, nonce, {
    path: "/api/auth/social",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  });
}

function clearOAuthStateCookie(reply: FastifyReply): void {
  reply.clearCookie(OAUTH_STATE_COOKIE, {
    path: "/api/auth/social",
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  });
}

function requestedTarget(request: FastifyRequest): OAuthTarget {
  const requested = (request.query as { target?: string } | undefined)?.target;
  return requested === "console" ? "console" : "platform";
}

async function startSocialLogin(
  provider: SocialProvider,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!socialProviderConfigured(provider)) {
    const target = requestedTarget(request);
    recordSocialFailure(provider, "OAUTH_NOT_CONFIGURED", "Provider non configurato sul server.");
    return reply.redirect(oauthLoginUrl(target, "OAUTH_NOT_CONFIGURED", "Questo metodo di accesso non e' ancora disponibile."));
  }

  const target = requestedTarget(request);
  const { state, nonce } = createOAuthState(target);
  setOAuthStateCookie(reply, nonce);
  clearSocialFailure(provider);

  const url = socialAuthorizeUrl(provider, { state, nonce });
  return reply.redirect(url);
}

async function completeSocialLogin(
  provider: SocialProvider,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = (request.query ?? {}) as {
    code?: string;
    error?: string;
    error_description?: string;
    state?: string;
  };

  // Callback unificato: Google e GitHub hanno un solo callback URL per app,
  // quindi qui arrivano sia i login sia i collegamenti dei connettori. Lo
  // `state` firmato dice quale dei due e' (campo `c` = connettore).
  const connectorState = parseSignedState(query.state);
  if (connectorState) {
    return completeConnectorLogin(provider, connectorState, query, request, reply);
  }

  // Il target si considera fidato solo se lo `state` firmato combacia con il
  // cookie anti-CSRF: altrimenti si usa la destinazione di default.
  const verifiedTarget = verifyOAuthState(query.state, request.cookies[OAUTH_STATE_COOKIE]);
  const target: OAuthTarget = verifiedTarget ?? "platform";

  const fail = (code: string, message: string): void => {
    recordSocialFailure(provider, code, message);
    reply.redirect(oauthLoginUrl(target, code, message));
  };

  if (!verifiedTarget) {
    clearOAuthStateCookie(reply);
    return fail(
      "OAUTH_STATE_INVALID",
      "Sessione OAuth non valida o scaduta: riavvia il login.",
    );
  }

  if (query.error) {
    clearOAuthStateCookie(reply);
    const message =
      query.error === "access_denied"
        ? "Accesso annullato."
        : `Il provider ha rifiutato l'accesso: ${query.error_description ?? query.error}.`;
    return fail(query.error === "access_denied" ? "OAUTH_ACCESS_DENIED" : "OAUTH_ERROR", message);
  }

  if (!query.code) {
    clearOAuthStateCookie(reply);
    return fail("OAUTH_CODE_MISSING", "Codice di autorizzazione mancante: riavvia il login.");
  }

  let profile;
  try {
    const { accessToken } = await exchangeSocialCode(provider, query.code);
    profile = await fetchSocialProfile(provider, accessToken);
  } catch (err) {
    clearOAuthStateCookie(reply);
    if (err instanceof SocialAuthError) {
      return fail(err.code, err.message);
    }
    return fail("OAUTH_FAILED", `Accesso non riuscito: ${(err as Error).message}`);
  }

  const account = await resolveSocialAccount({
    email: profile.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    provider,
  });

  const apResponse = account.apResponse;
  const session: Session = {
    token: account.token,
    user: {
      id: apResponse?.id ?? account.apUserId ?? profile.providerUserId ?? profile.email,
      email: apResponse?.email ?? profile.email,
      firstName: apResponse?.firstName ?? profile.firstName,
      lastName: apResponse?.lastName ?? profile.lastName,
      platformRole: apResponse?.platformRole ?? "MEMBER",
      verified: apResponse?.verified ?? true,
      projectId: apResponse?.projectId ?? null,
    },
    exp: Math.floor(Date.now() / 1000) + config.cookieMaxAgeSec,
  };
  setSessionCookie(reply, session);
  clearOAuthStateCookie(reply);
  clearSocialFailure(provider);

  return reply.redirect(oauthSuccessUrl(target));
}

/**
 * Collegamento di un connettore Google/GitHub: lo `state` firmato porta
 * tenant + connettore, il cookie httpOnly porta il code_verifier PKCE.
 */
async function completeConnectorLogin(
  provider: SocialProvider,
  connectorState: { tenantId: string; connectorId: string; nonce: string },
  query: { code?: string; error?: string; error_description?: string; state?: string },
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const spec = connectorById(connectorState.connectorId);
  const cookieValue = request.cookies[CONNECTOR_STATE_COOKIE];
  const verified = verifyConnectorState(query.state, cookieValue);

  const clearConnectorCookie = (): void => {
    reply.clearCookie(CONNECTOR_STATE_COOKIE, {
      path: "/api",
      ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
    });
  };

  const back = (params: Record<string, string>): string => {
    const url = new URL(`${config.platformPublicUrl}/connectors`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.toString();
  };

  if (!spec || spec.auth !== provider) {
    clearConnectorCookie();
    return reply.redirect(
      back({
        error: "CONNECTOR_STATE_INVALID",
        message: "Sessione di collegamento non valida: riavria il collegamento.",
      }),
    );
  }

  if (!verified || verified.connectorId !== spec.id || verified.tenantId !== connectorState.tenantId) {
    clearConnectorCookie();
    return reply.redirect(
      back({
        connect: spec.id,
        error: "CONNECTOR_STATE_INVALID",
        message: "Sessione di collegamento non valida o scaduta: riprova.",
      }),
    );
  }

  if (query.error) {
    clearConnectorCookie();
    const message =
      query.error === "access_denied"
        ? "Accesso annullato."
        : `Il provider ha rifiutato il collegamento: ${query.error_description ?? query.error}.`;
    return reply.redirect(
      back({ connect: spec.id, error: "CONNECTOR_ACCESS_DENIED", message }),
    );
  }

  if (!query.code) {
    clearConnectorCookie();
    return reply.redirect(
      back({
        connect: spec.id,
        error: "CONNECTOR_CODE_MISSING",
        message: "Codice di autorizzazione mancante: riprova il collegamento.",
      }),
    );
  }

  const codeVerifier = (cookieValue ?? "").split(".")[1] ?? "";
  const completion = await completeConnectorAuthorization({
    spec,
    code: query.code,
    codeVerifier,
    tenantId: verified.tenantId,
    platformUrl: config.platformPublicUrl,
  });
  clearConnectorCookie();
  return reply.redirect(completion.redirect);
}

export async function registerSocialRoutes(app: FastifyInstance): Promise<void> {
  // Stato dei provider: la pagina di login usa questa rotta per sapere se il
  // bottone e' utilizzabile e per spiegare l'ultimo errore osservato.
  app.get("/api/auth/social/providers", async () => {
    return { providers: socialProviderStatus() };
  });

  app.get("/api/auth/social/google", async (request, reply) => {
    return startSocialLogin("google", request, reply);
  });

  app.get("/api/auth/social/google/callback", async (request, reply) => {
    return completeSocialLogin("google", request, reply);
  });

  app.get("/api/auth/social/github", async (request, reply) => {
    return startSocialLogin("github", request, reply);
  });

  app.get("/api/auth/social/github/callback", async (request, reply) => {
    return completeSocialLogin("github", request, reply);
  });
}
