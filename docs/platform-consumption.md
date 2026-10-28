# Aethersy — Piattaforma a consumo: struttura, modello di costo, pipeline agente

> Documento di progetto **+ stato di implementazione**. Sintesi di tre analisi parallele:
> **product design** (cosa fa l'agente, dall'idea al traffico), **architettura di metering/billing**
> (come si misura e si fattura il consumo) e **ricerca prezzi provider/competitor** (listini reali).
>
> **Stato P0 (28/10/2026):** il nucleo è implementato in `console/server/src/metering/` (schema
> idempotente, repo, guard, motore di prezzo, pattern matching) e `console/server/src/ai-gen/`
> (generazione Venice metrata). Vedi §9 per il delta aggiornato. Pipeline `pipeline/` (P0.3) e
> libreria asset (P0.4) restano da fare.
>
> Fonti dati: catalogo OpenRouter (`GET /models`, 464 modelli, 19 gratuiti) e Venice
> (`GET /api/v1/models`, 142 modelli), rilevati il **28/10/2026**. I valori sono snapshot e
> vanno aggiornati dal cron di snapshot listini (vedi §5.3).
>
> Vincolo di metodo: **nessun numero inventato**. Dove un dato non è verificabile è marcato
> `[DA VERIFICARE]`. Il modello di costo è derivato dai listini reali; i prezzi *di vendita*
> finali restano una decisione del committente.

---

## 0. Sintesi esecutiva

Aethersy smette di essere "un'istanza Activepieces brandizzata" e diventa una **piattaforma a
consumo**: il committente fa da **fornitore/rivenditore** di chiamate AI multimodali tramite i
provider (OpenRouter primario, Venice secondario) e fattura al cliente **le unità di consumo**
che la pipeline di agenti genera (token, immagini, video, caratteri TTS, secondi STT).

Tre pilastri:

1. **Pipeline agente end-to-end** (8 stadi: Idea → Strategia → Brand → Sito → Contenuti → Social
   → Pubblicità → Traffico), eseguita da sub-agent specializzati, con **deliverable approvabili**.
2. **Metering centralizzato**: *ogni* chiamata AI passa dal BFF (`AI Router`) e produce una riga
   append-only in `metering.usage_event` con costo provider e prezzo cliente.
3. **Billing a crediti** con price book versionato, markup per piano, quote e integrazione
   Stripe/Lago.

**Prerequisito tecnico P0 (risolto):** l'AI Router copriva solo `text`, `img_in`, `stt`, `vid_in`.
`img_out`, `tts`, `vid_out` sono ora implementati in `console/server/src/ai-gen/` (Venice, metrati),
indispensabili per Brand/Social/Ads.

**Decisione architetturale chiave:** Activepieces resta il **braccio esecutivo deterministico**
(webhook, scheduling, retry, worker, MCP). Aethersy è **cervello + banco di conto**: decide la
pipeline, genera i deliverable e **centralizza ogni chiamata AI** in un unico punto di metering.
Le chiamate AI dei flow **non** vanno fatte con i pezzi AI nativi di Activepieces, ma instradate
via BFF (§4.4).

---

## 1. Posizionamento e proposta di valore

**In una frase:** *Aethersy è l'AI Operating Officer che prende un'idea imprenditoriale e la porta
al traffico — brand, sito, contenuti, social, ads e lead — eseguendo la pipeline con agenti
specializzati e fatturando solo il consumo AI che quella pipeline genera.*

**ICP (in ordine di priorità):**
1. **Micro-agenzie / freelance digitali** (1–10 persone) che oggi assemblano 5–8 tool per servire
   3–15 clienti.
2. **PMI e attività locali** senza reparto marketing (retail, studi professionali, e-commerce).
3. **Rivenditori/partner white-label** che erogano il servizio su più workspace clienti
   (giustifica il multi-workspace già modellato nei mock: `workspaces`, `WorkspaceSelector`).

**Differenziazione:**

| Prodotto | Cosa vende | Cosa manca |
|---|---|---|
| Zapier / Make / n8n | **task / esecuzioni** | Nessuna pipeline marketing/brand, nessun deliverable, nessun agente che decide |
| Lindy | **crediti** su assistenti testuali | Nessun asset visuale, nessun funnel end-to-end, nessuna pubblicazione |
| Activepieces (motore) | orchestrazione + pieces + MCP | È il braccio esecutivo, non il cervello di prodotto né il banco di conto |
| **Aethersy** | **pipeline idea→traffico + metering del consumo** | — |

> *"Zapier automatizza il già deciso. Aethersy decide, produce e misura — e ti fattura il consumo
> AI reale."*
> Secondo asse: **sovranità di dato e costo** — self-hosted, modelli preferiti gratuiti via AI
> Router, fallback a pagamento solo quando serve. Il margine nasce dall'**arbitraggio fra modelli**,
> non da un markup opaco sui crediti.

---

## 2. Struttura schematica del progetto

```
aethersy-infra/                              (repo infrastruttura)
├── docker-compose.yml                       stack: caddy, app, worker, console, postgres, redis
├── caddy/                                    TLS + routing (app. / mcp. / console.)
├── branding/                                 asset e design token del PRODOTTO (non del cliente)
├── scripts/                                  bootstrap, hardening, deploy, backup, smoke test
├── docs/                                     runbook, security, phases, restore, agents, questo file
│
├── platform/                                [ESISTE] Portale cliente (SPA, con mock layer)
│   └── src/{pages,lib,mocks}
│       pages: Dashboard, Agents, AgentCreate/Detail/Logs, Tasks, SocialMedia, Website,
│              Contents, Ads, Products, Outreach, Analytics, Settings, Landing, Onboarding
│
├── console/                                 [ESISTE] Aethersy Console
│   ├── web/                                 SPA React (Dashboard, Flows, Runs, Connections, AiCenter)
│   └── server/                              BFF Fastify = "Agent Runtime" + "AI Router"
│       └── src/
│           ├── index.ts                     bootstrap server
│           ├── session.ts                   sessione cookie httpOnly firmata HMAC
│           ├── ap.ts / routes.ts            [ESISTE] proxy autenticato verso Activepieces
│           ├── ai-router.ts                 [ESISTE] selezione modello (text/img_in/stt/vid_in)
│           ├── ai-gen/                      [DA CREARE] generazione: image_gen, video_gen, tts
│           ├── pipeline/                    [DA CREARE] catalogo stadi + macchina a stati dei job
│           │   ├── stages/*.ts              8 stadi → agenti → deliverable
│           │   └── runs.ts                  orchestratore: chi esegue, ordine, approvazioni
│           ├── metering/                    [DA CREARE] intercept chiamate AI + unità di consumo
│           ├── billing/                     [DA CREARE] ledger crediti, quote, piani, overage
│           ├── assets/                      [DA CREARE] libreria asset generati (storage+versioning)
│           └── integrations/                [DA CREARE] social / ads / analytics connectors (OAuth)
│
└── app (Activepieces, container)            MOTORE: flows + worker + MCP (mcp.aethersy.online)
                                             flow = "skill" atomica, non un agente
                                             nessuna decisione di prodotto, nessun metering
```

