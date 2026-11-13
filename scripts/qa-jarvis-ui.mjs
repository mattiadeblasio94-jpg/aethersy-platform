// QA UI: pagina /jarvis con il servizio attivo (chat reale dal browser).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGIN = "https://platform.aethersy.online";
const email = process.argv[2];
const password = process.argv[3];
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.QA_CDP_PORT ?? 9398);
mkdirSync("shots-fase35", { recursive: true });

const profile = mkdtempSync(join(tmpdir(), "qa-jarvis-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--window-size=1440,1600", "about:blank"], { stdio: "ignore" });
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

const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId)).result?.result?.value;
const goto = async (url) => { await send("Page.navigate", { url }, sessionId); await new Promise((r) => setTimeout(r, 3500)); };

await goto(`${ORIGIN}/login`);
await evalJs(`(async () => { await fetch("/api/auth/login", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(${JSON.stringify({ email, password })}) }); return true; })()`);

await goto(`${ORIGIN}/jarvis`);
const bodyText = await evalJs("document.body.innerText");
check("pagina Jarvis aperta", bodyText.includes("Jarvis"));
check("stato servizio indicato", /attiv|disponibil|conness|pront/i.test(bodyText), bodyText.match(/Jarvis[^\n]{0,80}/)?.[0] ?? "");

// Invio di un messaggio reale
await evalJs(`(() => {
  const ta = document.querySelector('textarea');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, "Quante voci di memoria ci sono nel vault? Rispondi in una frase.");
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await new Promise((r) => setTimeout(r, 500));
const sent = await evalJs(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /invia|invio|send/i.test(b.textContent || '') || b.getAttribute('aria-label')?.toLowerCase().includes('inv'));
  if (!btn) return false;
  btn.click();
  return true;
})()`);
check("pulsante di invio presente e cliccato", sent === true);

let answer = "";
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  answer = await evalJs("document.body.innerText");
  if (/voci? di memoria|vault|1 voce|una voce/i.test(answer.split("Jarvis").slice(-1)[0] ?? "")) break;
}
check("risposta di Jarvis ricevuta", /voce|memoria|vault/i.test(answer), (answer.match(/.{0,60}(?:voce|memoria|vault).{0,60}/i)?.[0] ?? "").replace(/\n/g, " "));

const shot = await send("Page.captureScreenshot", { captureBeyondViewport: true }, sessionId);
if (shot.result?.data) {
  const fs = await import("node:fs");
  fs.writeFileSync("shots-fase35/jarvis-chat.png", Buffer.from(shot.result.data, "base64"));
  console.log("      screenshot: shots-fase35/jarvis-chat.png");
console.log("      bubble: " + String(await evalJs("JSON.stringify([...document.querySelectorAll('p.whitespace-pre-wrap')].map(e=>e.textContent))")).slice(0,400));
}

console.log(`\n${passed} superati, ${failed} falliti`);
ws.close(); chrome.kill();
process.exit(failed === 0 ? 0 : 1);
