// Test del login sociale (Google, GitHub) senza toccare la rete pubblica.
//
// Avvia un provider finto in locale (token endpoint + userinfo) e verifica:
//   - la costruzione dell'URL di autorizzazione (client_id, redirect_uri,
//     state, nonce OIDC);
//   - lo scambio del codice con i token, inclusi gli errori dei provider
//     (codice scaduto, app OAuth sconosciuta);
//   - la lettura del profilo (email, nome, email GitHub nascosta);
//   - la protezione anti-CSRF dello `state`;
//   - il flusso HTTP completo: avvio -> callback -> cookie di sessione, e il
//     rientro alla pagina di login quando qualcosa fallisce.
//
//   npm run test:social   (compila il BFF e gira i test sul dist)

import http from "node:http";
import assert from "node:assert/strict";

// --- Provider finto ----------------------------------------------------------

const stub = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const json = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (url.pathname === "/google/token") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      if (params.get("code") === "good-google") {
        return json(200, { access_token: "tok-google", id_token: "id-google", token_type: "Bearer" });
      }
      return json(400, { error: "invalid_grant", error_description: "Malformed auth code." });
    });
    return;
  }

  if (url.pathname === "/google/userinfo") {
    if (req.headers.authorization !== "Bearer tok-google") return json(401, { error: "invalid_token" });
    return json(200, {
      id: "google-1",
      email: "ada@example.com",
      given_name: "Ada",
      family_name: "Lovelace",
      picture: "https://example.com/ada.png",
    });
  }

  if (url.pathname === "/github/token") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const payload = JSON.parse(body || "{}");
      if (payload.code === "good-github") return json(200, { access_token: "tok-github" });
      if (payload.code === "unknown-app") return json(404, { error: "Not Found" });
      return json(200, { error: "bad_verification_code", error_description: "The code passed is incorrect." });
    });
    return;
  }

  if (url.pathname === "/github/user") {
    if (req.headers.authorization !== "Bearer tok-github") return json(401, { message: "Bad credentials" });
    return json(200, { id: 42, login: "ada", name: "Ada Lovelace", avatar_url: "https://example.com/ada.png" });
  }

  if (url.pathname === "/github/user/emails") {
    return json(200, [
      { email: "ada@altro.example", primary: false, verified: true },
      { email: "ada@example.com", primary: true, verified: true },
    ]);
  }

  json(404, { error: "not_found" });
});

await new Promise((resolve) => stub.listen(0, "127.0.0.1", resolve));
const stubPort = stub.address().port;
const stubBase = `http://127.0.0.1:${stubPort}`;

// --- Env (config le legge all'import) ----------------------------------------

process.env.CONSOLE_SESSION_SECRET ??= "test-secret";
process.env.OPENROUTER_API_KEY ??= "test";
process.env.GOOGLE_CLIENT_ID ??= "google-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "google-client-secret";
process.env.GITHUB_CLIENT_ID ??= "github-client-id";
process.env.GITHUB_CLIENT_SECRET ??= "github-client-secret";
process.env.GOOGLE_REDIRECT_URI ??= "https://platform.aethersy.online/api/auth/social/google/callback";
process.env.GITHUB_REDIRECT_URI ??= "https://platform.aethersy.online/api/auth/social/github/callback";
process.env.GOOGLE_TOKEN_URL = `${stubBase}/google/token`;
process.env.GOOGLE_USERINFO_URL = `${stubBase}/google/userinfo`;
process.env.GITHUB_TOKEN_URL = `${stubBase}/github/token`;
process.env.GITHUB_USERINFO_URL = `${stubBase}/github/user`;
process.env.GITHUB_USER_EMAILS_URL = `${stubBase}/github/user/emails`;

const { socialAuthorizeUrl, exchangeSocialCode, fetchSocialProfile, socialProviderStatus, SocialAuthError } =
  await import("../dist/auth/social.js");
const { createOAuthState, verifyOAuthState, oauthLoginUrl, oauthSuccessUrl } = await import("../dist/auth/oauth-state.js");
const { registerSocialRoutes } = await import("../dist/auth/social-routes.js");

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

// --- URL di autorizzazione ---------------------------------------------------

