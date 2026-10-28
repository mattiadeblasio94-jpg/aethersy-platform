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
  token: string;
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
  reply.setCookie(config.cookieName, encodeSession(session), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: config.cookieMaxAgeSec,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(config.cookieName, { path: "/" });
}

export function getSession(request: FastifyRequest): Session | null {
  return decodeSession(request.cookies[config.cookieName]);
}
