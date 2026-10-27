# AGENTS.md — Progetto "aethersy"

> Specifica operativa per Droid (Factory AI). Leggi tutto prima di scrivere una riga di codice.

## 0. Ruolo

Agisci come **lead platform engineer**. Costruisci, deploya e documenta l'infrastruttura del progetto "aethersy" su un VPS Aruba. Puoi delegare a sottotask/droid paralleli, ma tu sei responsabile della coerenza finale.

**Metodo di lavoro, obbligatorio:**
1. Una fase alla volta, nell'ordine indicato.
2. Ogni fase termina con i comandi di verifica elencati negli "Acceptance criteria". Se un criterio non passa, **non** proseguire: diagnostica, correggi, ritenta.
3. Commit atomici con messaggi `fase-N: <descrizione>`.
4. Aggiorna `docs/phases.md` con esito e timestamp di ogni fase.
5. Prima di inventare un nome di variabile d'ambiente, verifica nelle doc ufficiali (vedi §11).

**Regola d'oro:** se un'informazione non è nel repo né nelle doc ufficiali, chiedi invece di indovinare. Le uniche eccezioni sono elencate in §11 come "verifica".

## 1. Cos'è aethersy

Piattaforma di automazione self-hosted basata su **Activepieces** (open source), brandizzata `aethersy`, esposta su due sottodomini pubblici:

- `app.aethersy.online` → interfaccia web + API REST di Activepieces
- `mcp.aethersy.online` → endpoint MCP (Model Context Protocol), per pilotare Activepieces da client AI esterni (Claude, ChatGPT, Droid stesso)

Provider AI dei flow: **OpenRouter** (primario, gateway con failover) e **Venice.ai** (endpoint compatibile OpenAI, opzionale).
Notifiche operative: **Slack**.

Obiettivo: piattaforma stabile, sicura, aggiornabile, con segreti fuori dal codice e backup verificati.

## 2. Infrastruttura

> **Decisione architetturale (27/10/2026, aggiornata):**
> - **Activepieces + worker → VPS Aruba** (`195.231.79.221`), con **Caddy** in TLS termination sullo stesso VPS.
> - **DNS `aethersy.online` → GoDaddy** (record A `@`/`app`/`mcp` → IP del VPS; `www` → apex). Il dominio `aethersy.com` (su Vercel) è **abbandonato**: l'account Vercel è limitato e non permetteva la creazione dei record.
> - Il servizio Render preesistente `aethersy-platform` (repo `mattiadeblasio94-jpg/aethersy-platform`, orchestrazione multiagente "fase 1") è **sostituito** dal piano Activepieces di questa spec.

| Voce | Valore |
|---|---|
| Provider VPS | Aruba Cloud |
| OS | Ubuntu 24.04 LTS (installazione pulita) |
| Dominio | `aethersy.online` — DNS gestito su **GoDaddy** (NS `ns59/ns60.domaincontrol.com`; registrato 27/10/2026) |
| Sottodomini | `app.` e `mcp.` (record A → IP del VPS Aruba `195.231.79.221`); apex + `www` → 301 verso `app.` |
| Accesso | SSH con chiave ed25519; utente `deploy` con sudo; root disabilitato al login |
| Porte pubbliche | 22, 80, 443 — nient'altro |
| Swap | 2 GB (file, non partizione) |
| Runtime | Docker Engine + Compose v2, via repo ufficiale Docker |

## 3. Architettura target

```
                 Internet
                    |
        [ ufw: solo 22 / 80 / 443 ]
                    |
        +-----------v-----------+
        |   caddy (container)   |   80/443, TLS automatico
        |   reverse proxy       |
        +-----+-----------+-----+
              |           |
   app.aethersy.online   mcp.aethersy.online
              |           |
              v           v
        +-----------------------+
        |  activepieces:8080    |   rete docker interna
        |  (UI + API + /mcp)    |
        +----+--------+---------+
             |        |
        +----v--+  +--v----+
        |postgres|  | redis |        NON esposti pubblicamente
        +--------+  +---+---+
                        |
                  +-----v------+
                  |   worker   |    esecuzione dei flow
                  +--+------+--+
                     |      |
              HTTPS  |      |  HTTPS
                     v      v
       api.openrouter.ai /    Slack API
          api.venice.ai
```

