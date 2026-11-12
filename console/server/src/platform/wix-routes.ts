import type { FastifyInstance, FastifyReply } from "fastify";
import { config } from "../config.js";
import { requireMeteredTenant } from "./guard.js";
import {
  createWixState,
  disconnectWix,
  ensureWixAccessToken,
  loadWixTokens,
  registerWixClient,
  saveWixPendingClient,
  saveWixTokens,
  verifyWixState,
  wixAuthorizeUrl,
  wixCallTool,
  wixExchangeCode,
  wixListTools,
  wixRedirectUri,
  wixRestProbe,
  wixStateCookieValue,
  wixToolSummary,
  wixInsights,
  type McpTool,
} from "./wix.js";

// Rotte dell'integrazione Wix.
//
//   GET  /api/platform/wix              -> stato reale (collegato, tool, REST)
//   GET  /api/platform/wix/connect      -> avvia il login OAuth (DCR + PKCE)
//   GET  /api/platform/wix/callback     -> ritorno dal provider: scambio token
//   GET  /api/platform/wix/tools        -> catalogo tool reali del server MCP
//   POST /api/platform/wix/tools/:name  -> esegue un tool Wix
//   POST /api/platform/wix/disconnect   -> scollega (revoca la credenziale)
//
// I token OAuth vivono cifrati nel database del tenant: il frontend vede solo
// lo stato e i risultati delle chiamate.

const WIX_STATE_COOKIE = "aethersy_wix_oauth";
const TOOLS_TTL_MS = 5 * 60 * 1000;

const toolsCache = new Map<string, { at: number; tools: McpTool[] }>();

function setStateCookie(reply: FastifyReply, value: string): void {
  reply.setCookie(WIX_STATE_COOKIE, value, {
    path: "/api",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  });
}

function clearStateCookie(reply: FastifyReply): void {
  reply.clearCookie(WIX_STATE_COOKIE, {
    path: "/api",
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  });
}

