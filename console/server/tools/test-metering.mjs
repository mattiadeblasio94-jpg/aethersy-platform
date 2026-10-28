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

console.log(`\n${passed} test superati, ${failures.length} falliti`);
if (failures.length) {
  for (const f of failures) console.error(`- ${f.name}: ${f.message}`);
  process.exit(1);
}
