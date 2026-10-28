# delivery-report.md — Report finale di consegna

> Richiesto da `AGENTS.md` §13. Riepilogo di chiusura del progetto **aethersy**.
> Data: **2026-10-28**. Fonte di verità per lo stato di dettaglio: `docs/phases.md`.

## 1. Stato per fase

| Fase | Descrizione | Stato | Note |
|---|---|---|---|
| 0 | Accesso SSH e preparazione repo | **DONE** | Repo creato; accesso SSH al VPS Aruba (`195.231.79.221`) via chiave `ed25519` |
| 1 | Bootstrap e hardening | **DONE** | Ubuntu 24.04, swap 2 GB, utente `deploy` (+ gruppo `docker`), root/password SSH off, ufw 22/80/443, fail2ban, unattended-upgrades |
| 2 | DNS e reverse proxy | **DONE** | `aethersy.online` su GoDaddy; Caddy + Let's Encrypt su `app.`/`mcp.`/`console.`; apex + `www` → 301 |
| 3 | Deploy stack Activepieces | **DONE** | Stack up e healthy; Postgres/Redis/worker mai esposti |
| 4 | Primo accesso e chiusura signup | **DONE** | Admin creato; registrazioni pubbliche chiuse (`INVITATION_ONLY_SIGN_UP`) |
| 5 | Provider AI (OpenRouter / Venice) | **DONE** | OpenRouter attivo (464 modelli); flow "Ask AI" end-to-end → output `PONG`. Venice: chiave valida **senza credito** → non aggiunto (opzionale) |
| 6 | Slack | **DONE** | Webhook in `.env`; alert su fallimento smoke test (cron 15 min) + flow "Slack notification" |
| 7 | Endpoint MCP | **DONE** | Handshake OAuth reale con client MCP → **42 tool**; `/mcp/platform` per token di piattaforma; consent 404 corretto in Caddy |
| 8 | Branding | **DONE** | Nome/logo/palette **Aethersy** applicati (patch `theme.js` + design token CSS); verificati live |
| 9 | Backup e monitoraggio | **DONE** | `backup.sh` con rotazione; **restore testato** su DB temporaneo (83 tabelle) |
| 10 | Review finale e consegna | **DONE** | Audit infrastrutturale + **clean-clone** verificato; restano solo azioni utente |
| 11 | Aethersy Console (fusion A+B+C) | **DONE** | SPA React + BFF Fastify con sessione httpOnly e **AI Router** multimodale; live su `console.aethersy.online` |

Nessuna fase è `BLOCKED`.

## 2. Variabili d'ambiente

Tutte definite in `.env` sul VPS (git-ignorato, `chmod 600`, owner `deploy`); i placeholder sono in `.env.example` (versionato). Nessun valore reale è nel repo.

**Segreti critici (da salvare offline — vedi §5)**

| Variabile | Generazione | Impatto se persa |
|---|---|---|
| `AP_ENCRYPTION_KEY` | `openssl rand -hex 16` | **Irrecuperabile**: le credenziali delle connessioni dei flow diventano illeggibili |
| `AP_JWT_SECRET` | `openssl rand -hex 32` | Firma dei JWT: rotarlo disconnette tutti gli utenti |

**Core / infrastruttura**

| Variabile | Dove | Note |
|---|---|---|
| `AP_VERSION` | `.env` | Pin immagine: `0.92.3-hotfix.1` (mai `latest`) |
| `AP_FRONTEND_URL` | `.env` | `https://app.aethersy.online` |
| `AP_MCP_URL` | `.env` | `https://mcp.aethersy.online` (obbligatoriamente ≠ `AP_FRONTEND_URL`) |
| `AP_POSTGRES_*`, `AP_REDIS_*` | `.env` | Credenziali DB/cache, solo rete interna |
| `AP_ENVIRONMENT`, `AP_TELEMETRY_ENABLED` | `.env` | `prod`, telemetria off |
| `AP_HOST_PORT` | `.env` | `8080` — mapping host dell'app (solo localhost) |
| `AP_EXECUTION_MODE`, `AP_WORKER_CONCURRENCY`, `AP_REUSE_SANDBOX` | `.env` | `UNSANDBOXED`, `1`, `true` (blast radius OOM ridotto) |
| `AP_NETWORK_MODE`, `AP_SSRF_ALLOW_LIST` | `.env` | Egress del codice dei flow (vedi `docs/security.md` §5) |
| `AP_ALLOW_OPEN_SIGN_UP` | `.env` (assente) | Assente → signup su invito; **non esiste** `AP_SIGN_UP_ENABLED` |
| `APP_DOMAIN`, `MCP_DOMAIN`, `APEX_DOMAIN`, `ACME_EMAIL` | `.env` | Usati da Caddy |
| `CONSOLE_DOMAIN`, `CONSOLE_VERSION`, `CONSOLE_SESSION_SECRET` | `.env` | Console: `console.aethersy.online`, `0.1.0`, firma cookie (hex 32) |
| `OPENROUTER_API_KEY` | `.env` | Consumata dalla **Console** (AI Router). Per Activepieces la chiave è invece in **AI Center → Providers** (non da env) |
| `VENICE_API_KEY`, `VENICE_BASE_URL` | `.env` | Riferimento; attivabile solo con credito |
| `SLACK_WEBHOOK_URL` | `.env` | Alert cron + flow |
| `TZ` | `.env` | `Europe/Rome` |

