// Test dei connettori senza toccare la rete pubblica.
//
// Verifica:
//   - l'integrita' del catalogo (id univoci, endpoint OAuth presenti, campi
//     credenziali dove servono);
//   - lo `state` firmato del flusso di collegamento (valido, manomesso, scaduto,
//     di un altro connettore);
//   - la costruzione degli URL di autorizzazione (Google, GitHub, app dedicate,
//     PKCE);
//   - lo scambio del codice con i token, incluso l'errore del provider;
//   - la cifratura/decifratura del pacchetto token;
//   - il montaggio delle rotte sul BFF.
//
//   npm run test:connectors   (compila il BFF e gira i test sul dist)

import http from "node:http";
import assert from "node:assert/strict";

// --- Provider finto ----------------------------------------------------------

const stub = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const json = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (url.pathname === "/token") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      if (params.get("code") === "good") {
        return json(200, {
          access_token: "tok-1",
          refresh_token: "ref-1",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "chat:write channels:read",
        });
      }
      return json(400, { error: "invalid_grant", error_description: "Code already used." });
    });
    return;
  }

  json(404, { error: "not_found" });
});

await new Promise((resolve) => stub.listen(0, "127.0.0.1", resolve));
const stubBase = `http://127.0.0.1:${stub.address().port}`;

// --- Env ---------------------------------------------------------------------

process.env.CONSOLE_SESSION_SECRET ??= "test-secret";
process.env.CONSOLE_SECRETS_KEY ??= "a".repeat(64);
process.env.OPENROUTER_API_KEY ??= "test";
process.env.GOOGLE_CLIENT_ID ??= "google-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "google-client-secret";
process.env.GITHUB_CLIENT_ID ??= "github-client-id";
process.env.GITHUB_CLIENT_SECRET ??= "github-client-secret";
process.env.GOOGLE_CONNECTOR_TOKEN_URL = `${stubBase}/token`;
process.env.GITHUB_CONNECTOR_TOKEN_URL = `${stubBase}/token`;
process.env.CONNECTOR_SLACK_CLIENT_ID = "slack-client-id";
process.env.CONNECTOR_SLACK_CLIENT_SECRET = "slack-client-secret";
process.env.CONNECTOR_SLACK_TOKEN_URL = `${stubBase}/token`;

const {
  CONNECTORS,
  connectorById,
  CONNECTOR_CATEGORY_LABELS,
  CONNECTOR_SIGNUP_URLS,
  CONNECTOR_DISTRIBUTION,
  googleMasterSpec,
  googleServicesForScopes,
} = await import("../dist/connectors/catalog.js");
const { createConnectorState, verifyConnectorState, connectorStateCookieValue, parseSignedState, isConnectorState } =
  await import("../dist/connectors/state.js");
const {
  connectorAuthorizeUrl,
  connectorConfig,
  connectorConfigured,
  exchangeConnectorCode,
  encryptBundle,
  decryptBundle,
  connectorRedirectUri,
  resolveConnectorClient,
  googleConsentHint,
} = await import("../dist/connectors/oauth.js");
const { registerConnectorRoutes } = await import("../dist/connectors/routes.js");

let passed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.log(`  FAIL ${name}: ${err.message}`);
  }
}

// --- Catalogo ----------------------------------------------------------------

await check("catalogo: almeno 40 provider reali", () => {
  assert.ok(CONNECTORS.length >= 40, `solo ${CONNECTORS.length} connettori`);
});

await check("catalogo: id univoci", () => {
  const ids = CONNECTORS.map((connector) => connector.id);
  assert.equal(new Set(ids).size, ids.length);
});

await check("catalogo: ogni connettore dichiara come si attiva per gli utenti", () => {
  const modes = new Set(["platform", "self_serve", "review", "byo"]);
  for (const connector of CONNECTORS) {
    const distribution = CONNECTOR_DISTRIBUTION[connector.id];
    assert.ok(distribution, `${connector.id} senza stato di attivazione`);
    assert.ok(modes.has(distribution.mode), `${connector.id} modalita' ${distribution.mode}`);
    assert.ok(distribution.requirement.length > 20, `${connector.id} senza requisito`);
  }
});

