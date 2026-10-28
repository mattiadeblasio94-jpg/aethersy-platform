// Test end-to-end del "percorso pilota" (P0.7), OPT-IN.
//
// Verifica l'intera catena a consumo su un Postgres REALE, senza passare per
// HTTP e senza toccare i dati di produzione:
//
//   run aperto -> esecuzione task (metering flow_run) -> asset draft
//   -> submit -> decide (HITL) -> approva run -> consegna
//   -> pacchetto esportabile -> credenziali cifrate -> lead + notifica -> funnel
//
// Come si esegue (sul VPS, contro un database temporaneo):
//
//   docker compose exec -T postgres psql -U "$AP_POSTGRES_USERNAME" \
//     -c 'CREATE DATABASE console_e2e;'
//   docker compose run --rm --no-deps \
//     -e E2E_CONFIRM=1 -e CONSOLE_PGDATABASE=console_e2e \
//     -v "$PWD/console/server/tools:/tools:ro" \
//     console node /tools/test-e2e-pilot.mjs
//   docker compose exec -T postgres psql -U "$AP_POSTGRES_USERNAME" \
//     -c 'DROP DATABASE console_e2e WITH (FORCE);'
//
// Sicurezza: senza `E2E_CONFIRM=1` lo script esce con SKIP. Le migrazioni sono
// idempotenti e girano SOLO sul database indicato da `CONSOLE_PGDATABASE`, ma il
// test scrive tenant/run/lead di prova: usare un DB dedicato.

process.env.CONSOLE_SESSION_SECRET ??= "e2e-session";
process.env.OPENROUTER_API_KEY ??= "e2e-key";
// Chiave di cifratura di prova: solo per il DB temporaneo del test.
process.env.CONSOLE_SECRETS_KEY ??= "e2e-secrets-key-not-for-production";

const CONFIRMED = process.env.E2E_CONFIRM === "1";
const DIST = process.env.E2E_DIST ?? "/app/dist";

let passed = 0;
const failures = [];

function record(name, fn) {
  try {
    const out = fn();
    passed += 1;
    console.log(`  ok   ${name}`);
    return out;
  } catch (err) {
    failures.push({ name, message: err.message });
    console.log(`  FAIL ${name}: ${err.message}`);
    return undefined;
  }
}

async function recordAsync(name, fn) {
  try {
    const out = await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
    return out;
  } catch (err) {
    failures.push({ name, message: err.message });
    console.log(`  FAIL ${name}: ${err.message}`);
    return undefined;
  }
}

function eq(actual, expected, label = "valore") {
  if (actual !== expected) throw new Error(`${label}: atteso ${expected}, ottenuto ${actual}`);
}

function ok(value, label = "valore") {
  if (!value) throw new Error(`${label}: atteso truthy`);
}

if (!CONFIRMED) {
  console.log("SKIP: test E2E non confermato (imposta E2E_CONFIRM=1). Nessun DB toccato.");
  process.exit(0);
}

const database = process.env.CONSOLE_PGDATABASE ?? "";
if (!database) {
  console.error("ERRORE: CONSOLE_PGDATABASE non impostato.");
  process.exit(2);
}
if (database === "activepieces" || database === process.env.AP_POSTGRES_DATABASE) {
  console.error("ERRORE: rifiuto di eseguire sul database Activepieces. Usa un DB temporaneo.");
  process.exit(2);
}

// Canale outbound finto: intercetta il POST del notificatore senza Slack reale.
// Va avviato PRIMA di importare `config.ts` (che legge SLACK_WEBHOOK_URL).
const http = await import("node:http");
const received = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    received.push({ url: req.url, body });
    res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
process.env.SLACK_WEBHOOK_URL = `http://127.0.0.1:${port}/hook`;

