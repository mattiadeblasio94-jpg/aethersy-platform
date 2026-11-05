// qa-console-live.mjs — verifica end-to-end del Console sul VPS.
//
// Uso (dentro il container console, che ha gia' l'env):
//   node qa-console-live.mjs <email> <password>
//
// Controlla: login -> session -> saldo crediti -> chat LLM -> rotte builder.
// Non stampa cookie ne' token.

const base = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("uso: node qa-console-live.mjs <email> <password>");
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
check("login", login.status === 200 && cookie.length > 0, `status ${login.status}`);

if (!cookie) process.exit(1);
const auth = { cookie };

const session = await fetch(`${base}/api/auth/session`, { headers: auth });
const sessionBody = await session.json().catch(() => ({}));
check("session", session.status === 200 && Boolean(sessionBody.email), `status ${session.status}`);

const balance = await fetch(`${base}/api/ai/balance`, { headers: auth });
const balanceBody = await balance.json().catch(() => ({}));
check("saldo crediti", balance.status === 200, `status ${balance.status} saldo ${balanceBody.balance ?? "?"}`);

const chat = await fetch(`${base}/api/ai/chat`, {
  method: "POST",
  headers: { "content-type": "application/json", ...auth },
  body: JSON.stringify({ prompt: "Rispondi in una frase: cosa puoi fare?" }),
});
const chatBody = await chat.json().catch(() => ({}));
const answer = chatBody.answer ?? chatBody.reply ?? chatBody.content ?? chatBody.message ?? "";
check(
  "chat LLM",
  chat.status === 200 && typeof answer === "string" && answer.length > 0,
  `status ${chat.status} risposta ${String(answer).slice(0, 120)}`,
);

for (const path of [
  "/api/builder/projects",
  "/api/builder/credits/balance",
  "/api/builder/agents/available",
  "/api/builder/summary/daily",
]) {
  const res = await fetch(`${base}${path}`, { headers: auth });
  check(`builder ${path}`, res.status === 200, `status ${res.status}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} controlli superati`);
process.exit(failed.length === 0 ? 0 : 1);
