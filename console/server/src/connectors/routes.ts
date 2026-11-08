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
  CONNECTOR_SIGNUP_URLS,
  GOOGLE_CONSOLE_URL,
  GOOGLE_TEST_USER_NOTICE,
  connectorById,
  connectorCredentialKinds,
  type ConnectorSpec,
} from "./catalog.js";
import {
  connectorAuthorizeUrl,
  connectorRedirectUri,
  decryptBundle,
  encryptBundle,
  googleConsentHint,
  resolveConnectorClient,
} from "./oauth.js";
import { deleteConnectorApp, listConnectorApps, saveConnectorApp } from "./app-store.js";
import { completeConnectorAuthorization } from "./complete.js";
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
    // Path "/api": il callback dei connettori Google/GitHub e' lo stesso del
    // login sociale (`/api/auth/social/...`), perche' il provider accetta un
    // solo callback URL per app.
    path: "/api",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  });
}

function clearStateCookie(reply: FastifyReply): void {
  reply.clearCookie(CONNECTOR_STATE_COOKIE, {
    path: "/api",
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
  /** L'app OAuth del provider e' disponibile (piattaforma o tenant). */
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
  /** Console sviluppatore dove si registra l'app OAuth del provider. */
  signupUrl: string | null;
  /** Il tenant ha registrato una app OAuth per questo provider. */
  appRegistered: boolean;
  /** Un solo accesso attiva piu' servizi (Google). */
  master: boolean;
  masterServices: string[];
  /** Avviso sui requisiti del provider (Google: utente di test). */
  notice: string | null;
  /** Console del provider (schermata di consenso OAuth). */
  consoleUrl: string | null;
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
    const apps = await listConnectorApps(tenant.tenantId);

    const entries: CatalogEntry[] = [];
    for (const spec of CONNECTORS) {
      const credential = byProvider.get(spec.id);
      const kinds = connectorCredentialKinds(spec);
      // Solo le credenziali del tipo giusto contano come collegamento: la
      // credenziale webhook di Slack non e' il login OAuth di Slack.
      const matches =
        credential && kinds.includes(credential.kind as "oauth" | "webhook" | "api_key");
      const resolved =
        spec.auth === "api_key"
          ? { client: null, source: null, reason: null }
          : await resolveConnectorClient(spec, tenant.tenantId, apps);
      const configured = spec.auth === "api_key" ? true : Boolean(resolved.client);
      const connected = Boolean(matches && credential?.status === "active");
      entries.push({
        id: spec.id,
        label: spec.label,
        category: spec.category,
        categoryLabel: CONNECTOR_CATEGORY_LABELS[spec.category],
        auth: spec.auth,
        loginLabel: spec.loginLabel,
        scopes: spec.scopes,
        capabilities: spec.capabilities,
        howTo:
          spec.auth === "google" && !spec.master
            ? `${spec.howTo} Se Google chiede di verificare l'app, aggiungi il tuo account come utente di test (Schermata di consenso OAuth -> Utenti di test).`
            : spec.howTo,
        configured,
        missingReason:
          configured || connected
            ? null
            : (resolved.reason ??
              (spec.auth === "api_key"
                ? null
                : "App OAuth del provider non configurata.")),
        apiKeyFields: spec.apiKeyFields ?? [],
        connected,
        connectedAt: connected
          ? new Date(credential!.updated_at ?? credential!.created_at).toISOString()
          : null,
        revoked: Boolean(credential) && !connected && credential?.status === "revoked",
        testable: Boolean(spec.test),
        redirectUri: connectorRedirectUri(spec.id, spec.auth),
        signupUrl: CONNECTOR_SIGNUP_URLS[spec.id] ?? null,
        appRegistered: apps.has(spec.id),
        master: Boolean(spec.master),
        masterServices: spec.masterServices ?? [],
        notice:
          spec.auth === "google"
            ? GOOGLE_TEST_USER_NOTICE
            : (spec.notice ?? null),
        consoleUrl:
          spec.auth === "google" ? GOOGLE_CONSOLE_URL : (spec.consoleUrl ?? null),
      });
    }

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
        apps: entries.filter((entry) => entry.appRegistered).length,
      },
    };
  });

  // Avvio del login al provider: l'utente viene mandato alla pagina di
  // accesso del provider, che chiede il consenso e rimanda qui.
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

    const resolved = await resolveConnectorClient(spec, tenant.tenantId);
    if (!resolved.client) {
      return reply.redirect(
        connectorsUiUrl({
          connect: spec.id,
          error: "CONNECTOR_NOT_CONFIGURED",
          message: resolved.reason ?? "App OAuth del provider non configurata.",
        }),
      );
    }

    const { state, nonce, codeVerifier } = createConnectorState({
      tenantId: tenant.tenantId,
      connectorId: spec.id,
    });
    setStateCookie(reply, connectorStateCookieValue(nonce, codeVerifier));

    const url = connectorAuthorizeUrl(spec, { state, codeVerifier }, resolved.client);
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
      const hint = spec.auth === "google" ? googleConsentHint(query.error, query.error_description) : null;
      const message =
        hint ??
        (query.error === "access_denied"
          ? "Accesso annullato."
          : `Il provider ha rifiutato il collegamento: ${query.error_description ?? query.error}.`);
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
    // L'app da usare e' quella del tenant (se l'ha registrata dalla
    // piattaforma), altrimenti quella di piattaforma.
    const resolved = await resolveConnectorClient(spec, verified.tenantId);
    const completion = await completeConnectorAuthorization({
      spec,
      code: query.code,
      codeVerifier,
      tenantId: verified.tenantId,
      platformUrl: config.platformPublicUrl,
      client: resolved.client,
    });
    return reply.redirect(completion.redirect);
  });

  // Registrazione dell'app OAuth del provider: da qui in poi il pulsante
  // "Accedi con <Provider>" porta alla pagina di login del provider.
  app.post("/api/pipeline/connectors/:id/app", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return reply;

    const params = request.params as { id: string };
    const spec = connectorById(params.id);
    if (!spec) {
      return reply.code(404).send({ code: "CONNECTOR_UNKNOWN", message: "Connettore sconosciuto" });
    }
    if (spec.auth !== "provider") {
      return reply.code(400).send({
        code: "CONNECTOR_NOT_PROVIDER_AUTH",
        message: `${spec.label} non usa un'app OAuth registrata dal tenant.`,
      });
    }

    const body = (request.body ?? {}) as {
      clientId?: string;
      clientSecret?: string;
      redirectUri?: string;
    };
    const clientId = (body.clientId ?? "").trim();
    const clientSecret = (body.clientSecret ?? "").trim();
    if (!clientId || !clientSecret) {
      return reply.code(400).send({
        code: "CONNECTOR_APP_FIELDS_MISSING",
        message: "Client ID e Client Secret sono obbligatori.",
      });
    }

    const redirectUri = (body.redirectUri ?? "").trim() || connectorRedirectUri(spec.id, spec.auth);
    const app = await saveConnectorApp({
      tenantId: tenant.tenantId,
      provider: spec.id,
      clientId,
      clientSecret,
      redirectUri,
    });

    return {
      ok: true,
      connector: spec.id,
      appRegistered: true,
      redirectUri: app.redirectUri,
      message: `App ${spec.label} registrata: il pulsante di accesso e' attivo.`,
    };
  });

  // Rimozione dell'app registrata dal tenant (la connessione resta).
  app.delete("/api/pipeline/connectors/:id/app", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return reply;

    const params = request.params as { id: string };
    const spec = connectorById(params.id);
    if (!spec) {
      return reply.code(404).send({ code: "CONNECTOR_UNKNOWN", message: "Connettore sconosciuto" });
    }

    const removed = await deleteConnectorApp(tenant.tenantId, spec.id);
    return { ok: removed, connector: spec.id, appRegistered: false };
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