await check("catalogo: l'app di piattaforma e' gia' attiva solo per i provider con app", () => {
  for (const connector of CONNECTORS) {
    const distribution = CONNECTOR_DISTRIBUTION[connector.id];
    assert.ok(distribution, `${connector.id} senza stato di attivazione`);
    const expected = connector.auth === "google" || connector.auth === "github";
    assert.equal(
      distribution.platformApp,
      expected,
      `${connector.id}: platformApp=${distribution.platformApp}, atteso ${expected}`,
    );
  }
  assert.equal(CONNECTOR_DISTRIBUTION.google?.mode, "review");
  assert.equal(CONNECTOR_DISTRIBUTION.github?.mode, "platform");
});

await check("catalogo: i connettori a credenziale sono per forza 'byo'", () => {
  for (const connector of CONNECTORS) {
    if (connector.auth !== "api_key") continue;
    assert.equal(
      CONNECTOR_DISTRIBUTION[connector.id]?.mode,
      "byo",
      `${connector.id} e' a credenziale ma non e' 'byo'`,
    );
  }
});

await check("catalogo: i connettori Google sono 10 e usano l'app Google", () => {
  const google = CONNECTORS.filter((connector) => connector.auth === "google" && !connector.master);
  assert.equal(google.length, 10, `sono ${google.length} servizi Google`);
  for (const connector of google) {
    assert.equal(connector.loginLabel, "Accedi con Google");
    assert.ok(connector.scopes.length > 0, `${connector.id} senza scope`);
  }
});

await check("catalogo: il master Google attiva tutti i servizi Google", () => {
  const master = googleMasterSpec();
  assert.ok(master, "manca il connettore master Google");
  assert.equal(master.auth, "google");
  assert.equal(master.masterServices.length, 10);
  const services = CONNECTORS.filter((connector) => connector.auth === "google" && !connector.master);
  for (const service of services) {
    assert.ok(master.masterServices.includes(service.id), `${service.id} non coperto dal master`);
    assert.ok(master.scopes.includes(service.scopes[0]), `scope di ${service.id} assente nel master`);
  }
});

await check("scope Google concessi -> servizi che risultano collegati", () => {
  const master = googleMasterSpec();
  const covered = googleServicesForScopes(master.scopes);
  assert.equal(covered.length, 10);
  assert.deepEqual(googleServicesForScopes(["https://www.googleapis.com/auth/gmail.modify"]), [
    "gmail",
  ]);
  assert.deepEqual(googleServicesForScopes([]), []);
});

await check("catalogo: gli scope non validi del progetto non sono nel master", () => {
  // `maps-api` e `meetings.space` non sono scope validi per il progetto
  // Google: con quelli il consenso unificato falliva con invalid_scope.
  const master = googleMasterSpec();
  const forbidden = [
    "https://www.googleapis.com/auth/maps-api",
    "https://www.googleapis.com/auth/meetings.space",
  ];
  for (const scope of forbidden) {
    assert.ok(!master.scopes.includes(scope), `scope non valido nel master: ${scope}`);
    for (const connector of CONNECTORS) {
      assert.ok(!connector.scopes.includes(scope), `scope non valido in ${connector.id}: ${scope}`);
    }
  }
});

