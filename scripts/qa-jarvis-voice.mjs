// QA voce: flusso completo microfono -> trascrizione -> risposta -> TTS.
// Chrome headless con microfono simulato (--use-file-for-fake-audio-capture).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGIN = process.argv[2] ?? "https://platform.aethersy.online";
const email = process.argv[3];
const password = process.argv[4];
const wav = process.argv[5];
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.QA_CDP_PORT ?? 9399);
mkdirSync("shots-fase35", { recursive: true });

const profile = mkdtempSync(join(tmpdir(), "qa-jarvis-voice-"));
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
await send("Log.enable", {}, sessionId);

const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId)).result?.result?.value;
const goto = async (url) => { await send("Page.navigate", { url }, sessionId); await new Promise((r) => setTimeout(r, 3500)); };

await goto(`${ORIGIN}/login`);
await evalJs(`(async () => { await fetch("/api/auth/login", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(${JSON.stringify({ email, password })}) }); return true; })()`);

await goto(`${ORIGIN}/jarvis`);
const bodyText = await evalJs("document.body.innerText");
check("pagina Jarvis aperta", bodyText.includes("Jarvis"));

// Intercetta le risposte HTTP per vedere transcribe/chat/TTS.
await send("Network.enable", {}, sessionId);
const seen = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Network.responseReceived" && m.sessionId === sessionId) {
    const url = m.params.response.url;
    if (/jarvis\/transcribe|jarvis\/chat|ai\/generate|blob:/.test(url)) seen.push(`${m.params.response.status} ${url.replace(ORIGIN, "")}`);
  }
});

// Microfono: avvia la registrazione, parla (file wav finto), poi ferma.
const started = await evalJs(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').toLowerCase().includes('parla'));
  if (!btn) return 'nessun bottone microfono';
  btn.click();
  return 'ok';
})()`);
check("microfono: registrazione avviata", started === "ok", String(started));

await new Promise((r) => setTimeout(r, 5000));
const stopped = await evalJs(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').toLowerCase().includes('ferma'));
  if (!btn) return 'nessun bottone stop';
  btn.click();
  return 'ok';
})()`);
check("microfono: registrazione chiusa", stopped === "ok", String(stopped));

// Attende la trascrizione (testo dell'utente) e la risposta.
let bubble = "[]";
let ttsSeen = [];
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  bubble = String(await evalJs("JSON.stringify([...document.querySelectorAll('p.whitespace-pre-wrap')].map(e=>e.textContent))"));
  ttsSeen = seen.filter((s) => s.includes("ai/generate"));
  const arr = JSON.parse(bubble);
  if (arr.length >= 2 && ttsSeen.length > 0) break;
}
const arr = JSON.parse(bubble);
check("trascrizione del microfono ricevuta", arr.length >= 1, arr[0] ?? "");
check("risposta di Jarvis ricevuta", arr.length >= 2, arr[1] ?? "");

const tts = seen.filter((s) => s.includes("ai/generate"));
check("sintesi vocale richiesta e risposta", tts.some((s) => s.startsWith("200")), tts.join(" | ") || "nessuna richiesta TTS");
check("trascrizione senza errori 4xx/5xx", !seen.some((s) => /transcribe/.test(s) && !s.startsWith("2")), seen.join(" | "));

const replay = await evalJs(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /rileggi/i.test(b.getAttribute('aria-label') || ''));
  if (!btn) return false;
  btn.click();
  return true;
})()`);
check("pulsante rileggi presente e cliccato", replay === true);

// L'audio TTS e' un oggetto Audio creato via JS: si verifica la richiesta blob.
await new Promise((r) => setTimeout(r, 8000));
const blobFetched = seen.some((s) => s.startsWith("200 blob:") || s.startsWith("206 blob:"));
check("audio TTS scaricato e riproducibile", blobFetched, seen.filter((s) => s.includes("blob:")).join(" | ") || "nessuna richiesta blob");

const shot = await send("Page.captureScreenshot", { captureBeyondViewport: true }, sessionId);
if (shot.result?.data) {
  const fs = await import("node:fs");
  fs.writeFileSync("shots-fase35/jarvis-voice.png", Buffer.from(shot.result.data, "base64"));
  console.log("      screenshot: shots-fase35/jarvis-voice.png");
  console.log("      messaggi: " + bubble.slice(0, 400));
}

console.log(`\n${passed} superati, ${failed} falliti`);
ws.close(); chrome.kill();
process.exit(failed === 0 ? 0 : 1);