**Flusso dati (semplificato):**

```
 Cliente ──▶ Console (SPA)
                 │  brief / approvazioni / crediti
                 ▼
        BFF "Agent Runtime" ──────▶ pipeline/  (stato job per stadio)
                 │                        │
                 │ ogni chiamata AI       │ azioni deterministiche
                 ▼                        ▼
        AI Router + metering ──▶ OpenRouter / Venice     app+worker (Activepieces) ──▶ Social/Ads/Analytics
                 │                        │                        │
                 ▼                        ▼                        ▼
        usage_event ──▶ billing/ledger ──▶ quota & fattura    flow_runs (log esecuzione)
                 │
                 ▼
        assets/ (deliverable) ──▶ Console (approvazione) ──▶ consegna al cliente
```

**Modello dati minimo (Postgres):**

| Tabella | Ruolo |
|---|---|
| `tenant`, `tenant_user` | tenant e utenti (mapping utente → tenant) |
| `api_key` | chiavi per tenant (console, worker, integrazioni) |
| `pipeline_run` | esecuzione di uno stadio: `tenant_id, stage, status, started_at, approved_by` |
| `agent_task` | unità di lavoro assegnata a un droid/stage, link al `flow_run` di Activepieces |
| `usage_event` | **una riga per chiamata AI** (§3.1) |
| `credit_account` / `credit_ledger` | saldo e movimenti (consumo, top-up, rettifica) |
| `price_book` / `price_book_entry` | listino versionato per capability/modello |
| `quota` | piano, unità incluse, soglia overage |
| `asset` | deliverable generati: `run_id, kind, storage_key, version, approved_at` |
| `integration_credential` | token OAuth social/ads/analytics (cifrati con `AP_ENCRYPTION_KEY`) |

---

## 3. Modello di costo a consumo

### 3.1 Unità di misura e tassonomia del consumo

| Codice unità | Capability | Misurata in | Stato router |
|---|---|---|---|
| `token_in` / `token_out` | testo | token (prompt / completion) | ✅ `text` |
| `token_cached` | testo (prompt cache) | token cached | ✅ (derivato) |
| `img_in` | comprensione immagine (vision) | token / numero immagini | ✅ `img_in` |
| `img_out` | **generazione immagine** | immagine (es. 1024², varianti) | ❌ **da fare** |
| `stt` | trascrizione audio | secondi audio | ✅ `stt` |
| `tts` | **sintesi vocale** | caratteri (o secondi) | ❌ **da fare** |
| `vid_in` | comprensione video | token / secondi | ✅ `vid_in` |
| `vid_out` | **generazione video** | secondi generati | ❌ **da fare** |
| `request` | orchestrazione (flow run) | numero esecuzioni | n/a (metrica non-AI) |

### 3.2 Listino di riferimento (snapshot 28/10/2026)

Convenzione: i prezzi per unità **token** sono espressi **per 1.000.000 di token** (vedi §3.4,
nota sulla scala). `fx_usd_eur = 0.92`; `provider_fee_bps = 550` (5,5%) **solo su OpenRouter**,
applicata all'acquisto crediti e non per richiesta.

**OpenRouter (per 1M token, in/out):**

| Modello | in | out |
|---|---|---|
| `deepseek/deepseek-flash-latest` | $0.011 | $1.80 |
| `z-ai/glm-5.2` | $0.014 | $7.00 |
| `openai/gpt-oss-20b` | $0.018 | $0.090 |
| `meta-llama/llama-3.1-8b` | $0.020 | $0.040 |
| `mistralai/mistral-nemo` | $0.029 | $0.030 |

**Venice (per 1M token, in/out):**

| Modello | in | out |
|---|---|---|
| `z-ai-glm-5-3-flash` | $0.15 | $0.50 |
| `gemini-3-6-flash` | $0.9375 | $4.6875 |
| `z-ai-glm-5-3` | $1.75 | $5.50 |
| `gemini-4-argon` | $2.50 | $12.50 |

**Venice — unità non-token:**

| Capability | Prezzo provider (USD) |
|---|---|
| `img_out` | $0.01 – $0.29 / immagine |
| `vid_out` | $0.02 – $2.86 / generazione |
| `tts` | $3.50 – $125 / 1M caratteri |
| `stt` | $0.00003148 – $0.000167 / secondo |
| `embedding` | $0.0125 – $0.25 / 1M token |

**Riferimenti competitor (per posizionare il prezzo di vendita):**

| Competitor | Modello | Prezzo di listino noto |
|---|---|---|
| Lindy | crediti | $29.99/mo = 3.000 crediti |
| Make | crediti (operations) | piano a crediti |
| Zapier | task | piano a task |
| n8n | esecuzioni | self-host / cloud a esecuzioni |
| Vapi | hosting + pass-through | $0.05/min + modelli a costo |

> **Target margine: 50–70% gross margin.** Evitare il pass-through 1:1.

### 3.3 Motore di prezzo

```
costo_provider_eur = costo_provider_usd × fx_usd_eur
prezzo_cliente_eur = costo_provider_eur × (1 + markup_bps/10000)
crediti            = round(prezzo_cliente_eur / credit_unit)
```

**Formula del costo provider per capability:**

```
text:      cost = price(token_in)  × in_tokens  / 1e6
                 + price(token_out) × out_tokens / 1e6
                 + price(token_cached) × cached_tokens / 1e6
img_out:   cost = price(image)  × n_images
vid_out:   cost = price(video)  × n_generations        (o × secondi, se il modello fattura a secondi)
tts:       cost = price(char)   × n_characters / 1e6
stt:       cost = price(second) × n_seconds
flow_run:  cost = 0 (metrica non-AI) → prezzo da price book, unit = request
```

**Markup ≠ margine.** Con `prezzo = costo × (1 + m)` il margine lordo è `m / (1 + m)`:

