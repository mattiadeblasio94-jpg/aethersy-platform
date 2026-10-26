"use strict";

/**
 * Agente 1 — Triage
 * Compito: leggere il testo grezzo di una richiesta cliente e produrre una
 * classificazione strutturata (tipo di richiesta, urgenza, entità estratte)
 * che l'Agente 2 (Drafting) userà come input.
 *
 * STATO REALE: la logica di esecuzione, il passaggio di dati strutturati
 * all'agente successivo e la persistenza del risultato sono reali.
 * STATO SIMULATO: il "ragionamento" è un motore a parole chiave deterministico,
 * non una chiamata a un modello linguistico reale. È il sostituto onesto e
 * verificabile di un futuro agente basato su LLM, da collegare in una fase
 * successiva senza cambiare il contratto tra agenti (stessa forma di output).
 */

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
}

const RULES = [
  {
    type: "prenotazione",
    label: "Richiesta di appuntamento/prenotazione",
    keywords: ["prenotare", "prenotazione", "appuntamento", "consulenza", "fissare", "disponibilita"],
    urgency: "normale"
  },
  {
    type: "reclamo",
    label: "Reclamo / sollecito",
    keywords: ["reclamo", "ritardo", "sollecito", "non funziona", "urgente", "non e arrivato", "lamentela"],
    urgency: "alta"
  },
  {
    type: "preventivo",
    label: "Richiesta di preventivo",
    keywords: ["preventivo", "costo", "quanto costa", "quotazione", "prezzo"],
    urgency: "normale"
  },
  {
    type: "faq",
    label: "Domanda informativa (FAQ)",
    keywords: ["orari", "orario", "aperto", "apertura", "dove", "indirizzo", "pagamento", "reso", "spedizione"],
    urgency: "bassa"
  }
];

// Data/ora sintetiche presenti nel testo (gg/mm/aaaa ore hh:mm), per le richieste di prenotazione.
const DATE_TIME_RE = /(\d{1,2}\/\d{1,2}\/\d{4})\D{0,12}(\d{1,2}[:.]\d{2})/;

function extractDateTime(text) {
  const m = text.match(DATE_TIME_RE);
  if (!m) return null;
  return { date: m[1], time: m[2].replace(".", ":") };
}

function triage(requestText, meta) {
  meta = meta || {};
  const norm = normalize(requestText);
  let best = null;
  let bestScore = 0;
  for (const rule of RULES) {
    let score = 0;
    for (const k of rule.keywords) {
      if (norm.indexOf(normalize(k)) !== -1) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = rule;
    }
  }

  const classification = best
    ? { type: best.type, label: best.label, urgency: best.urgency, confidence: Math.min(1, bestScore / 2) }
    : { type: "manuale", label: "Da valutare manualmente", urgency: "normale", confidence: 0 };

  const entities = {
    mittente: meta.mittente || "Mittente sconosciuto",
    dataOraRichiesta: extractDateTime(requestText)
  };

  return {
    agente: "TriageAgent",
    reale: "classificazione eseguita lato server, output strutturato passato all'agente successivo",
    simulato: "motore a parole chiave, non un modello linguistico",
    classification,
    entities,
    testoOriginale: requestText
  };
}

module.exports = { triage };
