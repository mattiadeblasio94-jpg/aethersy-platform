# phases.md — Log di esecuzione fasi

> Aggiornare dopo **ogni** fase con: data/ora, esito, comandi di verifica, note.
> Stati ammessi: `DONE`, `BLOCKED: input #N`, `NOTE`.
>
> Ultima revisione: 2026-10-27

## Stato sintetico

| Fase | Descrizione | Stato |
|---|---|---|
| 0 | Accesso SSH e preparazione repo | `NOTE` — repo creato, IP VPS ricevuto (`195.231.79.221`), credenziali ricevute; SSH `BLOCKED` (ban porta 22; SiteGround solo chiave) |
| 1 | Bootstrap e hardening | `NOTE` — script pronti, esecuzione `BLOCKED: input #2` |
| 2 | DNS e reverse proxy | `NOTE` — Caddyfile pronto; DNS su Vercel ma non punta al VPS, `BLOCKED: input #4/#6` |
| 3 | Deploy stack Activepieces | `NOTE` — compose/env pronti, `BLOCKED: input #1/#2` |
| 4 | Primo accesso e chiusura signup | `BLOCKED: input #1/#2` |
| 5 | Provider AI (OpenRouter/Venice) | `NOTE` — chiavi testate (OpenRouter ok, Venice senza credito), config UI `BLOCKED: input #1/#2` |
| 6 | Slack | `BLOCKED: input #1/#5` |
| 7 | Endpoint MCP | `BLOCKED: input #1` |
| 8 | Branding | `BLOCKED: input #1` |
| 9 | Backup e monitoraggio | `NOTE` — `backup.sh` pronto, restore da testare `BLOCKED: input #1` |
| 10 | Review finale e consegna | `BLOCKED: input #1` |

## Verifica §11 — nomi variabili, versioni, route

Data: **2026-10-27**. Metodo: doc ufficiali Activepieces (incluse le varianti `.md` per LLM) e file raw del repo GitHub upstream, più verifica mirata sui log di fetch salvati come artifact.

