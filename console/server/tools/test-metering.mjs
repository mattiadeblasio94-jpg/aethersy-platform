// Test del motore di metering (nessuna dipendenza esterna, nessun DB).
//
// Esegue asserzioni pure sul motore di prezzo e sul matching dei pattern di
// modello. Non tocca Postgres/Redis: serve come guardrail rapido in CI/locale
// prima di ogni commit che modifica `metering/`.
//
//   npm run test:metering

// Config richiesta da `config.ts` (importato transitivamente da repo.ts).
process.env.CONSOLE_SESSION_SECRET ??= "test";
process.env.OPENROUTER_API_KEY ??= "test";

const { computePrice, creditsFromEur, marginFromMarkup, markupForMargin } = await import(
  "../src/metering/price.ts"
);
const { patternScore } = await import("../src/metering/pattern.ts");

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.log(`  FAIL ${name}: ${err.message}`);
  }
}

function eq(actual, expected, label = "") {
  if (actual !== expected) {
    throw new Error(`${label} atteso ${expected}, ottenuto ${actual}`);
  }
}

function near(actual, expected, tol = 1e-9, label = "") {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${label} atteso ~${expected}, ottenuto ${actual}`);
  }
}

const CREDIT_UNIT = 0.0001; // 1 credito = 0,0001 EUR
const FX = 0.92;
const MARKUP = 15000; // 150% -> margine 60%

console.log("price.ts");

check("token: costo per 1M diviso 1e6", () => {
  const bd = computePrice({
    capability: "text",
    unit: "token_in",
    units: 1_000_000,
    unitPriceUsd: 0.5,
    fxUsdEur: FX,
    markupBps: 0,
    creditUnit: CREDIT_UNIT,
  });
  near(bd.providerCostUsd, 0.5, 1e-12, "providerCostUsd");
  near(bd.providerCostEur, 0.5 * FX, 1e-12, "providerCostEur");
});

check("caratteri: prezzo per 1M diviso 1e6", () => {
  const bd = computePrice({
    capability: "tts",
    unit: "char",
    units: 500_000,
    unitPriceUsd: 3.5,
    fxUsdEur: FX,
    markupBps: MARKUP,
    creditUnit: CREDIT_UNIT,
  });
  const expectedEur = ((3.5 * 500_000) / 1e6) * FX * (1 + MARKUP / 10_000);
  near(bd.priceEur, expectedEur, 1e-12, "priceEur");
});

check("immagine: prezzo per unita' (nessuna divisione)", () => {
  const bd = computePrice({
    capability: "img_out",
    unit: "image",
    units: 2,
    unitPriceUsd: 0.05,
    fxUsdEur: FX,
    markupBps: 0,
    creditUnit: CREDIT_UNIT,
  });
  near(bd.providerCostUsd, 0.1, 1e-12, "providerCostUsd");
});

check("markup applicato al costo provider", () => {
  const bd = computePrice({
    capability: "text",
    unit: "token_in",
    units: 1_000_000,
    unitPriceUsd: 1,
    fxUsdEur: 1,
    markupBps: 15000,
    creditUnit: CREDIT_UNIT,
  });
  near(bd.priceEur, 2.5, 1e-12, "priceEur (1 EUR * 2,5)");
});

check("crediti = round(prezzo / credit_unit)", () => {
  const bd = computePrice({
    capability: "text",
    unit: "token_in",
    units: 1_000_000,
    unitPriceUsd: 1,
    fxUsdEur: 1,
    markupBps: 0,
    creditUnit: CREDIT_UNIT,
  });
  eq(bd.credits, 10_000, "credits");
});

check("prezzo > 0 -> almeno 1 credito", () => {
  const bd = computePrice({
    capability: "text",
    unit: "token_in",
    units: 1,
    unitPriceUsd: 0.0001,
    fxUsdEur: 1,
    markupBps: 0,
    creditUnit: CREDIT_UNIT,
  });
  eq(bd.credits, 1, "credits minimi");
});

check("prezzo 0 (modello gratuito) -> 0 crediti", () => {
  const bd = computePrice({
    capability: "text",
    unit: "token_in",
    units: 1_000_000,
    unitPriceUsd: 0,
    fxUsdEur: FX,
    markupBps: MARKUP,
    creditUnit: CREDIT_UNIT,
  });
  eq(bd.credits, 0, "credits");
});

check("minCredits forza il minimo quando il prezzo e' > 0", () => {
  eq(creditsFromEur(0.00001, CREDIT_UNIT, 5), 5, "minCredits");
  eq(creditsFromEur(0, CREDIT_UNIT, 5), 0, "prezzo nullo");
});

check("credit_unit non valida -> errore", () => {
  let threw = false;
  try {
    creditsFromEur(1, 0);
  } catch {
    threw = true;
  }
  eq(threw, true, "deve lanciare");
});

check("marginFromMarkup: 150% -> 60%", () => {
  near(marginFromMarkup(15000), 0.6, 1e-12, "margin");
});

check("markupForMargin: 60% -> 15000 bps", () => {
  eq(markupForMargin(0.6), 15000, "markup bps");
});

check("markupForMargin: margine fuori range -> errore", () => {
  let threw = false;
  try {
    markupForMargin(1.5);
  } catch {
    threw = true;
  }
  eq(threw, true, "deve lanciare");
});

console.log("pattern.ts — patternScore");

check("match esatto e' il piu' specifico", () => {
  const exact = patternScore("venice-sd35", "venice-sd35");
  const wildcard = patternScore("*", "venice-sd35");
  eq(exact > wildcard, true, "exact > wildcard");
});

check("prefisso 'openai/*' corrisponde e batte la wildcard", () => {
  const prefix = patternScore("openai/*", "openai/gpt-4o-mini");
  eq(prefix > patternScore("*", "openai/gpt-4o-mini"), true, "prefisso > wildcard");
  eq(prefix !== null, true, "prefisso non null");
});

check("prefisso non corrispondente -> null", () => {
  eq(patternScore("openai/*", "anthropic/claude"), null, "deve essere null");
});

check("wildcard interna '*:free' funziona", () => {
  eq(patternScore("*:free", "google/gemma:free") !== null, true, "match");
  eq(patternScore("*:free", "google/gemma"), null, "no match");
});

check("wildcard universale corrisponde a tutto", () => {
  eq(patternScore("*", "qualsiasi/modello"), 1, "score");
});

check("pattern letterale non corrispondente -> null", () => {
  eq(patternScore("venice-sd35", "flux-2-pro"), null, "deve essere null");
});

check("precedenza: exact > prefisso > wildcard", () => {
  const model = "openai/gpt-4o-mini";
  const s1 = patternScore(model, model);
  const s2 = patternScore("openai/*", model);
  const s3 = patternScore("*", model);
  eq(s1 > s2 && s2 > s3, true, `ordinamento ${s1} > ${s2} > ${s3}`);
});

// --- pipeline/catalog.ts (macchina a stati + catalogo stadi) ------------------
const { STAGES, stageSpec, canTransitionRun, nextRunStatus, isRunTerminal, derivedRunStatus } =
  await import("../src/pipeline/catalog.ts");

console.log("pipeline/catalog.ts");

check("P0: 4 stadi con ordine 3..6 e id unici", () => {
  eq(STAGES.length, 4, "numero stadi");
  const ids = STAGES.map((s) => s.id);
  eq(new Set(ids).size, 4, "id unici");
  eq(
    STAGES.every((s) => s.order >= 3 && s.order <= 6),
    true,
    "ordini",
  );
});

check("ogni stadio ha task, droids e deliverable", () => {
  for (const s of STAGES) {
    eq(s.tasks.length > 0, true, `${s.id} tasks`);
    eq(s.droids.length > 0, true, `${s.id} droids`);
    eq(s.deliverables.length > 0, true, `${s.id} deliverables`);
  }
});

check("stageSpec risolve gli id noti e ignora gli sconosciuti", () => {
  eq(stageSpec("brand")?.title, "Brand", "brand");
  eq(stageSpec("social")?.title, "Social media", "social");
  eq(stageSpec("idea"), null, "stadi P1 non in P0");
});

check("transizioni run ammesse nel percorso felice", () => {
  eq(canTransitionRun("draft", "in_progress"), true, "draft->in_progress");
  eq(canTransitionRun("in_progress", "in_review"), true, "in_progress->in_review");
  eq(canTransitionRun("in_review", "approved"), true, "in_review->approved");
  eq(canTransitionRun("approved", "delivered"), true, "approved->delivered");
});

check("transizioni non ammesse rifiutate", () => {
  eq(canTransitionRun("draft", "approved"), false, "draft->approved");
  eq(canTransitionRun("delivered", "in_progress"), false, "delivered e' terminale");
  eq(canTransitionRun("in_review", "delivered"), false, "no salto approvazione");
});

check("nextRunStatus salta lo stato di errore", () => {
  eq(nextRunStatus("draft"), "in_progress", "draft");
  eq(nextRunStatus("delivered"), null, "terminale");
});

check("isRunTerminal solo su delivered", () => {
  eq(isRunTerminal("delivered"), true, "delivered");
  eq(isRunTerminal("failed"), false, "failed ammette retry");
  eq(isRunTerminal("in_progress"), false, "in_progress");
});

check("derivedRunStatus dai task", () => {
  eq(derivedRunStatus([]), "draft", "nessun task");
  eq(derivedRunStatus([{ status: "pending" }]), "draft", "tutti pending");
  eq(derivedRunStatus([{ status: "running" }]), "in_progress", "in esecuzione");
  eq(derivedRunStatus([{ status: "done" }]), "in_review", "tutti done");
  eq(
    derivedRunStatus([{ status: "done" }, { status: "skipped" }]),
    "in_review",
    "done+skipped",
  );
  eq(derivedRunStatus([{ status: "failed" }]), "failed", "fallimento");
});

// --- pipeline/catalog.ts (macchina a stati degli asset, P0.4) -----------------
const {
  canTransitionAsset,
  isAssetDecidable,
  isAssetAccepted,
  assetFamilyKey,
  approvedVersion,
} = await import("../src/pipeline/catalog.ts");

console.log("pipeline/catalog.ts — asset");

check("transizioni asset ammesse nel percorso felice", () => {
  eq(canTransitionAsset("draft", "in_review"), true, "draft->in_review");
  eq(canTransitionAsset("in_review", "approved"), true, "in_review->approved");
  eq(canTransitionAsset("in_review", "rejected"), true, "in_review->rejected");
  eq(canTransitionAsset("approved", "delivered"), true, "approved->delivered");
});

check("transizioni asset non ammesse rifiutate", () => {
  eq(canTransitionAsset("draft", "approved"), false, "niente approvazione senza revisione");
  eq(canTransitionAsset("delivered", "in_review"), false, "delivered e' terminale");
  eq(canTransitionAsset("rejected", "approved"), false, "rejected non si approva diretto");
});

check("rejected/draft possono essere ripresentati", () => {
  eq(canTransitionAsset("rejected", "in_review"), true, "rejected->in_review");
  eq(canTransitionAsset("rejected", "draft"), true, "rejected->draft");
});

check("isAssetDecidable solo su in_review", () => {
  eq(isAssetDecidable("in_review"), true, "in_review");
  eq(isAssetDecidable("draft"), false, "draft");
  eq(isAssetDecidable("approved"), false, "approved");
});

check("isAssetAccepted su approved/delivered", () => {
  eq(isAssetAccepted("approved"), true, "approved");
  eq(isAssetAccepted("delivered"), true, "delivered");
  eq(isAssetAccepted("rejected"), false, "rejected");
});

check("assetFamilyKey raggruppa per run/kind/name", () => {
  eq(assetFamilyKey(null, "image", "logo.png"), "global|image|logo.png", "senza run");
  eq(assetFamilyKey("abc", "image", "logo.png"), "abc|image|logo.png", "con run");
});

check("approvedVersion sceglie l'ultima approvata/consegnata", () => {
  const versions = [
    { version: 3, status: "in_review" },
    { version: 2, status: "approved" },
    { version: 1, status: "approved" },
  ];
  eq(approvedVersion(versions)?.version, 2, "ultima accettata");
  eq(approvedVersion([{ version: 1, status: "draft" }]), null, "nessuna accettata");
  eq(approvedVersion([{ version: 4, status: "delivered" }])?.version, 4, "delivered conta");
});

console.log(`\n${passed} test superati, ${failures.length} falliti`);
if (failures.length) {
  for (const f of failures) console.error(`- ${f.name}: ${f.message}`);
  process.exit(1);
}
