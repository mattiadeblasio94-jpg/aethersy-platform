// =============================================================================
// Verifica degli id_token OIDC di Telegram.
//
// Telegram Login (oauth.telegram.org) restituisce i dati dell'utente dentro
// l'`id_token`: un JWT firmato con RS256 dalla chiave del bot. Non esiste un
// endpoint userinfo.
//
// Il token viene verificato server-side contro il JWKS ufficiale:
//   1. la firma RS256 e' controllata con la chiave pubblica del `kid` indicato;
//   2. `iss` deve essere https://oauth.telegram.org;
//   3. `aud` deve corrispondere al Client ID del bot;
//   4. `exp` deve essere nel futuro.
//
// Senza questa verifica un token fabbricato da terzi permetterebbe di
// impersonare qualsiasi utente Telegram.
// =============================================================================

import crypto from "node:crypto";
import { config } from "../config.js";

export interface TelegramClaims {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  id?: string | number;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  picture?: string;
  phone_number?: string;
}

interface Jwk {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
  x?: string;
  y?: string;
  crv?: string;
}

interface JwksDocument {
  keys?: Jwk[];
}

const JWKS_URL =
  process.env.TELEGRAM_JWKS_URL?.trim() || "https://oauth.telegram.org/.well-known/jwks.json";
const ISSUER = "https://oauth.telegram.org";
const JWKS_TTL_MS = 10 * 60 * 1000;

let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;

function b64urlToBuffer(segment: string): Buffer {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

/** Scarica (con cache breve) il JWKS ufficiale di Telegram. */
async function fetchJwks(): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const response = await fetch(JWKS_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`JWKS Telegram non raggiungibile (HTTP ${response.status})`);
  }
  const payload = (await response.json()) as JwksDocument;
  const keys = Array.isArray(payload?.keys) ? payload.keys : [];
  if (!keys.length) throw new Error("JWKS Telegram vuoto");
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

/** Chiave pubblica PEM a partire dalla JWK (RSA n/e). */
function publicKeyFromJwk(jwk: Jwk): crypto.KeyObject | null {
  if (jwk.kty !== "RSA" || !jwk.n || !jwk.e) return null;
  return crypto.createPublicKey({
    key: { kty: "RSA", n: jwk.n, e: jwk.e },
    format: "jwk",
  });
}

/**
 * Verifica l'id_token Telegram e restituisce le dichiarazioni.
 * Lancia un errore se la firma, l'emittente, il destinatario o la scadenza
 * non sono validi.
 */
export async function verifyTelegramIdToken(idToken: string): Promise<TelegramClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("id_token Telegram malformato");

  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const header = JSON.parse(b64urlToBuffer(headerSegment).toString("utf8")) as {
    alg?: string;
    kid?: string;
  };
  if (header.alg !== "RS256") {
    throw new Error(`algoritmo di firma non supportato: ${header.alg ?? "?"}`);
  }

  const keys = await fetchJwks();
  const candidates = header.kid ? keys.filter((k) => k.kid === header.kid) : keys;
  const signature = b64urlToBuffer(signatureSegment);
  const signedData = Buffer.from(`${headerSegment}.${payloadSegment}`, "utf8");

  let verified = false;
  for (const jwk of candidates) {
    const key = publicKeyFromJwk(jwk);
    if (!key) continue;
    if (crypto.verify("RSA-SHA256", signedData, key, signature)) {
      verified = true;
      break;
    }
  }
  if (!verified) throw new Error("firma dell'id_token Telegram non valida");

  const claims = JSON.parse(b64urlToBuffer(payloadSegment).toString("utf8")) as TelegramClaims;
  if (claims.iss !== ISSUER) {
    throw new Error(`issuer dell'id_token non atteso: ${claims.iss ?? "?"}`);
  }
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(config.telegramClientId)) {
    throw new Error("audience dell'id_token non corrisponde al Client ID del bot");
  }
  if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now()) {
    throw new Error("id_token Telegram scaduto");
  }
  return claims;
}
