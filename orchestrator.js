"use strict";

/**
 * Orchestratore — coordina i due agenti specializzati su una richiesta reale
 * dell'utente e applica il cancello di revisione umana obbligatorio:
 * nessuna azione viene eseguita senza un'approvazione esplicita.
 */

const crypto = require("crypto");
const { triage } = require("./agents/triageAgent");
const { draft } = require("./agents/draftingAgent");
const store = require("./store");

function handleNewRequest(testo, mittente) {
  const triageResult = triage(testo, { mittente });
  const draftResult = draft(triageResult);

  const needsReview = draftResult.azioneProposta.tipo !== "nessuna_azione" &&
    draftResult.azioneProposta.tipo !== "da_valutare_manualmente";

  const record = {
    id: crypto.randomUUID(),
    creatoIl: new Date().toISOString(),
    mittente,
    testoOriginale: testo,
    triage: triageResult,
    drafting: draftResult,
    stato: needsReview ? "in_attesa_revisione_umana" : "nessuna_revisione_necessaria",
    revisione: null,
    esecuzione: null
  };
  store.saveRequest(record);
  return record;
}

function approveRequest(id, opts) {
  opts = opts || {};
  const record = store.getRequest(id);
  if (!record) return { error: "richiesta_non_trovata" };
  if (record.stato !== "in_attesa_revisione_umana") {
    return { error: "stato_non_valido_per_approvazione", statoAttuale: record.stato };
  }
  const azione = record.drafting.azioneProposta;
  if (azione.conflitto && !opts.confermaConflitto) {
    return { error: "conflitto_agenda_non_confermato", dettaglio: "Questa azione riguarda uno slot in conflitto con l'agenda: serve la conferma esplicita del conflitto prima di approvare." };
  }

  const testoFinale = opts.testoModificato || azione.testoProposto;

  record.revisione = {
    approvatoIl: new Date().toISOString(),
    testoFinaleApprovato: testoFinale
  };
  record.stato = "approvata_in_esecuzione";
  store.saveRequest(record);

  // ESECUZIONE SERVER-SIDE REALE: scrittura persistente su disco.
  // Non viene effettuata nessuna chiamata di rete in uscita reale (nessuna
  // email, nessun provider di calendario): l'effetto osservabile reale è la
  // scrittura nel registro "outbox" su file, verificabile su disco.
  const outboxEntry = {
    id: crypto.randomUUID(),
    richiestaId: record.id,
    eseguitoIl: new Date().toISOString(),
    tipoAzione: azione.tipo,
    destinatario: record.mittente,
    testo: testoFinale,
    nota: "Scrittura reale su disco eseguita dal server. Nessun invio reale verso l'esterno (email/calendario) è stato effettuato in questa fase."
  };
  store.appendOutbox(outboxEntry);

  record.esecuzione = outboxEntry;
  record.stato = "eseguita";
  store.saveRequest(record);
  return record;
}

function rejectRequest(id, motivo) {
  const record = store.getRequest(id);
  if (!record) return { error: "richiesta_non_trovata" };
  record.revisione = {
    rifiutatoIl: new Date().toISOString(),
    motivo: motivo || "nessun motivo indicato"
  };
  record.stato = "rifiutata";
  store.saveRequest(record);
  return record;
}

module.exports = { handleNewRequest, approveRequest, rejectRequest };
