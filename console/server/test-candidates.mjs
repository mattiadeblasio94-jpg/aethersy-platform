import { readFileSync } from "node:fs";
const env = readFileSync("C:/Users/PC/aethersy-infra/.env", "utf8");
const key = env.match(/^OPENROUTER_API_KEY=(.*)$/m)[1].trim();

const candidates = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-lightning:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "dots-studio/dots-3-note-preview:free",
  "xingchen-agi/xing4.0-29b-a4b:free",
  "nvidia/nemotron-3.5-super-vl:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "recursive/flint-v1.0:free",
];

for (const m of candidates) {
  const t = Date.now();
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: m, messages: [{ role: "user", content: "Reply with exactly: PONG" }] }),
    });
    const b = await res.json();
    const ans = b?.choices?.[0]?.message?.content ?? b?.error?.message ?? "(vuoto)";
    console.log(`${res.ok ? "OK " : "ERR"} ${String(Date.now() - t).padStart(6)}ms  ${m}`);
    console.log(`      -> ${JSON.stringify(String(ans).trim().slice(0, 90))}`);
  } catch (e) {
    console.log(`EXC ${m}: ${e.message}`);
  }
}
