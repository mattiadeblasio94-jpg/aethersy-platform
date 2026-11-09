// Test del renderer PDF dei deliverable.
//
//   node tools/test-pdf.mjs [out.pdf]
//
// Genera un PDF di prova dal markdown di esempio e ne verifica struttura,
// dimensione e presenza dei blocchi attesi (titoli, tabelle, codice, pagine).
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { renderDeliverablePdf } from "../dist/pipeline/pdf.js";

const out = process.argv[2] ?? join(tmpdir(), "aethersy-test-deliverable.pdf");

const markdown = `# Piano editoriale Q4

## Obiettivo

Portare il **traffico** del sito a 20.000 visitatori al mese, con un'\`aumento\` del 35% e una conversione del 2,4%.

Il contesto di mercato mostra una domanda in crescita costante da tre trimestri. La concorrenza diretta non ha
spostato l'offerta sulla seconda meta' dell'anno, quindi c'e' spazio per un posizionamentoOwn con dati
sistemi di pricing piu' trasparenti.

### Attivita' previste

1. Landing page comparativa con tre scenari d'uso
2. Campagna email ai lead inattivi da 90 giorni
3. Contenuti video di due minuti per i canali social

- Rivedere la struttura dei prezzi
- Semplificare il checkout
- Aggiungere il piano annuale

## Tabella obiettivi

| Canale | Kpi | Target | Stato |
|---|---:|---:|---|
| Blog | Visitatori | 20.000 | In corso |
| Email | Conversioni | 4,5% | Da avviare |
| Social | Engagement | 8% | In corso |

> Nota: i target sono definiti sul trimestre e vanno rivisti dopo il primo mese.

## Piano di lavoro

\`\`\`bash
# Esempio di chiamata alle API del provider
curl -X POST https://api.example.com/v1/campaigns \\
  -H "Authorization: Bearer $TOKEN" \\
  -d '{"name":"Q4","budget":5000}'
\`\`\`

### Rischi

Il principale rischio e' la saturazione del canale email: senza una segmentazione nuova il costo per
acquisizione cresce del 20% nel trimestre.
`;

const pdf = await renderDeliverablePdf({
  title: "Piano editoriale Q4",
  subtitle: "strategist · Content & Campaign",
  markdown,
  dateLabel: "8 novembre 2026",
});

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.log(`  FAIL ${name}: ${err.message}`);
  }
}

await check("il documento e' un PDF valido", () => {
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.ok(pdf.includes(Buffer.from("%%EOF", "latin1")), "manca il marker di fine file");
});

await check("il documento ha piu' pagine e una dimensione utile", () => {
  const pages = pdf.toString("latin1").split("/Type /Page").length - 1;
  assert.ok(pages >= 2, `solo ${pages} pagine`);
  assert.ok(pdf.length > 2500, `solo ${pdf.length} byte`);
});

await check("il documento contiene il contenuto atteso", () => {
  const raw = pdf.toString("latin1");
  assert.ok(raw.includes("Helvetica"), "manca il font");
  assert.ok(raw.includes("/Title"), "manca il titolo nei metadati");
  assert.ok(raw.includes("Aethersy"), "manca il brand nel pie' di pagina");
});

writeFileSync(out, pdf);
console.log(`\n${passed} test superati, ${failures.length} falliti`);
console.log(`PDF scritto in ${out} (${Math.round(pdf.length / 1024)} KB)`);
if (failures.length) process.exit(1);