| # | Voce | Esito verificato | Fonte |
|---|---|---|---|
| 1 | Worker | `AP_CONTAINER_TYPE` = `APP` \| `WORKER` \| `WORKER_AND_APP` (default `WORKER_AND_APP`). Worker same-host = `AP_CONTAINER_TYPE=WORKER` + `AP_FRONTEND_URL=http://app` (nome servizio), **senza** token. `AP_WORKER_TOKEN` serve **solo** se il worker gira su una macchina separata (generato con `npx @activepieces/cli workers token` dallo stesso `AP_JWT_SECRET`) | `environment-variables.md`, `docker-compose.md`, `separate-workers.md` |
| 2 | MCP | `AP_MCP_URL` = hostname pubblico dedicato, deve differire da `AP_FRONTEND_URL`. Auth **OAuth**, nessun token statico. Route: `/mcp`, `/mcp/platform`, `/authorize`, `/token`, `/register`, `/revoke`, `/userinfo`, `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource/*`, `/.well-known/openid-configuration`, `/.well-known/jwks.json`. Preservare `Host`/`X-Forwarded-Host`. Consent screen su `/mcp-authorize` (host principale) | doc MCP Activepieces |
| 3 | Tag stabile | `0.92.3-hotfix.1` — GitHub *Latest*, 23/10/2026. Il compose upstream `main` resta su `0.92.2` | GitHub releases |
| 4 | Branding | Nessuna env di branding nella Community. Nome/logo via Platform Admin. White-label completo = Enterprise | doc branding |
| 5 | Health | `GET /api/v1/health` | doc API |
| 6 | Provider AI (env) | **Nessuna env configura un provider AI.** Non esistono `AP_AI_PROVIDER` né env per le chiavi dei provider. I provider si configurano a runtime nella UI (**Platform Admin → AI Center → Providers**). Le uniche env attinenti: `AP_MODEL_CATALOG_URL` (metadati modelli, default CDN), `AP_AI_CREDIT_USD_VALUE`, `AP_OPENAI_API_KEY` (solo embedding per tool search) | `environment-variables.md`, `setup-ai-providers.md` |
| 7 | Modelli Venice | `GET https://api.venice.ai/api/v1/models` (Bearer, OpenAI-compatible). Test 27/10/2026: **HTTP 200** (chiave valida) | doc Venice, test live |
| 8 | Porta app | App in ascolto su **80** nel container (upstream: `'8080:80'`). `AP_HOST_PORT` = mapping host. **Non** impostare `AP_PORT` (porta interna: cambiarla rompe il mapping) | compose upstream, `environment-variables.md` |
| 9 | Signup | **`AP_SIGN_UP_ENABLED` NON esiste.** Controllo: `AP_ZEROBOUNCE_API_KEY`, `AP_TURNSTILE_SITE_KEY`/`AP_TURNSTILE_SECRET_KEY`, o disattivazione da Platform Admin | `environment-variables.md` |
| 10 | Concorrenza worker | `AP_WORKER_CONCURRENCY` (default `5`). Il default 5 è una modalità di compatibilità: aumenta il blast radius di un OOM. Consigliato `1` + scale orizzontale per replica. `AP_REUSE_SANDBOX=true` con concorrenza 1 | `workers.md`, `production-setup.md`, `environment-variables.md` |
| 11 | Egress di rete | `AP_NETWORK_MODE` = `UNRESTRICTED` (default) \| `STRICT` (guardia SSRF in-process). Eccezioni: `AP_SSRF_ALLOW_LIST` (IP/CIDR). Il layer server-side (OAuth/Vault/webhook/MCP) è **sempre** filtrato. Guardia best-effort: il confine reale va imposto a livello infrastrutturale | `network-security.md`, `environment-variables.md` |
| 12 | Edizione | `AP_EDITION=ee` per la licenza Enterprise; con `ee`, `AP_EXECUTION_MODE=UNSANDBOXED` è **rifiutato all'avvio** → usare `SANDBOX_CODE_ONLY` | `docker-compose.md` (manual steps, step 3) |
| 13 | Bug bundle worker | Il bug upstream #14654 (`piece-installer` usava `publicApiUrl`) è **risolto** in `0.92.3-hotfix.1`: il codice ora usa `internalApiUrl`. Verificato sul sorgente al tag. Resta comunque obbligatorio l'override `AP_FRONTEND_URL=http://app` sul worker per il socket | sorgente `piece-installer.ts` @ `0.92.3-hotfix.1`, issue #14654 |
| 14 | Tag immagine nel compose upstream | Il `docker-compose.yml` upstream al tag `0.92.3-hotfix.1` referenzia ancora `ghcr.io/...:0.92.3`. In questo repo l'immagine è parametrica: `${AP_VERSION}` con `AP_VERSION=0.92.3-hotfix.1` | compose raw @ tag |
| 15 | Origine delle impostazioni del worker | Il worker **non** legge l'esecuzione/rete dal proprio `.env`: `EXECUTION_MODE`, `NETWORK_MODE`, `SSRF_ALLOW_LIST`, `FLOW_TIMEOUT_SECONDS`, `MAX_FILE_SIZE_MB`, `SANDBOX_MEMORY_LIMIT` sono **pushate dall'app** al worker via socket (`machine-service.buildSettingsResponse`, cache per-processo). Lette **localmente** dal worker: `AP_CONTAINER_TYPE`, `AP_FRONTEND_URL`, `AP_WORKER_TOKEN`, `AP_WORKER_CONCURRENCY`, `AP_REUSE_SANDBOX`, `AP_PREWARM_CACHE_ON_STARTUP`, `AP_CACHE_BASE_PATH`, log/OTel. Conseguenza: app e worker devono condividere gli stessi valori (qui via un unico `.env`) | sorgente `machine-service.ts`, `worker/configs.ts`, `sandbox-config.ts` @ tag |
| 16 | Failover tra provider AI | **Non esiste failover automatico tra provider in Activepieces**: ogni step/agente sceglie un provider+modello. OpenRouter è un provider *Gateway* nativo e supporta (a) provider failover e (b) model fallback opt-in via array `models`. Strategia: usare OpenRouter come provider primario e delegargli il failover; Venice = "Other (OpenAI Compatible)" | `setup-ai-providers.md`, doc OpenRouter |