**Non configurabili da env:** i provider AI di Activepieces (nessuna `AP_AI_PROVIDER`) e il branding CE (nessuna env: patch via bind-mount + `scripts/05-branding.sh`). Vedi `docs/phases.md` → "Verifica §11".

## 3. Comandi operativi

| Azione | Comando |
|---|---|
| **Start / deploy** | `./scripts/03-deploy.sh` (valida `.env`, build `console`, `up -d`, branding) |
| **Stato** | `docker compose ps` |
| **Stop** | `docker compose stop` |
| **Log** | `docker compose logs -f app` / `worker` / `console` / `caddy` |
| **Smoke test** | `./scripts/04-smoke-test.sh` (5 check end-to-end) |
| **Update versione** | `./scripts/backup.sh` → cambia `AP_VERSION` → `docker compose pull && docker compose up -d` → `./scripts/05-branding.sh` → `./scripts/04-smoke-test.sh` |
| **Rollback** | ripristina il tag precedente in `AP_VERSION` → `docker compose pull && docker compose up -d`; per il DB ripristina il dump (vedi `docs/restore.md`) |
| **Backup** | `./scripts/backup.sh` (dump Postgres + tar Redis, rotazione 7g/4w) |
| **Restore** | `docs/restore.md` (procedura testata) |
| **Branding** | `./scripts/05-branding.sh` (obbligatorio dopo ogni cambio di `AP_VERSION`) |
| **Ricrea Caddy** | `docker compose up -d --force-recreate caddy` (**obbligatorio** dopo modifiche a `Caddyfile` o env di Caddy) |

> **Mai** `docker compose down -v`: cancella i volumi (database e Redis).

## 4. Definition of Done (`AGENTS.md` §12)

| # | Criterio | Esito |
|---|---|---|
| 1 | `app.` e `mcp.` in HTTPS con certificato valido | **OK** — Let's Encrypt, anche `console.` |
| 2 | Un flow di test usa un provider AI end-to-end | **OK** — flow "Ask AI" → `PONG` (OpenRouter) |
| 3 | Slack riceve le notifiche configurate | **OK** — alert cron + flow, HTTP 200 |
| 4 | Il worker esegue i flow e non è esposto | **OK** — `AP_CONTAINER_TYPE=WORKER`, nessuna porta pubblica |
| 5 | Backup automatico + restore **provato** | **OK** — restore su DB temporaneo (83 tabelle) |
| 6 | `runbook.md` / `security.md` / `restore.md` completi | **OK** — + `phases.md`, `agents.md`, questo report |
| 7 | Da repo pulito + `.env` → `docker compose up -d` ricostruisce lo stack | **OK** — clean-clone verificato (73 file, no `.env`; `config` + build `console` OK) |
| 8 | Nessun segreto nel repo; i due segreti critici salvati offline | **PARZIALE** — nessun segreto nel repo **OK**; backup offline dei due segreti **azione utente** (vedi §5) |

## 5. Debito tecnico e prossimi passi

### Azioni utente (bloccano solo il criterio #8, non l'operatività)

1. **Rotazione delle credenziali esposte in chat** — procedura dettagliata in `docs/security.md` §6.1/6.2, in ordine di priorità:
   - **P0:** token bot Telegram, password SSH VPS Aruba, chiave privata SSH VPS, password pannello SiteGround, chiave privata SSH SiteGround.
   - **P1:** `OPENROUTER_API_KEY`, `VENICE_API_KEY`, `NVIDIA_API_KEY`, `RENDER_API_KEY` (quest'ultima revocabile: servizio Render dismesso).
   - **P2:** `SLACK_WEBHOOK_URL`, `AP_JWT_SECRET` (opzionale), ACL `.env`.
2. **Backup offline dei segreti critici** — salva `AP_ENCRYPTION_KEY` e `AP_JWT_SECRET` in un gestore password **fuori dal VPS** (`docs/security.md` §8).
3. Aggiornare la colonna **Stato** della tabella §6.1 di `docs/security.md` a `fatto (data)` man mano che si ruota.

### Debito tecnico residuo (non bloccante)

- **Branding CE:** il patch vive dentro l'immagine → dopo ogni cambio di `AP_VERSION` va rieseguito `scripts/05-branding.sh`. Stringhe "Activepieces" residue nel bundle (testi di supporto, "Model by Activepieces", SAML SP entity id) **non** rimovibili senza rebuild del frontend.
- **Asset brand:** `logo.svg`/`favicon.ico` sono derivati dal JPEG sorgente (wrapper PNG-in-SVG). Sostituibili con vettoriali puliti se disponibili.
- **MCP consent:** il fix in Caddy dipende dal comportamento della versione pinnata (`0.92.3-hotfix.1`, upstream PR #15376 non ancora inclusa). Da rivalutare al prossimo bump di `AP_VERSION`.
- **Venice:** chiave valida ma senza credito; attivabile in qualsiasi momento come "Other (OpenAI Compatible)".
- **Console:** da validare in browser (login + AI Center) a cura dell'utente; il build/health sono verificati.

## 6. Input ancora mancanti

Nessun input infrastrutturale bloccante: tutti quelli elencati in `AGENTS.md` §6 sono stati ricevuti. Restano da ricevere/eseguire solo le **azioni utente** di §5 (rotazione credenziali e backup offline dei segreti), che non richiedono nuovi input tecnici.
