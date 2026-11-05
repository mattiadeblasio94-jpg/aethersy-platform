// qa-ai-providers.mjs — verifica live dei provider AI del Console sul VPS.
//
// Uso (dentro il container console, che ha gia' l'env):
//   node qa-ai-providers.mjs <email> <password>
//
// Controlla: catalogo (NVIDIA + z.ai free), chat di default, chat forzata su
// z.ai (GLM Flash free) e generazione immagine (Venice -> Replicate -> fal.ai).
// Non stampa cookie ne' token.

const base = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("uso: node qa-ai-providers.mjs <email> <password>");
  process.exit(2);
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const login = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
if (login.status !== 200 || !cookie) {
  console.log(`FAIL login — status ${login.status}`);
  process.exit(1);
}
const auth = { cookie };

// --- Catalogo -----------------------------------------------------------------
const catalog = await fetch(`${base}/api/ai/catalog?capability=text`, { headers: auth });
const catalogBody = await catalog.json().catch(() => ({}));
const models = catalogBody.models ?? [];
const ids = models.map((m) => m?.id ?? "");
const hasNvidia = ids.some((id) => id.startsWith("nvidia/"));
const hasZai = ids.includes("glm-4.5-flash") || ids.includes("glm-4.7-flash");
check(
  "catalogo (NVIDIA + z.ai)",
  catalog.status === 200 && hasNvidia && hasZai,
  `status ${catalog.status} modelli ${models.length} nvidia=${hasNvidia} zai=${hasZai}`,
);

// --- Chat di default (NVIDIA, primo provider free) ---------------------------
const chat = await fetch(`${base}/api/ai/chat`, {
  method: "POST",
  headers: { "content-type": "application/json", ...auth },
  body: JSON.stringify({ prompt: "Rispondi in una parola: OK" }),
});
const chatBody = await chat.json().catch(() => ({}));
const answer = chatBody.answer ?? "";
check(
  "chat default (NVIDIA)",
  chat.status === 200 && typeof answer === "string" && answer.length > 0,
  `status ${chat.status} modello ${chatBody.model ?? "?"} risposta "${String(answer).slice(0, 60)}"`,
);

// --- Chat forzata su z.ai ------------------------------------------------------
const chatZai = await fetch(`${base}/api/ai/chat`, {
  method: "POST",
  headers: { "content-type": "application/json", ...auth },
  body: JSON.stringify({ prompt: "Rispondi solo: OK", model: "glm-4.5-flash" }),
});
const zaiBody = await chatZai.json().catch(() => ({}));
const zaiAnswer = zaiBody.answer ?? "";
check(
  "chat z.ai (glm-4.5-flash)",
  chatZai.status === 200 && typeof zaiAnswer === "string" && zaiAnswer.length > 0,
  `status ${chatZai.status} modello ${zaiBody.model ?? "?"} risposta "${String(zaiAnswer).slice(0, 60)}"`,
);

// --- Generazione immagine (Venice -> Replicate -> fal.ai) ---------------------
const img = await fetch(`${base}/api/ai/generate`, {
  method: "POST",
  headers: { "content-type": "application/json", ...auth },
  body: JSON.stringify({ capability: "img_out", prompt: "un cubo rosso su sfondo bianco" }),
});
const imgBody = await img.json().catch(() => ({}));
const images = imgBody.images ?? [];
check(
  "generazione immagine",
  img.status === 200 && images.length > 0,
  `status ${img.status} provider ${imgBody.provider ?? "?"} modello ${imgBody.model ?? "?"} immagini ${images.length} fallback ${imgBody.fallbackFrom ?? "-"}`,
);

// --- Saldo dopo ---------------------------------------------------------------
const balance = await fetch(`${base}/api/ai/balance`, { headers: auth });
const balanceBody = await balance.json().catch(() => ({}));
check("saldo crediti", balance.status === 200, `status ${balance.status} saldo ${balanceBody.balance ?? "?"}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} controlli superati`);
process.exit(failed.length === 0 ? 0 : 1);