### Scostamenti dalla specifica originale

- `.env.example` della specifica usava `AP_SIGN_UP_ENABLED=true`: variabile **inesistente**. Rimossa; il controllo signup è documentato in Fase 4 (Platform Admin / Turnstile / ZeroBounce).
- La specifica indicava la porta app `8080`: è la porta **host** upstream. Internamente l'app ascolta su `80`; il compose di questo repo mappa `127.0.0.1:${AP_HOST_PORT:-8080}:80`.
- Il compose upstream espone `'8080:80'` su tutte le interfacce. Qui è ristretto a `127.0.0.1` (il pubblico passa da Caddy).

### Altre variabili confermate

`AP_FRONTEND_URL`, `AP_ENCRYPTION_KEY` (`openssl rand -hex 16`), `AP_JWT_SECRET` (`openssl rand -hex 32`), `AP_ENVIRONMENT`, `AP_POSTGRES_*`, `AP_REDIS_HOST/PORT/USER/PASSWORD` (`AP_REDIS_USER`/`AP_REDIS_PASSWORD` richiesti), `AP_QUEUE_UI_ENABLED` (+ username/password se attiva), `AP_TELEMETRY_ENABLED`, `AP_EXECUTION_MODE` (`UNSANDBOXED` \| `SANDBOX_PROCESS` \| `SANDBOX_CODE_ONLY` \| `SANDBOX_CODE_AND_PROCESS`), `AP_FLOW_TIMEOUT_SECONDS`, `AP_PIECES_SYNC_MODE`, `AP_TOOL_SEARCH_ENABLED`, `AP_OPENAI_API_KEY`, `AP_ENGINE_EXECUTABLE_PATH`, variabili SMTP, Google SSO, `AP_VERSION`.

Immagini upstream di riferimento: `ghcr.io/activepieces/activepieces:0.92.2`, `pgvector/pgvector:0.8.0-pg14`, `redis:7.0.7`. In questo repo: `ghcr.io/activepieces/activepieces:${AP_VERSION}` con `AP_VERSION=0.92.3-hotfix.1`.

Limiti confermati (default upstream, ora espliciti in `.env.example`): `AP_WEBHOOK_TIMEOUT_SECONDS=30` (max 15 min; Cloudflare taglia a 30 s), `AP_MAX_FILE_SIZE_MB=25`, `AP_MAX_WEBHOOK_PAYLOAD_SIZE_MB=25` (oltre → HTTP 413), `AP_MAX_FLOW_RUN_LOG_SIZE_MB=50`, `AP_MAX_STORE_ENTRY_VALUE_SIZE_KB=512`.

## Log per fase

### Fase 0 — Accesso SSH e preparazione
- **Esito:** `NOTE`. Struttura repo creata localmente in `C:\Users\PC\aethersy-infra` (`AGENTS.md`, `.gitignore`, `docker-compose.yml`, `.env.example`, `caddy/`, `scripts/`, `docs/`).
- **Input #1 ricevuto (27/10/2026):** IP pubblico VPS Aruba = **`195.231.79.221`**.
- **Ricognizione VPS (27/10/2026, sola lettura):**
  - SSH: porta 22 **aperta**, banner `SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.20` → **Ubuntu 24.04 confermato**.
  - Porte 80/443: **chiuse** (installazione pulita, nessun web server attivo — coerente con Fase 2 non ancora eseguita).
  - Porta 8080: chiusa (nessuno stack Activepieces attivo).
  - Ping ICMP: risponde.
