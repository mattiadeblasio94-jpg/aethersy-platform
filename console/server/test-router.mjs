// Smoke test dell'AI Router: catalogo per capacita' + selezione automatica
// preferendo i gratuiti. Uso: node test-router.mjs
import { readFileSync } from "node:fs";

const env = readFileSync("C:/Users/PC/aethersy-infra/.env", "utf8");
const key = env.match(/^OPENROUTER_API_KEY=(.*)$/m)[1].trim();
process.env.OPENROUTER_API_KEY = key;
process.env.CONSOLE_SESSION_SECRET = "test-secret";

const { catalogFor, selectModel, chat } = await import("./dist/ai-router.js");

for (const cap of ["text", "image", "audio", "video"]) {
  const c = await catalogFor(cap);
  const sel = await selectModel(cap);
  console.log(
    `${cap.padEnd(6)} | ${String(c.models.length).padStart(3)} modelli | scelto: ${sel.id} (free=${sel.free})`,
  );
}

console.log("\n-- chat testo (modello auto) --");
const r = await chat({ capability: "text", prompt: "Reply with exactly: PONG" });
console.log("model:", r.model, "| latency:", r.latencyMs + "ms");
if (r.attempts.length) console.log("scartati:", r.attempts.map((a) => a.model).join(", "));
console.log("answer:", JSON.stringify(r.answer.trim().slice(0, 120)));