function wixUiUrl(query: Record<string, string>): string {
  const url = new URL(`${config.platformPublicUrl}/wix`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.toString();
}

async function cachedTools(tenantId: string): Promise<McpTool[]> {
  const hit = toolsCache.get(tenantId);
  if (hit && Date.now() - hit.at < TOOLS_TTL_MS) return hit.tools;
  const token = await ensureWixAccessToken(tenantId);
  const tools = await wixListTools(token);
  toolsCache.set(tenantId, { at: Date.now(), tools });
  return tools;
}

export async function registerWixRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/platform/wix", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;

    const tokens = await loadWixTokens(tenant.tenantId);
    const connected = Boolean(tokens?.access_token);
    const rest = await wixRestProbe();

    let tools: McpTool[] = [];
    let toolsError: string | null = null;
    if (connected) {
      try {
        tools = await cachedTools(tenant.tenantId);
      } catch (err) {
        toolsError = (err as Error).message;
      }
    }

    return {
      connected,
      mcp: {
        server: "https://mcp.wix.com/mcp",
        scope: config.wixMcpScope,
        redirectUri: wixRedirectUri(),
        toolCount: tools.length,
        summary: wixToolSummary(tools),
        error: toolsError,
      },
      rest,
      connectedAt: tokens ? null : null,
      hint: connected
        ? toolsError
          ? "Collegamento presente ma l'elenco tool non e' disponibile: ricollega."
          : null
        : "Collega il tuo account Wix con un clic: la piattaforma registra il client MCP, l'utente autorizza e i token restano cifrati.",
    };
  });

  app.get("/api/platform/wix/connect", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;

    let client: { client_id: string; client_secret?: string };
    try {
      client = await registerWixClient();
    } catch (err) {
      return reply.redirect(
        wixUiUrl({
          error: "WIX_CLIENT_FAILED",
          message: (err as Error).message,
        }),
      );
    }

    await saveWixPendingClient(tenant.tenantId, client.client_id, client.client_secret);

    const { state, nonce, codeVerifier } = createWixState(tenant.tenantId);
    setStateCookie(reply, wixStateCookieValue(nonce, codeVerifier));
    return reply.redirect(
      wixAuthorizeUrl({ clientId: client.client_id, state, codeVerifier }),
    );
  });

  app.get("/api/platform/wix/callback", async (request, reply) => {
    const query = (request.query ?? {}) as {
      code?: string;
      error?: string;
      error_description?: string;
      state?: string;
    };
    const cookieValue = request.cookies[WIX_STATE_COOKIE];
    const verified = verifyWixState(query.state, cookieValue);
    clearStateCookie(reply);

    if (!verified) {
      return reply.redirect(
        wixUiUrl({
          error: "WIX_STATE_INVALID",
          message: "Sessione di collegamento non valida o scaduta: riprova.",
        }),
      );
    }
    if (query.error) {
      return reply.redirect(
        wixUiUrl({
          error: "WIX_ACCESS_DENIED",
          message:
            query.error_description ??
            `Wix ha rifiutato il collegamento: ${query.error}.`,
        }),
      );
    }
    if (!query.code) {
      return reply.redirect(
        wixUiUrl({
          error: "WIX_CODE_MISSING",
          message: "Codice di autorizzazione mancante: riprova il collegamento.",
        }),
      );
    }

    const existing = await loadWixTokens(verified.tenantId);
    const clientId = existing?.client_id ?? "";
    const clientSecret = existing?.client_secret;
    if (!clientId) {
      return reply.redirect(
        wixUiUrl({
          error: "WIX_CLIENT_MISSING",
          message: "Client MCP non trovato: riavvia il collegamento.",
        }),
      );
    }

    const codeVerifier = (cookieValue ?? "").split(".")[1] ?? "";
    try {
      const tokens = await wixExchangeCode({
        clientId,
        clientSecret,
        code: query.code,
        codeVerifier,
      });
      await saveWixTokens(verified.tenantId, tokens);
      toolsCache.delete(verified.tenantId);
      return reply.redirect(wixUiUrl({ connected: "1" }));
    } catch (err) {
      return reply.redirect(
        wixUiUrl({
          error: "WIX_TOKEN_FAILED",
          message: (err as Error).message,
        }),
      );
    }
  });

  app.get("/api/platform/wix/tools", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;

    const tokens = await loadWixTokens(tenant.tenantId);
    if (!tokens?.access_token) {
      return reply.code(409).send({
        code: "WIX_NOT_CONNECTED",
        message: "Account Wix non collegato: autorizza l'accesso per usare i tool.",
      });
    }

    try {
      const tools = await cachedTools(tenant.tenantId);
      return { tools, summary: wixToolSummary(tools) };
    } catch (err) {
      return reply.code(502).send({
        code: "WIX_TOOLS_FAILED",
        message: (err as Error).message,
      });
    }
  });

  app.get("/api/platform/wix/insights", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;

    const tokens = await loadWixTokens(tenant.tenantId);
    if (!tokens?.access_token) {
      return reply.code(409).send({
        code: "WIX_NOT_CONNECTED",
        message: "Account Wix non collegato: autorizza l'accesso per leggere i dati.",
      });
    }
    try {
      const token = await ensureWixAccessToken(tenant.tenantId);
      const tools = await cachedTools(tenant.tenantId);
      const groups = await wixInsights(token, tools);
      return { groups };
    } catch (err) {
      return reply.code(502).send({
        code: "WIX_INSIGHTS_FAILED",
        message: (err as Error).message,
      });
    }
  });

  app.post("/api/platform/wix/tools/:name", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;

    const { name } = request.params as { name: string };
    const body = (request.body ?? {}) as { arguments?: Record<string, unknown> };
    const tokens = await loadWixTokens(tenant.tenantId);
    if (!tokens?.access_token) {
      return reply.code(409).send({
        code: "WIX_NOT_CONNECTED",
        message: "Account Wix non collegato: autorizza l'accesso per usare i tool.",
      });
    }
    try {
      const token = await ensureWixAccessToken(tenant.tenantId);
      const result = await wixCallTool(token, name, body.arguments ?? {});
      if (!result.ok) {
        return reply.code(502).send({
          code: "WIX_TOOL_FAILED",
          message: result.error ?? "Tool Wix non riuscito",
        });
      }
      return { ok: true, tool: name, content: result.content, isError: result.isError };
    } catch (err) {
      return reply.code(502).send({
        code: "WIX_TOOL_FAILED",
        message: (err as Error).message,
      });
    }
  });

  app.post("/api/platform/wix/disconnect", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const revoked = await disconnectWix(tenant.tenantId);
    toolsCache.delete(tenant.tenantId);
    return { ok: revoked, connected: false };
  });
}