await check("authorize Google: client_id, redirect_uri, state e nonce presenti", () => {
  const url = new URL(socialAuthorizeUrl("google", { state: "st", nonce: "no" }));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), "google-client-id");
  assert.equal(url.searchParams.get("redirect_uri"), process.env.GOOGLE_REDIRECT_URI);
  assert.equal(url.searchParams.get("state"), "st");
  assert.equal(url.searchParams.get("nonce"), "no");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
});

await check("authorize GitHub: scope read:user user:email", () => {
  const url = new URL(socialAuthorizeUrl("github", { state: "st", nonce: "no" }));
  assert.equal(url.origin + url.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(url.searchParams.get("scope"), "read:user user:email");
  assert.equal(url.searchParams.get("allow_signup"), "true");
});

// --- Scambio codice/token ----------------------------------------------------

await check("scambio codice Google: access token ricevuto", async () => {
  const { accessToken, idToken } = await exchangeSocialCode("google", "good-google");
  assert.equal(accessToken, "tok-google");
  assert.equal(idToken, "id-google");
});

await check("scambio codice Google fallito: errore comprensibile", async () => {
  await assert.rejects(
    () => exchangeSocialCode("google", "scaduto"),
    (err) => {
      assert.ok(err instanceof SocialAuthError);
      assert.equal(err.code, "OAUTH_CODE_INVALID");
      assert.match(err.message, /riavvia il login/i);
      return true;
    },
  );
});

await check("GitHub con app OAuth sconosciuta: OAUTH_APP_INVALID", async () => {
  await assert.rejects(
    () => exchangeSocialCode("github", "unknown-app"),
    (err) => {
      assert.ok(err instanceof SocialAuthError);
      assert.equal(err.code, "OAUTH_APP_INVALID");
      assert.match(err.message, /GitHub non riconosce l'app OAuth/);
      return true;
    },
  );
});

// --- Profilo -----------------------------------------------------------------

await check("profilo Google: email e nome", async () => {
  const profile = await fetchSocialProfile("google", "tok-google");
  assert.equal(profile.email, "ada@example.com");
  assert.equal(profile.firstName, "Ada");
  assert.equal(profile.lastName, "Lovelace");
});

await check("profilo GitHub: email nascosta letta da /user/emails", async () => {
  const profile = await fetchSocialProfile("github", "tok-github");
  assert.equal(profile.email, "ada@example.com");
  assert.equal(profile.firstName, "Ada");
  assert.equal(profile.lastName, "Lovelace");
});

// --- Protezione anti-CSRF ----------------------------------------------------

await check("state: verifica valida con nonce e destinazione corretti", () => {
  const { state, nonce } = createOAuthState("platform");
  assert.equal(verifyOAuthState(state, nonce), "platform");
});

await check("state: nonce diverso -> rifiutato", () => {
  const { state } = createOAuthState("platform");
  assert.equal(verifyOAuthState(state, "altro-nonce"), null);
});

await check("state: manomesso -> rifiutato", () => {
  const { state, nonce } = createOAuthState("platform");
  const tampered = `${state.slice(0, -2)}xx`;
  assert.equal(verifyOAuthState(tampered, nonce), null);
});

await check("state scaduto -> rifiutato", () => {
  const { state, nonce } = createOAuthState("platform");
  const payload = Buffer.from(state.split(".")[0], "base64").toString("utf8");
  const parsed = JSON.parse(payload);
  parsed.ts = Date.now() - 11 * 60 * 1000;
  const forged = Buffer.from(JSON.stringify(parsed)).toString("base64");
  assert.equal(verifyOAuthState(`${forged}.${state.split(".")[1]}`, nonce), null);
});

await check("URL di login e di successo coerenti con il target", () => {
  const login = new URL(oauthLoginUrl("platform", "OAUTH_ERROR", "messaggio"));
  assert.equal(login.origin + login.pathname, "https://platform.aethersy.online/login");
  assert.equal(login.searchParams.get("error"), "OAUTH_ERROR");
  assert.equal(login.searchParams.get("message"), "messaggio");
  assert.equal(oauthSuccessUrl("platform"), "https://platform.aethersy.online/studio?login=social");
});

// --- Flusso HTTP completo ----------------------------------------------------

const Fastify = (await import("fastify")).default;
const cookie = (await import("@fastify/cookie")).default;
const app = Fastify({ logger: false });
await app.register(cookie);
await registerSocialRoutes(app);
await app.ready();

const extractCookie = (response) => {
  const raw = response.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return Object.fromEntries(list.map((entry) => entry.split(";")[0].split("=")));
};

await check("GET /api/auth/social/providers: stato dei provider", async () => {
  const response = await app.inject({ method: "GET", url: "/api/auth/social/providers" });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.providers.google.configured, true);
  assert.equal(body.providers.github.configured, true);
});

await check("avvio Google: redirect al provider con cookie di state", async () => {
  const response = await app.inject({ method: "GET", url: "/api/auth/social/google?target=platform" });
  assert.equal(response.statusCode, 302);
  const location = response.headers.location;
  assert.match(location, /accounts\.google\.com/);
  const cookies = extractCookie(response);
  assert.ok(cookies.aethersy_oauth_state, "cookie di state mancante");
});

await check("callback Google: sessione aperta e redirect allo studio", async () => {
  const start = await app.inject({ method: "GET", url: "/api/auth/social/google?target=platform" });
  const state = new URL(start.headers.location).searchParams.get("state");
  const cookies = extractCookie(start);
  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/social/google/callback?code=good-google&state=${encodeURIComponent(state)}`,
    headers: { cookie: `aethersy_oauth_state=${cookies.aethersy_oauth_state}` },
  });
  assert.equal(callback.statusCode, 302);
  assert.equal(callback.headers.location, "https://platform.aethersy.online/studio?login=social");
  const session = extractCookie(callback);
  assert.ok(session.aethersy_session, "cookie di sessione mancante");
  const payload = JSON.parse(Buffer.from(session.aethersy_session.split(".")[0], "base64").toString("utf8"));
  assert.equal(payload.user.email, "ada@example.com");
});

await check("callback GitHub: sessione aperta con email dal profilo", async () => {
  const start = await app.inject({ method: "GET", url: "/api/auth/social/github?target=platform" });
  const state = new URL(start.headers.location).searchParams.get("state");
  const cookies = extractCookie(start);
  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/social/github/callback?code=good-github&state=${encodeURIComponent(state)}`,
    headers: { cookie: `aethersy_oauth_state=${cookies.aethersy_oauth_state}` },
  });
  assert.equal(callback.statusCode, 302);
  assert.equal(callback.headers.location, "https://platform.aethersy.online/studio?login=social");
});

