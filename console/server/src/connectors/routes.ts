import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { requireMeteredTenant } from "../platform/guard.js";
import {
  listIntegrationCredentials,
  getIntegrationCredential,
  revokeIntegrationCredential,
  saveIntegrationCredential,
} from "../pipeline/repo.js";
import {
  CONNECTOR_CATEGORY_LABELS,
  CONNECTORS,
  connectorById,
  connectorCredentialKinds,
  type ConnectorSpec,
} from "./catalog.js";
import {
  connectorAuthorizeUrl,
  connectorConfig,
  connectorRedirectUri,
  decryptBundle,
  encryptBundle,
  exchangeConnectorCode,
} from "./oauth.js";
import {
  CONNECTOR_STATE_COOKIE,
  connectorStateCookieValue,
  createConnectorState,
  verifyConnectorState,
} from "./state.js";

// Rotte dei connettori: il tenant collega i propri account ai provider.
//
// Il collegamento e' sempre un login reale:
//   - connettori Google  -> l'utente fa login con Google (stessa app del
//     login della piattaforma);
//   - connettori GitHub  -> l'utente fa login con GitHub;
//   - altri provider     -> l'utente fa login con l'account del provider
//     (l'app OAuth dedicata va accreditata nel VPS);
//   - provider senza OAuth -> credenziale personale (l'unico caso in cui
//     l'utente deve incollare qualcosa).
//
// I token restano cifrati nel database: il frontend vede solo lo stato.

function setStateCookie(reply: FastifyReply, value: string): void {
  reply.setCookie(CONNECTOR_STATE_COOKIE, value, {
    path: "/api/pipeline/connectors",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  });
}

function clearStateCookie(reply: FastifyReply): void {
  reply.clearCookie(CONNECTOR_STATE_COOKIE, {
    path: "/api/pipeline/connectors",
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  });
}

