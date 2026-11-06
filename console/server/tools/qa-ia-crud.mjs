// qa-ia-crud.mjs — verifica le scritture delle pagine IA (fase 19):
// creazione/modifica/eliminazione di un obiettivo e di una voce di memoria,
// piu' pausa/riattivazione di una voce di agenda se esiste. Le righe create
// vengono eliminate a fine test.
//
// Uso (dentro il container console, che ha gia' l'env):
//   node qa-ia-crud.mjs <email> <password>
// Le credenziali arrivano come argomenti: nessun segreto nel repo.

const base = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const email = process.argv[2];
const password = process.argv[3];

const login = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
if (!cookie) {
  console.error("login fallito");
  process.exit(1);
}
const auth = { cookie, "content-type": "application/json" };

async function call(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: auth,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

const stamp = Date.now();
let failed = 0;
function check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// --- Obiettivo: create -> patch -> delete -----------------------------------
const created = await call("POST", "/api/platform/goals", {
  title: `QA fase 19 ${stamp}`,
  description: "Verifica CRUD pagina Obiettivi",
  metric: "1",
  priority: 2,
  status: "active",
});
check("POST /api/platform/goals", created.status >= 200 && created.status < 300 && Boolean(created.body?.id), `status ${created.status}`);
const goalId = created.body?.id;

if (goalId) {
  const patched = await call("PATCH", `/api/platform/goals/${goalId}`, { status: "achieved" });
  check("PATCH /api/platform/goals/:id", patched.status === 200 && patched.body?.status === "achieved", `status ${patched.status}`);
  const deleted = await call("DELETE", `/api/platform/goals/${goalId}`);
  check("DELETE /api/platform/goals/:id", deleted.status === 200 && deleted.body?.ok === true, `status ${deleted.status}`);
}

// --- Memoria: create (content obbligatorio) -> pin -> delete -----------------
const memCreated = await call("POST", "/api/platform/memory", {
  kind: "note",
  title: `QA fase 19 ${stamp}`,
  content: "Verifica CRUD pagina Memoria",
  source: "qa",
});
check("POST /api/platform/memory", memCreated.status >= 200 && memCreated.status < 300 && Boolean(memCreated.body?.id), `status ${memCreated.status}`);
const memId = memCreated.body?.id;

if (memId) {
  const pinned = await call("PATCH", `/api/platform/memory/${memId}`, { pinned: true });
  check("PATCH /api/platform/memory/:id", pinned.status === 200 && pinned.body?.pinned === true, `status ${pinned.status}`);
  const memDeleted = await call("DELETE", `/api/platform/memory/${memId}`);
  check("DELETE /api/platform/memory/:id", memDeleted.status === 200 && memDeleted.body?.ok === true, `status ${memDeleted.status}`);
}

// --- Memoria senza content: il server deve rifiutare (400) ------------------
const invalid = await call("POST", "/api/platform/memory", { kind: "note", title: "senza contenuto" });
check("POST /api/platform/memory senza content -> 400", invalid.status === 400, `status ${invalid.status}`);

// --- Agenda: pausa/riattivazione se esiste una voce -------------------------
const schedule = await call("GET", "/api/platform/schedule");
const first = Array.isArray(schedule.body) ? schedule.body[0] : null;
if (first) {
  const paused = await call("PATCH", `/api/platform/schedule/${first.id}`, { status: "paused" });
  check("PATCH /api/platform/schedule/:id (pausa)", paused.status === 200 && paused.body?.status === "paused", `status ${paused.status}`);
  const resumed = await call("PATCH", `/api/platform/schedule/${first.id}`, { status: "scheduled" });
  check("PATCH /api/platform/schedule/:id (riattiva)", resumed.status === 200 && resumed.body?.status === "scheduled", `status ${resumed.status}`);
} else {
  console.log("SKIP agenda — nessuna voce presente");
}

console.log(failed === 0 ? "\nCRUD: tutti i controlli superati" : `\nCRUD: ${failed} controlli falliti`);
process.exit(failed === 0 ? 0 : 1);