await check("catalogo: ogni connettore con app dedicata ha la console sviluppatore", () => {
  for (const connector of CONNECTORS) {
    if (connector.auth !== "provider") continue;
    const url = CONNECTOR_SIGNUP_URLS[connector.id];
    assert.ok(url, `${connector.id} senza console sviluppatore`);
    assert.match(url, /^https:\/\//, `${connector.id} console non valida`);
  }
});

await check("catalogo: GitHub usa l'app GitHub", () => {
  const github = connectorById("github");
  assert.ok(github);
  assert.equal(github.auth, "github");
  assert.equal(github.loginLabel, "Accedi con GitHub");
});

await check("catalogo: ogni connettore con app dedicata ha gli endpoint OAuth", () => {
  for (const connector of CONNECTORS) {
    if (connector.auth !== "provider") continue;
    assert.ok(connector.oauth?.authorizeUrl, `${connector.id} senza authorizeUrl`);
    assert.ok(connector.oauth?.tokenUrl, `${connector.id} senza tokenUrl`);
  }
});

await check("catalogo: ogni connettore a credenziale ha i campi e una verifica", () => {
  for (const connector of CONNECTORS) {
    if (connector.auth !== "api_key") continue;
    assert.ok(connector.apiKeyFields?.length, `${connector.id} senza campi`);
    assert.ok(connector.test, `${connector.id} senza verifica`);
  }
});

await check("catalogo: ogni connettore ha una verifica reale", () => {
  for (const connector of CONNECTORS) {
    assert.ok(connector.test, `${connector.id} senza verifica`);
    assert.ok(connector.capabilities.length > 0, `${connector.id} senza capacita'`);
    assert.ok(connector.howTo.length > 0, `${connector.id} senza istruzioni`);
  }
});

await check("catalogo: le categorie hanno tutte un'etichetta", () => {
  for (const connector of CONNECTORS) {
    assert.ok(CONNECTOR_CATEGORY_LABELS[connector.category], `categoria senza etichetta: ${connector.category}`);
  }
});

// --- Stato firmato -----------------------------------------------------------

await check("state: creazione e verifica riuscite", () => {
  const { state, nonce, codeVerifier } = createConnectorState({
    tenantId: "tenant-1",
    connectorId: "gmail",
  });
  const cookie = connectorStateCookieValue(nonce, codeVerifier);
  const payload = verifyConnectorState(state, cookie);
  assert.equal(payload.tenantId, "tenant-1");
  assert.equal(payload.connectorId, "gmail");
});

await check("state: manomesso -> rifiutato", () => {
  const { state, nonce, codeVerifier } = createConnectorState({
    tenantId: "tenant-1",
    connectorId: "gmail",
  });
  const cookie = connectorStateCookieValue(nonce, codeVerifier);
  assert.equal(verifyConnectorState(`${state.slice(0, -2)}xx`, cookie), null);
});

await check("state: cookie diverso -> rifiutato", () => {
  const { state } = createConnectorState({ tenantId: "tenant-1", connectorId: "gmail" });
  assert.equal(verifyConnectorState(state, "altro-nonce.altro-verifier"), null);
});

await check("state: scaduto -> rifiutato", () => {
  const { state, nonce, codeVerifier } = createConnectorState({
    tenantId: "tenant-1",
    connectorId: "gmail",
  });
  const payload = Buffer.from(state.split(".")[0], "base64").toString("utf8");
  const parsed = JSON.parse(payload);
  parsed.ts = Date.now() - 11 * 60 * 1000;
  const forged = Buffer.from(JSON.stringify(parsed)).toString("base64");
  const cookie = connectorStateCookieValue(nonce, codeVerifier);
  assert.equal(verifyConnectorState(`${forged}.${state.split(".")[1]}`, cookie), null);
});

// --- Configurazione client ---------------------------------------------------

await check("config: Google e GitHub configurati con le env del login", () => {
  assert.equal(connectorConfigured(connectorById("gmail")), true);
  assert.equal(connectorConfigured(connectorById("github")), true);
});

await check("config: app dedicata non accreditata -> motivo esplicito", () => {
  const notion = connectorById("notion");
  const state = connectorConfig(notion);
  assert.equal(state.ok, false);
  assert.match(state.reason, /CONNECTOR_NOTION_CLIENT_ID/);
});

await check("config: app dedicata accreditata -> pronta", () => {
  const slack = connectorById("slack");
  const state = connectorConfig(slack);
  assert.equal(state.ok, true);
  assert.equal(state.client.clientId, "slack-client-id");
  assert.equal(state.client.redirectUri, connectorRedirectUri("slack", "provider"));
});

await check("config: i connettori a credenziale sono sempre utilizzabili", () => {
  assert.equal(connectorConfigured(connectorById("telegram")), true);
});

// --- App registrata dal tenant ------------------------------------------------

await check("app tenant: senza app il motivo spiega come registrarla", async () => {
  const resolved = await resolveConnectorClient(connectorById("notion"), "tenant-1", new Map());
  assert.equal(resolved.client, null);
  assert.match(resolved.reason, /Registra l'app OAuth di Notion/);
});

await check("app tenant: registrata, il provider e' utilizzabile", async () => {
  const apps = new Map([
    [
      "notion",
      {
        provider: "notion",
        clientId: "tenant-client-id",
        clientSecret: "tenant-secret",
        redirectUri: null,
        updatedAt: new Date().toISOString(),
        valid: true,
      },
    ],
  ]);
  const resolved = await resolveConnectorClient(connectorById("notion"), "tenant-1", apps);
  assert.equal(resolved.source, "tenant");
  assert.equal(resolved.client.clientId, "tenant-client-id");
  assert.equal(resolved.client.redirectUri, connectorRedirectUri("notion", "provider"));
});

await check("app tenant: con redirect URI propria viene usata", async () => {
  const apps = new Map([
    [
      "figma",
      {
        provider: "figma",
        clientId: "cid",
        clientSecret: "secret",
        redirectUri: "https://platform.aethersy.online/api/pipeline/connectors/figma/callback",
        updatedAt: new Date().toISOString(),
        valid: true,
      },
    ],
  ]);
  const resolved = await resolveConnectorClient(connectorById("figma"), "tenant-1", apps);
  assert.equal(resolved.client.redirectUri, apps.get("figma").redirectUri);
});

await check("app tenant: l'app di piattaforma ha la precedenza", async () => {
  const resolved = await resolveConnectorClient(connectorById("slack"), "tenant-1", new Map());
  assert.equal(resolved.source, "env");
  assert.equal(resolved.client.clientId, "slack-client-id");
});

await check("consenso Google: invalid_scope e app non verificata hanno una guida", () => {
  const invalid = googleConsentHint("invalid_scope", "Some requested scopes were invalid.");
  assert.match(invalid, /Google ha rifiutato uno scope/);
  const unverified = googleConsentHint("access_denied", "App is not verified for this user");
  assert.match(unverified, /utenti di test/);
  assert.equal(googleConsentHint("access_denied", "User cancelled"), null);
  assert.equal(googleConsentHint(null, null), null);
});

// --- URL di autorizzazione ----------------------------------------------------

await check("authorize Google: client_id, redirect_uri, scope e PKCE", () => {
  const url = new URL(
    connectorAuthorizeUrl(connectorById("gmail"), { state: "st", codeVerifier: "verifier" }),
  );
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), "google-client-id");
  assert.equal(url.searchParams.get("redirect_uri"), connectorRedirectUri("gmail", "google"));
  assert.equal(url.searchParams.get("state"), "st");
  assert.ok(url.searchParams.get("scope").includes("gmail.modify"));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(url.searchParams.get("code_challenge"));
});

