// QA conversazione in tempo reale: Jarvis SEMPRE in ascolto.
//
// Verifica che, senza premere nulla, la pagina /jarvis:
//   1. avvia l'ascolto continuo con il microfono simulato;
//   2. segmenta il parlato, trascrive e risponde da sola (turno automatico);
//   3. ripete il ciclo (secondo turno automatico: la conversazione continua);
//   4. riceve un evento proattivo via SSE e lo annuncia.
//
// Chrome headless con microfono simulato (--use-file-for-fake-audio-capture:
// il file WAV viene ripetuto in loop, quindi l'assistente riceve piu' frasi).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGIN = process.argv[2] ?? "https://platform.aethersy.online";
const email = process.argv[3];
const password = process.argv[4];
const wav = process.argv[5];
const eventsToken = process.argv[6];
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.QA_CDP_PORT ?? 9402);
mkdirSync("shots-fase35", { recursive: true });

const profile = mkdtempSync(join(tmpdir(), "qa-jarvis-live-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--window-size=1440,1600", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`, "about:blank"], { stdio: "ignore" });
const cleanup = () => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on("exit", cleanup);

let passed = 0, failed = 0;
const check = (name, ok, detail = "") => { if (ok) { passed++; console.log(`PASS  ${name}${detail ? " — " + detail : ""}`); } else { failed++; console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`); } };

async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try { const res = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (res.ok) return (await res.json()).webSocketDebuggerUrl; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("CDP non raggiungibile");
}

const ws = new WebSocket(await waitForCdp());
let msgId = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
await new Promise((r) => ws.addEventListener("open", r));
const send = (method, params = {}, sessionId) => new Promise((resolve) => { const id = ++msgId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });

const { result: t } = await send("Target.createTarget", { url: "about:blank" });
const { result: a } = await send("Target.attachToTarget", { targetId: t.targetId, flatten: true });
const sessionId = a.sessionId;
await send("Runtime.enable", {}, sessionId);
await send("Page.enable", {}, sessionId);
await send("Network.enable", {}, sessionId);

const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId)).result?.result?.value;
const goto = async (url) => { await send("Page.navigate", { url }, sessionId); await new Promise((r) => setTimeout(r, 3500)); };

await goto(`${ORIGIN}/login`);
await evalJs(`(async () => { await fetch("/api/auth/login", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(${JSON.stringify({ email, password })}) }); return true; })()`);

await goto(`${ORIGIN}/jarvis`);
check("pagina Jarvis aperta", String(await evalJs("document.body.innerText")).includes("Jarvis"));

const seen = [];
const transcriptBodies = [];
const requestIds = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Network.responseReceived" && m.sessionId === sessionId) {
    const url = m.params.response.url;
    if (/jarvis\/transcribe|jarvis\/chat|ai\/generate|jarvis\/stream|blob:/.test(url)) {
      seen.push(`${m.params.response.status} ${url.replace(ORIGIN, "")}`);
      requestIds.set(m.params.requestId, `${m.params.response.status} ${url.replace(ORIGIN, "")}`);
    }
  }
  if (m.method === "Network.loadingFinished" && m.sessionId === sessionId && requestIds.has(m.params.requestId)) {
    const label = requestIds.get(m.params.requestId);
    if (label.startsWith("5") || label.startsWith("4") || label.includes("transcribe")) {
      void send("Network.getResponseBody", { requestId: m.params.requestId }, sessionId).then((r) => {
        const body = String(r.result?.body ?? "").slice(0, 200);
        if (label.startsWith("5") || label.startsWith("4")) console.log("ERRBODY", label, body);
        else transcriptBodies.push(body);
      });
    }
  }
});

