import crypto from "node:crypto";
import { config } from "../config.js";

// Stato firmato del flusso di collegamento di un connettore.
//
// Il `state` viaggia nel browser (query string del provider) e porta dentro il
// tenant e il connettore: e' firmato con lo stesso segreto della sessione, per
// che un terzo non possa riaprire la connessione a nome di un altro tenant.
//
// Il nonce e' tenuto in un cookie httpOnly: al ritorno dal provider i due
// valori devono combaciare. Il code_verifier PKCE sta nel cookie (mai nel
// `state`, che e' visibile al browser).

export const CONNECTOR_STATE_COOKIE = "aethersy_connector_oauth";

const STATE_TTL_MS = 10 * 60 * 1000;

export interface ConnectorStatePayload {
  tenantId: string;
  connectorId: string;
  nonce: string;
  createdAt: number;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(payload: string): string {
  return b64url(crypto.createHmac("sha256", config.sessionSecret).update(payload).digest());
}

export function createConnectorState(params: {
  tenantId: string;
  connectorId: string;
}): { state: string; nonce: string; codeVerifier: string } {
  const nonce = crypto.randomBytes(16).toString("hex");
  const codeVerifier = b64url(crypto.randomBytes(32));
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        t: params.tenantId,
        c: params.connectorId,
        n: nonce,
        ts: Date.now(),
      }),
    ),
  );
  return { state: `${payload}.${sign(payload)}`, nonce, codeVerifier };
}

/** Verifica lo `state` contro il cookie: ritorna il payload o `null`. */
export function verifyConnectorState(
  state: string | undefined,
  cookieValue: string | undefined,
): ConnectorStatePayload | null {
  if (!state || !cookieValue) return null;
  const [payload, mac] = state.split(".");
  if (!payload || !mac) return null;

  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const [nonce, codeVerifier] = cookieValue.split(".");
  if (!nonce || !codeVerifier) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as {
      t?: string;
      c?: string;
      n?: string;
      ts?: number;
    };
    if (typeof parsed.t !== "string" || typeof parsed.c !== "string") return null;
    if (parsed.n !== nonce) return null;
    if (typeof parsed.ts !== "number" || Date.now() - parsed.ts > STATE_TTL_MS) return null;
    return { tenantId: parsed.t, connectorId: parsed.c, nonce, createdAt: parsed.ts };
  } catch {
    return null;
  }
}

export function connectorStateCookieValue(nonce: string, codeVerifier: string): string {
  return `${nonce}.${codeVerifier}`;
}

/**
 * Payload firmato, letto senza cookie.
 *
 * Serve al callback unificato: Google e GitHub accettano un solo callback URL
 * per app, quindi il login sociale e il collegamento dei connettori tornano
 * dalla stessa porta e si distinguono dal contenuto dello `state`.
 */
export function parseSignedState(
  state: string | undefined,
): ConnectorStatePayload | null {
  if (!state) return null;
  const [payload, mac] = state.split(".");
  if (!payload || !mac) return null;

  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as {
      t?: string;
      c?: string;
      n?: string;
      ts?: number;
    };
    if (typeof parsed.t !== "string" || typeof parsed.c !== "string") return null;
    if (typeof parsed.n !== "string" || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > STATE_TTL_MS) return null;
    return {
      tenantId: parsed.t,
      connectorId: parsed.c,
      nonce: parsed.n,
      createdAt: parsed.ts,
    };
  } catch {
    return null;
  }
}

/** Vero se lo `state` firmato descrive un collegamento di connettore. */
export function isConnectorState(state: string | undefined): boolean {
  return parseSignedState(state) !== null;
}

export function pkceChallenge(codeVerifier: string): string {
  return b64url(crypto.createHash("sha256").update(codeVerifier).digest());
}