await check("authorize GitHub: scope repo workflow e redirect_uri", () => {
  const url = new URL(
    connectorAuthorizeUrl(connectorById("github"), { state: "st", codeVerifier: "verifier" }),
  );
  assert.equal(url.origin + url.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(url.searchParams.get("scope"), "repo workflow");
  assert.equal(url.searchParams.get("redirect_uri"), connectorRedirectUri("github", "github"));
});

await check("authorize app dedicata: endpoint del provider e client_id", () => {
  const url = new URL(
    connectorAuthorizeUrl(connectorById("slack"), { state: "st", codeVerifier: "verifier" }),
  );
  assert.equal(url.origin + url.pathname, "https://slack.com/oauth/v2/authorize");
  assert.equal(url.searchParams.get("client_id"), "slack-client-id");
  assert.equal(url.searchParams.get("state"), "st");
});

await check("authorize master Google: consenso unificato sui 10 servizi", () => {
  const master = googleMasterSpec();
  const url = new URL(
    connectorAuthorizeUrl(master, { state: "st", codeVerifier: "verifier" }),
  );
  const scopes = url.searchParams.get("scope").split(" ");
  assert.equal(scopes.length, 10);
  assert.equal(url.searchParams.get("client_id"), "google-client-id");
  assert.equal(url.searchParams.get("redirect_uri"), connectorRedirectUri("google", "google"));
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});

await check("callback unificato: Google/GitHub usano il callback gia' registrato", () => {
  // Google e GitHub accettano un solo callback URL per app: il connettore
  // deve usare quello del login sociale, altrimenti GitHub risponde 404.
  assert.equal(
    connectorRedirectUri("gmail", "google"),
    "https://platform.aethersy.online/api/auth/social/google/callback",
  );
  assert.equal(
    connectorRedirectUri("github", "github"),
    "https://platform.aethersy.online/api/auth/social/github/callback",
  );
  assert.equal(
    connectorRedirectUri("slack", "provider"),
    "https://platform.aethersy.online/api/pipeline/connectors/slack/callback",
  );
});

await check("state di connettore: riconosciuto senza cookie (callback unificato)", () => {
  const { state } = createConnectorState({ tenantId: "tenant-1", connectorId: "gmail" });
  const payload = parseSignedState(state);
  assert.equal(payload.connectorId, "gmail");
  assert.equal(payload.tenantId, "tenant-1");
  assert.equal(isConnectorState(state), true);
  assert.equal(isConnectorState("state.manomesso"), false);
  assert.equal(isConnectorState(undefined), false);
});

// --- Scambio codice / token --------------------------------------------------

await check("scambio codice: token ricevuti e cifrati sul server", async () => {
  const bundle = await exchangeConnectorCode(connectorById("slack"), "good", "verifier");
  assert.equal(bundle.access_token, "tok-1");
  assert.equal(bundle.refresh_token, "ref-1");
  assert.ok(bundle.expires_at > Date.now());
  const encrypted = encryptBundle(bundle);
  assert.ok(!encrypted.includes("tok-1"), "il token compare in chiaro");
  const decrypted = decryptBundle(encrypted);
  assert.equal(decrypted.access_token, "tok-1");
});

await check("scambio codice fallito: errore comprensibile", async () => {
  await assert.rejects(
    () => exchangeConnectorCode(connectorById("slack"), "scaduto", "verifier"),
    (err) => {
      assert.match(err.message, /Collegamento a Slack fallito/);
      return true;
    },
  );
});

// --- Rotte -------------------------------------------------------------------

const Fastify = (await import("fastify")).default;
const cookie = (await import("@fastify/cookie")).default;
const app = Fastify({ logger: false });
await app.register(cookie);
await registerConnectorRoutes(app);
await app.ready();

await check("rotte: GET /api/pipeline/connectors risponde (guard del tenant)", async () => {
  const response = await app.inject({ method: "GET", url: "/api/pipeline/connectors" });
  assert.notEqual(response.statusCode, 404);
  assert.ok([401, 503].includes(response.statusCode), `status ${response.statusCode}`);
});

await check("rotte: GET connect di un connettore inesistente -> 404", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/pipeline/connectors/non-esiste/connect",
  });
  assert.ok([401, 503].includes(response.statusCode), `status ${response.statusCode}`);
});

