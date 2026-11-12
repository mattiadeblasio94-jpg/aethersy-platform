import crypto from "node:crypto";
import { config } from "../config.js";
import { decryptSecret, encryptSecret } from "../pipeline/secrets.js";
import {
  getIntegrationCredential,
  listIntegrationCredentials,
  revokeIntegrationCredential,
  saveIntegrationCredential,
} from "../pipeline/repo.js";

// Integrazione con Wix.
//
// Due accessi, complementari:
//
//  1) **Wix MCP** (`https://mcp.wix.com/mcp`): il server MCP ufficiale di Wix
//     espone le API del sito (e-commerce, blog, analytics, pagine, domini) come
//     tool MCP. Si autentica con OAuth 2.1: registrazione dinamica del client
//     (DCR) + PKCE, poi i token restano cifrati nel database del tenant.
//  2) **Wix REST** (`https://www.wixapis.com`): token di istanza/account per le
//     API REST dirette. Va nel `.env` del VPS, mai nel repo.
//
// Il resto del file e' volutamente senza commenti: il comportamento e' quello
// descritto sopra e nei commenti dei moduli vicini.

export const WIX_PROVIDER = "wix";
export const WIX_CREDENTIAL_LABEL = "mcp";

export interface WixTokens {
  client_id: string;
  client_secret?: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  scope?: string;
  token_type?: string;
}

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpCallResult {
  ok: boolean;
  content: unknown;
  error?: string;
  isError?: boolean;
}

const MCP_PROVIDER_ID = "wix";
const STATE_TTL_MS = 10 * 60 * 1000;

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signState(payload: string): string {
  return b64url(crypto.createHmac("sha256", config.sessionSecret).update(payload).digest());
}

export function createWixState(tenantId: string): {
  state: string;
  nonce: string;
  codeVerifier: string;
} {
  const nonce = crypto.randomBytes(16).toString("hex");
  const codeVerifier = b64url(crypto.randomBytes(32));
  const payload = b64url(
    Buffer.from(JSON.stringify({ t: tenantId, n: nonce, ts: Date.now() })),
  );
  return { state: `${payload}.${signState(payload)}`, nonce, codeVerifier };
}

export function verifyWixState(
  state: string | undefined,
  cookieValue: string | undefined,
): { tenantId: string; nonce: string } | null {
  if (!state || !cookieValue) return null;
  const [payload, mac] = state.split(".");
  if (!payload || !mac) return null;
  const expected = signState(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const [nonce, codeVerifier] = cookieValue.split(".");
  if (!nonce || !codeVerifier || nonce !== codeVerifier.split(".")[0]) {
    if (!nonce) return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as {
      t?: string;
      n?: string;
      ts?: number;
    };
    if (typeof parsed.t !== "string" || typeof parsed.n !== "string") return null;
    if (parsed.n !== nonce) return null;
    if (typeof parsed.ts !== "number" || Date.now() - parsed.ts > STATE_TTL_MS) return null;
    return { tenantId: parsed.t, nonce };
  } catch {
    return null;
  }
}

export function wixStateCookieValue(nonce: string, codeVerifier: string): string {
  return `${nonce}.${codeVerifier}`;
}

export function wixRedirectUri(): string {
  return `${config.platformPublicUrl}/api/platform/wix/callback`;
}

export async function registerWixClient(): Promise<{
  client_id: string;
  client_secret?: string;
}> {
  if (config.wixMcpClientId) {
    return {
      client_id: config.wixMcpClientId,
      client_secret: config.wixMcpClientSecret || undefined,
    };
  }
  const response = await fetch(config.wixMcpRegisterUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "Aethersy Platform",
      redirect_uris: [wixRedirectUri()],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
      scope: config.wixMcpScope,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Registrazione del client MCP Wix fallita (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }
  const payload = JSON.parse(text) as { client_id?: string; client_secret?: string };
  if (!payload.client_id) throw new Error("Wix MCP non ha restituito il client_id");
  return { client_id: payload.client_id, client_secret: payload.client_secret };
}

export function wixAuthorizeUrl(params: {
  clientId: string;
  state: string;
  codeVerifier: string;
}): string {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    redirect_uri: wixRedirectUri(),
    scope: config.wixMcpScope,
    state: params.state,
    code_challenge: b64url(
      crypto.createHash("sha256").update(params.codeVerifier).digest(),
    ),
    code_challenge_method: "S256",
  });
  return `${config.wixMcpAuthorizeUrl}?${query.toString()}`;
}

export async function wixExchangeCode(params: {
  clientId: string;
  clientSecret?: string;
  code: string;
  codeVerifier: string;
}): Promise<WixTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: wixRedirectUri(),
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
  });
  if (params.clientSecret) body.set("client_secret", params.clientSecret);
  const response = await fetch(config.wixMcpTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
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
      payload?.error_description ?? payload?.error ?? payload?.message ?? `HTTP ${response.status}`;
    throw new Error(`Collegamento a Wix fallito: ${detail}`);
  }
  return tokensFromPayload(payload, params.clientId, params.clientSecret);
}