| markup `m` | margine lordo |
|---|---|
| 40% | 28,6% (sotto target) |
| 100% | **50,0%** ✔ |
| 120% | 54,5% ✔ |
| 150% | 60,0% ✔ |
| 233% | 70,0% ✔ |

**Default deciso dal committente (28/10/2026):** `markup_bps = 15000` (**150% → 60,0% margine**) su
tutti i piani, con override per piano disponibile in `tenant_price_override` / `tenant.markup_bps`:

| Piano | `markup_bps` | margine |
|---|---|---|
| default (tutti) | **15000** | **60,0%** |
| override possibile | 0–23300 | contratto / promozioni |

**Free tier:** i 19 modelli gratuiti hanno costo provider = 0 → prezzo = 0. Per coprire il costo
infrastrutturale si applica un `min_charge` (es. 1 credito = 0,0001 €) sulle capability `text`
con pattern `*:free`. Il ledger registra comunque `provider_cost_usd = 0` per la riconciliazione.

### 3.4 Due correzioni non ovvie (emerse dal calcolo)

1. **Scala dei prezzi per-token.** I prezzi unitari sono dell'ordine di `1.5e-8 €`;
   `numeric(18,8)` **non** li rappresenta. Soluzione adottata: `unit_price` per le unità token è
   espresso **per 1.000.000 di token** e il motore divide per `1e6` al calcolo (valori leggibili:
   `0.01518 €/1M`).
2. **Granularità dei crediti.** Con `credit_unit = 0.01 €` una chiamata da `0.0005 €` verrebbe
   arrotondata a 20× il costo. Portare `credit_unit = 0.0001 €` (1 credito = 0,0001 €): quella
   chiamata costa 5 crediti. È la stessa scala di Lindy/Make, familiare all'utente.

---

## 4. Architettura di metering e billing

### 4.1 Schema Postgres — `metering`

DDL di riferimento (idempotente, applicato con un migrator dedicato; **non** tocca lo schema
Activepieces):

```sql
CREATE SCHEMA IF NOT EXISTS metering;

-- Tenant e utenti ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metering.tenant (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  plan            text NOT NULL DEFAULT 'free',      -- free | starter | pro | enterprise
  markup_bps      integer NOT NULL DEFAULT 15000,    -- 150% => 60,0% margine (deciso 28/10/2026)
  credit_unit     numeric(18,8) NOT NULL DEFAULT 0.0001, -- 1 credito = 0,0001 EUR
  hard_stop_on_empty boolean NOT NULL DEFAULT true,
  billing_customer_ref text,                          -- cus_... (Stripe) o external_customer_id (Lago)
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS metering.tenant_user (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE,
  email      text NOT NULL UNIQUE,
  role       text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- API key per tenant (console / worker / integrazioni) -----------------------
CREATE TABLE IF NOT EXISTS metering.api_key (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE,
  key_hash    text NOT NULL UNIQUE,                   -- sha256(key), mai in chiaro
  label       text NOT NULL DEFAULT '',
  source_tag  text NOT NULL DEFAULT 'console',        -- console | worker | mcp | integration
  scopes      text[] NOT NULL DEFAULT '{}',
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_key_tenant_idx ON metering.api_key(tenant_id) WHERE revoked_at IS NULL;

-- Price book versionato ------------------------------------------------------
CREATE TABLE IF NOT EXISTS metering.price_book (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version            integer NOT NULL,
  default_markup_bps integer NOT NULL DEFAULT 15000,
  fx_usd_eur         numeric(12,6) NOT NULL DEFAULT 0.92,
  effective_from     timestamptz NOT NULL DEFAULT now(),
  effective_to       timestamptz,
  UNIQUE (version)
);

CREATE TABLE IF NOT EXISTS metering.price_book_entry (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_book_id uuid NOT NULL REFERENCES metering.price_book(id) ON DELETE CASCADE,
  capability    text NOT NULL,          -- text | img_in | img_out | stt | tts | vid_in | vid_out | embedding | flow_run
  model_pattern text NOT NULL,          -- 'deepseek/*', 'z-ai/glm-5.2', '*'
  provider      text NOT NULL DEFAULT '*',  -- openrouter | venice | *
  unit          text NOT NULL,          -- token_in | token_out | token_cached | image | video | char | second | request
  unit_price    numeric(24,12) NOT NULL,-- per 1M token per le unità token; per unità altrimenti
  markup_bps    integer,                -- override sul default
  UNIQUE (price_book_id, capability, model_pattern, provider, unit)
);

CREATE TABLE IF NOT EXISTS metering.tenant_price_override (
  tenant_id     uuid NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE,
  capability    text NOT NULL,
  model_pattern text NOT NULL,
  markup_bps    integer NOT NULL,
  PRIMARY KEY (tenant_id, capability, model_pattern)
);

-- Ledger di consumo (APPEND-ONLY) --------------------------------------------
CREATE TABLE IF NOT EXISTS metering.usage_event (
  id                bigserial PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES metering.tenant(id),
  api_key_id        uuid REFERENCES metering.api_key(id),
  request_id        uuid NOT NULL,
  attempt_no        smallint NOT NULL DEFAULT 1,
  flow_run_id       text,                     -- X-Aethersy-Flow-Run (worker)
  capability        text NOT NULL,
  provider          text NOT NULL,
  model             text NOT NULL,
  unit              text NOT NULL,
  billable_units    numeric(24,8) NOT NULL,
  input_tokens      integer,
  output_tokens     integer,
  cached_tokens     integer,
  provider_cost_usd numeric(18,10) NOT NULL DEFAULT 0,
  provider_fee_usd  numeric(18,10) NOT NULL DEFAULT 0,
  price_eur         numeric(18,10) NOT NULL DEFAULT 0,
  markup_bps        integer NOT NULL DEFAULT 0,
  credits           numeric(18,8) NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'success',  -- success | error | partial
  latency_ms        integer,
  source            text NOT NULL DEFAULT 'console',
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS usage_event_dedup
  ON metering.usage_event(request_id, attempt_no);
CREATE INDEX IF NOT EXISTS usage_event_tenant_time
  ON metering.usage_event(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_event_flow_run
  ON metering.usage_event(flow_run_id) WHERE flow_run_id IS NOT NULL;

-- Saldi e movimenti ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS metering.credit_account (
  tenant_id        uuid PRIMARY KEY REFERENCES metering.tenant(id) ON DELETE CASCADE,
  balance_credits  numeric(18,8) NOT NULL DEFAULT 0,
  reserved_credits numeric(18,8) NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (balance_credits >= 0)      -- rimuovere se si consente saldo negativo (vedi §4.6)
);

CREATE TABLE IF NOT EXISTS metering.credit_ledger (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES metering.tenant(id),
  kind        text NOT NULL,          -- topup | reserve | settle | release | adjust
  delta_credits numeric(18,8) NOT NULL,
  reason      text,
  usage_event_id bigint REFERENCES metering.usage_event(id),
  provider_ref   text,                -- charge/invoice id
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_ledger_tenant_time
  ON metering.credit_ledger(tenant_id, created_at DESC);

-- Quote ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metering.quota (
  tenant_id     uuid PRIMARY KEY REFERENCES metering.tenant(id) ON DELETE CASCADE,
  limit_credits numeric(18,8) NOT NULL DEFAULT 0,
  window        text NOT NULL DEFAULT 'month',  -- day | month
  soft_pct      integer NOT NULL DEFAULT 80,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Rollup giornaliero (per dashboard/billing) ---------------------------------
CREATE TABLE IF NOT EXISTS metering.usage_daily (
  tenant_id     uuid NOT NULL REFERENCES metering.tenant(id),
  day           date NOT NULL,
  capability    text NOT NULL,
  credits       numeric(18,8) NOT NULL DEFAULT 0,
  price_eur     numeric(18,10) NOT NULL DEFAULT 0,
  provider_cost_usd numeric(18,10) NOT NULL DEFAULT 0,
  requests      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day, capability)
);

-- Outbox verso billing esterno ----------------------------------------------
CREATE TABLE IF NOT EXISTS metering.billing_outbox (
  id              bigserial PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES metering.tenant(id),
  target          text NOT NULL,      -- stripe | lago
  window_start    timestamptz NOT NULL,
  window_end      timestamptz NOT NULL,
  credits         numeric(18,8) NOT NULL,
  amount_eur      numeric(18,10) NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status          text NOT NULL DEFAULT 'pending',  -- pending | sent | error
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  external_ref    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);

-- Link progetto Activepieces -> tenant ---------------------------------------
CREATE TABLE IF NOT EXISTS metering.ap_project_link (
  project_id text PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES metering.tenant(id) ON DELETE CASCADE
);
```

