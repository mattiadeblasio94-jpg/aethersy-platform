// qa-platform-routes.mjs — verifica nel browser TUTTE le rotte della SPA platform
// dopo la conversione a dati reali (fase 20): login via fetch sulla stessa
// origine, navigazione su ogni rotta, attesa dei marker attesi, raccolta degli
// errori di console e delle risposte HTTP >= 400.
//
// Uso: node scripts/qa-platform-routes.mjs <email> <password>
// Variabili: PLATFORM_ORIGIN (default https://platform.aethersy.online),
//            CHROME_PATH (percorso dell'eseguibile Chrome).
// Le credenziali arrivano come argomenti: nessun segreto nel repo.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGIN = process.env.PLATFORM_ORIGIN ?? "https://platform.aethersy.online";
const email = process.argv[2];
const password = process.argv[3];
if (!email || !password) {
  console.error("uso: node scripts/qa-platform-routes.mjs <email> <password>");
  process.exit(2);
}

const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "/usr/bin/google-chrome");

const PORT = Number(process.env.QA_CDP_PORT ?? 9345);
const SHOT_DIR = process.env.QA_SHOT_DIR ?? "";

// Marker minimi per rotta: devono comparire nel testo renderizzato.
const ROUTES = [
  { path: "/dashboard", expect: ["Polso"] },
  { path: "/studio", expect: ["Studio"] },
  { path: "/library", expect: ["Libreria"] },
  { path: "/library?tab=artefatti", expect: ["Artefatti"] },
  { path: "/library?tab=risorse", expect: ["Risorse"] },
  { path: "/agents", expect: ["Agenti"] },
  { path: "/agents/create", expect: ["Agente"] },
  { path: "/products", expect: ["Prodotti"] },
  { path: "/ads", expect: ["Annunci"] },
  { path: "/analytics", expect: ["Analisi"] },
  { path: "/website", expect: ["Sito"] },
  { path: "/outreach", expect: ["Outreach", "Lead"] },
  { path: "/social-media", expect: ["Social"] },
  { path: "/tasks", expect: ["Task", "Attiv"] },
  { path: "/opportunities", expect: ["Opportunit"] },
  { path: "/settings/profile", expect: ["Profilo"] },
  { path: "/settings/notifications", expect: ["Notifiche"] },
  { path: "/settings/integrations", expect: ["Integrazioni"] },
  { path: "/settings/billing", expect: ["Crediti", "Billing", "crediti"] },
  { path: "/help", expect: ["Aiuto", "FAQ", "Domande"] },
  { path: "/goals", expect: ["Obiettivi"] },
  { path: "/memory", expect: ["Memoria"] },
  { path: "/inbox", expect: ["Inbox"] },
  { path: "/scheduled-tasks", expect: ["Attivita' pianificate", "Attività pianificate"] },
  { path: "/content-calendar", expect: ["Calendario editoriale"] },
  { path: "/skills", expect: ["Competenze"] },
  { path: "/members", expect: ["Membri"] },
  { path: "/payouts", expect: ["Pagamenti e consumi"] },
  { path: "/account", expect: ["Account"] },
  { path: "/onboarding", expect: ["configurazione", "Obiettivi", "obiettivo"] },
];

const profile = mkdtempSync(join(tmpdir(), "qa-platform-routes-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--hide-scrollbars",
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

function cleanup() {
  try {
    chrome.kill();
  } catch {}
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
}
process.on("exit", cleanup);

async function waitForCdp() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return await res.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("CDP non raggiungibile");
}

const version = await waitForCdp();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const consoleErrors = [];
const badResponses = [];

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? "")})`));
    else resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    consoleErrors.push(`exception: ${msg.params?.exceptionDetails?.text ?? "?"}`);
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params?.type === "error") {
    const text = (msg.params.args ?? [])
      .map((a) => a.value ?? a.description ?? a.type)
      .join(" ");
    consoleErrors.push(`console.error: ${text}`);
  }
  if (msg.method === "Network.responseReceived") {
    const status = msg.params?.response?.status ?? 0;
    const url = msg.params?.response?.url ?? "";
    if (status >= 400 && url.startsWith(ORIGIN)) {
      badResponses.push(`${status} ${url.replace(ORIGIN, "")}`);
    }
  }
});

function send(method, params = {}, sessionId) {
  const id = nextId++;
  const payload = { id, method, params };
  if (sessionId) payload.sessionId = sessionId;
  ws.send(JSON.stringify(payload));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout ${method}`));
      }
    }, 45000);
  });
}

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });

await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
await send("Network.enable", {}, sessionId);

async function evaluate(expression, awaitPromise = false) {
  const result = await send(
    "Runtime.evaluate",
    { expression, awaitPromise, returnByValue: true },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "errore di valutazione");
  }
  return result.result?.value;
}

async function goto(url) {
  await send("Page.navigate", { url }, sessionId);
  await new Promise((r) => setTimeout(r, 1200));
}

await goto(`${ORIGIN}/login`);
const loginStatus = await evaluate(
  `fetch('/api/auth/login', {
     method: 'POST',
     headers: { 'content-type': 'application/json' },
     credentials: 'include',
     body: JSON.stringify(${JSON.stringify({ email, password })})
   }).then(r => r.status)`,
  true,
);
console.log(`login → ${loginStatus}`);
if (loginStatus !== 200) {
  console.error("login fallito");
  process.exit(1);
}

let failures = 0;
for (const route of ROUTES) {
  const errorsBefore = consoleErrors.length;
  const responsesBefore = badResponses.length;
  await goto(`${ORIGIN}${route.path}`);

  let text = "";
  for (let attempt = 0; attempt < 25; attempt += 1) {
    text = String(await evaluate("document.body.innerText"));
    if (route.expect.some((needle) => text.includes(needle))) break;
    await new Promise((r) => setTimeout(r, 800));
  }

  const missing = String(text ?? "").includes(route.expect[0])
    ? []
    : route.expect.filter((needle) => !String(text ?? "").includes(needle));
  const newErrors = consoleErrors.slice(errorsBefore);
  const newResponses = badResponses.slice(responsesBefore);
  const ok = missing.length === 0 && newErrors.length === 0 && newResponses.length === 0;
  if (!ok) failures += 1;
  if (!ok) {
    console.log(
      "  testo:",
      String(text ?? "")
        .split("\n")
        .filter(Boolean)
        .slice(0, 10)
        .join(" | "),
    );
  }
  console.log(
    `${ok ? "OK  " : "FAIL"} ${route.path}` +
      (missing.length ? ` — manca: ${missing.join(", ")}` : "") +
      (newErrors.length ? ` — errori console: ${newErrors.length}` : "") +
      (newResponses.length ? ` — risposte >=400: ${newResponses.join(", ")}` : ""),
  );
}

if (SHOT_DIR) {
  for (const path of ["/dashboard", "/studio", "/library", "/agents", "/library?tab=artefatti", "/library?tab=risorse"]) {
    await goto(`${ORIGIN}${path}`);
    await new Promise((r) => setTimeout(r, 1500));
    const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    const name =
      path === "/"
        ? "home"
        : path.replace(/\//g, "-").replace(/^-/, "").replace(/\?/g, "-").replace(/=/g, "-");
    writeFileSync(join(SHOT_DIR, `${name}.png`), Buffer.from(shot.data, "base64"));
  }
  console.log(`screenshot in ${SHOT_DIR}`);
}

console.log(`\n${ROUTES.length - failures}/${ROUTES.length} rotte verificate`);
process.exit(failures === 0 ? 0 : 1);