// Avvia l'ascolto continuo (nessun click successivo: e' Jarvis a guidare).
const started = await evalJs(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').includes('Ascolto continuo'));
  if (!btn) return false;
  btn.click();
  return true;
})()`);
check("ascolto continuo avviato", started === true);

// Attendiamo i turni automatici: la pagina non deve ricevere input.
let bubbles = [];
let userTurns = [];
let assistantTurns = [];
let eventTurns = [];
const readTurns = async () => {
  const raw = String(await evalJs(`JSON.stringify([...document.querySelectorAll('[data-turn]')].map(e => ({ role: e.getAttribute('data-turn'), text: (e.querySelector('p.whitespace-pre-wrap') || {}).textContent || '' })))`));
  const all = JSON.parse(raw);
  userTurns = all.filter((t) => t.role === "user").map((t) => t.text);
  assistantTurns = all.filter((t) => t.role === "assistant").map((t) => t.text);
  eventTurns = all.filter((t) => t.role === "event").map((t) => t.text);
  return all;
};
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 4000));
  await readTurns();
  if (userTurns.length >= 2 && assistantTurns.length >= 2) break;
}
check("primo turno automatico (ascolto -> risposta)", userTurns.length >= 1 && assistantTurns.length >= 1, userTurns[0]?.slice(0, 120) ?? "");
check("secondo turno automatico (conversazione continua)", userTurns.length >= 2 && assistantTurns.length >= 2, `${userTurns.length} frasi udite, ${assistantTurns.length} risposte`);
check("trascrizioni inviate senza intervento", seen.filter((s) => s.includes("jarvis/transcribe")).length >= 2, seen.filter((s) => s.includes("transcribe")).join(" | ") || "nessuna");
const finalTranscribes = seen.filter((s) => s.includes("jarvis/transcribe") && !s.includes("partial=1")).length;
const partialTranscribes = seen.filter((s) => s.includes("partial=1")).length;
check("segmenti finali inviati (turni chiusi)", finalTranscribes >= 1, `finali: ${finalTranscribes}, parziali: ${partialTranscribes}`);
check(
  "risposte di Jarvis via chat",
  seen.filter((s) => s.startsWith("200") && s.includes("jarvis/chat")).length >= 2,
  seen.filter((s) => s.includes("jarvis/chat")).join(" | ") || "nessuna",
);
// Una risposta in modalita' degradata (quota provider esaurita) non vale come
// risposta: il turno deve contenere una risposta vera del modello.
const degradedTurn = assistantTurns.find((t) => /ripristinando il collegamento/i.test(t));
check(
  "risposta del modello (non degradata)",
  assistantTurns.length >= 1 && !degradedTurn,
  degradedTurn
    ? `degradata: ${degradedTurn.slice(0, 100)}`
    : `trascrizioni: ${transcriptBodies.slice(-4).join(" / ").slice(0, 220)}`,
);
check("sintesi vocale richiesta", seen.some((s) => s.startsWith("200") && s.includes("ai/generate")), seen.filter((s) => s.includes("ai/generate")).join(" | ") || "nessuna");

// Evento proattivo: deve arrivare via SSE e comparire nella conversazione.
if (eventsToken) {
  const before = eventTurns.length;
  const sent = await evalJs(`(async () => {
    const res = await fetch("/api/platform/jarvis/events", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-jarvis-token": ${JSON.stringify(eventsToken)} },
      body: JSON.stringify({ kind: "notice", severity: "info", title: "QA evento proattivo", message: "il watcher ha rilevato un evento" }),
    });
    return res.status;
  })()`);
  check("evento proattivo accettato dal BFF", sent === 201, `HTTP ${sent}`);
  await new Promise((r) => setTimeout(r, 6000));
  await readTurns();
  check("evento proattivo ricevuto in streaming (SSE)", eventTurns.length > before && eventTurns.some((b) => b.includes("QA evento proattivo")), eventTurns.slice(-1)[0]?.slice(0, 160) || "nessun evento");
} else {
  console.log("SKIP  evento proattivo (token non fornito)");
}

const state = String(await evalJs(`document.body.innerText`));
check("stato sempre sveglio visibile", /sveglio|in ascolto|sto ascoltando/i.test(state), state.split("\n").find((l) => /sveglio|ascolto/i.test(l)) ?? "");

await send("Page.captureScreenshot", { format: "png" }, sessionId).then(async (r) => {
  const fs = await import("node:fs");
  if (r.result?.data) fs.writeFileSync("shots-fase35/jarvis-live.png", Buffer.from(r.result.data, "base64"));
});

console.log(`\n${passed} superati, ${failed} falliti`);
console.log("      frasi udite:", JSON.stringify(userTurns).slice(0, 400));
console.log("      risposte:", JSON.stringify(assistantTurns).slice(0, 400));
process.exit(failed === 0 ? 0 : 1);