export async function wixRefreshTokens(tokens: WixTokens): Promise<WixTokens> {
  if (!tokens.refresh_token) throw new Error("Token Wix senza refresh_token");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: tokens.client_id,
  });
  if (tokens.client_secret) body.set("client_secret", tokens.client_secret);
  const response = await fetch(config.wixMcpTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
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
    throw new Error(
      `Rinnovo del token Wix fallito: ${payload?.error_description ?? payload?.error ?? `HTTP ${response.status}`}`,
    );
  }
  return tokensFromPayload(payload, tokens.client_id, tokens.client_secret);
}

function tokensFromPayload(
  payload: any,
  clientId: string,
  clientSecret?: string,
): WixTokens {
  const accessToken = typeof payload?.access_token === "string" ? payload.access_token : "";
  if (!accessToken) throw new Error("Wix non ha restituito il token di accesso");
  const expiresIn = typeof payload?.expires_in === "number" ? payload.expires_in : undefined;
  return {
    client_id: clientId,
    client_secret: clientSecret,
    access_token: accessToken,
    refresh_token:
      typeof payload?.refresh_token === "string" ? payload.refresh_token : undefined,
    token_type: typeof payload?.token_type === "string" ? payload.token_type : undefined,
    scope: typeof payload?.scope === "string" ? payload.scope : undefined,
    expires_at: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
  };
}

export async function saveWixTokens(
  tenantId: string,
  tokens: WixTokens,
  meta?: Record<string, unknown>,
): Promise<void> {
  await saveIntegrationCredential({
    tenantId,
    provider: WIX_PROVIDER,
    kind: "oauth",
    label: WIX_CREDENTIAL_LABEL,
    secretEnc: encryptSecret(JSON.stringify(tokens)),
    scopes: tokens.scope ? tokens.scope.split(/\s+/) : [],
    meta: { connected_at: new Date().toISOString(), ...(meta ?? {}) },
  });
}

export async function saveWixPendingClient(
  tenantId: string,
  clientId: string,
  clientSecret?: string,
): Promise<void> {
  await saveIntegrationCredential({
    tenantId,
    provider: WIX_PROVIDER,
    kind: "oauth",
    label: WIX_CREDENTIAL_LABEL,
    secretEnc: encryptSecret(JSON.stringify({ client_id: clientId, client_secret: clientSecret })),
    scopes: [],
    meta: { stage: "authorize" },
  });
}

export async function loadWixTokens(tenantId: string): Promise<WixTokens | null> {
  const rows = await listIntegrationCredentials(tenantId);
  const row = rows.find(
    (item) =>
      item.provider === WIX_PROVIDER &&
      item.label === WIX_CREDENTIAL_LABEL &&
      item.status === "active",
  );
  if (!row) return null;
  const full = await getIntegrationCredential(tenantId, row.id);
  if (!full) return null;
  try {
    const parsed = JSON.parse(decryptSecret(full.secret_enc)) as WixTokens;
    if (!parsed?.client_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function disconnectWix(tenantId: string): Promise<boolean> {
  const rows = await listIntegrationCredentials(tenantId);
  const row = rows.find(
    (item) =>
      item.provider === WIX_PROVIDER &&
      item.label === WIX_CREDENTIAL_LABEL &&
      item.status === "active",
  );
  if (!row) return false;
  return revokeIntegrationCredential(tenantId, row.id);
}

export async function ensureWixAccessToken(tenantId: string): Promise<string> {
  const tokens = await loadWixTokens(tenantId);
  if (!tokens) throw new Error("Wix non e' ancora collegato");
  const expired = tokens.expires_at !== undefined && tokens.expires_at <= Date.now() + 60_000;
  if (!tokens.access_token || expired) {
    const refreshed = await wixRefreshTokens(tokens);
    await saveWixTokens(tenantId, { ...tokens, ...refreshed });
    return refreshed.access_token!;
  }
  return tokens.access_token;
}

interface McpHttpResponse {
  payload: any;
  sessionId?: string;
  status: number;
}

async function mcpPost(
  accessToken: string,
  body: unknown,
  sessionId?: string,
): Promise<McpHttpResponse> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const response = await fetch(config.wixMcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const session = response.headers.get("mcp-session-id") ?? sessionId;
  const contentType = response.headers.get("content-type") ?? "";
  let payload: any = null;
  if (text) {
    if (contentType.includes("text/event-stream")) {
      const chunks = text
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .filter(Boolean);
      for (const chunk of chunks) {
        try {
          const parsed = JSON.parse(chunk);
          if (parsed && typeof parsed === "object" && "id" in parsed) payload = parsed;
        } catch {
          continue;
        }
      }
      if (!payload && chunks.length) {
        try {
          payload = JSON.parse(chunks[chunks.length - 1]);
        } catch {
          payload = null;
        }
      }
    } else {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }
  }
  return { payload, sessionId: session ?? undefined, status: response.status };
}

export interface WixMcpSession {
  sessionId?: string;
  serverInfo?: { name?: string; version?: string };
  capabilities?: unknown;
}

export async function wixMcpInitialize(accessToken: string): Promise<WixMcpSession> {
  const init = await mcpPost(accessToken, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "aethersy-platform", version: "1.0" },
    },
  });
  if (init.status >= 400) {
    const detail = init.payload?.error_description ?? init.payload?.error ?? `HTTP ${init.status}`;
    throw new Error(`Wix MCP non ha accettato la sessione: ${detail}`);
  }
  await mcpPost(
    accessToken,
    { jsonrpc: "2.0", method: "notifications/initialized" },
    init.sessionId,
  );
  return {
    sessionId: init.sessionId,
    serverInfo: init.payload?.result?.serverInfo,
    capabilities: init.payload?.result?.capabilities,
  };
}

