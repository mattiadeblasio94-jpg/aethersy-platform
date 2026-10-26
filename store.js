"use strict";

/**
 * Persistenza reale su file (non localStorage del browser).
 * Ogni richiesta, il passaggio tra agenti, l'approvazione/rifiuto umano e
 * l'esecuzione finale vengono scritti davvero su disco in data/ledger.json
 * e, per le azioni eseguite, anche in data/outbox.json (registro delle
 * "azioni eseguite" — simulazione esplicita di invio/conferma reale verso
 * l'esterno, nessuna chiamata di rete in uscita viene effettuata).
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const LEDGER_PATH = path.join(DATA_DIR, "ledger.json");
const OUTBOX_PATH = path.join(DATA_DIR, "outbox.json");

function ensureFile(p, initial) {
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify(initial, null, 2));
  }
}

function init() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  ensureFile(LEDGER_PATH, []);
  ensureFile(OUTBOX_PATH, []);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function listRequests() {
  init();
  return readJson(LEDGER_PATH);
}

function getRequest(id) {
  return listRequests().find((r) => r.id === id) || null;
}

function saveRequest(record) {
  init();
  const all = readJson(LEDGER_PATH);
  const idx = all.findIndex((r) => r.id === record.id);
  if (idx === -1) all.unshift(record);
  else all[idx] = record;
  writeJson(LEDGER_PATH, all);
  return record;
}

function appendOutbox(entry) {
  init();
  const all = readJson(OUTBOX_PATH);
  all.unshift(entry);
  writeJson(OUTBOX_PATH, all);
  return entry;
}

function listOutbox() {
  init();
  return readJson(OUTBOX_PATH);
}

module.exports = { init, listRequests, getRequest, saveRequest, appendOutbox, listOutbox, LEDGER_PATH, OUTBOX_PATH };