### 4.2 Flusso di metering (dove agganciarsi)

Il metering si aggancia **in `chat()` di `console/server/src/ai-router.ts`**, che già ritorna
`{ model, capability, answer, usage, latencyMs, attempts[] }`. Ogni **attempt** produce una riga in
`usage_event` (chiave `request_id` + `attempt_no` → idempotenza). Il settle avviene in **una sola
transazione**: insert `usage_event` + aggiornamento `credit_account` + riga `credit_ledger`.

Garanzie:
- **Append-only**: nessun UPDATE/DELETE sul ledger di consumo.
- **Idempotenza**: `UNIQUE (request_id, attempt_no)`; un retry dopo timeout non raddoppia.
- **Fail-closed** sul saldo: se il DB non risponde, la richiesta viene rifiutata (non si regala
  consumo).
- **Sempre scritto, anche a costo zero**: è la base di audit e riconciliazione.

### 4.3 Pipeline di guard (preHandler Fastify, solo `/api/ai/*`)

```
preHandler /api/ai/*
  1. requireTenant()      cookie HMAC -> tenant_user  OPPURE  Bearer key -> api_key
        └ 401 UNAUTHENTICATED / 403 SCOPE_MISSING
  2. rateLimit()          Redis: INCR rl:{key}:{floor(now/60)}  TTL 90s
        └ 429 RATE_LIMITED + Retry-After
  3. quotaCheck()         consumo(giorno/mese) + stima vs quota.limit_credits
        └ 429 QUOTA_EXCEEDED (soft) | 402 QUOTA_EXCEEDED (hard)
  4. balanceCheck()       SELECT balance_credits - reserved_credits
        └ 402 INSUFFICIENT_CREDITS
  5. reserve()            metering.reserve_credits(tenant, requestId, estimate)
  ── handler ──
  6. chat({ meter })      AI Router -> usage_event per attempt
  7. post_usage()/release() settle nella stessa transazione
```

Implementato come **un unico modulo** `console/server/src/metering/guard.ts` esportato come
`preHandler`, per non duplicare logica tra `/chat`, TTS, embeddings, ecc.

**Stima della prenotazione:**

```
text:  est_out = min(model.max_output_default, 1024)
       est_in  = inputTokens(prompt)   -- len/4 o tokenizer
       price   = price(token_in)*est_in + price(token_out)*est_out
img/audio/video: prezzo unitario × 1 unità (Venice fattura per generazione)
credits = price_eur / tenant.credit_unit
reserve = min(credits, availableCredits)   -- mai oltre il disponibile
```

**Degradazione invece di hard-stop:** se `available < 10%` della quota mensile, il router forza
`preferFree = true` (solo modelli gratuiti) → il cliente continua a lavorare a costo ~0, con banner
"crediti quasi esauriti". Il `402` definitivo scatta solo a saldo zero.

### 4.4 Attribuzione del consumo del worker Activepieces (punto critico)

I flow girano nel **worker**, che non passa dal BFF: il consumo AI dei flow è invisibile al
metering. Tre approcci, in ordine di robustezza:

**(A) Instradare i flow attraverso l'AI Router — RACCOMANDATO.**
Uno step/piece "Aethersy AI" chiama `POST https://console.aethersy.online/api/ai/chat` con:
- `Authorization: Bearer <API key del tenant>` (creata in `metering.api_key`, `source_tag='worker'`)
- `X-Aethersy-Flow-Run: <runId>` e `X-Aethersy-Request-Id: <uuid>`

Così *ogni* chiamata AI di un flow passa dal guard e dal ledger, attribuita per **chiave** (tenant),
con `flow_run_id` nel ledger. Un solo punto di metering, modelli e pricing centralizzati.
Costo: migrare i flow che oggi usano pezzi AI nativi.

**(B) Attribuzione per progetto.** `ap_project_link` mappa `projectId → tenant`; il BFF già conosce
`projectId` (proxy `/api/ap/*`). Serve per autorizzare le chiavi worker e per la metrica non-AI.