function connectorsUiUrl(query: Record<string, string>): string {
  const url = new URL(`${config.platformPublicUrl}/connectors`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * Credenziale attiva del tenant per un connettore, filtrata per tipo:
 * il webhook Slack non e' il login OAuth di Slack, e viceversa.
 */
async function findConnectorCredential(tenantId: string, spec: ConnectorSpec) {
  const kinds = connectorCredentialKinds(spec);
  const rows = await listIntegrationCredentials(tenantId);
  const row = rows.find(
    (item) =>
      item.provider === spec.id &&
      item.status === "active" &&
      kinds.includes(item.kind as "oauth" | "webhook" | "api_key"),
  );
  if (!row) return null;
  return getIntegrationCredential(tenantId, row.id);
}

interface CatalogEntry {
  id: string;
  label: string;
  category: string;
  categoryLabel: string;
  auth: ConnectorSpec["auth"];
  loginLabel: string;
  scopes: string[];
  capabilities: string[];
  howTo: string;
  /** L'app OAuth del provider e' accreditata nel VPS. */
  configured: boolean;
  /** Motivo per cui non e' utilizzabile (null quando e' ok). */
  missingReason: string | null;
  /** Servono credenziali manuali (nessun OAuth disponibile). */
  apiKeyFields: { key: string; label: string; secret?: boolean }[];
  /** Il tenant ha gia' collegato questo provider. */
  connected: boolean;
  connectedAt: string | null;
  /** Credenziale salvata ma non attiva (revocata). */
  revoked: boolean;
  /** Il connettore espone una verifica reale. */
  testable: boolean;
  redirectUri: string;
}

export async function registerConnectorRoutes(app: FastifyInstance): Promise<void> {
  // Catalogo + stato reale per il tenant.
  app.get("/api/pipeline/connectors", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return reply;

    const credentials = await listIntegrationCredentials(tenant.tenantId);
    const byProvider = new Map<string, (typeof credentials)[number]>();
    for (const row of credentials) {
      if (!byProvider.has(row.provider)) byProvider.set(row.provider, row);
    }

    const entries: CatalogEntry[] = CONNECTORS.map((spec) => {
      const credential = byProvider.get(spec.id);
      const kinds = connectorCredentialKinds(spec);
      // Solo le credenziali del tipo giusto contano come collegamento: la
      // credenziale webhook di Slack non e' il login OAuth di Slack.
      const matches =
        credential && kinds.includes(credential.kind as "oauth" | "webhook" | "api_key");
      const configState = spec.auth === "api_key" ? null : connectorConfig(spec);
      const configured = spec.auth === "api_key" ? true : (configState?.ok ?? false);
      const connected = Boolean(matches && credential?.status === "active");
      return {
        id: spec.id,
        label: spec.label,
        category: spec.category,
        categoryLabel: CONNECTOR_CATEGORY_LABELS[spec.category],
        auth: spec.auth,
        loginLabel: spec.loginLabel,
        scopes: spec.scopes,
        capabilities: spec.capabilities,
        howTo: spec.howTo,
        configured,
        missingReason:
          configured || connected
            ? null
            : (configState?.reason ??
              (spec.auth === "api_key"
                ? null
                : "App OAuth del provider non configurata nel VPS.")),
        apiKeyFields: spec.apiKeyFields ?? [],
        connected,
        connectedAt: connected
          ? new Date(credential!.updated_at ?? credential!.created_at).toISOString()
          : null,
        revoked: Boolean(credential) && !connected && credential?.status === "revoked",
        testable: Boolean(spec.test),
        redirectUri: connectorRedirectUri(spec.id),
      };
    });

    return {
      connectors: entries,
      groups: Object.entries(CONNECTOR_CATEGORY_LABELS).map(([key, label]) => ({
        key,
        label,
        count: entries.filter((entry) => entry.category === key).length,
      })),
      summary: {
        total: entries.length,
        connected: entries.filter((entry) => entry.connected).length,
        ready: entries.filter((entry) => entry.configured).length,
      },
    };
  });

  // Avvio del login al provider.
  app.get("/api/pipeline/connectors/:id/connect", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return reply;

    const params = request.params as { id: string };
    const spec = connectorById(params.id);
    if (!spec) {
      return reply.code(404).send({ code: "CONNECTOR_UNKNOWN", message: "Connettore sconosciuto" });
    }
    if (spec.auth === "api_key") {
      return reply.redirect(
        connectorsUiUrl({ connect: spec.id, mode: "api_key" }),
      );
    }

    const configState = connectorConfig(spec);
    if (!configState.ok || !configState.client) {
      return reply.redirect(
        connectorsUiUrl({
          connect: spec.id,
          error: "CONNECTOR_NOT_CONFIGURED",
          message: configState.reason ?? "App OAuth del provider non configurata.",
        }),
      );
    }

    const { state, nonce, codeVerifier } = createConnectorState({
      tenantId: tenant.tenantId,
      connectorId: spec.id,
    });
    setStateCookie(reply, connectorStateCookieValue(nonce, codeVerifier));

    const url = connectorAuthorizeUrl(spec, { state, codeVerifier });
    return reply.redirect(url);
  });

  // Ritorno dal provider: scambio del codice e salvataggio del token cifrato.
  app.get("/api/pipeline/connectors/:id/callback", async (request, reply) => {
    const params = request.params as { id: string };
    const query = (request.query ?? {}) as {
      code?: string;
      error?: string;
      error_description?: string;
      state?: string;
    };
    const spec = connectorById(params.id);
    if (!spec) {
      return reply.code(404).send({ code: "CONNECTOR_UNKNOWN", message: "Connettore sconosciuto" });
    }

    const cookieValue = request.cookies[CONNECTOR_STATE_COOKIE];
    const verified = verifyConnectorState(query.state, cookieValue);
    clearStateCookie(reply);

    if (!verified || verified.connectorId !== spec.id) {
      return reply.redirect(
        connectorsUiUrl({
          connect: spec.id,
          error: "CONNECTOR_STATE_INVALID",
          message: "Sessione di collegamento non valida o scaduta: riprova.",
        }),
      );
    }

    if (query.error) {
      const message =
        query.error === "access_denied"
          ? "Accesso annullato."
          : `Il provider ha rifiutato il collegamento: ${query.error_description ?? query.error}.`;
      return reply.redirect(
        connectorsUiUrl({ connect: spec.id, error: "CONNECTOR_ACCESS_DENIED", message }),
      );
    }

    if (!query.code) {
      return reply.redirect(
        connectorsUiUrl({
          connect: spec.id,
          error: "CONNECTOR_CODE_MISSING",
          message: "Codice di autorizzazione mancante: riprova il collegamento.",
        }),
      );
    }

    const codeVerifier = (cookieValue ?? "").split(".")[1] ?? "";
    try {
      const bundle = await exchangeConnectorCode(spec, query.code, codeVerifier);
      await saveIntegrationCredential({
        tenantId: verified.tenantId,
        provider: spec.id,
        kind: "oauth",
        label: spec.id,
        secretEnc: encryptBundle(bundle),
        scopes: bundle.scope ? bundle.scope.split(" ").filter(Boolean) : spec.scopes,
        meta: {
          connected_at: new Date().toISOString(),
          auth: spec.auth,
          ...(bundle.extra ?? {}),
        },
      });
      return reply.redirect(
        connectorsUiUrl({ connected: spec.id, message: `${spec.label} collegato.` }),
      );
    } catch (err) {
      return reply.redirect(
        connectorsUiUrl({
          connect: spec.id,
          error: "CONNECTOR_FAILED",
          message: `Collegamento a ${spec.label} fallito: ${(err as Error).message}`,
        }),
      );
    }
  });

  // Credenziale manuale (solo per i provider senza OAuth).
  app.post("/api/pipeline/connectors/:id/api-key", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return reply;

    const params = request.params as { id: string };
    const spec = connectorById(params.id);
    if (!spec) {
      return reply.code(404).send({ code: "CONNECTOR_UNKNOWN", message: "Connettore sconosciuto" });
    }
    if (spec.auth !== "api_key" || !spec.apiKeyFields?.length) {
      return reply.code(400).send({
        code: "CONNECTOR_NOT_API_KEY",
        message: `${spec.label} si collega con il login, non con una credenziale manuale.`,
      });
    }

    const body = (request.body ?? {}) as { fields?: Record<string, string> };
    const fields = body.fields ?? {};
    const missing = spec.apiKeyFields
      .filter((field) => !fields[field.key] || !fields[field.key].trim())
      .map((field) => field.label);
    if (missing.length) {
      return reply.code(400).send({
        code: "CONNECTOR_FIELDS_MISSING",
        message: `Campi obbligatori mancanti: ${missing.join(", ")}`,
      });
    }

    const cleaned: Record<string, string> = {};
    for (const field of spec.apiKeyFields) cleaned[field.key] = fields[field.key].trim();

    await saveIntegrationCredential({
      tenantId: tenant.tenantId,
      provider: spec.id,
      kind: "api_key",
      label: spec.id,
      secretEnc: encryptBundle(cleaned),
      scopes: [],
      meta: { connected_at: new Date().toISOString(), auth: spec.auth },
    });

    return { ok: true, connector: spec.id, connected: true };
  });

  // Verifica reale: chiama il provider con le credenziali salvate.
  app.post("/api/pipeline/connectors/:id/test", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return reply;

    const params = request.params as { id: string };
    const spec = connectorById(params.id);
    if (!spec) {
      return reply.code(404).send({ code: "CONNECTOR_UNKNOWN", message: "Connettore sconosciuto" });
    }
    if (!spec.test) {
      return reply.code(400).send({
        code: "CONNECTOR_NOT_TESTABLE",
        message: `${spec.label} non espone una verifica automatica.`,
      });
    }

    const credential = await findConnectorCredential(tenant.tenantId, spec);
    if (!credential) {
      return reply.code(409).send({
        code: "CONNECTOR_NOT_CONNECTED",
        message: `${spec.label} non e' ancora collegato.`,
      });
    }

    const secret = decryptBundle(credential.secret_enc);
    try {
      const result = await spec.test(secret);
      return { ok: result.ok, status: result.status, detail: result.detail, connector: spec.id };
    } catch (err) {
      return reply.code(502).send({
        code: "CONNECTOR_TEST_FAILED",
        message: `Verifica di ${spec.label} fallita: ${(err as Error).message}`,
      });
    }
  });

  // Scollegamento: la credenziale viene revocata, non cancellata a mano.
  app.post("/api/pipeline/connectors/:id/disconnect", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return reply;

    const params = request.params as { id: string };
    const spec = connectorById(params.id);
    if (!spec) {
      return reply.code(404).send({ code: "CONNECTOR_UNKNOWN", message: "Connettore sconosciuto" });
    }

    const credential = await findConnectorCredential(tenant.tenantId, spec);
    if (!credential) {
      return reply.code(409).send({
        code: "CONNECTOR_NOT_CONNECTED",
        message: `${spec.label} non e' collegato.`,
      });
    }

    const revoked = await revokeIntegrationCredential(tenant.tenantId, credential.id);
    return { ok: revoked, connector: spec.id, connected: false };
  });
}
