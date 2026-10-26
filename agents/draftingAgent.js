"use strict";

/**
 * Agente 2 — Drafting / Azione proposta
 * Compito: ricevere l'output strutturato del TriageAgent (non il testo grezzo)
 * e produrre un'azione concreta proposta: una bozza di risposta oppure una
 * proposta di conferma prenotazione con controllo conflitti reale contro
 * un'agenda sintetica caricata da file.
 *
 * STATO REALE: il controllo conflitti legge davvero l'agenda sintetica da
 * data/agenda.json; la struttura "azione proposta" con stato di revisione è
 * reale e viene eseguita realmente solo dopo l'approvazione umana (vedi
 * orchestrator.js e server.js).
 * STATO SIMULATO: il testo delle bozze è generato con modelli di frase fissi,
 * non da un modello linguistico; l'agenda è sintetica, non un calendario reale.
 */

const fs = require("fs");
const path = require("path");

const AGENDA_PATH = path.join(__dirname, "..", "data", "agenda.json");

function loadAgenda() {
  try {
    return JSON.parse(fs.readFileSync(AGENDA_PATH, "utf8"));
  } catch (e) {
    return [];
  }
}

function firstName(full) {
  return String(full || "").split(" ")[0] || "cliente";
}

function draft(triageResult) {
  const c = triageResult.classification;
  const entities = triageResult.entities;
  const mittente = entities.mittente;

  if (c.type === "prenotazione") {
    const agenda = loadAgenda();
    const slot = entities.dataOraRichiesta;
    const conflict = slot
      ? agenda.some((a) => a.data === slot.date && a.ora === slot.time)
      : false;

    const azione = {
      tipo: "conferma_prenotazione",
      titolo: slot
        ? `Proposta di conferma per ${slot.date} ore ${slot.time}`
        : "Proposta di presa in carico (data/ora non specificate nel testo)",
      conflitto: conflict,
      richiedeConfermaEsplicita: conflict,
      testoProposto: slot
        ? `Gentile ${firstName(mittente)},\ngrazie per la richiesta. Confermiamo l'appuntamento per il ${slot.date} alle ${slot.time}.\n\nCordiali saluti,\nAethersy per conto del titolare`
        : `Gentile ${firstName(mittente)},\ngrazie per la richiesta. Per confermare l'appuntamento ci servono data e ora preferite.\n\nCordiali saluti,\nAethersy per conto del titolare`
    };
    return {
      agente: "DraftingAgent",
      reale: "controllo conflitti su agenda sintetica letta da file, struttura azione proposta reale",
      simulato: "testo della bozza da modelli di frase fissi; agenda sintetica, non un calendario reale collegato",
      azioneProposta: azione
    };
  }

  if (c.type === "reclamo") {
    return {
      agente: "DraftingAgent",
      reale: "struttura azione proposta reale, in attesa di revisione umana",
      simulato: "testo della bozza da modelli di frase fissi",
      azioneProposta: {
        tipo: "bozza_email",
        titolo: "Bozza di risposta a reclamo",
        testoProposto: `Gentile ${firstName(mittente)},\ngrazie per averci segnalato il problema. Stiamo verificando e le forniremo un aggiornamento entro domani. Ci scusiamo per il disagio.\n\nCordiali saluti,\nAethersy per conto del titolare`
      }
    };
  }

  if (c.type === "preventivo") {
    return {
      agente: "DraftingAgent",
      reale: "struttura azione proposta reale, in attesa di revisione umana",
      simulato: "testo della bozza da modelli di frase fissi",
      azioneProposta: {
        tipo: "bozza_email",
        titolo: "Bozza di risposta a richiesta preventivo",
        testoProposto: `Gentile ${firstName(mittente)},\ngrazie per averci contattato. Le invieremo un preventivo dettagliato entro 2 giorni lavorativi.\n\nCordiali saluti,\nAethersy per conto del titolare`
      }
    };
  }

  if (c.type === "faq") {
    return {
      agente: "DraftingAgent",
      reale: "struttura azione proposta reale",
      simulato: "nessuna bozza necessaria, risposta diretta",
      azioneProposta: {
        tipo: "nessuna_azione",
        titolo: "Domanda informativa, nessuna azione da approvare",
        testoProposto: null
      }
    };
  }

  return {
    agente: "DraftingAgent",
    reale: "struttura azione proposta reale",
    simulato: "nessuna bozza automatica disponibile",
    azioneProposta: {
      tipo: "da_valutare_manualmente",
      titolo: "Richiede valutazione diretta del titolare",
      testoProposto: null
    }
  };
}

module.exports = { draft };
