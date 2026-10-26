"use strict";

/**
 * Test di fumo reale: avvia davvero server.js come processo separato su una
 * porta dedicata, esegue richieste HTTP vere contro le API e verifica il
 * comportamento chiave già validato manualmente in questa fase:
 *  - /api/salute risponde
 *  - una prenotazione in conflitto viene rilevata
 *  - l'approvazione senza conferma di conflitto è bloccata (409)
 *  - l'approvazione con conferma esplicita esegue davvero (200, outbox scritto)
 *
 * Nessuna dipendenza esterna: solo moduli nativi Node.js (http, child_process, assert).
 * Uso: npm test  (oppure: node test/smoke.test.js)
 */

const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const assert = require("assert");

const PORT = process.env.SMOKE_TEST_PORT || 8799;
const BASE = `http://localhost:${PORT}`;

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      `${BASE}${urlPath}`,
      {
        method,
        headers: data
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
          : {}
      },
      (res) => {
        let chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = raw ? JSON.parse(raw) : null; } catch (e) { /* risposta non JSON */ }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function waitForServer(maxAttempts) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryOnce = () => {
      attempts += 1;
      request("GET", "/api/salute").then(
        (r) => (r.status === 200 ? resolve() : retry()),
        () => retry()
      );
    };
    const retry = () => {
      if (attempts >= maxAttempts) return reject(new Error("Server non pronto in tempo"));
      setTimeout(tryOnce, 200);
    };
    tryOnce();
  });
}

async function main() {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore"
  });

  let exitCode = 0;
  try {
    await waitForServer(25);

    const salute = await request("GET", "/api/salute");
    assert.strictEqual(salute.status, 200, "atteso /api/salute 200");

    const creata = await request("POST", "/api/richieste", {
      testo: "Vorrei prenotare una consulenza arredo per il 29/10/2026 alle 10:00",
      mittente: "Test sintetico"
    });
    assert.strictEqual(creata.status, 201, "atteso 201 alla creazione");
    const classificazione = creata.json.triage && creata.json.triage.classification;
    const azioneProposta = creata.json.drafting && creata.json.drafting.azioneProposta;
    assert.strictEqual(classificazione && classificazione.type, "prenotazione", "attesa classificazione prenotazione");
    assert.strictEqual(azioneProposta && azioneProposta.conflitto, true, "atteso conflitto rilevato");

    const id = creata.json.id;

    const bloccata = await request("POST", `/api/richieste/${id}/approva`, {});
    assert.strictEqual(bloccata.status, 409, "atteso 409 senza conferma di conflitto");

    const eseguita = await request("POST", `/api/richieste/${id}/approva`, { confermaConflitto: true });
    assert.strictEqual(eseguita.status, 200, "atteso 200 con conferma esplicita");
    assert.strictEqual(eseguita.json.stato, "eseguita", "atteso stato eseguita");

    console.log("Test di fumo superati: salute, rilevamento conflitto, blocco 409, esecuzione 200.");
  } catch (err) {
    console.error("Test di fumo falliti:", err.message);
    exitCode = 1;
  } finally {
    child.kill();
  }
  process.exit(exitCode);
}

main();
