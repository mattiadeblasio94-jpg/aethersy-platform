import { readFileSync } from "node:fs";
const env = readFileSync("C:/Users/PC/aethersy-infra/.env", "utf8");
process.env.OPENROUTER_API_KEY = env.match(/^OPENROUTER_API_KEY=(.*)$/m)[1].trim();
process.env.CONSOLE_SESSION_SECRET = "test";

const { chat } = await import("./dist/ai-router.js");

// Immagine pubblica: il logo Aethersy servito dall'app.
const img = "https://app.aethersy.online/brand/full-logo.png";
console.log("-- image -> text --");
const r = await chat({
  capability: "image",
  prompt: "Descrivi questa immagine in una frase.",
  fileUrl: img,
});
console.log("model:", r.model, "| latency:", r.latencyMs + "ms");
if (r.attempts.length) console.log("scartati:", r.attempts.map((a) => `${a.model}(${a.error.slice(0,40)})`).join(", "));
console.log("answer:", JSON.stringify(r.answer.trim().slice(0, 200)));