await check("callback con state non valido: rientro alla pagina di login", async () => {
  const callback = await app.inject({
    method: "GET",
    url: "/api/auth/social/google/callback?code=good-google&state=manomesso",
  });
  assert.equal(callback.statusCode, 302);
  const location = new URL(callback.headers.location);
  assert.equal(location.pathname, "/login");
  assert.equal(location.searchParams.get("error"), "OAUTH_STATE_INVALID");
});

await check("callback con credenziali GitHub non valide: rientro con messaggio", async () => {
  const start = await app.inject({ method: "GET", url: "/api/auth/social/github?target=platform" });
  const state = new URL(start.headers.location).searchParams.get("state");
  const cookies = extractCookie(start);
  const callback = await app.inject({
    method: "GET",
    url: `/api/auth/social/github/callback?code=unknown-app&state=${encodeURIComponent(state)}`,
    headers: { cookie: `aethersy_oauth_state=${cookies.aethersy_oauth_state}` },
  });
  assert.equal(callback.statusCode, 302);
  const location = new URL(callback.headers.location);
  assert.equal(location.pathname, "/login");
  assert.equal(location.searchParams.get("error"), "OAUTH_APP_INVALID");
  assert.match(location.searchParams.get("message"), /GitHub non riconosce l'app OAuth/);
});

await check("stato provider: l'ultimo errore resta visibile per la UI", async () => {
  const status = socialProviderStatus();
  assert.equal(status.github.lastError.code, "OAUTH_APP_INVALID");
});

await app.close();
stub.close();

console.log(`\n${passed} test superati, ${failures.length} falliti`);
if (failures.length) {
  for (const failure of failures) console.log(`  FAIL ${failure.name}: ${failure.message}`);
  process.exit(1);
}