**(C) Conteggio run (fallback, non sufficiente da solo).** Polling di
`/api/v1/flow-runs?projectId=...` (l'endpoint `flow-runs/count-by-status` è già usato nel repo) →
`usage_event(capability='flow_run', unit='request', billable_units=1)` con prezzo da price book
(es. `0.0020 €`, ~2 crediti). Modello "task" stile Zapier/n8n. **Non** cattura i token: va
**combinato** con (A) — (A) fattura l'AI, (C) fattura l'orchestrazione.

> `[DA VERIFICARE]` Activepieces CE `0.92.3-hotfix.1` espone un webhook/notifica *push* di
> "run completed" (più efficiente del polling)? Il polling è comunque disponibile.

**Activepieces CE non ha un motore di billing a consumo.** Il metering resta **fuori** da
Activepieces: il BFF è l'unica autorità su saldi e quote. Questo mantiene pulito l'upgrade path
(un `AP_VERSION` più recente non tocca il metering).

### 4.5 Integrazione billing esterno

**Stripe (metered billing)** — `[DA VERIFICARE sulla doc corrente]`: Stripe ha introdotto
**Billing Meters** e alcuni endpoint legacy per `usage_records` sono in deprecazione. Modello:
- `customer` (`cus_…` → `tenant.billing_customer_ref`), `subscription` con item *usage-based*.
- Invio consumo: **eventi** su un meter (`event_name`, `payload.value`, `timestamp`) **oppure**
  usage record su subscription item — **il path esatto va verificato** e isolato in `config.ts`.
- Top-up: webhook Stripe (`invoice.paid` / `checkout.completed`) → verifica firma
  (`Stripe-Signature`) → `credit_ledger(kind='topup', delta_credits=+N, provider_ref=<id>)`.
- Idempotenza: `billing_outbox.idempotency_key` passato **verbatim** come `Idempotency-Key`.

**Lago (open-source, alternativa)** — `[DA VERIFICARE versione/percorso]`:
`POST /api/v1/events` con `transaction_id` (nostro idempotency key),
`external_customer_id` (= `billing_customer_ref`), `code` (billable metric), `properties`
(`{credits, model, capability}`). Billable metric con aggregazione `sum` su `credits`/`amount_eur`.
Lago deduplica per `transaction_id`.

**Pipeline di aggregazione e push (fuori dal percorso di richiesta):**

```
cron orario/daily (nel console; lock Redis SET NX "billing:lock" EX 300)
  1. SELECT ... FROM metering.usage_daily WHERE day = <ieri>
  2. per tenant: total_credits, total_eur, breakdown per capability
  3. INSERT INTO metering.billing_outbox (..., idempotency_key='lago:{tenant}:{window_end}')
       ON CONFLICT DO NOTHING
  4. push worker: per ogni outbox 'pending' -> POST provider (con Idempotency-Key)
       ok      -> status='sent', external_ref=<id>
       errore  -> attempts+1, last_error, resta 'pending' (backoff, max N tentativi)
  5. riconciliazione: SUM(price_eur) ledger vs SUM(amount) provider invoice mensile
```

**Riconciliazione (due assi separati):**

- **Asse 1 — costo reale vs costo calcolato:**
  `delta = SUM(usage_event.provider_cost_usd + provider_fee_usd) − SUM(provider_invoice_line.amount)`.
  Cause tipiche di scostamento: modelli non mappati nel price book; token cached fatturati
  diversamente; chiamate fallite dopo il billing del provider; risposte streaming senza `usage`
  (uso stimato `len/4`); rounding. Soglia allarme `|delta_pct| > 3%` → alert Slack.
- **Asse 2 — ricavo vs incassato:**
  `ricavo = SUM(usage_event.price_eur)` vs `incassato = SUM(billing_outbox sent) + topup`.
  Obiettivo `incassato / ricavo ≥ 1.0` (pagamento anticipato via crediti) e sfrido crediti ≈ 0.

### 4.6 Punto aperto: saldo clampato o negativo?

- **Clampato** (CHECK `balance_credits >= 0`): il settle addebita il disponibile; la differenza va
  in `credit_ledger(kind='adjust', reason='unbilled_overflow')` e alimenta un alert (possibile
  abuso). **Default proposto.**
- **Negativo consentito**: si rimuove il CHECK, il debito si recupera al top-up successivo.

Decisione di prodotto del committente.

### 4.7 Diagramma end-to-end

```
 ══════════════════ PERCORSO SINCRONO (Console / API / MCP) ══════════════════

  Browser / API client
        │  Authorization: Bearer <api_key>   oppure   Cookie aethersy_session (HMAC)
        ▼
 ┌────────────────────────────────────────────────────────────────────────────┐
 │  Caddy (TLS)  →  console:3000   (BFF Fastify + TS)                         │
 │   preHandler /api/ai/*                                                     │
 │     [1] requireTenant()  cookie→tenant_user | sha256(key)→api_key → 401/403│
 │     [2] rateLimit()      ← Redis INCR rl:{key}:{min} TTL 90s      → 429    │
 │     [3] quotaCheck()     ← usage_daily vs quota                  → 429/402 │
 │     [4] balanceCheck()   ← SELECT balance-reserved               → 402     │
 │     [5] reserve()        ─ reserve_credits() ─→ credit_account.reserved    │
 │     [6] chat({meter})                                                      │
 └───────────────┬───────────────────────────────────────────────┬────────────┘
                 │ (a) rankModels() per capability                │ (b) resolvePrice()
                 │     preferFree se crediti bassi                │     price_book_entry + override
                 ▼                                                ▼
        ┌───────────────────┐                          ┌──────────────────────────┐
        │  AI Router        │                          │   MOTORE DI PREZZO       │
        │  (ai-router.ts)   │                          │  cost_usd → ×fee → ×fx   │
        │  fetch /chat/…    │                          │  → ×(1+markup) → credits │
        └────────┬──────────┘                          └────────────┬─────────────┘
                 │  OpenRouter / Venice (HTTPS)                      │
                 │  response.usage {in,out,cached} ──────────────────┘
                 ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │  Postgres — schema `metering`                                    │
        │   usage_event_dedup ──(PK request_id, attempt_no)──┐ idempotenza │
        │   usage_event (APPEND-ONLY)  ◀──────────────────────┘            │
        │      tenant, capability, provider, model, in/out/cached,         │
        │      unità non-token, cost_usd, fee_usd, price_eur, markup,      │
        │      credits, latency_ms, request_id, flow_run_id                │
        │   post_usage() (1 transazione: insert + settle)                  │
        │        ├─ credit_account: reserved−stima, balance−reale          │
        │        └─ credit_ledger: 'reserve' → 'settle' (audit)            │
        │   usage_daily  ◀── rollup (cron) ── per dashboard/billing        │
        └───────────────────────────────┬──────────────────────────────────┘
                                        ▼
                    ┌──────────────────────────────────────┐
                    │  billing_outbox  (pending → sent)     │
                    │  idempotency_key = '{target}:{t}:{win}'│
                    └─────────┬────────────────────┬─────────┘
                              ▼                    ▼
                     ┌────────────────┐   ┌──────────────────┐
                     │  Stripe        │   │  Lago            │
                     │  meters/       │   │  POST /events    │
                     │  usage_records │   │  (transaction_id)│
                     └────────────────┘   └──────────────────┘
                              ▲ webhook top-up (invoice.paid / checkout.completed)
                              │ → credit_ledger kind='topup'

    RISPOSTA: { model, capability, answer, usage, latencyMs, attempts,
                metering: { requestId, credits, creditsRemaining } }


 ══════════ PERCORSO ASINCRONO (Worker Activepieces esegue i flow) ══════════

   Trigger (webhook / schedule / MCP su mcp.aethersy.online)
        ▼
   ┌──────────────────────┐      ┌──────────────────────────────┐
   │  app (Activepieces)  │─────▶│  worker (AP_CONTAINER_TYPE   │
   │  enqueue flow run    │      │  = WORKER, concorrenza 1)    │
   └──────────────────────┘      └──────────────┬───────────────┘
                                                │  step "Aethersy AI"
                                                │  Bearer <API key del TENANT>
                                                │  X-Aethersy-Flow-Run: <runId>
                                                ▼
                    ┌──────────────────────────────────────────────────┐
                    │  console:3000  /api/ai/chat  (stesso guard)      │
                    │  source='worker', tenant = api_key.tenant_id     │
                    └──────────────┬───────────────────────────────────┘
                                   ▼  usage_event con flow_run_id
                         (stesso ledger `metering`)

   ── metrica NON-AI (orchestrazione) ──
   cron console  ── poll /api/v1/flow-runs?projectId=… ──▶ ap_project_link
        └─ usage_event(capability='flow_run', unit='request', 1 × unit_price)
```

---

## 5. La pipeline dell'agente — dall'idea al traffico

Ogni stadio è un **job di pipeline** con stato (`draft → in_review → approved → delivered`), owner
(un droid), deliverable versionati e un **manifest di consumo** (`run_id → unità AI consumate`).

### 5.1 Tabella riassuntiva

| # | Stadio | Sub-agent | Deliverable cliente | Capability dominanti | Intensità |
|---|---|---|---|---|---|
| 1 | **Idea / Discovery** | `scout`, `compass`, `lens` | Dossier di validazione + backlog ipotesi | `txt_in`, `txt_out`, `img_in` | Media |
| 2 | **Creazione / Strategia** | `compass`, `scout`, `quill` | Strategia offerta + go-to-market + griglia prezzi | `txt_in`, `txt_out` | Bassa |
| 3 | **Brand** | `prism`, `quill`, `scout`, `vault`(advisory) | Brand Kit (logo, palette, font, linee guida) + Design System | **`img_out` alto**, `txt_out`, `img_in` | **Alta** |
| 4 | **Sito / Web** | `forge`, `quill`, `prism`, `beacon`, `probe`, `orbit` | Sito v1 pubblicato (3–7 pagine, form lead) | `txt_out`, `img_out` medio | Media |
| 5 | **Contenuti** | `beacon`, `quill`, `scout`, `lens` | Piano editoriale 90gg + cluster 8 articoli | **`txt_out` alto**, `txt_in` | **Alta** |
| 6 | **Social media** | `quill`, `prism`, `beacon`, `atlas`, `probe`, `echo` | Calendario 30gg + asset + pubblicazione schedulata | **`img_out` molto alto**, `txt_out`, `tts`, `vid_out` | **Molto alta** |
| 7 | **Pubblicità** | `beacon`, `prism`, `quill`, `forge`, `lens`, `probe` | Campagna pronta al lancio (creative+copy+targeting+landing+tracking) | `img_out` alto, `vid_out`, `txt_out` | **Alta** |
| 8 | **Traffico / Growth** | `beacon`, `lens`, `atlas`, `echo`, `compass` | Report crescita mensile + automazioni acquisizione | `txt_in`, `txt_out` | Media |

### 5.2 Dettaglio per stadio (input → agente → output → consumo)

**Stadio 1 — Idea / Discovery.** Input: settore, area geografica, budget, prodotto/competenza,
URL competitor. Agente: `scout` (mercato, competitor, domanda, keyword seed) + `compass` (ipotesi e
priorità) + `lens` (normalizza i dati). Output: `discovery-brief.md`, `competitor-matrix.csv`
(10 concorrenti × prezzo/posizionamento/canali), `keyword-seed.csv`, `hypothesis-backlog.md`
(10 ipotesi con costo/sforzo), `icp-canvas.md`. Deliverable: **Dossier di validazione + backlog di
test**. Consumo: molte chiamate brevi `txt_in/txt_out`, `img_in` basso.

**Stadio 2 — Creazione / Strategia.** Input: dossier approvato, obiettivi, vincoli. Agente:
`compass` + `scout` (benchmark come *dato*) + `quill` (formulazione offerta) + `beacon` (GTM).
Output: `positioning-statement.md`, `offer-catalog.md`, `pricing-tiers-sheet.md` (prezzi del
*cliente finale*, con range di mercato come evidenza), `go-to-market.md`, `funnel-map.md`.
Deliverable: **Strategia di offerta e go-to-market**. Consumo: quasi tutto `txt_in/txt_out` (basso
costo, alta densità di valore).

**Stadio 3 — Brand.** Input: positioning, riferimenti visivi, nome provvisorio. Agente: `prism`
(naming, moodboard, palette, tipografia, design system) + `scout` (disponibilità nome/domini) +
`quill` (tone of voice) + `vault` (check trademark/fonti, advisory). Output: `logo-kit/` (SVG+PNG
192/512+favicon), `palette-tokens.json` (mappata sui token già in uso: `--aethersy-indigo #1A0F4A`,
`--aethersy-cyan #00D4FF`, `--aethersy-amber #FF9F1C`), `typography-spec.md`, `tone-of-voice.md`,
`moodboard.png`, `brand-guidelines.pdf`, `design-system/`. Deliverable: **Brand Kit + Design
System**. Consumo: `txt_out` + **`img_out` alto** + `img_in`. **Stadio a più alta intensità di
generazione immagini** → richiede il gap `img_out`.

**Stadio 4 — Sito / Web.** Input: brand kit + design system + offerta + keyword seed. Agente:
`forge` (sitemap, wireframe, build) + `quill` (copy) + `prism` (asset) + `beacon` (SEO on-page,
tracking base) + `probe` (test link/accessibilità/form) + `orbit` (deploy + TLS). Output:
`sitemap.md`, `wireframes/`, `pages/*.html`, form contatti + webhook lead → Activepieces,
`robots.txt`/`sitemap.xml`, `tracking-plan.md`, **sito pubblicato con TLS**. Deliverable: **Sito v1
pubblicato**. Consumo: `txt_out` alto, `img_out` medio; la build non consuma AI.

**Stadio 5 — Contenuti.** Input: sito pubblicato, keyword map, ICP, tone of voice. Agente:
`beacon` (strategy, keyword map, content-gap) + `quill` (articoli, script, newsletter) + `scout`
(fonti verificabili) + `lens` (performance). Output: `content-strategy.md`,
`editorial-calendar-90d.md`, 8–20 `articles/*.md` con meta/title/description,
`internal-linking-map.csv`, `seo-onpage-report.md`, `scripts/`. Deliverable: **Piano editoriale
90gg + primo cluster 8 articoli**. Consumo: `txt_out` **alto**, `txt_in`; `img_out` basso/medio.

**Stadio 6 — Social media.** Input: brand kit, calendario, asset, canali collegati. Agente:
`quill` (caption+hook) + `prism` (asset) + `beacon` (piano, orari, hashtag) + `atlas` (scheduling/
pubblicazione su Activepieces) + `probe` (dry-run) + `echo` (commenti/DM come bozze). Output:
`social-playbook.md`, `calendar-30d.csv`, 90–120 asset statici, 8–12 reel, caption+hashtag, coda di
pubblicazione schedulata. Deliverable: **Calendario social 30gg + asset + pubblicazione
schedulata**. Consumo: **`img_out` molto alto**, `txt_out` medio, `tts` medio, `vid_out` medio →
stadio a più alta intensità complessiva dopo il brand.

**Stadio 7 — Pubblicità.** Input: offerta, ICP, landing, budget, account ads. Agente: `beacon`
(struttura campagne, pubblici, budget) + `prism` (15 statiche + 5 video) + `quill` (copy/hook/CTA) +
`forge` (landing campagna) + `lens` (CPA/ROAS, dashboard) + `probe` (QA tracking: pixel, eventi,
UTM). Output: `campaign-brief.md`, `creatives/`, `ad-copy-variants.md`, `targeting-sheet.csv`,
`landing-campagna`, `tracking-spec.md`. Deliverable: **Campagna pronta al lancio**. Consumo:
`img_out` alto, `vid_out` medio-alto, `tts` basso, `txt_out` medio.

**Stadio 8 — Traffico / Growth.** Input: sito + contenuti + campagne + analytics/ads. Agente:
`beacon` (SEO tecnico, funnel, nurturing) + `lens` (KPI, dashboard, report) + `atlas` (lead→CRM/
email, alert) + `echo` (FAQ/first-touch lead) + `compass` (priorità mensili). Output:
`seo-technical-report.md`, `keyword-map.csv`, `automation-catalog.md`, `dashboard-kpi`,
`growth-report-mensile.pdf`. Deliverable: **Report crescita mensile + automazioni attive**. Consumo:
`txt_in/txt_out` medio.

### 5.3 Metriche di successo

| Stadio | Metrica di valore | Soglia |
|---|---|---|
| 1. Idea | Ipotesi validate | ≥ 7/10 con evidenza e priorità |
| 2. Creazione | Offerta approvata | 1 positioning + 1 offer + 1 pricing approvati in 1 ciclo |
| 3. Brand | Asset approvati al 1° giro | ≥ 80% logo/palette, ≥ 60% moodboard |
| 4. Sito | Conversione | lead/1.000 visite; Lighthouse ≥ 90; idea→pubblicato ≤ 5 giorni |
| 5. Contenuti | Pubblicati + organic | ≥ 2 articoli/settimana; keyword in top-20 |
| 6. Social | Engagement & follower | engagement ≥ baseline; % post pubblicati vs pianificati ≥ 95% |
| 7. Pubblicità | CPA / ROAS | CPA ≤ target cliente; CTR per variante |
| 8. Traffico | Lead & CAC | lead qualificati/mese; % traffico owned; CAC trend |

**Metriche di piattaforma (trasversali):** costo AI per deliverable; **tasso di modelli gratuiti**
(proxy del margine); **tasso di fallback a pagamento** (proxy del rischio di costo);
time-to-deliverable; consumo per workspace vs quota (dimensione dell'upsell).

---

## 6. Modello di erogazione

| Modalità | Chi esegue | Adatta a | Cosa compra il cliente |
|---|---|---|---|
| **Self-service** | Il cliente nella Console | Micro-agenzie, freelance tecnici | Accesso alla pipeline + crediti |
| **Managed** | Aethersy (+ droid) | PMI, attività locali, chi non ha tempo | Deliverable finiti, approvati a milestone |
| **Ibrido** *(default)* | Agente autonomo, umano alle **approvazioni** | ~90% dei casi | Pipeline automatica con HITL su brand/ads/pubblicazioni |

**Incluso (non a consumo):** Console, onboarding, workspace, catalogo pipeline, scheduling,
libreria asset, approvazioni e versioning, viewer run, dashboard KPI, report periodici, template di
flow, backup/monitoraggio/sicurezza.

**A consumo (per unità AI):** ogni chiamata generativa — `txt_out`, `img_out`, `vid_out`, `tts`,
`stt` — registrata in `usage_event`; più generazioni oltre quota, run extra fuori pipeline,
re-generazioni illimitate, connessioni premium (ads/analytics avanzati).

**Unlock di prezzo:** crediti/pacchetti; piano con pool mensile + overage; retainer (pool + N
deliverable + priorità coda); sprint one-shot (prezzo fisso, es. "Brand Kit + Sito v1"); overage
pay-as-you-go; agenzia/white-label (multi-workspace, sub-tenant, margine rivenditore).

**Tutele:** quota raggiunta → pipeline `paused` (non errore); approvazione umana obbligatoria prima
di pubblicazioni social/ads e di claim legali/prezzi (coerente con `docs/agents.md`: `quill` non
documenta claim non verificabili).

---

## 7. Roadmap MVP → v1

**Obiettivo MVP:** una pipeline end-to-end su **UN cliente pilota**, con metering reale e
deliverable approvabili.

### P0 — MVP

| # | Cosa | Reparto | Perché P0 |
|---|---|---|---|
| P0.1 | **AI Router esteso alla generazione** (`img_out`, `tts`, `vid_out`) | atlas + scout | Senza generazione non esistono brand/asset/creative |
| P0.2 | **Metering centralizzato** (`usage_event` + ledger) su ogni chiamata | atlas + lens | È il cuore del modello a consumo; retrofittarlo dopo è costoso |
| P0.3 | **`pipeline/` con 4 stadi minimi**: Brand → Sito → Contenuti → Social | compass + atlas + forge + prism + quill | Pipeline minima che produce valore consegnabile |
| P0.4 | **Libreria asset** con versioning + approvazione in Console | forge + atlas | I deliverable devono essere artefatti, non chat |
| P0.5 | **Console: onboarding + workspace + run + crediti (display)** | forge + compass | Il cliente deve vedere cosa accade e quanto consuma |
| P0.6 | **Integrazioni minime**: webhook lead + 1 canale (o export pacchettizzato) | atlas + beacon | Il pilota deve arrivare a "consegnabile" |
| P0.7 | **QA end-to-end + backup/alert** del percorso pilota | probe + orbit + vault | Regola di progetto: nessuna fase chiude senza test |
| P0.8 | **Consolidamento frontend**: decidere `platform/` (mock) ↔ `console/` (reale) | compass + forge | Due SPA parallele = doppio costo di manutenzione |

### P1 — v1 (post-pilota)

Stadi **Idea/Discovery**, **Strategia**, **Pubblicità**, **Traffico** completi; billing automatico
(quote, overage, fatturazione, solleciti); integrazioni reali (Meta/LinkedIn/TikTok/YouTube,
GA4/Search Console, ads Meta/Google); HITL strutturato (code di approvazione, commenti, rollback di
versione); reportistica `growth-report` automatica via email/Slack; multi-tenant/agenzia
(sub-workspace, white-label, ruoli).

### P2 — oltre v1

Video generation con coerenza brand, voice cloning brandizzato, marketplace di agenti/pipeline, A/B
testing automatico sui creative, attribution avanzata, SLA e supporto enterprise.

---

## 8. Rischi e decisioni aperte

1. **Rivendita di chiamate AI** — l'arbitraggio sui modelli gratuiti per fatturare terzi va
   verificato contro le ToS di OpenRouter/Venice. Se non consentito, il modello "per unità" resta
   valido ma il costo variabile cambia. → `scout` + `vault`.
2. **Volatilità dei modelli gratuiti** — un modello `:free` può sparire o rate-limitare; il
   fallback a pagamento erode il margine. Mitigazione: fallback già presente nel router + buffer di
   prezzo + metrica "tasso di fallback a pagamento".
3. **Generazione non coperta** — `img_out`/`vid_out`/`tts` non esistono oggi nel router: **rischio
   #1 per la roadmap P0**.
4. **Pubblicazione via API social/ads** — richiede app review e OAuth per-provider; rate limit e
   policy di settore. Fallback MVP: export pacchetto + pubblicazione manuale assistita.
5. **HITL obbligatorio** — nessuna pubblicazione automatica su brand/ads/claim senza approvazione:
   impatto su UX e stato `pipeline_run`.
6. **Due frontend** — `platform/` (mock) e `console/` (reale) convivono: senza consolidamento i
   contratti divergono e il costo di manutenzione raddoppia.
7. **PII/GDPR** — lead e contenuti dei clienti passano per la piattaforma: cifratura credenziali,
   retention, informativa. → `vault`.
8. **`[DA VERIFICARE]`** — (a) endpoint/oggetti Stripe Billing Meters; (b) payload/versione Lago
   events; (c) esistenza di un webhook push "run completed" in Activepieces CE `0.92.3-hotfix.1`;
   (d) ~~decisione clamp-vs-negativo sul saldo~~ → **risolta (28/10/2026): clamp a zero**
   (`CHECK (balance_credits >= 0)`, eccedenza in `credit_ledger(kind='adjust',
   reason='unbilled_overflow:…')`); (e) ~~conferma `credit_unit = 0.0001 €` e `markup_bps = 12000`
   di default~~ → **confermata (28/10/2026): `credit_unit = 0.0001 €`, `markup_bps = 15000`
   (150%, margine lordo 60%)**.

---

## 9. Delta operativo rispetto al repo (fase implementativa)

| Elemento | Stato (28/10/2026) | Residuo |
|---|---|---|
| Driver DB nel BFF | **fatto** — `pg` + `ioredis` in `package.json` | — |
| Config BFF | **fatto** — `config.ts`: `dbUrl`, `redisUrl`, `meteringEnabled`, `ratePerMinute`, `signupCredits`, `veniceKey` | — |
| Env documentate | **fatto** — `.env.example` (root) e `console/.env.example` con blocco metering | — |
| Sessione | **non toccata** — il tenant si risolve a ogni richiesta da email/chiave, non dalla sessione | `tenantId` in `Session` solo se serve caching |
| `chat()` | **fatto** — `meter?: MeterInfo`, `billChat()` token-based | `attempt_no` incrementale sui fallback (oggi `1`) |
| Generazione | **fatto** — `ai-gen/{select,venice,generate}.ts` + `img_out`/`tts`/`vid_out` in `/api/ai/generate` | — |
| `routes.ts` | **fatto** — `authorizeAi()` (cookie **o** Bearer key) + release su errore; `/api/ai/balance` e `/api/ai/usage` | `flow_run` (P0.3) |
| Compose `console` | **fatto** — parametri discreti `CONSOLE_PG*`/`CONSOLE_REDIS_*` derivati da `AP_POSTGRES_*`/`AP_REDIS_PASSWORD` (nessuna URL con credenziali); dipendenze su `postgres`/`redis` | — |
| Redis | **fatto** — riuso dello stack, namespace `rl:` | quota negativa su Redis non necessaria |
| Migrazioni | **fatto** — `metering/schema.sql` → `schema.ts` (bundle) + `migrate.ts` idempotente all'avvio, schema isolato | — |
| Test | **fatto** — `npm run test:metering` (19 asserzioni pure su prezzi + pattern) | test di integrazione con DB reale |
| Snapshot listini | **solo seed** statico (price book v1) | cron di aggiornamento `price_book` + `fx_usd_eur` |

---

*Fine documento. Nessuna implementazione è stata eseguita: questo file è progettazione. Le voci
`[DA VERIFICARE]` vanno risolte prima della fase di build.*