Separazione dei ruoli: `activepieces` serve UI/API, `worker` esegue. Nessun processo gira come root dentro i container se l'immagine offre un utente dedicato.

## 4. Vincoli non negoziabili

1. **Zero segreti nel repo.** Tutto in `.env` (git-ignorato) + `.env.example` versionato con placeholder.
2. **Immagini con tag pinnato** (es. `ghcr.io/activepieces/activepieces:0.x.y`), mai `latest` in produzione.
3. **Postgres, Redis e worker non esposti**: bind su rete Docker interna, `ports:` solo se necessario e sempre `127.0.0.1:`.
4. **TLS obbligatorio** su entrambi i sottodomini, redirect HTTP→HTTPS.
5. **Firewall default-deny** tranne 22/80/443. fail2ban attivo. Login root con password disabilitato.
6. **`AP_ENCRYPTION_KEY` e `AP_JWT_SECRET` sono critici**: se persi, le credenziali dei flow diventano irrecuperabili. Vanno generati una volta e salvati offline.
7. Ogni fase chiude con test verificabile e commit.

## 5. Struttura del repo

```
aethersy-infra/
├── AGENTS.md                  # questo file
├── README.md                  # overview + quickstart
├── .gitignore                 # .env, backups/, caddy/data/
├── docker-compose.yml
├── .env.example
├── caddy/
│   └── Caddyfile
├── scripts/
│   ├── 00-bootstrap.sh        # pacchetti base, timezone, swap
│   ├── 01-hardening.sh        # utente deploy, ssh, ufw, fail2ban
│   ├── 02-dns-check.sh        # verifica propagazione record A
│   ├── 03-deploy.sh           # pull + up, con controllo .env
│   ├── 04-smoke-test.sh       # health check end-to-end
│   └── backup.sh              # dump postgres + volumi, rotazione
└── docs/
    ├── runbook.md             # operazioni quotidiane
    ├── security.md            # modello di minaccia + hardening
    ├── phases.md              # log di esecuzione fasi
    └── restore.md             # procedura di ripristino testata
```

Tutti gli script: `set -euo pipefail`, idempotenti, con `usage()` se serve un argomento.

## 6. Input necessari prima di iniziare

