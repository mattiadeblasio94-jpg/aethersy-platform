'use strict';

/**
 * Cookie di sessione firmato HMAC-SHA256: "id.scadenza.firma".
 * Rotazione: AETHERSY_SESSION_SECRET_PREV accetta le firme vecchie in lettura.
 */

const crypto = require('node:crypto');

const COOKIE = 'aeth_session';
const TTL_MS = 1000 * 60 * 60 * 24 * 14;

function secret() {
  const s = process.env.AETHERSY_SESSION_SECRET || '';
  if (Buffer.byteLength(s) < 32) throw new Error('AETHERSY_SESSION_SECRET < 32 byte');
  return s;
}

function sign(payload, key) {
  return crypto.createHmac('sha256', key).update(payload).digest('base64url');
}

function safeEq(a, b) {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function issue(userId) {
  const exp = Date.now() + TTL_MS;
  const payload = `${userId}.${exp}`;
  return { value: `${payload}.${sign(payload, secret())}`, expires: new Date(exp) };
}

function read(cookieHeader) {
  if (!cookieHeader) return null;
  const raw = cookieHeader.split(';').map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return null;

  const value = decodeURIComponent(raw.slice(COOKIE.length + 1));
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  if (Number(exp) < Date.now()) return null;

  const payload = `${id}.${exp}`;
  const keys = [secret(), process.env.AETHERSY_SESSION_SECRET_PREV].filter(Boolean);
  const ok = keys.some((k) => safeEq(sig, sign(payload, k)));
  return ok ? { id, exp: Number(exp) } : null;
}

function cookieHeader(value, expires, secure = true) {
  const base = `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}`;
  return secure ? `${base}; Secure` : base;
}

function clearHeader() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

module.exports = { COOKIE, issue, read, cookieHeader, clearHeader };
