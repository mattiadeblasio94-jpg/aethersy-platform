// qa-ia-pages.mjs — verifica le rotte BFF consumate dalle pagine IA del
// platform (fase 19: obiettivi, memoria, inbox, agenda, calendario, competenze,
// membri, pagamenti, account). Non stampa cookie, token ne' payload sensibili:
// solo stato HTTP, forma del payload e conteggi.
//
// Uso (dentro il container console, che ha gia' l'env):
//   node qa-ia-pages.mjs <email> <password>
// Le credenziali arrivano come argomenti: nessun segreto nel repo.

const base = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("uso: node qa-ia-pages.mjs <email> <password>");
  process.exit(2);
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
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

async function get(path, expect) {
  const res = await fetch(`${base}${path}`, { headers: auth });
  const body = await res.json().catch(() => null);
  const shape = expect(body);
  check(path, res.status === 200 && shape.ok, `status ${res.status} · ${shape.detail}`);
  return body;
}

await get("/api/platform/goals", (b) => ({
  ok: Array.isArray(b),
  detail: `${Array.isArray(b) ? b.length : "non-array"} elementi`,
}));

await get("/api/platform/memory", (b) => ({
  ok: Array.isArray(b),
  detail: `${Array.isArray(b) ? b.length : "non-array"} elementi`,
}));

await get("/api/platform/business/catalog", (b) => ({
  ok: Array.isArray(b?.goalStatuses) && Array.isArray(b?.memoryKinds),
  detail: `${b?.goalStatuses?.length ?? 0} stati, ${b?.memoryKinds?.length ?? 0} tipi`,
}));

await get("/api/platform/roster", (b) => ({
  ok: Array.isArray(b),
  detail: `${Array.isArray(b) ? b.length : "non-array"} agenti`,
}));

await get("/api/platform/library", (b) => ({
  ok: Array.isArray(b?.inviti),
  detail: `inviti: ${b?.inviti?.length ?? 0}`,
}));

await get("/api/platform/account", (b) => ({
  ok: typeof b?.tenantId === "string" && typeof b?.plan === "string",
  detail: `piano ${b?.plan ?? "?"}, markup ${b?.markupBps ?? "?"} bps`,
}));

await get("/api/platform/faq", (b) => ({
  ok: Array.isArray(b?.faqs),
  detail: `${b?.faqs?.length ?? 0} FAQ`,
}));

await get("/api/platform/schedule", (b) => ({
  ok: Array.isArray(b),
  detail: `${Array.isArray(b) ? b.length : "non-array"} voci`,
}));

await get("/api/platform/social/scheduled", (b) => ({
  ok: Array.isArray(b),
  detail: `${Array.isArray(b) ? b.length : "non-array"} pianificati`,
}));

await get("/api/platform/social/posts", (b) => ({
  ok: Array.isArray(b),
  detail: `${Array.isArray(b) ? b.length : "non-array"} contenuti`,
}));

await get("/api/platform/social/summary", (b) => ({
  ok: typeof b?.totalPosts === "number",
  detail: `post ${b?.totalPosts ?? 0}, pianificati ${b?.totalScheduled ?? 0}`,
}));

await get("/api/platform/chat/conversations", (b) => ({
  ok: Array.isArray(b?.conversations),
  detail: `${b?.conversations?.length ?? 0} conversazioni`,
}));

await get("/api/platform/tasks", (b) => ({
  ok: Array.isArray(b),
  detail: `${Array.isArray(b) ? b.length : "non-array"} task`,
}));

await get("/api/ai/balance", (b) => ({
  ok: typeof b?.balance === "number",
  detail: `saldo ${b?.balance ?? 0}, riservato ${b?.reserved ?? 0}`,
}));

await get("/api/ai/usage?limit=5", (b) => ({
  ok: typeof b?.metering === "boolean" && Array.isArray(b?.events),
  detail: `${b?.events?.length ?? 0} eventi`,
}));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} controlli superati`);
process.exit(failed.length === 0 ? 0 : 1);
