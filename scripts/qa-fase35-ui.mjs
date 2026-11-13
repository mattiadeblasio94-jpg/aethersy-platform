// QA visivo Fase 35: pagina /admin (pannello), /jarvis e /memoria.
// Verifica caricamento, contenuti chiave e assenza di errori in console.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGIN = "https://platform.aethersy.online";
const email = process.argv[2];
const password = process.argv[3];
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.QA_CDP_PORT ?? 9397);
mkdirSync("shots-fase35", { recursive: true });

const profile = mkdtempSync(join(tmpdir(), "qa-fase35-"));
const chrome = spawn(
  CHROME,
  ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--window-size=1440,1600", "about:blank"],
  { stdio: "ignore" },
);
const cleanup = () => {
  try { chrome.kill(); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
};
process.on("exit", cleanup);

let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { failed++; console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("CDP non raggiungibile");
}

const wsUrl = await waitForCdp();
const ws = new WebSocket(wsUrl);
let msgId = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
await new Promise((resolve) => ws.addEventListener("open", resolve));
function send(method, params = {}, sessionId) {
  const id = ++msgId;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

const { result: targetResult } = await send("Target.createTarget", { url: "about:blank" });
const targetId = targetResult.targetId;
const { result: attachResult } = await send("Target.attachToTarget", { targetId, flatten: true });
const sessionId = attachResult.sessionId;

const consoleErrors = [];
const failedRequests = [];
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.sessionId !== sessionId) return;
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    consoleErrors.push(msg.params.args?.map((a) => a.value ?? a.description ?? "").join(" ") ?? "");
  }
  if (msg.method === "Network.loadingFailed") failedRequests.push(msg.params.errorText ?? "");
});

await send("Runtime.enable", {}, sessionId);
await send("Network.enable", {}, sessionId);
await send("Page.enable", {}, sessionId);

async function goto(url) {
  await send("Page.navigate", { url }, sessionId);
  await new Promise((r) => setTimeout(r, 3500));
}

async function evaluate(expression) {
  const { result } = await send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  return result?.result?.value;
}

async function login() {
  await goto(`${ORIGIN}/login`);
  await evaluate(`(async () => {
    const r = await fetch("/api/auth/login", {
      method: "POST", credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(${JSON.stringify({ email, password })})
    });
    return r.status;
  })()`);
}

await login();

// --- /admin ---------------------------------------------------------------
await goto(`${ORIGIN}/admin`);
const adminText = await evaluate("document.body.innerText");
check("pannello: pagina caricata", adminText.includes("Pannello di controllo"), adminText.slice(0, 60).replace(/\n/g, " "));
check("pannello: KPI richieste", adminText.includes("Richieste AI"));
check("pannello: costo provider", adminText.includes("Costo provider"));
check("pannello: costi per utente", adminText.includes("Costi per utente"));
check("pannello: tabella tenant", adminText.includes("Tenant"));
check("pannello: ultimi consumi", adminText.includes("Ultimi consumi"));
await send("Page.captureScreenshot", {}, sessionId).catch(() => {});

// --- /jarvis --------------------------------------------------------------
await goto(`${ORIGIN}/jarvis`);
const jarvisText = await evaluate("document.body.innerText");
check("jarvis: pagina caricata", jarvisText.includes("Jarvis"), jarvisText.slice(0, 60).replace(/\n/g, " "));
check("jarvis: campo di input", await evaluate("!!document.querySelector('textarea')"));
check("jarvis: pulsante microfono", await evaluate("!!document.querySelector('button[aria-label*=\"microfono\"], button[aria-label*=\"Parla\"]')"));

// --- /memoria -------------------------------------------------------------
await goto(`${ORIGIN}/memory`);
const memText = await evaluate("document.body.innerText");
check("memoria: pagina caricata", memText.includes("Memoria"));
check("memoria: pulsante nuova nota", memText.includes("Nuova nota") || memText.includes("nuova nota"));

check("nessun errore in console", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
check("nessuna richiesta fallita", failedRequests.length === 0, failedRequests.slice(0, 2).join(" | "));

console.log(`\n${passed} superati, ${failed} falliti`);
ws.close();
chrome.kill();
process.exit(failed === 0 ? 0 : 1);
