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
  wixStateCookieValue,
  wixToolSummary,
  wixInsights,
  type McpTool,
} from "./wix.js";
import {
  resolveWixSite,
  wixBusinessSnapshot,
  wixCreateProduct,
  type WixProductDraft,
} from "./wix-business.js";

// Rotte dell'integrazione Wix.
//
//   GET  /api/platform/wix              -> stato reale (collegato, tool, REST)
//   GET  /api/platform/wix/connect      -> avvia il login OAuth (DCR + PKCE)
//   GET  /api/platform/wix/callback     -> ritorno dal provider: scambio token
//   GET  /api/platform/wix/sites        -> siti reali dell'account collegato
//   GET  /api/platform/wix/business     -> snapshot commerciale (ordini, catalogo)
//   GET  /api/platform/wix/tools        -> catalogo tool reali del server MCP
//   POST /api/platform/wix/tools/:name  -> esegue un tool Wix
//   POST /api/platform/wix/products     -> crea un prodotto in catalogo
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

    let tools: McpTool[] = [];
    let toolsError: string | null = null;
    let site: {
      id: string | null;
      name: string | null;
      source: "configured" | "discovered";
      sites: { id: string; name: string }[];
    } = { id: config.wixSiteId || null, name: null, source: "configured", sites: [] };
    if (connected) {
      try {
        const token = await ensureWixAccessToken(tenant.tenantId);
        const resolution = await resolveWixSite(token);
        const match = resolution.sites.find((item) => item.id === resolution.siteId);
        site = {
          id: resolution.siteId,
          name: match?.name ?? null,
          source: resolution.source,
          sites: resolution.sites,
        };
      } catch (err) {
        toolsError = (err as Error).message;
      }
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
      site,
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

  app.get("/api/platform/wix/sites", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;

    const tokens = await loadWixTokens(tenant.tenantId);
    if (!tokens?.access_token) {
      return reply.code(409).send({
        code: "WIX_NOT_CONNECTED",
        message: "Account Wix non collegato: autorizza l'accesso per vedere i siti.",
      });
    }
    try {
      const token = await ensureWixAccessToken(tenant.tenantId);
      const resolution = await resolveWixSite(token);
      return { sites: resolution.sites, siteId: resolution.siteId, source: resolution.source };
    } catch (err) {
      return reply.code(502).send({
        code: "WIX_SITES_FAILED",
        message: (err as Error).message,
      });
    }
  });

  app.get("/api/platform/wix/business", async (request, reply) => {
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
      const resolution = await resolveWixSite(token);
      if (!resolution.siteId) {
        return reply.code(404).send({
          code: "WIX_SITE_NOT_FOUND",
          message: "Nessun sito Wix trovato per questo account: collega un account con almeno un sito.",
        });
      }
      let siteId = resolution.siteId;
      let warning = resolution.warning;
      let snapshot: Awaited<ReturnType<typeof wixBusinessSnapshot>>;
      try {
        snapshot = await wixBusinessSnapshot(token, siteId);
      } catch (err) {
        // Il sito configurato non e' accessibile con l'account collegato:
        // si ripiega sul sito scoperto, se c'e', e si segnala il motivo.
        if (resolution.fallbackSiteId) {
          try {
            snapshot = await wixBusinessSnapshot(token, resolution.fallbackSiteId);
            siteId = resolution.fallbackSiteId;
            warning = `Il sito configurato non e' accessibile con l'account Wix collegato: dati letti dal sito ${siteId}. Ricollega l'account che gestisce il sito per leggere i dati corretti.`;
          } catch {
            throw err;
          }
        } else {
          throw err;
        }
      }
      return { snapshot, sites: resolution.sites, source: resolution.source, warning };
    } catch (err) {
      return reply.code(502).send({
        code: "WIX_BUSINESS_FAILED",
        message: (err as Error).message,
        hint:
          "Se il sito non e' raggiungibile, ricollega l'account Wix che gestisce il sito (quello con l'id configurato in WIX_SITE_ID).",
      });
    }
  });

  app.post("/api/platform/wix/products", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;

    const body = (request.body ?? {}) as Partial<WixProductDraft>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const price = typeof body.price === "number" ? body.price : Number.parseFloat(String(body.price ?? ""));
    if (!name || name.length < 2) {
      return reply.code(400).send({
        code: "WIX_PRODUCT_NAME_REQUIRED",
        message: "Indica il nome del prodotto (almeno 2 caratteri).",
      });
    }
    if (!Number.isFinite(price) || price <= 0) {
      return reply.code(400).send({
        code: "WIX_PRODUCT_PRICE_REQUIRED",
        message: "Indica un prezzo maggiore di zero.",
      });
    }

    const tokens = await loadWixTokens(tenant.tenantId);
    if (!tokens?.access_token) {
      return reply.code(409).send({
        code: "WIX_NOT_CONNECTED",
        message: "Account Wix non collegato: autorizza l'accesso per gestire il catalogo.",
      });
    }
    try {
      const token = await ensureWixAccessToken(tenant.tenantId);
      const resolution = await resolveWixSite(token);
      if (!resolution.siteId) {
        return reply.code(404).send({
          code: "WIX_SITE_NOT_FOUND",
          message: "Nessun sito Wix trovato per questo account.",
        });
      }
      const result = await wixCreateProduct(token, resolution.siteId, {
        name,
        description: typeof body.description === "string" ? body.description.trim() : undefined,
        price,
        currency: typeof body.currency === "string" ? body.currency : undefined,
        productType: body.productType === "DIGITAL" ? "DIGITAL" : "PHYSICAL",
      });
      if (!result.created) {
        return reply.code(502).send({
          code: "WIX_PRODUCT_FAILED",
          message: result.detail ?? `Wix ha rifiutato la creazione del prodotto (HTTP ${result.status}).`,
        });
      }
      return { ok: true, product: result };
    } catch (err) {
      return reply.code(502).send({
        code: "WIX_PRODUCT_FAILED",
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