| # | Input | Dove | Blocca la fase |
|---|---|---|---|
| 1 | IP pubblico del VPS | pannello Aruba | 0 — **ricevuto: `195.231.79.221`** |
| 2 | Accesso SSH iniziale (utente + chiave o password) | pannello Aruba | 0 — **ricevuto e funzionante**: VPS Aruba `195.231.79.221`; chiave `aethersy_deploy_ed25519` installata; utente `deploy` (root/password disabilitati dopo hardening) |
| 3 | Chiavi provider AI: OpenRouter (primario) e/o Venice | openrouter.ai/keys, venice.ai/settings/api | 5 |
| 4 | Email per TLS + alert | — | 2 |
| 5 | Webhook Slack (o workspace dove installare l'app) | api.slack.com | 6 |
| 6 | Accesso DNS (pannello **Vercel** / token API) | vercel.com dashboard → Domains | 2 — **account accessibile ma deploy bloccato**; record A `app.`/`mcp.` da impostare verso `195.231.79.221` |

Se un input manca, esegui tutte le fasi possibili e marca le altre come `BLOCKED: input #N` in `docs/phases.md`.

## 7. Fasi

### Fase 0 — Accesso e preparazione
**Task:** verifica accesso SSH con chiave; se assente, guida l'utente alla generazione di una coppia `ed25519` e al caricamento della pubblica nel pannello Aruba. Imposta `~/.ssh/config` con alias `aethersy`. Crea il repo locale con la struttura di §5.

**Acceptance:** `ssh aethersy 'uname -a'` risponde con Ubuntu 24.04; il repo esiste con `.gitignore` e README.

### Fase 1 — Bootstrap e hardening
**Task:** `00-bootstrap.sh` (apt update/upgrade, timezone Europe/Rome, unattended-upgrades, swap 2 GB con `vm.swappiness=10`, Docker da repo ufficiale, `docker compose` v2). `01-hardening.sh` (utente `deploy` con sudo, copia `authorized_keys`, `PermitRootLogin no`, `PasswordAuthentication no`, ufw default deny + allow 22/80/443, fail2ban su sshd).

**Acceptance:**
- `swapon --show` → 2 GB
- `ufw status verbose` → default deny, allow 22/80/443
- `systemctl is-active fail2ban` → active
- `docker run --rm hello-world` → ok
- login `ssh deploy@VPS` funziona, `ssh root@VPS` no

### Fase 2 — DNS e reverse proxy
**Task:** `02-dns-check.sh` verifica che `app.aethersy.online` e `mcp.aethersy.online` risolvano sull'IP del VPS (record A, TTL basso). Scrivi `caddy/Caddyfile` (§8) e il servizio Caddy in compose. In questo momento l'app non esiste ancora: usa un `respond "ok"` temporaneo e verifica che il certificato venga emesso.

**Acceptance:** `curl -sI https://app.aethersy.online` → 200; `openssl s_client -connect app.aethersy.online:443` mostra un certificato valido emesso per il dominio; idem `mcp.`.

### Fase 3 — Deploy dello stack Activepieces
**Task:** scrivi `docker-compose.yml` e `.env.example` (§8). Genera `AP_ENCRYPTION_KEY` e `AP_JWT_SECRET`. Tira su postgres, redis, activepieces, worker, caddy. `03-deploy.sh` controlla che `.env` esista e che i segreti non siano i placeholder prima del `up -d`.

**Acceptance:** `docker compose ps` → tutti `running`/`healthy`; `curl -s http://127.0.0.1:8080/api/v1/health` (endpoint verificato, §11) → ok; nessuna porta di postgres/redis raggiungibile dall'esterno.

### Fase 4 — Primo accesso e chiusura registrazioni
**Task:** apri il primo account admin su `https://app.aethersy.online`. Le registrazioni pubbliche sono già chiuse per default (gate `AP_ALLOW_OPEN_SIGN_UP`, assente ≠ `true`; `AP_SIGN_UP_ENABLED` **non** esiste — vedi §11). Per aggiungere utenti usa l'invito da Platform Admin → Users. Salva le credenziali admin in `docs/runbook.md` (senza password in chiaro nel repo).

**Acceptance:** login riuscito; un secondo tentativo di signup è bloccato.

### Fase 5 — Provider AI (OpenRouter + Venice)
**Task:** configura i provider AI a runtime in **Platform Admin → AI Center → Providers** (Activepieces non li legge da env, vedi §11 voce 6). Aggiungi **OpenRouter** come provider primario (gateway nativo, funzionante) e, opzionalmente, **Venice** come "Other (OpenAI Compatible)" con base URL `https://api.venice.ai/api/v1` (utilizzabile solo dopo aver caricato credito). Delega il failover a OpenRouter. Verifica il catalogo Venice con `GET https://api.venice.ai/api/v1/models`. Crea un flow di test "Ask AI" che risponde a un prompt.

**Stato:** `DONE` (27/10/2026). OpenRouter inserito via `POST /api/v1/ai-providers` (`provider=openrouter`, `config={}`, `auth={apiKey}`), `status=active`, `enabledForChat=true`, 464 modelli. Test end-to-end `POST /api/v1/ai/execute` (`action=ASK_AI`, `openai/gpt-4o-mini`) → risposta reale. Venice non aggiunto: chiave valida ma senza credito.

**Acceptance:** il flow di test restituisce una risposta reale dal provider configurato, senza errori di auth, e il run appare verde nella cronologia. (Verificato a livello API; il flow di test UI va confermato in Fase 10.)

### Fase 6 — Slack
**Task:** crea l'app Slack, prendi il webhook (o token bot), salva in `.env`. Aggiungi: (a) un flow Activepieces che notifica un evento, (b) un alert di sistema se `04-smoke-test.sh` fallisce via cron.

**Acceptance:** messaggio di test recapitato sul canale corretto.

### Fase 7 — Endpoint MCP
**Task:** abilita il server MCP di Activepieces (vedi §11: `AP_MCP_URL`). Esponi l'hostname `mcp.aethersy.online` via Caddy preservando l'`Host`. Documenta come collegare Claude/ChatGPT con l'URL e il flusso OAuth.

**Acceptance:** `curl` sull'endpoint MCP risponde con handshake valido; un client AI esterno elenca almeno un tool Activepieces.

### Fase 8 — Branding
**Task:** nome `aethersy`, logo, colori, favicon dove Activepieces lo consente via env o asset. Se una personalizzazione richiede la versione Enterprise, documenta chiaramente cosa è community e cosa no.

**Acceptance:** l'header dell'app mostra `aethersy`; nessun placeholder "Activepieces" residuo nella UI principale.

### Fase 9 — Backup e monitoraggio
**Task:** `backup.sh` → `pg_dump` + tar dei volumi rilevanti, cifratura opzionale, rotazione 7 giornalieri + 4 settimanali, destinazione fuori dal VPS (almeno copia locale in `backups/` con istruzioni per lo scarico). Cron notturno. Scrivi `docs/restore.md` con procedura di restore **testata davvero** su un secondo database.

**Acceptance:** il dump esiste, ha dimensione plausibile, e un restore su DB temporaneo restituisce tabelle popolate. `docker compose config` non emette warning.

### Fase 10 — Review, hardening finale e consegna
**Task:** rileggi tutto lo stack. Verifica: nessun segreto nel git history, porte esposte minime, `unattended-upgrades` attivo, log con rotazione, immagini pinnate. Scrivi `docs/security.md` e `docs/runbook.md` con: deploy, update di versione, rollback, restore, troubleshooting. Prepara una checklist per il passaggio di consegne.

**Acceptance:** clonando il repo su una macchina pulita, con solo `.env` compilato, `docker compose up -d` porta lo stack su. Documentato nero su bianco.

## 8. File chiave — scheletri di partenza

Gli scheletri di `docker-compose.yml`, `caddy/Caddyfile`, `.env.example` e `.gitignore` indicati originariamente in questa sezione sono stati **implementati** nella repo (cartelle `docker-compose.yml`, `caddy/`, `.env.example`, `.gitignore`), con i nomi di variabile verificati nelle doc ufficiali. Vedi `docs/phases.md` → "Verifica §11" per le fonti.

## 9. Sicurezza — checklist

- [ ] ufw default deny incoming, allow 22/80/443
- [ ] fail2ban jail `sshd` attiva
- [ ] `PasswordAuthentication no`, `PermitRootLogin no`
- [ ] utente `deploy` con sudo, no password per sudo se possibile
- [ ] `unattended-upgrades` attivo per i security update
- [ ] Docker daemon: log driver con `max-size`, non esporre socket oltre il necessario
- [ ] Nessun container con `network_mode: host`
- [ ] Porte pubblicate solo quelle di Caddy
- [ ] Nessun segreto in `docker-compose.yml`, solo `${...}` da `.env`
- [ ] `.env` con permessi `600`, owner `deploy`
- [ ] Backup dei due segreti critici **fuori dal VPS**

## 10. Convenzioni

- Branch `main` protetto; lavoro su `fase-N` poi merge.
- Commit: `fase-N: <cosa>` — es. `fase-1: hardening ssh + ufw`.
- Script in `scripts/` eseguibili, con commento d'intestazione: scopo, prerequisiti, effetto.
- Documentazione in italiano; identificatori di codice e variabili in inglese.
- Nessun `latest` nei tag, nessun `sudo` dentro gli script se già root (controlla `$EUID`).

## 11. Da verificare nelle doc ufficiali (non inventare)

Esito della verifica (27/10/2026), fonti e dettagli in `docs/phases.md`:

1. **Worker:** `AP_CONTAINER_TYPE` = `APP` | `WORKER` | `WORKER_AND_APP` (default `WORKER_AND_APP`). Il worker va sovrascritto con `AP_CONTAINER_TYPE=WORKER` e un `AP_FRONTEND_URL` interno che punta al servizio app.
2. **MCP:** `AP_MCP_URL` (hostname pubblico dedicato, obbligatoriamente diverso da `AP_FRONTEND_URL`). Nessun token statico: l'auth è OAuth. Route da proxare sull'hostname MCP: `/mcp`, `/mcp/platform`, `/authorize`, `/token`, `/register`, `/revoke`, `/userinfo`, `/.well-known/oauth-*`, `/.well-known/openid-configuration`, `/.well-known/jwks.json`. Va preservato l'`Host` pubblico.
3. **Tag stabile:** `0.92.3-hotfix.1` (marcata *Latest* su GitHub releases, 23/10/2026).
4. **Branding community:** nessuna variabile env di branding documentata per la Community edition; logo/nome via Platform Admin (UI). White-label completo = Enterprise.
5. **Health check:** `GET /api/v1/health`.
6. **Provider AI:** Activepieces **non** legge i provider da env (nessun `AP_AI_PROVIDER` né env per le chiavi). Config a runtime in **Platform Admin → AI Center → Providers**: OpenRouter = provider *Gateway* nativo; Venice = **Other (OpenAI Compatible)** con base URL `https://api.venice.ai/api/v1`. Nessun failover automatico tra provider: delegarlo a OpenRouter (array `models`). **OpenRouter configurato** (27/10/2026, `id=KGJ2h1RWYJSUIUZFQpyFQ`, active, chat-enabled, 464 modelli; test end-to-end OK). Venice: chiave valida (`GET /models` 200) ma **senza credito** (inferenza → `Insufficient USD or Diem balance`), non aggiunto.
7. **Modelli Venice:** `GET https://api.venice.ai/api/v1/models` (Bearer auth, OpenAI-compatible).
8. **Porta app:** l'app ascolta su **`80`** dentro il container; il mapping host è `AP_HOST_PORT` (default `8080`). **Non** impostare `AP_PORT` (porta interna: cambiarla rompe il mapping).
9. **`AP_SIGN_UP_ENABLED` NON esiste** nelle doc attuali. Controllo registrazioni = ZeroBounce (`AP_ZEROBOUNCE_API_KEY`) + Cloudflare Turnstile (`AP_TURNSTILE_SITE_KEY`/`AP_TURNSTILE_SECRET_KEY`), e/o disattivazione dall'area Platform Admin.

## 12. Definition of Done globale

Il progetto è consegnato quando:

1. `https://app.aethersy.online` e `https://mcp.aethersy.online` rispondono in HTTPS con certificato valido.
2. Un flow di test usa un provider AI (OpenRouter, o Venice con credito) e funziona end-to-end.
3. Slack riceve le notifiche configurate.
4. Il worker esegue i flow e non è esposto pubblicamente.
5. Esiste un backup automatico e un restore **provato**.
6. `docs/runbook.md`, `docs/security.md`, `docs/restore.md` sono completi e aggiornati.
7. Da repo pulito + `.env` compilato, `docker compose up -d` ricostruisce lo stack.
8. Nessun segreto nel repo; i due segreti critici sono salvati offline.

## 13. Report finale atteso

Alla chiusura, produci un riepilogo con:
- stato per fase (fatto / bloccato / con note)
- variabili d'ambiente usate e dove sono definite
- comandi operativi principali (start, stop, update, rollback, restore)
- debito tecnico residuo e prossimi passi consigliati
- input ancora mancanti

## 14. Regole per te, Droid

- **Non** eseguire comandi distruttivi (`rm -rf`, `docker compose down -v`, `docker volume prune`) senza dirlo.
- **Non** chiedere conferma per ogni comando: esegui, verifica, riporta in blocco.
- **Non** modificare `docker-compose.yml` senza aggiornare `.env.example` di conseguenza.
- Quando incontri un'ambiguità di §11, verifica nelle doc e **documenta la scelta** in `docs/phases.md` con la fonte.
- Mantieni sempre il VPS in stato funzionante a fine fase: non lasciare il reverse proxy o il firewall in configurazioni intermedie rotte.
- Operazioni distruttive o su sistemi remoti (SSH/ufw/DB): da confermare caso per caso, non in bianco.
