// qa-platform-ui.mjs — verifica nel browser le pagine IA del platform (fase 19)
// con Chrome headless + CDP (nessuna dipendenza esterna: WebSocket globale di
// Node >= 22). Login via fetch sulla stessa origine (cookie di sessione), poi
// navigazione su ogni rotta IA con attesa dei marker attesi, lettura del testo
// renderizzato e raccolta degli errori di console.
//
// Uso: node scripts/qa-platform-ui.mjs <email> <password>
// Variabili: PLATFORM_ORIGIN (default https://platform.aethersy.online),
//            CHROME_PATH (percorso dell'eseguibile Chrome).
// Le credenziali arrivano come argomenti: nessun segreto nel repo.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGIN = process.env.PLATFORM_ORIGIN ?? "https://platform.aethersy.online";
const email = process.argv[2];
const password = process.argv[3];
if (!email || !password) {
  console.error("uso: node scripts/qa-platform-ui.mjs <email> <password>");
  process.exit(2);
}
// Chrome: percorso esplicito via CHROME_PATH, altrimenti il default del SO.
const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "/usr/bin/google-chrome");
const PORT = 9333;

const ROUTES = [
  { path: "/goals", expect: ["Obiettivi", "Nuovo obiettivo"] },
  { path: "/memory", expect: ["Memoria", "Nuova nota"] },
  { path: "/inbox", expect: ["Inbox", "Conversazioni"] },
  { path: "/scheduled-tasks", expect: ["Attivita' pianificate"] },
  { path: "/content-calendar", expect: ["Calendario editoriale"] },
  { path: "/skills", expect: ["Competenze"] },
  { path: "/members", expect: ["Membri"] },
  { path: "/payouts", expect: ["Pagamenti e consumi"] },
  { path: "/account", expect: ["Account"] },
];

const profile = mkdtempSync(join(tmpdir(), "qa-platform-"));
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

// --- Login (stessa origine: cookie di sessione) -----------------------------
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
  const before = consoleErrors.length;
  await goto(`${ORIGIN}${route.path}`);
  // Attesa attiva dei marker attesi (la SPA carica i chunk lazy e i dati).
  let text = "";
  for (let attempt = 0; attempt < 30; attempt += 1) {
    text = String(await evaluate("document.body.innerText"));
    if (route.expect.every((needle) => text.includes(needle))) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const missing = route.expect.filter((needle) => !String(text ?? "").includes(needle));
  const newErrors = consoleErrors.slice(before);
  const ok = missing.length === 0 && newErrors.length === 0;
  if (!ok) failures += 1;
  if (!ok) console.log("  testo:", String(text ?? "").split("\n").filter(Boolean).slice(0, 12).join(" | "));
  console.log(
    `${ok ? "OK  " : "FAIL"} ${route.path}` +
      (missing.length ? ` — manca: ${missing.join(", ")}` : "") +
      (newErrors.length ? ` — errori console: ${newErrors.length}` : "") +
      ` — ${String(text ?? "").split("\n").filter(Boolean).length} righe di testo`,
  );
}

// Screenshot di una pagina nuova per prova visiva.
await goto(`${ORIGIN}/payouts`);
await new Promise((r) => setTimeout(r, 1200));
const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
const { writeFileSync } = await import("node:fs");
writeFileSync(join(profile, "payouts.png"), Buffer.from(shot.data, "base64"));

console.log(`\n${ROUTES.length - failures}/${ROUTES.length} pagine verificate`);
process.exit(failures === 0 ? 0 : 1);
