"use strict";

/**
 * Persistenza reale su file (non localStorage del browser).
 * Ogni richiesta, il passaggio tra agenti, l'approvazione/rifiuto umano e
 * l'esecuzione finale vengono scritti davvero su disco in data/ledger.json
 * e, per le azioni eseguite, anche in data/outbox.json (registro delle
 * "azioni eseguite" — simulazione esplicita di invio/conferma reale verso
 * l'esterno, nessuna chiamata di rete in uscita viene effettuata).
 *
 * Gli agenti configurabili (nome, ruolo, abilitato, istruzioni) sono
 * persistiti in data/agents.json e letti realmente dall'orchestratore prima
 * di ogni richiesta: disattivare un agente qui cambia davvero il risultato
 * (vedi orchestrator.js).
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const LEDGER_PATH = path.join(DATA_DIR, "ledger.json");
const OUTBOX_PATH = path.join(DATA_DIR, "outbox.json");
const AGENTS_PATH = path.join(DATA_DIR, "agents.json");

const DEFAULT_AGENTS = [
  {
    id: "triage",
    nome: "TriageAgent",
    ruolo: "Classifica la richiesta cliente (prenotazione, reclamo, preventivo, FAQ) ed estrae data/ora quando presenti.",
    abilitato: true,
    istruzioni: "Classifica come prenotazione, preventivo, reclamo o domanda informativa; estrai data e ora se il testo le contiene."
  },
  {
    id: "drafting",
    nome: "DraftingAgent",
    ruolo: "Riceve l'output del TriageAgent, controlla l'agenda sintetica e propone un'azione con bozza di testo modificabile.",
    abilitato: true,
    istruzioni: "Se la classificazione è una prenotazione, controlla l'agenda sintetica per conflitti; proponi sempre un testo di bozza modificabile prima dell'approvazione umana."
  }
];

function ensureFile(p, initial) {
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify(initial, null, 2));
  }
}

function init() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  ensureFile(LEDGER_PATH, []);
  ensureFile(OUTBOX_PATH, []);
  ensureFile(AGENTS_PATH, DEFAULT_AGENTS);
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

function listAgents() {
  init();
  return readJson(AGENTS_PATH);
}

function getAgent(id) {
  return listAgents().find((a) => a.id === id) || null;
}

function updateAgent(id, changes) {
  init();
  changes = changes || {};
  const all = readJson(AGENTS_PATH);
  const idx = all.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const updated = Object.assign({}, all[idx]);
  if (typeof changes.abilitato === "boolean") updated.abilitato = changes.abilitato;
  if (typeof changes.istruzioni === "string" && changes.istruzioni.trim()) {
    updated.istruzioni = changes.istruzioni.trim().slice(0, 500);
  }
  all[idx] = updated;
  writeJson(AGENTS_PATH, all);
  return updated;
}

module.exports = {
  init,
  listRequests,
  getRequest,
  saveRequest,
  appendOutbox,
  listOutbox,
  listAgents,
  getAgent,
  updateAgent,
  LEDGER_PATH,
  OUTBOX_PATH,
  AGENTS_PATH
};
