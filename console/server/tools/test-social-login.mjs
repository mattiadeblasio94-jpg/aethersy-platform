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
import crypto from "node:crypto";
import assert from "node:assert/strict";

// --- Provider finto ----------------------------------------------------------

// Chiave RSA del bot Telegram di test: serve a firmare un id_token valido e a
// pubblicare il JWKS corrispondente, cosi' la verifica server-side e' provata
// davvero (non un token finto non verificabile).
const telegramKeys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const telegramPublicJwk = telegramKeys.publicKey.export({ format: "jwk" });
telegramPublicJwk.kid = "test-kid";
telegramPublicJwk.alg = "RS256";
telegramPublicJwk.use = "sig";

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signTelegramIdToken(claims) {
  const header = b64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-kid" })));
  const payload = b64url(Buffer.from(JSON.stringify(claims)));
  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), telegramKeys.privateKey);
  return `${header}.${payload}.${b64url(signature)}`;
}

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

  if (url.pathname === "/telegram/token") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      if (params.get("code") !== "good-telegram") {
        return json(400, { error: "invalid_grant", error_description: "Invalid code." });
      }
      return json(200, {
        access_token: "tok-telegram",
        token_type: "Bearer",
        id_token: signTelegramIdToken({
          iss: "https://oauth.telegram.org",
          aud: process.env.TELEGRAM_CLIENT_ID,
          sub: "771234567",
          id: 771234567,
          name: "Ada Lovelace",
          preferred_username: "ada",
          picture: "https://example.com/ada.png",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      });
    });
    return;
  }

  if (url.pathname === "/telegram/jwks") {
    return json(200, { keys: [telegramPublicJwk] });
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
process.env.TELEGRAM_CLIENT_ID ??= "telegram-client-id";
process.env.TELEGRAM_CLIENT_SECRET ??= "telegram-client-secret";
process.env.TELEGRAM_REDIRECT_URI ??= "https://platform.aethersy.online/api/auth/social/telegram/callback";
process.env.TELEGRAM_TOKEN_URL = `${stubBase}/telegram/token`;
process.env.TELEGRAM_JWKS_URL = `${stubBase}/telegram/jwks`;

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

// --- Telegram (OIDC) ---------------------------------------------------------

await check("authorize Telegram: issuer OIDC, scope openid profile e nonce", () => {
  const url = new URL(socialAuthorizeUrl("telegram", { state: "st", nonce: "no" }));
  assert.equal(url.origin + url.pathname, "https://oauth.telegram.org/auth");
  assert.equal(url.searchParams.get("client_id"), "telegram-client-id");
  assert.equal(url.searchParams.get("redirect_uri"), process.env.TELEGRAM_REDIRECT_URI);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "openid profile");
  assert.equal(url.searchParams.get("nonce"), "no");
  assert.equal(url.searchParams.get("state"), "st");
});

await check("scambio codice Telegram: id_token ricevuto", async () => {
  const { accessToken, idToken } = await exchangeSocialCode("telegram", "good-telegram");
  assert.equal(accessToken, "tok-telegram");
  assert.ok(idToken?.split(".").length === 3, "id_token non e' un JWT");
});

await check("profilo Telegram: claims letti dall'id_token con firma verificata", async () => {
  const { idToken } = await exchangeSocialCode("telegram", "good-telegram");
  const profile = await fetchSocialProfile("telegram", "tok-telegram", idToken);
  assert.equal(profile.providerUserId, "771234567");
  assert.equal(profile.firstName, "Ada");
  assert.equal(profile.lastName, "Lovelace");
  // Telegram non espone l'email: l'identita' e' sintetica ma stabile.
  assert.equal(profile.syntheticEmail, true);
  assert.equal(profile.email, "tg-ada@telegram.aethersy.online");
});

await check("profilo Telegram: id_token mancante rifiutato", async () => {
  await assert.rejects(
    () => fetchSocialProfile("telegram", "tok-telegram", null),
    (err) => {
      assert.ok(err instanceof SocialAuthError);
      assert.equal(err.code, "TOKEN_MISSING");
      return true;
    },
  );
});

await check("id_token Telegram con firma manipolata rifiutato", async () => {
  const { idToken } = await exchangeSocialCode("telegram", "good-telegram");
  const parts = idToken.split(".");
  const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -4)}AAAA`;
  await assert.rejects(
    () => fetchSocialProfile("telegram", "tok-telegram", tampered),
    /firma dell'id_token Telegram non valida/,
  );
});

await check("stato dei provider: telegram configurato quando ha client_id e secret", () => {
  const status = socialProviderStatus();
  assert.equal(status.telegram.configured, true);
  assert.equal(status.telegram.label, "Telegram");
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