- **DNS (27/10/2026):** il DNS di `aethersy.com` è su **Vercel** (NS `ns1.vercel-dns.com`, `ns2.vercel-dns.com`), **non** su SiteGround come da specifica. `aethersy.com`, `app.aethersy.com`, `mcp.aethersy.com` risolvono su `216.150.16.x` (range Vercel) → **NON puntano al VPS**. I record A per `app.`/`mcp.` vanno creati nella dashboard Vercel verso `195.231.79.221` (input #6, ora "accesso DNS Vercel"). La Vercel CLI è installata localmente ma il token è scaduto/invalido (`vercel login` richiesto).
- **Accessi (27/10/2026, aggiornamento):** l'utente ha fornito credenziali.
  - **VPS Aruba `195.231.79.221`** (`host221-79-231-195.serverdedicati.aruba.it`): il server offre `publickey,password`. La porta 22 è tornata **aperta** (ban decaduto) → tentato login a password (via `SSH_ASKPASS`, meccanismo confermato funzionante con `-vv`) come `root`, `deploy`, `ubuntu`: **password rifiutata** su tutti e tre (`Permission denied (publickey,password)`). La porta 22 è poi tornata **filtrata** (ban riattivato dai tentativi). IP pubblico della workstation: `2.36.103.146`.
  - **Host alternativo SiteGround `ssh.matthewdeblas.com:18765`** (IP `35.214.161.222`, Google Cloud): porta **aperta**, ma il server accetta **solo autenticazione a chiave pubblica** (`Authentications that can continue: publickey`, verificato con `ssh -vv`). La password NON è utilizzabile per SSH qui: serve solo per il pannello **Site Tools**, dove va caricata una chiave pubblica.
  - **Chiave dedicata generata:** `~/.ssh/aethersy_deploy_ed25519` (+ `.pub`). Pubblica da incollare in Site Tools / `authorized_keys`:
    `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIP0IEkl3mGtxaRz8k8OVptBKRtNFyEJ9oJcTj4ES3BWr aethersy-deploy`
  - **`~/.ssh/config`** aggiornato con alias `aethersy-sg` (SiteGround) e `aethersy-vps` (Aruba).
  - **Sicurezza:** la password condivisa in chat è **compromessa → da ruotare** (vedi `docs/security.md` §6.1).
- **Bloccante:** accesso SSH effettivo. Due strade: (a) sbloccare l'IP dal ban e usare la password/root corretta sul VPS Aruba; (b) caricare la chiave pubblica `aethersy_deploy_ed25519.pub` in Site Tools e usare `ssh aethersy-sg`.
- **Da fare quando sbloccata:** verificare `uname -a` (atteso Ubuntu 24.04), `git init` + primo commit.

### Fase 1 — Bootstrap e hardening
- **Esito:** `NOTE`. `scripts/00-bootstrap.sh` e `scripts/01-hardening.sh` scritti (idempotenti, `set -euo pipefail`).
- **Bloccante:** `BLOCKED: input #1/#2` — nessun VPS raggiungibile da qui.
- **Acceptance da verificare sul VPS:** `swapon --show` = 2 GB; `ufw status verbose` default deny + allow 22/80/443; `systemctl is-active fail2ban` = active; `docker run --rm hello-world` ok; `ssh deploy@VPS` ok e `ssh root@VPS` no.

### Fase 2 — DNS e reverse proxy
- **Esito:** `NOTE`. `caddy/Caddyfile` scritto con i due hostname e le route MCP esatte; servizio `caddy` presente in compose.
- **Bloccante:** `BLOCKED: input #1/#4/#6`.
- **Nota Fase 2:** lo spec suggeriva un `respond "ok"` temporaneo per validare il certificato prima che l'app esista. Con questo compose l'app viene su nella stessa fase, quindi il `respond` non serve. Se si vuole validare il solo TLS, avviare `caddy` da solo con un Caddyfile minimo; non introdurre configurazioni intermedie rotte.
- **Acceptance:** `curl -sI https://app.aethersy.com` → 200; `openssl s_client -connect app.aethersy.com:443` mostra cert valido per il dominio; idem `mcp.`.

### Fase 3 — Deploy stack Activepieces
- **Esito:** `NOTE`. `docker-compose.yml` + `.env.example` scritti. `scripts/03-deploy.sh` valida `.env` (placeholder `CHANGEME`, variabili obbligatorie) e lancia `docker compose config --quiet` prima di `up -d`.
- **Bloccante:** `BLOCKED: input #1/#2`.
- **Acceptance:** `docker compose ps` tutto `running`/`healthy`; `curl -s http://127.0.0.1:8080/api/v1/health` ok; nessuna porta di postgres/redis raggiungibile dall'esterno.

### Fase 4 — Primo accesso e chiusura registrazioni
- **Esito:** `BLOCKED: input #1/#2`.
- **Piano:** aprire il primo account admin su `https://app.aethersy.com`, poi chiudere le registrazioni. `AP_SIGN_UP_ENABLED` **non esiste**: usare Platform Admin (`/platform`) e/o Turnstile + ZeroBounce. Salvare le credenziali admin in un gestore password, non nel repo.

### Fase 5 — Provider AI (OpenRouter + Venice)
- **Esito:** `NOTE` — chiavi testate live il 27/10/2026, configurazione UI `BLOCKED: input #1/#2`.
- **Test chiavi (live):**
  - Venice: `GET /api/v1/models` → **HTTP 200** (chiave valida); `POST /chat/completions` → `{"error":"Insufficient USD or Diem balance to complete request..."}` → **chiave senza credito, non può fare inferenza**.
  - OpenRouter: `POST /chat/completions` (gpt-4o-mini) → **200, risposta reale** (costo ~$0.0000042). Chiave valida e funzionante.
- **Decisione:** Activepieces **non** configura provider da env (vedi §11 voce 6). La configurazione è a runtime in **Platform Admin → AI Center → Providers**:
  1. Aggiungere **OpenRouter** (provider Gateway nativo) con `OPENROUTER_API_KEY` → provider primario, funzionante.
  2. (Opzionale) aggiungere **Venice** come "Other (OpenAI Compatible)" con base URL `https://api.venice.ai/api/v1` e `VENICE_API_KEY` → utilizzabile solo dopo aver caricato credito su Venice.
  3. Il **failover** tra provider/modelli si delega a OpenRouter (provider failover + array `models`); Activepieces non lo fa da sé (§11 voce 16).
- **Acceptance (quando sbloccata):** un flow di test "Ask AI" con provider OpenRouter restituisce una risposta reale e il run appare verde. Idem per Venice solo dopo ricarica credito.

### Fase 6 — Slack
- **Esito:** `BLOCKED: input #5`.
- **Piano:** creare l'app Slack, salvare il webhook in `.env` (`SLACK_WEBHOOK_URL`). Flow di notifica + alert su `04-smoke-test.sh` in cron.

### Fase 7 — Endpoint MCP
- **Esito:** `BLOCKED: input #1`.
- **Piano:** `AP_MCP_URL=https://mcp.aethersy.com` (già in `.env.example`), Caddy già configurato con le route MCP esatte. Documentare il flusso OAuth per i client AI.

### Fase 8 — Branding
- **Esito:** `BLOCKED: input #1`.
- **Piano:** nome/logo/colori via Platform Admin (Community). Documentare esplicitamente cosa richiede Enterprise.

### Fase 9 — Backup e monitoraggio
- **Esito:** `NOTE`. `scripts/backup.sh` scritto (pg_dump + tar Redis, rotazione 7 giornalieri + 4 settimanali, copia settimanale la domenica).
- **Bloccante:** test di restore reale `BLOCKED: input #1`. Procedura in `docs/restore.md` (da marcare "testata" solo dopo averla eseguita).
- **Acceptance:** dump non vuoto con dimensione plausibile; restore su DB temporaneo restituisce tabelle popolate; `docker compose config` senza warning.

### Fase 10 — Review finale e consegna
- **Esito:** `BLOCKED: input #1`.
- **Piano:** audit segreti (`git log`, `grep`), porte minime, `unattended-upgrades` attivo, log con rotazione, immagini pinnate; completare `docs/security.md` e `docs/runbook.md`; checklist di consegna.
