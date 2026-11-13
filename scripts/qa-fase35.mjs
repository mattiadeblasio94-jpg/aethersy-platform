// QA Fase 35: pannello di controllo (admin), memoria vault, esenzione admin,
// proxy Jarvis e comportamento Wix dopo il fix della risoluzione del sito.
import { readFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "https://platform.aethersy.online";
const email = process.argv[2];
const password = process.argv[3];
if (!email || !password) {
  console.error("uso: node qa-fase35.mjs <email> <password>");
  process.exit(2);
}

let cookie = "";
let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}${detail ? " — " + detail : ""}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

async function call(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(cookie ? { cookie } : {}),
      ...(options.headers ?? {}),
    },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const raw of setCookie) {
    const first = raw.split(";")[0];
    if (first.includes("aethersy_session")) cookie = first;
  }
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

// 1. Login
const login = await call("/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
check("login", login.status === 200, `status ${login.status}`);

// 2. Sessione con flag admin
const session = await call("/api/auth/session");
check("sessione", session.status === 200, `status ${session.status}`);
const isAdmin = session.body?.isAdmin === true;
check("flag isAdmin nella sessione", isAdmin, `isAdmin=${session.body?.isAdmin}`);

// 3. Pannello admin
const overview = await call("/api/platform/admin/overview");
check("pannello admin raggiungibile", overview.status === 200, `status ${overview.status}`);
if (overview.status === 200) {
  const t = overview.body?.totals ?? {};
  check("pannello: utenti", typeof t.users === "number", `users=${t.users}`);
  check("pannello: richieste 30gg", typeof t.requests30d === "number", `requests=${t.requests30d}`);
  check("pannello: costo provider", typeof t.providerCostUsd === "number", `cost=${t.providerCostUsd}`);
  check("pannello: costo per utente presente", Array.isArray(overview.body?.topUsers), `users=${overview.body?.topUsers?.length ?? 0}`);
  check(
    "pannello: per-capacita' presente",
    Array.isArray(overview.body?.byCapability) && overview.body.byCapability.length > 0,
    `cap=${overview.body?.byCapability?.length ?? 0}`,
  );
} else if (overview.status === 403) {
  console.log("      (403: l'account di test non e' admin, il controllo admin resta valido per l'admin reale)");
}

// 4. Memoria: vault + grafo + creazione con path/wiki link
const memBefore = await call("/api/platform/memory?limit=5");
check("memoria listabile", memBefore.status === 200, `status ${memBefore.status}`);

const created = await call("/api/platform/memory", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    kind: "note",
    title: "QA vault Fase 35",
    content: "Nota di verifica con collegamento [[QA vault Fase 35]] e path nel vault.",
    path: "QA/fase-35-nota.md",
    tags: ["qa", "fase-35"],
  }),
});
check("memoria creata con path", created.status === 201, `status ${created.status} path=${created.body?.path}`);
check("memoria: wiki link estratto", (created.body?.links ?? []).length === 1, `links=${JSON.stringify(created.body?.links)}`);

const graph = await call("/api/platform/memory/graph");
check("grafo memoria", graph.status === 200, `status ${graph.status}`);
check(
  "grafo: nodi presenti",
  Array.isArray(graph.body?.nodes) && graph.body.nodes.length > 0,
  `nodes=${graph.body?.nodes?.length ?? 0}`,
);

const vault = await call("/api/platform/memory/vault");
check("export vault", vault.status === 200, `status ${vault.status}`);
check(
  "vault: file con path",
  Array.isArray(vault.body?.files) && vault.body.files.some((f) => f.path === "QA/fase-35-nota.md"),
  `files=${vault.body?.files?.length ?? 0}`,
);

if (created.body?.id) {
  const patched = await call(`/api/platform/memory/${created.body.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "Nota aggiornata [[Memoria]]" }),
  });
  check("memoria aggiornata", patched.status === 200, `status ${patched.status}`);
  check("memoria: link ricalcolato", (patched.body?.links ?? []).includes("Memoria"), `links=${JSON.stringify(patched.body?.links)}`);

  const deleted = await call(`/api/platform/memory/${created.body.id}`, { method: "DELETE" });
  check("memoria di QA rimossa", deleted.status === 200, `status ${deleted.status}`);
}

// 5. Jarvis: stato (non configurato su questo ambiente -> 503 esplicito)
const jarvis = await call("/api/platform/jarvis/status");
check("stato Jarvis risponde", jarvis.status === 200, `status ${jarvis.status}`);
check(
  "Jarvis: se non configurato lo dichiara",
  jarvis.status !== 200 || jarvis.body?.enabled === false,
  JSON.stringify(jarvis.body),
);

// 6. Wix: il sito configurato viene tentato per primo e l'errore e' leggibile
const wixStatus = await call("/api/platform/wix");
check("stato Wix", wixStatus.status === 200, `status ${wixStatus.status}`);
const wixBusiness = await call("/api/platform/wix/business");
if (wixBusiness.status === 200) {
  check("Wix business: snapshot", typeof wixBusiness.body?.snapshot?.productsCount === "number", `prodotti=${wixBusiness.body?.snapshot?.productsCount}`);
} else {
  check(
    "Wix business: errore con codice e hint",
    typeof wixBusiness.body?.code === "string" && typeof wixBusiness.body?.hint === "string",
    `${wixBusiness.body?.code}: ${wixBusiness.body?.message}`,
  );
}

console.log(`\n${passed} superati, ${failed} falliti`);
process.exit(failed === 0 ? 0 : 1);