// Callback unificato: il login sociale deve riconoscere uno `state` di
// connettore e rientrare in /connectors (non nella pagina di login).
const { registerSocialRoutes } = await import("../dist/auth/social-routes.js");
const socialApp = Fastify({ logger: false });
await socialApp.register(cookie);
await registerSocialRoutes(socialApp);
await socialApp.ready();

await check("callback unificato: state di connettore -> rientro in /connectors", async () => {
  const { state, nonce, codeVerifier } = createConnectorState({
    tenantId: "tenant-1",
    connectorId: "github",
  });
  const cookie = connectorStateCookieValue(nonce, codeVerifier);
  const response = await socialApp.inject({
    method: "GET",
    url: `/api/auth/social/github/callback?code=good&state=${encodeURIComponent(state)}`,
    headers: { cookie: `aethersy_connector_oauth=${cookie}` },
  });
  assert.equal(response.statusCode, 302);
  const location = new URL(response.headers.location);
  assert.equal(location.pathname, "/connectors");
});

await check("callback unificato: state di connettore senza cookie -> rientro in /connectors", async () => {
  const { state } = createConnectorState({ tenantId: "tenant-1", connectorId: "github" });
  const response = await socialApp.inject({
    method: "GET",
    url: `/api/auth/social/github/callback?code=good&state=${encodeURIComponent(state)}`,
  });
  assert.equal(response.statusCode, 302);
  assert.equal(new URL(response.headers.location).pathname, "/connectors");
});

await socialApp.close();

await app.close();
stub.close();

console.log(`\n${passed} test superati, ${failures.length} falliti`);
if (failures.length) {
  for (const failure of failures) console.log(`  FAIL ${failure.name}: ${failure.message}`);
  process.exit(1);
}
