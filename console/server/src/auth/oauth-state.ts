import crypto from "node:crypto";
import { config } from "../config.js";

// Protezione del flusso OAuth (state + anti-CSRF).
//
// Il flusso e' in due tempi: il browser va su Google e torna con un `code`.
// Senza un `state` legato alla sessione di partenza, un terzo potrebbe
// iniettare il proprio codice (login fixation) o far tornare l'utente su un
// sito diverso (open redirect).
//
// Qui il `state` e' un payload firmato (HMAC col segreto di sessione) che
// contiene: un nonce casuale, la destinazione richiesta e il timestamp. Il
// nonce viene messo anche in un cookie httpOnly di breve durata: al ritorno
// il callback deve presentare entrambi, e devono combaciare.
//
// La destinazione e' una allowlist ("platform" | "console"): non si accettano
// URL arbitrari dal client.

export const OAUTH_STATE_COOKIE = "aethersy_oauth_state";

const STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthTarget = "platform" | "console";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(payload: string): string {
  return b64url(crypto.createHmac("sha256", config.sessionSecret).update(payload).digest());
}

/** Genera lo `state` firmato e il nonce da mettere nel cookie. */
export function createOAuthState(target: OAuthTarget): { state: string; nonce: string } {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = b64url(
    Buffer.from(JSON.stringify({ n: nonce, t: target, ts: Date.now() })),
  );
  return { state: `${payload}.${sign(payload)}`, nonce };
}

/**
 * Verifica lo `state` contro il nonce del cookie.
 * Ritorna la destinazione richiesta, oppure `null` se lo state non e' valido.
 */
export function verifyOAuthState(
  state: string | undefined,
  nonceCookie: string | undefined,
): OAuthTarget | null {
  if (!state || !nonceCookie) return null;
  const [payload, mac] = state.split(".");
  if (!payload || !mac) return null;

  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as {
      n?: string;
      t?: string;
      ts?: number;
    };
    if (typeof parsed.n !== "string" || parsed.n !== nonceCookie) return null;
    if (typeof parsed.ts !== "number" || Date.now() - parsed.ts > STATE_TTL_MS) return null;
    return parsed.t === "console" ? "console" : "platform";
  } catch {
    return null;
  }
}

/** URL di destinazione dopo il login (allowlist chiusa: nessun open redirect). */
export function oauthTargetUrl(target: OAuthTarget): string {
  return target === "console" ? `${config.consolePublicUrl}/` : `${config.platformPublicUrl}/`;
}

/**
 * URL della pagina di login a cui tornare quando il flusso OAuth fallisce.
 * L'utente torna sulla pagina con un messaggio leggibile invece di vedere
 * una risposta JSON grezza: era questo il "accesso bloccato" che si vedeva.
 */
export function oauthLoginUrl(target: OAuthTarget, code: string, message: string): string {
  const base = target === "console" ? `${config.consolePublicUrl}/login` : `${config.platformPublicUrl}/login`;
  const params = new URLSearchParams({ error: code, message });
  return `${base}?${params.toString()}`;
}

/** URL di arrivo dopo un login riuscito: la destinazione richiesta. */
export function oauthSuccessUrl(target: OAuthTarget): string {
  return target === "console"
    ? `${config.consolePublicUrl}/`
    : `${config.platformPublicUrl}/studio?login=social`;
}
