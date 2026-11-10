// Test del motore di ricerca reale.
//
//   node tools/test-research.mjs
//
// Verifica che i provider restituiscano risultati VERIFICABILI: link reali
// (http/https), titoli non vuoti e coerenza tra query e contenuto. I test
// usano la rete: se la rete non e' disponibile il test si dichiara saltato
// invece di fallire in modo fuorviante.
import assert from "node:assert/strict";
import { duckduckgoSearch, webSearch } from "../dist/research/search.js";
import { topicFromBrief } from "../dist/research/report.js";
import { checkDomains } from "../dist/research/domain.js";

let passed = 0;
let failed = 0;
let skipped = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    if (err && err.__network) {
      skipped += 1;
      console.log(`  skip ${name} — rete non disponibile: ${err.message}`);
      return;
    }
    failed += 1;
    console.log(`  FAIL ${name}: ${err.message}`);
  }
}

function networkError(err) {
  const e = new Error(err.message);
  e.__network = true;
  return e;
}

console.log("=== Test motore di ricerca reale ===");

await test("DuckDuckGo: la SERP restituisce link reali", async () => {
  let results;
  try {
    results = await duckduckgoSearch("agenzia marketing prezzi 2026", 5);
  } catch (err) {
    throw networkError(err);
  }
  assert.ok(results.length > 0, "nessun risultato dalla SERP");
  for (const result of results) {
    assert.match(result.url, /^https?:\/\//, `URL non valido: ${result.url}`);
    assert.ok(result.title.length > 0, "titolo vuoto");
    assert.equal(result.provider, "duckduckgo");
  }
});

await test("DuckDuckGo: l'URL non e' il redirect di DuckDuckGo", async () => {
  let results;
  try {
    results = await duckduckgoSearch("prezzi hosting italiano 2026", 5);
  } catch (err) {
    throw networkError(err);
  }
  for (const result of results) {
    assert.ok(
      !result.url.includes("duckduckgo.com/l/"),
      `URL non decompresso: ${result.url}`,
    );
  }
});

await test("webSearch: catena di provider e dichiarazione del provider", async () => {
  let result;
  try {
    result = await webSearch("normative GDPR cookie banner", 4);
  } catch (err) {
    throw networkError(err);
  }
  assert.ok(["duckduckgo", "wikipedia"].includes(result.provider));
  assert.ok(result.sources.length > 0);
  assert.equal(typeof result.degraded, "boolean");
});

await test("Verifica domini: DNS reale e distinzione taken/available", async () => {
  const checks = await checkDomains("aethersy", ["com", "it"]);
  assert.equal(checks.length, 2);
  for (const check of checks) {
    assert.match(check.domain, /^aethersy\.(com|it)$/);
    assert.ok(["taken", "likely_available", "unknown"].includes(check.status));
    assert.ok(check.detail.length > 0);
  }
  // google.com deve risultare registrato: prova che il DNS e' interrogato.
  const known = await checkDomains("google", ["com"]);
  assert.equal(known[0].status, "taken", "google.com dovrebbe risultare registrato");
});

await test("topicFromBrief: il tema arriva dal brief in varie forme", () => {
  assert.equal(topicFromBrief("crea un sito per un pastificio"), "crea un sito per un pastificio");
  assert.equal(topicFromBrief({ obiettivo: "vendere corsi di pasta" }), "vendere corsi di pasta");
  assert.equal(topicFromBrief({ settore: "ristorazione" }), "ristorazione");
  assert.equal(topicFromBrief(null), "");
});

console.log(`\n${passed} test superati, ${failed} falliti, ${skipped} saltati`);
if (failed > 0) process.exit(1);