export async function wixListTools(accessToken: string): Promise<McpTool[]> {
  const session = await wixMcpInitialize(accessToken);
  const res = await mcpPost(
    accessToken,
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    session.sessionId,
  );
  if (res.status >= 400 || res.payload?.error) {
    const detail = res.payload?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Elenco tool Wix non disponibile: ${detail}`);
  }
  const tools = res.payload?.result?.tools;
  return Array.isArray(tools) ? (tools as McpTool[]) : [];
}

export async function wixCallTool(
  accessToken: string,
  name: string,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  const session = await wixMcpInitialize(accessToken);
  const res = await mcpPost(
    accessToken,
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name, arguments: args ?? {} },
    },
    session.sessionId,
  );
  if (res.status >= 400 || res.payload?.error) {
    const detail = res.payload?.error?.message ?? `HTTP ${res.status}`;
    return { ok: false, content: null, error: detail };
  }
  const result = res.payload?.result;
  return {
    ok: true,
    content: result?.content ?? result ?? null,
    isError: Boolean(result?.isError),
  };
}

export function wixToolSummary(tools: McpTool[]): {
  total: number;
  names: string[];
  groups: { key: string; label: string; count: number }[];
} {
  const groups = new Map<string, number>();
  for (const tool of tools) {
    const key = (tool.name.split(/[._-]/)[0] || "wix").toLowerCase();
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return {
    total: tools.length,
    names: tools.map((tool) => tool.name),
    groups: [...groups.entries()]
      .map(([key, count]) => ({ key, label: key.toUpperCase(), count }))
      .sort((a, b) => b.count - a.count),
  };
}

const WRITE_HINTS = /(create|update|delete|remove|publish|add|set|post|insert|send|revoke|disconnect|cancel|refund)/i;
const READ_HINTS = /(list|get|fetch|query|read|report|stats|statistic|analytics|search|find|show|export|retrieve)/i;

export interface WixInsightGroup {
  key: string;
  label: string;
  tools: { name: string; content: unknown; error: string | null }[];
}

/** Famiglie di tool che alimentano la parte commerciale della piattaforma. */
const INSIGHT_FAMILIES: { key: string; label: string; match: RegExp }[] = [
  { key: "revenue", label: "Ricavi e vendite", match: /(revenue|sales|order|payment|checkout|invoice|transaction)/i },
  { key: "catalog", label: "Catalogo prodotti", match: /(product|catalog|collection|inventory|stock|price)/i },
  { key: "customers", label: "Clienti", match: /(customer|contact|lead|subscriber|member)/i },
  { key: "traffic", label: "Traffico e analytics", match: /(analytic|traffic|page.?view|visitor|conversion|session|activity|report)/i },
  { key: "content", label: "Contenuti", match: /(blog|post|page|media|content)/i },
];

/**
 * Estrae gli snapshot commerciali dai tool di sola lettura del server MCP.
 *
 * Il catalogo dei tool cambia con l'account e con i prodotti Wix attivi: qui
 * si selezionano i tool che leggono dati (e si escludono quelli che scrivono),
 * poi si chiamano senza argomenti per ottenere i dati reali.
 */
export async function wixInsights(
  accessToken: string,
  tools: McpTool[],
): Promise<WixInsightGroup[]> {
  const readOnly = tools.filter((tool) => {
    if (WRITE_HINTS.test(tool.name)) return false;
    return READ_HINTS.test(tool.name) || INSIGHT_FAMILIES.some((family) => family.match.test(tool.name));
  });
  const groups: WixInsightGroup[] = [];
  for (const family of INSIGHT_FAMILIES) {
    const matches = readOnly.filter((tool) => family.match.test(tool.name)).slice(0, 3);
    if (!matches.length) continue;
    const rows: WixInsightGroup["tools"] = [];
    for (const tool of matches) {
      try {
        const result = await wixCallTool(accessToken, tool.name, {});
        rows.push({
          name: tool.name,
          content: result.ok ? result.content : null,
          error: result.ok ? null : (result.error ?? "tool non riuscito"),
        });
      } catch (err) {
        rows.push({ name: tool.name, content: null, error: (err as Error).message });
      }
    }
    groups.push({ key: family.key, label: family.label, tools: rows });
  }
  return groups;
}

export { MCP_PROVIDER_ID };
