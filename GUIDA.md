# Aethersy — piattaforma, fase 1: guida rapida

Codice sorgente completo ed eseguibile del primo flusso di orchestrazione
multiagente di Aethersy: due agenti cooperanti (classificazione → bozza
azione), revisione umana obbligatoria prima di ogni esecuzione, e scrittura
reale su disco dopo l'approvazione. Dati solo sintetici, nessun invio reale
verso l'esterno.

## Eseguirlo in locale

Richiede solo Node.js 18 o superiore, nessuna dipendenza da installare.

```bash
cd piattaforma-sorgente
node server.js
```

Poi apri `http://localhost:8787` nel browser per l'interfaccia di prova, oppure
usa le API REST direttamente (vedi sotto). Variabile opzionale `PORT` per
cambiare la porta.

## API principali

- `POST /api/richieste` — invia una nuova richiesta cliente sintetica (`testo`, `mittente`).
- `GET /api/richieste` — elenca tutte le richieste con la traccia dei due agenti.
- `POST /api/richieste/:id/approva` — approvazione umana; richiede `confermaConflitto:true` se l'agenda sintetica segnala un conflitto. Esegue davvero la scrittura su disco.
- `POST /api/richieste/:id/rifiuta` — rifiuto umano, nessuna esecuzione.
- `GET /api/outbox` — registro reale delle azioni eseguite dopo approvazione.
- `GET /api/salute` — controllo di funzionamento del server.

## Struttura del codice

```
agents/triageAgent.js     Agente 1 — classificazione ed estrazione entità
agents/draftingAgent.js   Agente 2 — azione proposta e controllo conflitti agenda
orchestrator.js           Coordina i due agenti e applica il cancello di approvazione
store.js                  Persistenza reale su file (data/ledger.json, data/outbox.json)
server.js                 Server HTTP (solo moduli nativi Node.js) + interfaccia di prova
public/                   Interfaccia di prova statica (HTML/CSS/JS)
data/agenda.json          Agenda sintetica usata per il controllo conflitti
```

## Cosa è reale e cosa è simulato

Reale: esecuzione server, passaggio di dati strutturati tra i due agenti,
controllo conflitti su file, cancello di approvazione umana, scrittura su
disco dopo approvazione.

Simulato: la classificazione usa un motore a parole chiave (non un modello
linguistico); l'agenda è un file sintetico; nessuna email o prenotazione
viene davvero inviata a un sistema esterno — l'"outbox" registra solo ciò che
verrebbe inviato.

## Percorso di hosting reale

Questo è un server Node.js che deve restare in esecuzione continua: non può
diventare un sito statico su pazi.dev. Il percorso individuato, senza toccare
il sito di marketing pubblico, è un servizio Render dedicato a questo solo
processo (vedi `render.yaml` e il report pubblicato per i dettagli).

## Protezione dell'ambiente di prova pubblico

Quando il server gira con le variabili d'ambiente `BASIC_AUTH_USER` e
`BASIC_AUTH_PASS` impostate (come nel deploy Render), ogni rotta — inclusa
l'interfaccia di prova e tutte le API di mutazione/approvazione — richiede
quelle credenziali tramite autenticazione HTTP Basic; solo `/api/salute`
resta aperto per il controllo di funzionamento. Senza quelle variabili (uso
locale) il server resta aperto come nei test di questa fase. Sul deploy
Render la password è generata automaticamente ed è visibile solo nella scheda
"Environment" del servizio su dashboard.render.com — non è mai stampata nei
report o in chat.
