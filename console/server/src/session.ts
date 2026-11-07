import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.js";

// Sessione: il token Activepieces vive in un cookie httpOnly firmato (HMAC).
// Il browser non puo' leggerlo ne' modificarlo; il BFF lo usa per proxare le API.

export interface SessionUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  platformRole?: string;
  verified?: boolean;
  projectId?: string | null;
}

export interface Session {
  /**
   * Token Activepieces. `null` quando la sessione e' stata aperta con un login
   * social su un account gia' esistente di cui il BFF non conosce la password:
   * la piattaforma funziona comunque (il tenant e' risolto via email), ma le
   * rotte /api/ap/* rispondono 401 finche' l'utente non entra con la password.
   */
  token: string | null;
  user: SessionUser;
  exp: number;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(payload: string): string {
  return b64url(crypto.createHmac("sha256", config.sessionSecret).update(payload).digest());
}

export function encodeSession(session: Session): string {
  const payload = b64url(Buffer.from(JSON.stringify(session)));
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(raw: string | undefined): Session | null {
  if (!raw) return null;
  const [payload, mac] = raw.split(".");
  if (!payload || !mac) return null;

  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as Session;
    if (typeof session.exp !== "number" || session.exp < Date.now() / 1000) return null;
    return session;
  } catch {
    return null;
  }
}

export function setSessionCookie(reply: FastifyReply, session: Session): void {
  // Se il browser ha ancora il cookie "host-only" (senza attributo Domain,
  // impostato prima che esistesse CONSOLE_COOKIE_DOMAIN) lo si cancella: due
  // cookie con lo stesso nome fanno vincere quello sbagliato e la sessione
  // sembra valida al login ma non sulle richieste successive.
  reply.clearCookie(config.cookieName, { path: "/" });
  reply.setCookie(config.cookieName, encodeSession(session), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: config.cookieMaxAgeSec,
    // Cookie di dominio quando configurato (`CONSOLE_COOKIE_DOMAIN`), per
    // condividere la sessione tra Console e il sito Platform.
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(config.cookieName, {
    path: "/",
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  });
}

/**
 * Tutti i valori del cookie di sessione presenti nell'intestazione `Cookie`.
 * Il browser puo' inviare piu' cookie con lo stesso nome (host-only + Domain):
 * si tentano tutti, non solo il primo.
 */
function sessionCookieValues(request: FastifyRequest): string[] {
  const values: string[] = [];
  const parsed = request.cookies[config.cookieName];
  if (parsed) values.push(parsed);
  const header = request.headers.cookie;
  if (header) {
    for (const part of header.split(";")) {
      const eq = part.indexOf("=");
      if (eq < 0) continue;
      const name = part.slice(0, eq).trim();
      if (name !== config.cookieName) continue;
      const value = part.slice(eq + 1).trim();
      if (value && !values.includes(value)) values.push(value);
    }
  }
  return values;
}

export function getSession(request: FastifyRequest): Session | null {
  for (const value of sessionCookieValues(request)) {
    const session = decodeSession(value);
    if (session) return session;
  }
  return null;
}
