# Guida passo-passo della piattaforma

Percorso completo, in ordine, per passare da un'idea a un business online.
Ogni passo indica **dove** agire nella piattaforma e **cosa** succede.
La stessa guida è disponibile dentro l'app: pagina **Guida passo-passo** (`/guida`).

Regola di fondo: **ogni schermata mostra dati reali**. Se un numero è vuoto, è
perché la fonte non ha ancora restituito nulla, non perché la piattaforma
inventi valori.

---

## Passo 1 — Descrivi cosa vuoi ottenere

**Dove:** `Realizza l'idea` (`/idea`)

1. Scrivi il risultato che vuoi ("voglio una landing per un corso di cucina").
2. Aggiungi contesto: brand, pubblico, settore, tono, città, riferimenti.
3. La piattaforma crea i reparti necessari e mette al lavoro gli specialisti:
   ricerca sul web reale (fonti citate), testi, immagini, pagine.
4. Nel run approvi i deliverable che ti servono e scarti quello che non va.

**Cosa ottieni:** un deliverable completo e approvato, non un'anteprima.

---

## Passo 2 — Pubblica il sito

**Dove:** `Sito Web` (`/website`)

1. Dal run approvato premi **Pubblica sito**: vengono generate le pagine
   (home, servizi, lavori, contatti).
2. Ottieni un URL pubblico da condividere: è lo stesso sito scritto dai reparti.
3. Puoi ritirare il sito in qualsiasi momento: il link smette di funzionare,
   i dati restano tuoi.

**Cosa ottieni:** un sito multi-pagina online, con URL stabile.

---

## Passo 3 — Collega il tuo account Wix

**Dove:** `Wix` (`/wix`)

1. Premi **Collega Wix**: verrai reindirizzato su `wix.com` per autorizzare.
2. Torni nella piattaforma con il collegamento attivo: siti, prodotti e ordini
   sono già stati letti.
3. I token OAuth restano **cifrati** nel tenant (AES-256-GCM); la piattaforma
   non vede la password e non salva nulla nel browser.

**Dettagli tecnici:** OAuth 2.1 con registrazione dinamica del client (DCR) e
PKCE S256, server MCP `https://mcp.wix.com/mcp`.

**Se qualcosa non torna:** `Scollega` e ricollega. Se il collegamento è attivo
ma il business è vuoto, il sito Wix deve avere almeno un prodotto o un ordine.

---

## Passo 4 — Guarda il business e crea i prodotti

**Dove:** `Wix` (`/wix`) → sezione **Business**

Indicatori letti in tempo reale dal sito:

| Indicatore | Origine |
|---|---|
| Ricavi | somma degli ordini non annullati (`ecom/v1/orders/search`) |
| Ordini | ordini totali del sito |
| Scontrino medio | ricavi ÷ ordini validi |
| Prodotti in catalogo | `stores/v3/products/query` |
| Contatti | `contacts/v4/contacts/query` |

Per vendere un servizio nuovo:

1. Scrivi **nome**, **prezzo** e **descrizione**.
2. Premi **Crea nel catalogo Wix**: la scrittura avviene davvero sul tuo sito
   (`stores/v3/products`), con prezzo, valuta e tipo prodotto.
3. Il prodotto compare subito nel catalogo ed è acquistabile dal tuo store.

**Nota tecnica:** per i prodotti fisici Wix richiede `physicalProperties`
(prezzo per unità e dimensioni): il modulo li valorizza con valori neutri
(`1 KG`, `10×10×1 CM`), modificabili dal pannello Wix.

---

## Passo 5 — Metti in automatico ciò che fai ogni giorno

**Dove:** `Agenti` (`/agents`), `Attività` (`/scheduled-tasks`), `Connettori` (`/connectors`)

- Gli agenti eseguono i compiti assegnati (monitoraggio, social, outreach, report).
- Le attività programmate partono all'ora stabilita e lasciano traccia nel registro.
- I connettori collegano i tuoi strumenti; ogni connessione è reversibile.

---

## Passo 6 — Attiva il piano a pagamento

**Dove:** `Pagamenti` (`/payouts`), `Account` (`/account`)

1. Verifica i crediti: ogni operazione AI scalca dal saldo reale.
2. Attiva l'abbonamento: la fatturazione passa da Stripe.
3. Da `Pagamenti` vedi lo stato dei pagamenti e dei prelievi.

---

## Passo 7 — Affianca il negozio: catalogo e offerte

**Dove:** `Prodotti` (`/products`)

- L'offerta della piattaforma e il catalogo del tuo store sono la stessa
  fonte di verità: ciò che crei in Wix compare qui.

---

## Mappa rapida delle sezioni

| Sezione | A cosa serve |
|---|---|
| Home | saldo crediti, attività recente, stato del sistema |
| Guida | questo percorso, passo-passo |
| Realizza l'idea | punto di partenza: brief → reparti → deliverable → sito |
| Sito Web | pubblicazione e gestione dei siti |
| Wix | collegamento account, business, creazione prodotti |
| Studio | esecuzione degli agenti in tempo reale |
| Ricerca | ricerca web reale con fonti citate |
| Connettori | collegamenti a servizi esterni |
| Pagamenti | crediti, abbonamento, fatturazione |

## Troubleshooting rapido

| Sintomo | Causa più probabile | Cosa fare |
|---|---|---|
| "Collegamento Wix non riuscito" | autorizzazione non completata | `Scollega` e ricollega |
| Business vuoto | sito senza ordini/prodotti, o sito non rilevato | controlla il riquadro **Sito Wix** in alto |
| Crediti insufficienti | saldo esaurito | `Account` → ricarica |
| Deliverable sbagliato | singolo passo da rifare | rigenera quel passo dal run |
| Sito non raggiungibile | sito ritirato | ripubblica dal run |

## Verifiche tecniche della Fase 34

- `GET /api/platform/wix` → collegamento, tool count, sito rilevato.
- `GET /api/platform/wix/sites` → siti reali dell'account (`ListWixSites`).
- `GET /api/platform/wix/business` → snapshot commerciale reale.
- `POST /api/platform/wix/products` → creazione reale in catalogo.
- QA visivo: `qa-wix-business-ui.mjs` (browser headless, 16 controlli, creazione
  prodotto dalla UI e pulizia finale del catalogo).