const { hasDbConfig } = await import(`${DIST}/config.js`);
const { migrateMetering } = await import(`${DIST}/metering/migrate.js`);
const { migratePipeline } = await import(`${DIST}/pipeline/migrate.js`);
const { closePool, meteringActive } = await import(`${DIST}/metering/db.js`);
const metering = await import(`${DIST}/metering/repo.js`);
const catalog = await import(`${DIST}/pipeline/catalog.js`);
const repo = await import(`${DIST}/pipeline/repo.js`);
const orchestrator = await import(`${DIST}/pipeline/orchestrator.js`);
const notify = await import(`${DIST}/pipeline/notify.js`);
const secrets = await import(`${DIST}/pipeline/secrets.js`);
const pkgMod = await import(`${DIST}/pipeline/package.js`);

console.log(`database: ${database}`);
console.log(`canale outbound finto: 127.0.0.1:${port}`);
console.log("");

try {
  // ---------------------------------------------------------------- schema ----
  console.log("schema e metering");

  await recordAsync("Postgres configurato e metering attivo", async () => {
    ok(hasDbConfig(), "hasDbConfig");
    ok(meteringActive(), "meteringActive");
  });

  await recordAsync("migrazione metering", async () => {
    const res = await migrateMetering();
    ok(res.applied, "applicata");
  });

  await recordAsync("migrazione pipeline", async () => {
    const res = await migratePipeline();
    ok(res.applied, "applicata");
  });

  await recordAsync("le migrazioni sono idempotenti", async () => {
    eq((await migrateMetering()).applied, false, "metering al secondo giro");
    eq((await migratePipeline()).applied, false, "pipeline al secondo giro");
  });

  // ---------------------------------------------------------------- tenant ----
  console.log("\ntenant e credito");

  const email = `e2e-${Date.now()}@aethersy.test`;
  const tenant = await recordAsync("provisioning tenant dal primo accesso", async () => {
    const t = await metering.ensureTenantForEmail(email, { name: "E2E Pilot", initialCredits: 0 });
    ok(t.tenantId, "tenantId");
    eq(t.plan, "free", "piano");
    return t;
  });

  if (!tenant) throw new Error("tenant non creato: impossibile proseguire");

  await recordAsync("saldo iniziale a zero", async () => {
    const snap = await metering.balanceSnapshot(tenant.tenantId);
    eq(snap.balance, 0, "balance");
    eq(snap.available, 0, "available");
  });

  await recordAsync("top-up accredita il saldo", async () => {
    eq(await metering.topupCredits(tenant.tenantId, 5000, "e2e topup"), 5000, "balance");
  });

  await recordAsync("balance snapshot coerente", async () => {
    const snap = await metering.balanceSnapshot(tenant.tenantId);
    eq(snap.balance, 5000, "balance");
    eq(snap.reserved, 0, "reserved");
    eq(snap.available, 5000, "available");
  });

  // ------------------------------------------------------------------ run -----
  console.log("\nrun di pipeline");

  const spec = catalog.STAGES.find((s) => s.id === "brand");
  ok(spec, "stadio brand nel catalogo");

  const run = await recordAsync("apertura run con i task pianificati", async () => {
    const r = await orchestrator.openRun({
      tenantId: tenant.tenantId,
      stage: "brand",
      title: "E2E brand run",
      brief: { client: "Aethersy E2E", goal: "verifica percorso pilota" },
    });
    eq(r.status, "draft", "stato iniziale");
    const tasks = await repo.listTasks(tenant.tenantId, r.id);
    eq(tasks.length, spec.tasks.length, "numero task");
    eq(tasks[0].droid, spec.tasks[0].droid, "primo droid");
    return r;
  });

  if (!run) throw new Error("run non creato: impossibile proseguire");

  await recordAsync("approvazione non ammessa in draft", async () => {
    eq(await orchestrator.approveRun(tenant.tenantId, run.id, "e2e"), null, "approveRun su draft");
  });

  await recordAsync("esecuzione dei task con metering flow_run", async () => {
    const result = await orchestrator.orchestrateRun(
      tenant.tenantId,
      run.id,
      async (ctx) => ({
        status: "done",
        output: { stage: ctx.stage.id, droid: ctx.task.droid, ok: true },
        assets: [
          ctx.task.seq === 1
            ? {
                kind: spec.deliverables[0].kind,
                name: spec.deliverables[0].name,
                storageKey: `e2e/${run.id}/${spec.deliverables[0].name}`,
                mime: "image/png",
                meta: { generatedBy: ctx.task.droid },
              }
            : {
                kind: "document",
                name: `artifact-${ctx.task.seq}.md`,
                storageKey: `e2e/${run.id}/artifact-${ctx.task.seq}.md`,
                mime: "text/markdown",
              },
        ],
      }),
      { meter: true },
    );
    eq(result.failed, false, "failed");
    eq(result.outcomes.length, spec.tasks.length, "task eseguiti");
    ok(result.credits > 0, "crediti di orchestrazione addebitati");
    eq(result.run.status, "in_review", "stato del run");
    return result;
  });

  await recordAsync("ogni task ha un flow_run_id", async () => {
    const tasks = await repo.listTasks(tenant.tenantId, run.id);
    ok(tasks.every((t) => t.flow_run_id), "flow_run_id valorizzato");
    ok(tasks.every((t) => t.status === "done"), "tutti done");
  });

  await recordAsync("gli asset sono registrati in versione 1", async () => {
    const assets = await repo.listAssets(tenant.tenantId, { runId: run.id });
    eq(assets.length, spec.tasks.length, "un asset per task");
    ok(assets.every((a) => a.version === 1), "version 1");
    ok(assets.every((a) => a.status === "draft"), "stato draft");
  });

  await recordAsync("il consumo del run e' attribuito", async () => {
    const usage = await repo.runUsageSummary(tenant.tenantId, run.id);
    ok(usage.totals.credits > 0, "crediti aggregati");
    ok(usage.byCapability.some((r) => r.capability === "flow_run"), "capability flow_run");
  });

  // ------------------------------------------------------------- HITL asset ---
  console.log("\nHITL sugli asset");

  const assets = await repo.listAssets(tenant.tenantId, { runId: run.id });
  const target = assets.find((a) => a.name === spec.deliverables[0].name) ?? assets[0];

  await recordAsync("la decisione su un asset draft non e' ammessa", async () => {
    eq(await repo.decideAsset(tenant.tenantId, target.id, "approved", "e2e"), null, "decideAsset su draft");
  });

  await recordAsync("submit porta l'asset in revisione", async () => {
    const a = await repo.transitionAsset(tenant.tenantId, target.id, "in_review", { by: "e2e" });
    ok(a, "asset in revisione");
    eq(a.status, "in_review", "status");
  });

  await recordAsync("submit due volte non e' ammesso", async () => {
    eq(await repo.transitionAsset(tenant.tenantId, target.id, "in_review", { by: "e2e" }), null, "secondo submit");
  });

  await recordAsync("approvazione dell'asset", async () => {
    const a = await repo.decideAsset(tenant.tenantId, target.id, "approved", "e2e@aethersy.test");
    ok(a, "asset approvato");
    eq(a.status, "approved", "status");
    eq(a.approved_by, "e2e@aethersy.test", "approved_by");
  });

  await recordAsync("la famiglia di versione espone la versione approvata", async () => {
    const versions = await repo.listAssetVersions(tenant.tenantId, target.id);
    ok(versions.length >= 1, "almeno una versione");
    const approved = catalog.approvedVersion(versions);
    ok(approved, "versione approvata presente");
    eq(approved.id, target.id, "id approvato");
  });

  // ------------------------------------------------------ approvazione/consegna
  console.log("\napprovazione e consegna");

  await recordAsync("approvazione del run (HITL)", async () => {
    const r = await orchestrator.approveRun(tenant.tenantId, run.id, "e2e@aethersy.test");
    ok(r, "run approvato");
    eq(r.status, "approved", "status");
    eq(r.approved_by, "e2e@aethersy.test", "approved_by");
  });

  await recordAsync("consegna del run e degli asset approvati", async () => {
    const r = await orchestrator.deliverRun(tenant.tenantId, run.id);
    ok(r, "run consegnato");
    eq(r.status, "delivered", "status");
    const delivered = await repo.listAssets(tenant.tenantId, { runId: run.id, status: "delivered" });
    eq(delivered.length, 1, "asset approvati consegnati");
  });

  await recordAsync("consegna doppia non e' ammessa", async () => {
    eq(await orchestrator.deliverRun(tenant.tenantId, run.id), null, "seconda consegna");
  });

  await recordAsync("notifica di consegna inviata al canale", async () => {
    const delivered = await repo.getRun(tenant.tenantId, run.id);
    ok(delivered, "run leggibile");
    const res = await notify.notifyRunDelivered(tenant.tenantId, delivered);
    ok(res.sent, "notifica inviata");
    eq(res.channel, "env", "canale di stack");
    ok(received.some((r) => r.url === "/hook"), "colpito il webhook di stack");
  });

  // --------------------------------------------------------------- pacchetto --
  console.log("\npacchetto esportabile");

  await recordAsync("il pacchetto contiene solo i deliverable approvati", async () => {
    const p = await pkgMod.buildRunPackage(tenant.tenantId, run.id);
    ok(p, "pacchetto costruito");
    eq(p.format, "aethersy.run-package/v1", "format");
    eq(p.run.status, "delivered", "stato run");
    eq(p.deliverables.length, 1, "deliverable inclusi");
    eq(p.deliverables[0].name, target.name, "nome deliverable");
    eq(p.deliverables[0].status, "delivered", "stato deliverable");
    ok(p.deliverables[0].storageKey, "storageKey");
    ok(p.usage.credits > 0, "consumo aggregato");
  });

  await recordAsync("il pacchetto non esiste per un run inesistente", async () => {
    eq(
      await pkgMod.buildRunPackage(tenant.tenantId, "00000000-0000-0000-0000-000000000000"),
      null,
      "pacchetto assente",
    );
  });

  record("il nome file e' deterministico", () => {
    const name = pkgMod.runPackageFilename({ id: run.id, stage: run.stage });
    eq(name, `run-brand-${run.id.slice(0, 8)}.json`, "filename");
  });

  // ------------------------------------------------------------- integrazioni
  console.log("\ncredenziali e cifratura");

  await recordAsync("segreti cifrati a riposo e decifrabili", async () => {
    ok(secrets.hasSecretsKey(), "chiave presente");
    const blob = secrets.encryptSecret("xoxb-e2e-token");
    ok(blob.startsWith("v1:"), "prefisso versione");
    eq(secrets.decryptSecret(blob), "xoxb-e2e-token", "round-trip");
  });

  const cred = await recordAsync("salvataggio credenziale di integrazione", async () => {
    const saved = await repo.saveIntegrationCredential({
      tenantId: tenant.tenantId,
      provider: "slack",
      kind: "webhook",
      label: "e2e",
      secretEnc: secrets.encryptSecret(`http://127.0.0.1:${port}/tenant-hook`),
    });
    ok(saved.id, "id credenziale");
    return saved;
  });

  await recordAsync("l'elenco non espone il segreto cifrato", async () => {
    const list = await repo.listIntegrationCredentials(tenant.tenantId);
    ok(list.length >= 1, "almeno una credenziale");
    ok(list.every((c) => !("secret_enc" in c)), "nessun secret_enc");
  });

  await recordAsync("la credenziale del tenant vince sul fallback di stack", async () => {
    const found = await repo.findActiveIntegrationCredential(tenant.tenantId, "slack");
    ok(found, "credenziale attiva");
    ok(secrets.decryptSecret(found.secret_enc).includes("/tenant-hook"), "url del tenant");
    const res = await notify.notifyText(tenant.tenantId, "prova canale tenant");
    ok(res.sent, "invio riuscito");
    eq(res.channel, "tenant", "canale tenant");
    ok(received.some((r) => r.url === "/tenant-hook"), "colpito il webhook del tenant");
  });

  await recordAsync("revoca della credenziale", async () => {
    ok(cred && (await repo.revokeIntegrationCredential(tenant.tenantId, cred.id)), "revoca applicata");
    eq(await repo.findActiveIntegrationCredential(tenant.tenantId, "slack"), null, "nessuna attiva");
  });

  await recordAsync("dopo la revoca si torna al canale di stack", async () => {
    eq((await notify.notifyText(tenant.tenantId, "prova fallback")).channel, "env", "canale di stack");
  });

  // -------------------------------------------------------------------- lead --
  console.log("\nlead e funnel");

  const lead = await recordAsync("creazione lead e notifica outbound", async () => {
    const created = await repo.createLead({
      tenantId: tenant.tenantId,
      runId: run.id,
      source: "website",
      name: "Mario E2E",
      email: "mario@example.test",
      message: "vorrei un preventivo",
      utm: { source: "e2e" },
      payload: { form: "e2e" },
    });
    ok(created.id, "id lead");

    const row = await repo.getLead(tenant.tenantId, created.id);
    ok(row, "lead leggibile");
    eq(row.status, "new", "stato iniziale");
    eq(row.notified_at, null, "non ancora notificato");

    const res = await notify.notifyLeadCreated(tenant.tenantId, row);
    ok(res.sent, "notifica inviata");
    await repo.markLeadNotified(tenant.tenantId, created.id);
    const after = await repo.getLead(tenant.tenantId, created.id);
    ok(after.notified_at, "notified_at valorizzato");
    return after;
  });

  record("il testo di notifica riporta il contatto", () => {
    const text = notify.leadNotificationText(lead);
    ok(text.includes("mario@example.test"), "email nel testo");
    ok(text.includes("website"), "origine nel testo");
  });

  await recordAsync("transizione ammessa new -> contacted", async () => {
    const updated = await repo.updateLeadStatus(tenant.tenantId, lead.id, "contacted");
    ok(updated, "lead aggiornato");
    eq(updated.status, "contacted", "status");
  });

  await recordAsync("transizione non ammessa contacted -> new", async () => {
    eq(await repo.updateLeadStatus(tenant.tenantId, lead.id, "new"), null, "transizione rifiutata");
  });

  await recordAsync("funnel fino a won e terminalita'", async () => {
    const q = await repo.updateLeadStatus(tenant.tenantId, lead.id, "qualified");
    ok(q, "qualified");
    const w = await repo.updateLeadStatus(tenant.tenantId, lead.id, "won");
    ok(w, "won");
    eq(await repo.updateLeadStatus(tenant.tenantId, lead.id, "contacted"), null, "won e' terminale");
  });

  await recordAsync("conteggi per stato", async () => {
    const counts = await repo.leadStatusCounts(tenant.tenantId);
    eq(counts.find((c) => c.status === "won")?.count, 1, "un lead won");
  });

  await recordAsync("filtro per stato", async () => {
    eq((await repo.listLeads(tenant.tenantId, { status: "won" })).length, 1, "un lead won");
    eq((await repo.listLeads(tenant.tenantId, { status: "spam" })).length, 0, "nessuno spam");
  });

  // ------------------------------------------------------------- isolamento ---
  console.log("\nisolamento fra tenant");

  await recordAsync("un altro tenant non vede run, lead e pacchetto", async () => {
    const other = await metering.ensureTenantForEmail(`e2e-other-${Date.now()}@aethersy.test`, {
      name: "E2E Other",
    });
    eq(await repo.getRun(other.tenantId, run.id), null, "run invisibile");
    eq(await repo.getLead(other.tenantId, lead.id), null, "lead invisibile");
    eq(await pkgMod.buildRunPackage(other.tenantId, run.id), null, "pacchetto invisibile");
  });

  await recordAsync("consumo registrato negli ultimi eventi", async () => {
    const events = await metering.recentUsage(tenant.tenantId, 50);
    ok(events.length > 0, "eventi presenti");
    ok(events.every((e) => e.credits !== undefined), "crediti sugli eventi");
  });
} catch (err) {
  failures.push({ name: "esecuzione", message: err.message });
  console.log(`  FAIL esecuzione: ${err.message}`);
} finally {
  server.close();
  await closePool().catch(() => {});
}

console.log("");
console.log(`${passed} ok, ${failures.length} falliti`);
if (failures.length) {
  for (const f of failures) console.log(`- ${f.name}: ${f.message}`);
  process.exit(1);
}
process.exit(0);
