# phases.md — Log di esecuzione fasi

> Aggiornare dopo **ogni** fase con: data/ora, esito, comandi di verifica, note.
> Stati ammessi: `DONE`, `BLOCKED: input #N`, `NOTE`.
>
> Ultima revisione: 2026-11-08 (fasi 0–12 `DONE`; **fasi 13–22** implementate e deployate: CI, IA nel platform, **platform a dati reali senza mock + UI cyber + agenti builder eseguibili + sito pubblicabile dal run pipeline**, **login sociale reale Google/GitHub**, **connettori reali con login ai provider (43 provider, niente connessioni finte)**; restano azioni utente per la rotazione credenziali, Stripe e le app OAuth dei provider)

## Stato sintetico

| Fase | Descrizione | Stato |
|---|---|---|
| 0 | Accesso SSH e preparazione repo | `DONE` — repo creato e committato (`be56668`); accesso SSH al VPS Aruba stabilito via chiave |
| 1 | Bootstrap e hardening | `DONE` — Docker 29.9.2 + Compose v5.6.1, swap 2 GB, utente `deploy`, root/password SSH disabilitati, ufw 22/80/443, fail2ban attivo |
| 2 | DNS e reverse proxy | `DONE` — dominio **aethersy.online** (GoDaddy); Caddy + Let's Encrypt attivi su `app.`, `mcp.`, apex e `www` (apex/www → 301 su `app.`) |
| 3 | Deploy stack Activepieces | `DONE` — stack up e healthy; smoke test OK su `https://app.aethersy.online` |
| 4 | Primo accesso e chiusura signup | `DONE` — admin `mattiadeblasio94@gmail.com` (ADMIN, ACTIVE) su `app.aethersy.online`; registrazioni pubbliche chiuse (`AP_ALLOW_OPEN_SIGN_UP` assente → `INVITATION_ONLY_SIGN_UP`) |
| 5 | Provider AI (OpenRouter/Venice) | `DONE` — **OpenRouter** creato via API admin, `status=active`, `enabledForChat=true`, 464 modelli; acceptance con flow reale "Ask AI" (webhook → `askAi`) → run `SUCCEEDED`, output `PONG`. Venice: chiave valida ma senza credito → non aggiunto (opzionale) |
| 6 | Slack | `DONE` — webhook in `.env` VPS; alert su fallimento smoke test (cron ogni 15 min) + flow Activepieces "Slack notification" (`ENABLED`, run `SUCCEEDED`) |
| 7 | Endpoint MCP | `DONE` — hostname `mcp.aethersy.online` esposto via Caddy; **acceptance chiusa con client MCP reale**: handshake OAuth completo (DCR → PKCE S256 → consent → token) → `tools/list` = **42 tool** (project-scoped); `/mcp/platform` per token di piattaforma; `/mcp` senza token → 401. Bug consent 404 corretto in Caddy (`@authorize` → `X-Forwarded-Host {$APP_DOMAIN}`) |
| 8 | Branding | `DONE` — nome **Aethersy**, logo reale fornito dal committente; palette ufficiale (primary `#00D4FF`, glow `#4DEEFF`, secondary `#1A0F4A`, accent `#FF9F1C`, bg `#0A0518`); asset trasparenti (`logo.png`, `full-logo.png`, `favicon.ico`) + **Layer A** re-skin via design token (`brand/aethersy.css`) con dark mode orbitale; verificato live (header/logo/bottone primario/screenshot) |
| 9 | Backup e monitoraggio | `DONE` — `backup.sh` corretto (rotazione robusta a glob vuoto) ed eseguito; **restore testato** su DB temporaneo (83 tabelle, dati coerenti) |
| 10 | Review finale e consegna | `DONE` — audit infrastrutturale **completato** (tutte le verifiche OK) e **clean-clone** verificato (tarball da `git ls-files`, 73 file, nessun `.env` → `docker compose config` OK + build `console` OK). Restano solo **azioni utente**: rotazione credenziali esposte in chat (P0–P2, `docs/security.md` §6.1) e backup offline dei due segreti critici |
| 11 | Aethersy Console (fusion A+B+C) | `DONE` — frontend proprietario React 19 + Vite + TS + Tailwind v4 + TanStack Query + React Router + BFF Fastify con sessione httpOnly firmata, proxy `/api/ap/*` verso Activepieces e **AI Router** multimodale (selezione automatica di modelli gratuiti OpenRouter per capacità testo/immagine/audio/video). Deployato su `https://console.aethersy.online` con TLS Let's Encrypt; smoke test 5/5 OK |
| 12 | Piattaforma a consumo (P0) — pipeline + libreria asset + Console run/crediti | `IN CORSO` — metering/billing (P0.1/P0.2, `24c1d1f`), pipeline multi-stadio + orchestratore HITL + segreti (P0.3, `94f65a9`), **libreria asset con versioning e approvazione in Console** (P0.4), **Console run/crediti** (P0.5), **lead webhook + canale Slack + export pacchettizzato + UI lead** (P0.6), **QA E2E + backup off-site** (P0.7), **layer Anteprima `/preview`** (P0.8), **deploy Console+Platform** (P0.9), **modulo piattaforma Business Pulse + `pipeline.schedule`** (P0.10, 29/10/2026), **substrato aziendale multi-tenant: schema `business` (obiettivi/memoria/prodotti) + API + Console** (P1.1, 29/10/2026), **motore agenti P2.1 + piattaforma reale P2.2 (`platform.aethersy.online`)** (29/10/2026). QA E2E **65/65 OK**; metering 44/44; web+server build OK; deployato sul VPS |
| 22 | Connettori reali con login ai provider | `DONE` — catalogo di **43 provider** (Google ×12 via app Google, GitHub, Slack/Notion/Figma/... via app OAuth dedicata, Telegram/Cloudflare/... via credenziale), login reale con `state` firmato + PKCE, token cifrati AES-256-GCM, pagina `/connectors` con verifica live; **connessioni placeholder eliminate**. Test `test:connectors` 23/23. Restano azioni utente: accreditare le app OAuth dei provider e creare quelle mancanti |
| 23 | Collegamento ai provider con consenso del provider | `DONE` — **un solo accesso Google** attiva i 12 servizi Google (consenso unificato) e le **app OAuth dei provider si registrano dalla piattaforma** (tabella `pipeline.oauth_app`, secret cifrato): il pulsante porta alla pagina di login/consenso del provider e al rientro la connessione e' attiva. Test `test:connectors` 35/35, `test:social` 19/19. Restano azioni utente: consenso Google (eventuale utente di test) e creazione delle app dei provider |

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
| 9 | Signup | **`AP_SIGN_UP_ENABLED` NON esiste.** Il gate reale è **`AP_ALLOW_OPEN_SIGN_UP`** (default assente ≠ `true` → per una piattaforma esistente serve un invito: errore `INVITATION_ONLY_SIGN_UP`). In assenza di piattaforme il primo signup crea la piattaforma (`provisionOrOnboard`). Altri controlli: `AP_ZEROBOUNCE_API_KEY`, `AP_TURNSTILE_SITE_KEY`/`AP_TURNSTILE_SECRET_KEY` | sorgente `system-props.js` + `authentication.service.js` @ `0.92.3-hotfix.1`, test live |
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
- **Esito:** `DONE`.
- **Struttura repo:** creata localmente in `C:\Users\PC\aethersy-infra` (`AGENTS.md`, `.gitignore`, `.gitattributes`, `docker-compose.yml`, `.env.example`, `caddy/`, `scripts/`, `docs/`); `git init -b main` + commit `be56668`. `.env`/`.env.secrets` correttamente esclusi.
- **Input #1 ricevuto (27/10/2026):** IP pubblico VPS Aruba = **`195.231.79.221`**.
- **Ricognizione VPS (27/10/2026, sola lettura):**
  - SSH: porta 22 **aperta**, banner `SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.20` → **Ubuntu 24.04 confermato**.
  - Porte 80/443: **chiuse** (installazione pulita, nessun web server attivo — coerente con Fase 2 non ancora eseguita).
  - Porta 8080: chiusa (nessuno stack Activepieces attivo).
  - Ping ICMP: risponde.
- **DNS (27/10/2026):** il DNS di `aethersy.com` è su **Vercel** (NS `ns1.vercel-dns.com`, `ns2.vercel-dns.com`), **non** su SiteGround come da specifica. `aethersy.com`, `app.aethersy.com`, `mcp.aethersy.com` risolvono su `216.150.16.x` (range Vercel) → **NON puntano al VPS**. I record A per `app.`/`mcp.` vanno creati nella dashboard Vercel verso `195.231.79.221` (input #6, ora "accesso DNS Vercel"). La Vercel CLI è installata localmente ma il token è scaduto/invalido (`vercel login` richiesto).
- **Accessi — risoluzione finale (27/10/2026):**
  - **Blocco iniziale:** la porta 22 del VPS Aruba era **filtrata da fail2ban** (ban dell'IP `2.36.103.146` innescato dai tentativi falliti; solo la 22 cambiava stato, la 53 restava aperta). Un ban lato server non è aggirabile dal client.
  - **Superamento:** l'utente ha eseguito `fail2ban-client unban 2.36.103.146` dalla console Aruba → porta 22 riaperta. Login **`root` + password accettato** (verificato `AETHERSY_OK`, `uid=0`, hostname `Aethersy`, Ubuntu 24.04 LTS).
  - **Ricognizione confermata via SSH:** IP pubblico `195.231.79.221`; sshd porta 22, `PermitRootLogin yes`, `PasswordAuthentication yes`, `PubkeyAuthentication yes`; unico utente non-root `ubuntu`; ufw attivo (solo 22); fail2ban jail `sshd` presente.
  - **Chiave dedicata installata:** `~/.ssh/aethersy_deploy_ed25519.pub` aggiunta a `/root/.ssh/authorized_keys` → accesso **via chiave verificato** (`KEY_AUTH_OK`).
  - **`~/.ssh/config`:** alias `aethersy-vps`/`aethersy` → `deploy@195.231.79.221:22` con `aethersy_deploy_ed25519`.
  - **Host alternativo SiteGround `ssh.matthewdeblas.com:18765`** (IP `35.214.161.222`): accetta **solo chiave pubblica**. Accesso **ottenuto** (27/10/2026): coppia generata in Site Tools → SSH Keys Manager (ed25519, chiave privata protetta da passphrase), salvata come `~/.ssh/aethersy_sg_ed25519`, alias `aethersy-sg` aggiornato. Login verificato: `u2246-pgbqtt88qkey@esm26.siteground.biz`, home `/home/customer`, PHP 8.2.35, Node v22.23.4; contenuto attuale solo `matthewdeblas.com`. Non usato per l'architettura finale (DNS/hosting restano su Vercel + Aruba).
  - **Chiave privata SiteGround condivisa in chat → da ruotare** (vedi `docs/security.md` §6.1).
  - **Sicurezza:** le password condivise in chat sono **compromesse → da ruotare** (vedi `docs/security.md` §6.1).
- **Acceptance verificata:** `git log` mostra il commit di Fase 0; `ssh aethersy 'uname -a'` risponde `Linux Aethersy ... Ubuntu 24.04` con 3.8 GB RAM.

### Fase 1 — Bootstrap e hardening
- **Esito:** `DONE`.
- **Bootstrap (`scripts/00-bootstrap.sh`):**
  - Primo tentativo **fallito**: `apt-get upgrade` ha incontrato un prompt conffile interattivo su `cloud-init` (`end of file on stdin at conffile prompt`) → dpkg in errore → `set -e` ha abortito lo script; Docker non installato; swap ancora 512 MB.
  - **Correzione dello script:** aggiunte `APT_OPTS=(-o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold")` su `apt-get upgrade`, `dpkg --configure -a || true`, e riscrittura del blocco swap per **ridimensionare** quando `SwapTotal < 2048 MB`.
  - Stato dpkg del VPS riparato (`dpkg --configure -a` → `EXIT=0`, `cloud-init` ora `ii`), script ricaricato e rieseguito.
  - **Esito:** Docker **29.9.2** + Compose **v5.6.1**, `docker run --rm hello-world` OK, timezone Europe/Rome, `unattended-upgrades` configurato, swap **2 GB** (`/swapfile`; rimosso il vecchio `/swap` da 512 MB dell'immagine e ripulito `/etc/fstab`).
- **Hardening (`scripts/01-hardening.sh`):**
  - Creato utente **`deploy`** (sudo NOPASSWD), chiave pubblica installata.
  - `/etc/ssh/sshd_config.d/99-hardening.conf`: `PermitRootLogin no`, `PasswordAuthentication no`, `PubkeyAuthentication yes`, `KbdInteractiveAuthentication no`, `MaxAuthTries 3`.
  - ufw: default deny incoming / allow outgoing; allow 22, 80, 443.
  - fail2ban: jail `sshd` (maxretry 5, findtime 10m, bantime 1h), attivo.
- **Acceptance verificata:**
  - `ssh deploy@195.231.79.221` via chiave → `DEPLOY_OK`, `uid=1001(deploy)` in gruppo `sudo`, `sudo whoami` → `root`, `sudo docker --version` → 29.9.2, `swapon --show` → 2 GB.
  - `sshd -T` effettivo: `permitrootlogin no`, `passwordauthentication no`, `pubkeyauthentication yes`, `kbdinteractiveauthentication no`.
  - `ssh root@195.231.79.221` → **`Permission denied`** (root chiuso, come atteso).
  - `ufw status` attivo con 22/80/443; `systemctl is-active fail2ban` → `active`.
- **Prossimo passo:** Fase 2 (record A su Vercel + Caddy TLS).

### Fase 2 — DNS e reverse proxy
- **Esito:** `DONE` — dominio definitivo **`aethersy.online`** (GoDaddy), TLS Let's Encrypt attivo su `app.`, `mcp.`, apex e `www`.
- **Dominio definitivo (27/10/2026):** l'utente ha registrato **`aethersy.online` su GoDaddy** (registrato 27/10/2026 20:23 UTC, scadenza 27/10/2027, NS `ns59/ns60.domaincontrol.com`), abbandonando `aethersy.com` (bloccato su Vercel). Record creati: **A** `@`, `app`, `mcp` → `195.231.79.221` (TTL 600); `www` = CNAME su apex. Nessun CAA → nessun vincolo di CA.
- **Caddyfile ristrutturato:** snippet riusabili `(app_proxy)` e `(mcp_proxy)`; blocchi `{$APP_DOMAIN}`, `{$MCP_DOMAIN}`, `{$APEX_DOMAIN}` (301 → app) e `www.{$APEX_DOMAIN}` (301 → app). I blocchi legacy `{$APP_DOMAIN_LEGACY}`/`{$MCP_DOMAIN_LEGACY}` (sslip.io), tenuti come rete di sicurezza durante il passaggio, sono stati **rimossi il 27/10/2026** dopo verifica del dominio definitivo. Config validata con `caddy validate` e formattata con `caddy fmt`.
- **TLS:** certificati emessi per `app.aethersy.online`, `mcp.aethersy.online`, `aethersy.online`, `www.aethersy.online` (issuer Let's Encrypt).
- **Acceptance verificata:** `https://app.aethersy.online/api/v1/health` → `{"status":"Healthy"}`; `https://mcp.aethersy.online/mcp` → **405** (atteso senza token), `/` su mcp → 404; `https://aethersy.online/` → **301** verso `https://app.aethersy.online/`; `scripts/04-smoke-test.sh` → **SMOKE TEST OK**.
- **Nota:** il resolver DNS locale Windows può mantenere in cache la risposta NXDOMAIN del primo minuto; `ipconfig /flushdns` risolve. La risoluzione pubblica (DoH Google/Cloudflare) e i nameserver autoritativi GoDaddy sono corretti.

#### Storico: Fase 2 su hostname temporaneo (sslip.io)
- **Esito:** `DONE (temporaneo)` — TLS attivo su hostname `sslip.io`; `BLOCKED: input #6` per il dominio reale.
- **Contesto (27/10/2026):** l'account Vercel è **limitato** (profilo accessibile ma deploy e **creazione record DNS bloccati**). Il dominio `aethersy.com` è registrato **tramite Vercel** (NS `ns1/ns2.vercel-dns.com`) e ha un record **wildcard `* ALIAS cname.vercel-dns-016.com`** che instrada tutti i sottodomini (`app`, `mcp`, `www`) su Vercel (`216.150.x.x`). Il CAA live autorizza Let's Encrypt (`0 issue "letsencrypt.org"`, `pki.goog`, `sectigo.com`), quindi Caddy può emettere TLS. Non essendo possibile creare i record A in Vercel, si è scelta la **strategia C**: hostname temporanei **`sslip.io`** (che risolvono sull'IP del VPS) per costruire e collaudare l'intero stack, con passaggio al dominio reale a una sola variabile.
- **Implementazione:**
  - `caddy/Caddyfile` **parametrizzato**: i blocchi usano `{$APP_DOMAIN}` e `{$MCP_DOMAIN}` (prima erano hardcoded).
  - `docker-compose.yml`: il servizio `caddy` riceve `APP_DOMAIN`/`MCP_DOMAIN` (default `app./mcp.aethersy.com`).
  - `.env.example`: aggiunte `APP_DOMAIN`/`MCP_DOMAIN` con nota sugli hostname temporanei.
  - `.env` sul VPS: `AP_FRONTEND_URL`/`AP_MCP_URL`/`APP_DOMAIN`/`MCP_DOMAIN` = `*.195.231.79.221.sslip.io`.
- **Acceptance verificata (27/10/2026):**
  - `curl -sI https://app.195.231.79.221.sslip.io/api/v1/health` → `{"status":"Healthy"}`.
  - Certificato Let's Encrypt valido per `app.195.231.79.221.sslip.io` (`issuer C=US, O=Let's Encrypt, CN=YE2`, `notAfter=Jan 25 2027`); Caddy ha emesso anche quello di `mcp.…`.
  - `https://mcp.195.231.79.221.sslip.io/mcp` → HTTP 405 (`Use POST with Authorization: Bearer <token>`) = host raggiungibile e route MCP attiva.
- **Per passare al dominio reale (quando Vercel è sbloccato):** creare in Vercel i record **A** `app` e `mcp` → `195.231.79.221` (i record A espliciti hanno precedenza sul wildcard), poi in `.env` impostare `AP_FRONTEND_URL=https://app.aethersy.com`, `AP_MCP_URL=https://mcp.aethersy.com`, `APP_DOMAIN=app.aethersy.com`, `MCP_DOMAIN=mcp.aethersy.com` e riavviare `caddy` + `app` + `worker`.

### Fase 3 — Deploy stack Activepieces
- **Esito:** `DONE (temporaneo)` — stack avviato e healthy su hostname `sslip.io`.
- **Contesto:** deploy eseguito dalla directory `/home/deploy/aethersy` sul VPS (posseduta da `deploy`); `.env` creato da `.env.example` con segreti generati (`openssl rand -hex 16` per `AP_ENCRYPTION_KEY`, `hex 32` per `AP_JWT_SECRET`/`AP_POSTGRES_PASSWORD`/`AP_REDIS_PASSWORD`), `chmod 600`.
- **Comandi:** `sudo docker compose config --quiet` → OK; `sudo bash scripts/03-deploy.sh` (pull + up -d).
- **Acceptance verificata:** `docker compose ps` → `app`, `worker`, `postgres`, `redis`, `caddy` tutti `running`/`healthy`; `curl http://127.0.0.1:8080/api/v1/health` → `{"status":"Healthy"}`; `scripts/04-smoke-test.sh` → **SMOKE TEST OK** (container, health locale, health pubblico HTTPS, endpoint MCP); postgres/redis **non** raggiungibili dall'esterno (nessuna porta pubblicata).
- **Nota:** `deploy` non è nel gruppo `docker`; i comandi docker sul VPS richiedono `sudo` (nessuna password, come da hardening).

### Fase 4 — Primo accesso e chiusura registrazioni
- **Esito:** `DONE` — admin creato su `https://app.aethersy.online`; registrazioni pubbliche **già chiuse** (verificato).
- **Admin creato:** `mattiadeblasio94@gmail.com`, `platformRole=ADMIN`, `status=ACTIVE`, creato 27/10/2026 21:58. Piattaforma `Mattia's Platform` (owner = lo stesso utente), 1 progetto. Utenti totali: **1**; identità: **1** (nessun account indesiderato).
- **Perché il primo signup è passato:** al momento della registrazione **non esisteva alcuna piattaforma**; senza `platformId` il flusso cade in `authenticationUtils.provisionOrOnboard` (onboarding → crea la piattaforma). Da lì in poi `platformUtils.getPlatformIdForRequest` risolve sempre la piattaforma più vecchia, quindi ogni nuovo signup passa dal ramo "existing platform".
- **Meccanismo di blocco (verificato sul sorgente dell'immagine `0.92.3-hotfix.1`):** in `authentication.service.signUp`, con `platformId` presente, se `system.get(AppSystemProp.ALLOW_OPEN_SIGN_UP) !== 'true'` viene chiamato `assertUserIsInvitedToPlatformOrProject` → senza invito lancia `INVITATION_ONLY_SIGN_UP`. La variabile d'ambiente è **`AP_ALLOW_OPEN_SIGN_UP`** (assente = default sicuro). `AP_SIGN_UP_ENABLED` **non esiste**.
- **Prova live:** `POST /api/v1/authentication/sign-up` con email non invitata → `{"code":"INVITATION_ONLY_SIGN_UP","params":{"message":"User is not invited to the platform"}}`. `AP_ALLOW_OPEN_SIGN_UP` non è impostata nel container `app`.
- **Aggiungere utenti:** invito da Platform Admin → Users (o `AP_ALLOW_OPEN_SIGN_UP=true` **temporaneamente**, sconsigliato in produzione).
- **Nota:** il branding "Activepieces" è quello di default della Community; il nome/logo si cambiano in Fase 8. Salvare le credenziali admin in un gestore password, non nel repo.

### Fase 5 — Provider AI (OpenRouter + Venice)
- **Esito:** `DONE` — **OpenRouter** configurato e verificato end-to-end il 27/10/2026. Venice testato ma non aggiunto (chiave senza credito).
- **Test chiavi (live):**
  - Venice: `GET /api/v1/models` → **HTTP 200** (chiave valida, 142 modelli testo); `POST /chat/completions` → `{"error":"Insufficient USD or Diem balance to complete request..."}` → **chiave senza credito, non può fare inferenza**.
  - OpenRouter: chiave valida (`GET /api/v1/auth/key` 200). Test end-to-end tramite la piattaforma: risposta reale.
- **Configurazione applicata (OpenRouter):** i provider AI non si configurano da env (§11 voce 6). Inserito via API admin `POST /api/v1/ai-providers` con body `{"displayName":"OpenRouter","provider":"openrouter","config":{},"auth":{"apiKey":"…"}}`. La `auth` viene cifrata con `AP_ENCRYPTION_KEY` (`encryptUtils.encryptObject`, AES-256-CBC). Risultato:
  - `id=KGJ2h1RWYJSUIUZFQpyFQ`, `provider=openrouter`, `status=active`, `enabledForChat=true`.
  - `GET /v1/ai-providers/configs/<id>/models` → **464 modelli**.
- **Verifica end-to-end (motore):** `POST /api/v1/ai/execute` (principal ENGINE, `action=ASK_AI`, `provider=openrouter`, `modelId=openai/gpt-4o-mini`, prompt "Reply with exactly: PONG") → `HTTP 200`, `{"output":{"answer":"PONG", …}}`. Inferenza reale attraverso lo stack (app → worker → OpenRouter).
- **Acceptance finale (flow reale "Ask AI"):** creato il flow `YHyMonm2DnBk9nSA2U46p` (project `gywxRL8I2uHuepqatbkjL`) via API admin con `IMPORT_FLOW` — trigger **Catch Webhook** (`@activepieces/piece-webhook@0.1.42`/`catch_webhook`, `authType=none`) → azione **Ask AI** (`@activepieces/piece-ai@0.11.0`/`askAi`, input `{provider:{provider:"openrouter",configId:"KGJ2h1RWYJSUIUZFQpyFQ"}, model:"openai/gpt-4o-mini", prompt:"Reply with exactly: PONG"}`, `schemaVersion:"27"`), poi `LOCK_AND_PUBLISH` (→ `publishedVersionId=485CAZ7B72wnL7PQoaW5O`) e `CHANGE_STATUS` `ENABLED` (tutti **HTTP 200**). Trigger reale `POST https://app.aethersy.online/api/v1/webhooks/YHyMonm2DnBk9nSA2U46p` (`{"hello":"world"}`) → **HTTP 200**; `flow_run` `HsIyEK9o9tv3nSMFXR0rZ` **`SUCCEEDED`** (ambiente `PRODUCTION`, 1 step, RUN 164 ms) con output dello step `askAi` = **`PONG`** (log zstd decompresso: trigger `SUCCEEDED` + `step_1 SUCCEEDED`). Il flusso è quindi provato end-to-end dall'entrypoint HTTP pubblico.
- **Shape `askAi` (piece-ai 0.11.0, verificato sul bundle):** `provider` è un Dropdown il cui valore memorizzato è un **oggetto** `{provider, configId?}` risolto a runtime da `resolveOrThrow` → `{provider, configId}`; `model` è l'id stringa; `prompt` è `LONG_TEXT` richiesto; opzionali `conversationKey`, `creativity`, `maxOutputTokens` (default 2000), `webSearch` (default false). La richiesta interna è `POST /v1/ai/execute` con `{action:"ASK_AI", provider, providerConfigId?, modelId, prompt, …}`.
- **Procedura ripetibile (UI):** **Platform Admin → AI Center → Providers → Add Provider → OpenRouter**, incollare la chiave, salvare. Abilitare per la chat ("Enabled for chat").
- **Venice (opzionale, non configurato):** per attivarlo aggiungere "Other (OpenAI Compatible)" con base URL `https://api.venice.ai/api/v1`, header `Authorization`, e i modelli desiderati — **solo dopo** aver caricato credito su venice.ai/settings/api.
- **Failover:** delegato a OpenRouter (provider failover + array `models`); Activepieces non lo fa da sé (§11 voce 16).
- **Nota admin API:** gli endpoint `/v1/ai-providers` sono `platformAdminOnly` e richiedono un principal USER con `platformRole=ADMIN`. In assenza di API key (feature a pagamento), il provider è stato inserito con un JWT admin firmato con `AP_JWT_SECRET` (uso una-tantum, token non persistito).

### Fase 6 — Slack
- **Esito:** `DONE` (28/10/2026).
- **Webhook:** creato un'app Slack con **Incoming Webhook** e salvato `SLACK_WEBHOOK_URL` nel `.env` del VPS (riga 125, `chmod 600`). Test live: `POST` al webhook → **HTTP 200 `ok`** (messaggio recapitato sul canale).
- **Deliverable (a) — alert di sistema:** `scripts/06-smoke-alert.sh` esegue `04-smoke-test.sh` e invia su Slack **solo in caso di fallimento** (log in `/tmp/aethersy-smoke.log`). Installato in cron ogni 15 min (sostituisce il vecchio job che loggava soltanto): `*/15 * * * * ... ./scripts/06-smoke-alert.sh >> backups/smoke.log`. Percorso di fallimento verificato end-to-end (smoke forzato a fallire → Slack HTTP 200 + exit 1; a riposo → exit 0, nessun messaggio). Helper riutilizzabile: `scripts/06-slack-notify.sh "<msg>" [emoji]`.
- **Deliverable (b) — flow Activepieces:** `scripts/06-slack-flow.sh` crea/pubblica/abilita il flow **"Slack notification"** (id `frmFofQ3jOzknIpPNbMX7`, `ENABLED`): trigger *Catch Webhook* (`piece-webhook` 0.1.42) → azione HTTP `send_request` (`piece-http` 0.13.0) in `POST` verso `SLACK_WEBHOOK_URL`, `authType=NONE`, `body_type=json`, `body.data.text`. Trigger via `POST /api/v1/webhooks/<flowId>` → run **SUCCEEDED**. Script idempotente (riusa il flow esistente via lookup su `flow_version.displayName`).
- **Nota tecnica:** il piece Slack nativo (`@activepieces/piece-slack`) richiede una connessione **OAuth**, non accetta il webhook in ingresso; per notifiche webhook si usa `piece-http`. Per il `body` JSON il prop è annidato in `body.data` (non `body.text`): un payload piatto produce `invalid_payload` (400) da Slack.
- **`04-smoke-test.sh`:** il check della Console pubblica è ora **WARN** (non FAIL) se `console.aethersy.online` non risolve, per evitare alert continui finché l'utente non aggiunge il record DNS.

### Fase 7 — Endpoint MCP
- **Esito:** `DONE` (27/10/2026).
- **Configurazione:** `AP_MCP_URL=https://mcp.aethersy.online` (in `.env` VPS). Caddy instrada su `app:80` preservando `Host`: `@mcp` (`/mcp`, `/mcp/platform`), `@oauth` (`/authorize`, `/token`, `/register`, `/revoke`, `/userinfo`), `@wellknown` (`/.well-known/oauth-authorization-server`, `openid-configuration`, `jwks.json`), `@protected` (`/.well-known/oauth-protected-resource/*`). La consent screen `/mcp-authorize` resta **sull'host dell'app** (`AP_FRONTEND_URL`), non sull'hostname MCP.
- **Verifica live (27/10/2026):**
  - `POST https://mcp.aethersy.online/mcp` (senza token) → **HTTP 401** con header `WWW-Authenticate: Bearer resource_metadata="https://mcp.aethersy.online/.well-known/oauth-protected-resource/mcp"` → il flusso OAuth è correttamente annunciato.
  - `/.well-known/oauth-protected-resource/mcp` → **200**: `resource=https://mcp.aethersy.online/mcp`, `authorization_servers=[https://mcp.aethersy.online]`, `scopes_supported=[mcp,openid,email,profile]`.
  - `/.well-known/oauth-authorization-server` → **200**: `authorization_endpoint=/authorize`, `token_endpoint=/token`, `registration_endpoint=/register` (dynamic client registration), `revocation_endpoint=/revoke`, `grant_types=[authorization_code,refresh_token]`, `code_challenge_methods=[S256]` (PKCE).
  - `/.well-known/openid-configuration` → **200**; `/.well-known/jwks.json` → **200**.
- **Collegamento client AI (Claude / ChatGPT / altri client MCP):** usare l'URL `https://mcp.aethersy.online/mcp`. Il client scopre automaticamente i metadata (protected-resource → authorization-server), registra un client dinamico su `/register`, esegue il flusso `authorization_code` + PKCE verso `/authorize` (consent su `/mcp-authorize` sull'host principale `app.aethersy.online`) e ottiene il token da `/token`. Nessun token statico: l'auth è OAuth con account Activepieces.
- **Nota:** il consent screen viene servito sull'host principale (`AP_FRONTEND_URL`); serve una sessione già autenticata su `app.aethersy.online` nel browser.
- **Bug corretto — consent `/mcp-authorize` → 404 (28/10/2026):** l'immagine pinnata `0.92.3-hotfix.1` costruisce l'URL del consent con `domainHelper.getPublicUrlFromRequest(...)`, che risolve sull'**host della richiesta** (`X-Forwarded-Host`/`req.hostname`). Chiamando `/authorize` sull'hostname MCP, il browser veniva reindirizzato a `https://mcp.aethersy.online/mcp-authorize`, che risponde **404** (la consent screen esiste solo sull'host dell'app). L'upstream ha poi spostato la consent sull'host principale (PR #15376), ma la versione pinnata ha ancora il comportamento vecchio. **Fix in `caddy/Caddyfile`:** separato `@authorize path /authorize` da `@oauth` e forzato `header_up X-Forwarded-Host {$APP_DOMAIN}` **solo** su quel blocco (gli altri endpoint OAuth restano su `{host}`). Verificato live: `GET /authorize?...` su `mcp.aethersy.online` → **302** verso `https://app.aethersy.online/mcp-authorize?...`; consent su app → **200**.
- **Acceptance client MCP reale (28/10/2026) — CHIUSA:** handshake OAuth completo eseguito con un client MCP vero: dynamic client registration (`/register`) → PKCE **S256** → `GET /authorize` (redirect alla consent sull'host app) → approvazione admin (`POST /v1/mcp-oauth/approve`) → `code` → `POST /token` → `POST /mcp` con `Authorization: Bearer`. Risultato: `initialize` + `tools/list` → **42 tool** Activepieces (token **project-scoped**, projectId passato in approve). Token **platform-scoped** verificato su `POST /mcp/platform` (initialize + `tools/list` con tool di piattaforma). `POST /mcp` **senza** token → **401** con challenge `WWW-Authenticate` (gate OK). L'acceptance di Fase 7 è quindi soddisfatta con un client reale, non solo a livello `curl`.

### Fase 8 — Branding
- **Esito:** `DONE` (28/10/2026). Nome **Aethersy**, **logo definitivo fornito dal committente**, palette ufficiale. Decisione committente: branding **completo via patch** (gratis, senza licenza), asset dal committente.
- **Palette ufficiale (dal committente):** Primary `#00D4FF` (cyan orbitale) · Secondary `#1A0F4A` (indaco profondo) · Accent `#FF9F1C` (nucleo dorato) · Glow `#4DEEFF` · Background `#0A0518` (nero-viola). Tipografia richiesta Inter/Space Grotesk; **Inter era già il font del bundle** (`InterVariable-*.woff2`), quindi nessun cambio font necessario.
- **Logo ricevuto:** `logo aethersy.jpg` (1280×1280), logo combinato = simbolo ("A" sfaccettata 3D cristallo, viola→arancio→ciano, con sfera dorata e archi ciano glow) + wordmark "Aethersy" su sfondo nero.
- **Perche' serve un patch (e non la UI):** la Community edition è **hard-coded** su `defaultTheme`. Verificato live: `/api/v1/flags` → `EDITION:"ce"`, `THEME` con `websiteName:"Activepieces"` e loghi `cdn.activepieces.com`; `ee/helper/appearance-helper.js` → `case ApEdition.COMMUNITY: return defaultTheme` (ignora del tutto la riga `platform` del DB, che pure contiene name/loghi/colore); `flags/flag.service.js:147` → `value: theme_1.defaultTheme`. Quindi nome/logo/colori del DB **non hanno effetto** in CE. Anche `<title>` è generato upstream come `Activepieces`. Il modulo Caddy `replace` (per riscrivere il body di `/api/v1/flags`) **non** è disponibile in `caddy:2.8-alpine` (presenti solo `templates` e `rewrite`).
- **Come è stato visto il logo (nota operativa):** il modello di questa sessione non accetta input immagini; il logo è stato analizzato con un **ponte vision** (`OpenRouter`, modello multimodale `google/gemini-2.5-flash`) ospitando temporaneamente l'immagine su un URL pubblico e rimuovendola subito dopo. Nessun file del committente lasciato esposto.
- **Soluzione implementata:**
  - `branding/theme.js` = copia di `packages/server/api/dist/src/app/flags/theme.js` con `defaultTheme = generateTheme({ primaryColor:'#00D4FF', websiteName:'Aethersy', fullLogoUrl:'/brand/full-logo.png', favIconUrl:'/favicon.ico', logoIconUrl:'/brand/logo.png', themeColors:{'blue-link':'#4DEEFF'} })`. Il titolo e il favicon del SPA sono impostati **a runtime** da `websiteName`/`favIconUrl` del tema (`document.title=…websiteName`), quindi questo patch copre header + titolo + favicon.
  - `branding/web/` = asset **trasparenti** generati da `scripts/gen_brand_assets.py`: `logo.svg` (SVG wrapper con PNG incorporato, 25 KB), `favicon.ico` (multi-size), `logo-192.png`, `logo-180.png`, `brand/logo.png` (512), `brand/full-logo.png` (simbolo + wordmark, reso in Space Grotesk). Lo sfondo nero del JPEG sorgente è rimosso via canale alpha; la wordmark è composta con il font Space Grotesk (scaricato in `.tmp/fonts/`, non versionato).
  - `docker-compose.yml` (servizio `app`): bind-mount **read-only** di `theme.js` e degli asset. Sopravvivono a `up -d`.
  - `index.html` **non** è montato (contiene gli hash dei bundle JS/CSS, che cambiano a ogni release): viene patchato **version-aware** da `scripts/05-branding.sh` (titolo + `favicon.ico` locale). `03-deploy.sh` lo richiama come step `[5/5]`.
- **Errore risolto (cache flags):** dopo aver aggiornato `theme.js` il bind-mount era corretto su disco ma `/api/v1/flags` restituiva ancora `#6e41e2` per la **cache in memoria** del processo API. Risolto con `docker compose restart app` (il semplice `up -d` non ricrea il container se il mount non cambia).
- **Verifica live (28/10/2026):** `GET /api/v1/flags` → `THEME.websiteName="Aethersy"`, `colors.primary.default="#00d4ff"`, `colors.blue-link="#4DEEFF"`, `logos` → `/brand/full-logo.png`, `/favicon.ico`, `/brand/logo.png`; `GET /` → `<title>Aethersy</title>` con `<link rel="icon">` locali; asset tutti `200`; **verifica visiva** (screenshot headless di `https://app.aethersy.online/` analizzato dal ponte vision): logo Aethersy visibile, bottone primario ciano, **nessun residuo "Activepieces"** visibile.
- **Debito/manutenzione:** il patch vive **dentro l'immagine** → dopo ogni cambio di `AP_VERSION` va rieseguito `scripts/05-branding.sh` (i bind-mount di theme.js/asset restano automatici, cambia solo `index.html`). Le stringhe "Activepieces" residue nel bundle (es. testi di supporto, "Model by Activepieces", SAML SP entity id) **non** sono rimovibili senza rebuild del frontend: restano note.
- **Layer A — re-skin profondo via design token (28/10/2026):** il frontend è **React + Tailwind v4 con design token CSS** (`--primary`, `--sidebar-*`, `--accent`, `--ring`, `--chart-*`, `--radius`, in formato HSL-triplet). È quindi possibile un re-skin **senza rebuild**: `branding/web/brand/aethersy.css` sovrascrive i token con la palette Aethersy (primary ciano `190 100% 50%`, sidebar indaco profondo, accent dorato, chart, builder canvas), include un **dark mode orbitale** (`--background 256 66% 6%`) e un glow `0 0 20px rgba(0,212,255,.3)` sui bottoni primari. Il file è iniettato come **ultimo** `<link>` di `<head>` da `05-branding.sh` (version-aware, idempotente) così vince a parità di specificità. Verificato live: `/brand/aethersy.css` → `200 text/css`; screenshot post-reskin → bottone primario ciano, link leggibili, logo visibile, nessun residuo "Activepieces", nessun elemento rotto.
- **Acceptance:** header/titolo mostrano `Aethersy` ✔; nessun placeholder "Activepieces" visibile nella UI principale ✔; re-skin ciano applicato alla UI ✔.

### Fase 9 — Backup e monitoraggio
- **Esito:** `DONE` (27/10/2026). `scripts/backup.sh` (pg_dump + tar Redis, rotazione 7 giornalieri + 4 settimanali, copia settimanale la domenica) **eseguito con successo**; **restore testato** su DB temporaneo.
- **Bug corretto:** la rotazione usava `ls -1t <glob> | tail | xargs` che, con glob vuoto (es. `weekly/` prima della prima domenica), fa uscire `ls` con codice 2 e — per `set -e`/`pipefail` — abortiva lo script **dopo** aver creato il dump (exit 1). Sostituito con una funzione `rotate()` che tratta l'assenza di file come caso non errore.
- **Corretto anche:** l'utente `deploy` non era nel gruppo `docker` (lo assumevano `backup.sh` e `04-smoke-test.sh`). Aggiunto in `01-hardening.sh` (`usermod -aG docker deploy`) e applicato a caldo sul VPS.
- **Test di restore (dettagli in `docs/restore.md` §6):** dump `postgres-20261027-230835.sql.gz` (28 MB, `gzip -t` OK, 81 `CREATE TABLE`); restore su `activepieces_restore_test` → **83 tabelle**, `user=1`, `platform=1`, `project=1`, `ai_provider=1` (id/status coerenti con produzione), `flow=0`; DB di test rimosso. Archive Redis integro (`gzip -t` OK; `appendonlydir/` + `dump.rdb`).
- **Acceptance:** dump non vuoto con dimensione plausibile ✔; restore su DB temporaneo restituisce tabelle popolate ✔; smoke test `04-smoke-test.sh` OK ✔.

### Fase 10 — Review finale e consegna
- **Esito:** `DONE` (28/10/2026) — audit infrastrutturale + **clean-clone** completati.
- **Verifiche eseguite sul VPS (tutte OK):** ufw default-deny con allow 22/80/443; fail2ban attivo; `sshd -T` → `permitrootlogin no`/`passwordauthentication no`/`maxauthtries 3`; `unattended-upgrades` active; swap 2 GB; porte in ascolto solo 22/80/443 (5432/6379 assenti); `.env` `-rw------- deploy`; `docker compose config --quiet` senza warning; immagini **pinnate** (`caddy:2.8-alpine`, `pgvector/pgvector:0.8.0-pg14`, `redis:7.0.7`, `activepieces:${AP_VERSION}`=`0.92.3-hotfix.1`); log driver `json-file` `max-size=10m`/`max-file=5`; nessun `network_mode: host` né mount di `docker.sock`.
- **Audit segreti:** `.env`/`.env.secrets` mai committati (fuori da `git ls-files`); nessuna chiave reale (`sk-…`, `ghp_…`, webhook Slack, PEM) nei file tracciati o nella history. **Defect trovato e corretto:** `docs/security.md` conteneva la password SSH in chiaro → **redatta**; il valore resta nella history git locale (repo **senza remote**, non pubblicato) e va comunque **ruotato** (§6.1 di `docs/security.md`).
- **Clean-clone (28/10/2026) — Acceptance soddisfatta:** il VPS non è un repo git (repo locale, nessun remote), quindi il test è stato eseguito costruendo un tarball dai soli file **tracciati** (`git ls-files` → **73 file**, nessun `.env` incluso), estratto in `/tmp/aethersy-cleanclone` su un percorso pulito. Copiato **solo** il `.env` (non tracciato) → `docker compose config --quiet` **OK senza warning**, segreti risolti correttamente; `docker compose build console` **OK**; stack live non toccato. Temp rimossi a fine test.
- **Nota "aethersy:" (non è un bug):** la voce `aethersy:` che compare in `docker-compose.yml` (riga ~176) è la definizione della **network Docker** (`networks: aethersy: driver: bridge`), renderizzata come `aethersy_aethersy`. Non è un servizio spurio né un duplicato.
- **Prossimi passi:** (1) rotazione credenziali esposte in chat (azione utente); (2) backup offline dei segreti critici; (3) ~~collegare un client MCP reale~~ (Fase 7 acceptance **CHIUSA** 28/10/2026 — handshake reale, 42 tool); (4) ~~decisione branding~~ (Fase 8 **DONE** 28/10/2026 — logo e palette definitivi dal committente, applicati e verificati live); (5) ~~`SLACK_WEBHOOK_URL`~~ (Fase 6 **DONE** 28/10/2026).
- **Report finale:** [`docs/delivery-report.md`](delivery-report.md) (riepilogo §13 di `AGENTS.md`: stato per fase, variabili, comandi operativi, Definition of Done, debito tecnico, azioni utente residue).

### Fase 11 — Aethersy Console (fusion A+B+C)
- **Esito:** `DONE` (28/10/2026). Piattaforma proprietaria "Aethersy Console" costruita **in aggiunta** ad Activepieces (che resta engine, admin e fallback). L'obiettivo è un'app brandizzata Aethersy con un **AI Router** che sceglie automaticamente il modello per capacità, preferendo i gratuiti.
- **Architettura:** frontend **React 19 + Vite + TS + Tailwind v4 + TanStack Query + React Router** (`console/web/`) e **BFF Fastify** (`console/server/`) che tiene i segreti lato server. L'auth è una **sessione reale**: il BFF fa `POST /api/v1/authentication/sign-in` su Activepieces e ripone il token utente in un **cookie httpOnly firmato HMAC** (`CONSOLE_SESSION_SECRET`); nessun token in `localStorage`, nessun token forgiato (la firma di Activepieces richiede `tokenVersion` + `verified`). Il browser non vede mai `OPENROUTER_API_KEY`.
- **AI Router** (`console/server/src/ai-router.ts`): legge il catalogo **live** da OpenRouter `GET /models` (nessuna lista hard-coded), deriva le capacità da `architecture.input_modalities`, e seleziona con (1) **lista curata** per capacità, (2) filtro `isUsable` che esclude modelli inadatti (musica `lyria`, content-safety, harness-only `inkling`, `whisper`), (3) **fallback automatico** sui candidati successivi se un modello gratuito rifiuta/è indisponibile. Supporta testo, immagine→testo, audio→testo (STT) e video→testo.
- **Verifica live (28/10/2026):** catalogo 464 modelli / 19 gratuiti. Selezioni: testo → `nvidia/nemotron-3.5-lightning:free` ("PONG" in ~2.1s); immagine → `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` (fallback da `super-vl` che rifiuta gli URL immagine) → descrizione **corretta** del logo Aethersy; audio/video → `nemotron-3-nano-omni`. Build web (322 KB js / 14.9 KB css) e server pulite; BFF: `/api/health` 200, `/api/auth/session` 401, login proxy fedele all'app (400 su email inesistente).
- **Build validato sul VPS (28/10/2026):** `docker build` della Console sul VPS Aruba OK (immagine 66 MB, multi-stage web→server→runtime); container di test isolato → `/api/health` 200, `/api/auth/session` 401, SPA `/` 200. Artefatti di test rimossi; stack live (`app`/`worker`/`postgres`/`redis`/`caddy`) non toccato.
- **Deploy (aggiuntivo, non distruttivo):** nuovo servizio `console` in `docker-compose.yml` (build da `./console`, `AP_INTERNAL_URL=http://app:80`, nessuna porta pubblicata) + blocco Caddy `{$CONSOLE_DOMAIN}` → `console:3000`. Nuove env: `CONSOLE_DOMAIN`, `CONSOLE_VERSION`, `CONSOLE_SESSION_SECRET` (in `.env.example`).
- **Deploy parziale sul VPS (28/10/2026):** file sincronizzati (`console/`, `docker-compose.yml`, `caddy/Caddyfile`, `scripts/`, `docs/`, `branding/`); backup live pre-modifica (`.bak.20261028-121052`). Generato `CONSOLE_SESSION_SECRET` (`openssl rand -hex 32`) e aggiunte le tre env `CONSOLE_*` al `.env` del VPS. **`OPENROUTER_API_KEY` era vuota nel `.env` del VPS** (la chiave viveva solo a runtime in Activepieces): popolata dal `.env` locale. Container `aethersy-console` **buildato e avviato** (`--no-deps`, Caddy non toccato) → `healthy`, `/api/health` raggiungibile sulla rete interna via `caddy`. Stack live intatto: `app`/`mcp` pubblici ancora 200/405.
- **Blocco risolto (28/10/2026):** l'utente ha aggiunto il record A `console` → `195.231.79.221` su GoDaddy. Verificato live via DoH (Google e Cloudflare) con TTL 600.
- **Deploy completato (28/10/2026):** il container Caddy era **stale** (creato 13h prima): aveva `CONSOLE_DOMAIN` vuoto e il Caddyfile precedente. La causa è il bind-mount di un **singolo file** (`./caddy/Caddyfile:/etc/caddy/Caddyfile:ro`): sostituendo il file cambia l'inode e il container continua a leggere il vecchio. Un `caddy reload` riportava `config is unchanged` (la env non era nemmeno nel processo). Risolto con `docker compose up -d --force-recreate caddy` (ricrea anche la catena `depends_on` → `app` ricreato e tornato `healthy`). **Nota operativa:** dopo ogni modifica al `Caddyfile` o alle env di Caddy serve `--force-recreate`, non basta `reload`.
- **Verifica live (28/10/2026):**
  - Certificato **Let's Encrypt** emesso per `console.aethersy.online` (challenge `tls-alpn-01`, `authz_status: valid`, `certificate obtained successfully`). `curl https://console.aethersy.online/api/health` → **HTTP 200** `{"status":"ok","service":"aethersy-console"}`, TLS verify **0**.
  - SPA `/` → **200** `text/html`; `/api/ai/catalog` e `/api/ap/projects` senza sessione → **401** (auth gate OK); login con credenziali errate → **401** `INVALID_CREDENTIALS` (il BFF raggiunge Activepieces; nessun 500).
  - `scripts/04-smoke-test.sh` → **5/5 OK** (il check Console ora usa `--resolve … :127.0.0.1` come fallback quando il resolver locale ha ancora in cache il vecchio NXDOMAIN, così valida Caddy/TLS in modo deterministico).
- **Nota DNS:** a livello autoritativo/DoH il record è live; i resolver ricorsivi di PC e VPS avevano ancora in cache il NXDOMAIN al momento della verifica (propagazione in corso, TTL 600). Let's Encrypt e i browser risolvono correttamente.
- **Prossimi passi:** (1) Fase 10 (rotazione segreti esposti in chat + backup offline dei due segreti critici); (2) ~~collegare un client MCP reale~~ (Fase 7 acceptance **CHIUSA** 28/10/2026 — handshake reale, 42 tool).

### Fase 12 — Piattaforma a consumo (P0): pipeline + asset + Console + lead/canale (P0.6)
- **Esito:** `DONE` (28/10/2026; P0.1–P0.8 chiusi). Trasformazione della piattaforma verso un modello **pay-per-use**: nucleo di metering/billing (P0.1/P0.2), pipeline multi-stadio (P0.3), **libreria asset con versioning + approvazione** (P0.4), **Console run/crediti** (P0.5), **lead webhook + canale Slack + export pacchettizzato** (P0.6) e **QA end-to-end + backup off-site** (P0.7, sezione dedicata sotto). Documento di progetto e delta implementativo: [`docs/platform-consumption.md`](platform-consumption.md) (§9).
- **Nucleo (P0.1/P0.2, commit `24c1d1f`):** schema `metering` idempotente (`usage_event`, `ledger`, `price_book`, `tenant`, …), repo `reserve`/`settle`/`top-up`, motore di prezzo (markup 15000 bps = margine 60%, `credit_unit = 0.0001 €`), guard con clamp-to-zero + degrade + `402`; generazione Venice metrata (`img_out`/`tts`/`vid_out`).
- **Pipeline (P0.3, commit `94f65a9`):** schema `pipeline` (`pipeline_run`, `agent_task`, `asset`, `integration_credential`, `lead`), catalogo puro (`STAGES` brand/website/content/social, macchina a stati del run), orchestratore con esecutore **iniettato** (`TaskExecutor`) e **HITL** obbligatorio su `approved→delivered`, segreti integrazione AES-256-GCM (`CONSOLE_SECRETS_KEY`), metering `flow_run` (1 × 0.0020 €/task).
- **Libreria asset (P0.4):** `pipeline/catalog.ts` — macchina a stati asset (`draft → in_review → approved → delivered`; `rejected` ripresentabile) con `canTransitionAsset`/`isAssetDecidable`/`isAssetAccepted`/`assetFamilyKey`/`approvedVersion`. `pipeline/repo.ts` — `transitionAsset` (con `SELECT … FOR UPDATE`), `listAssetVersions`, `listAssetFamilies` (una riga per deliverable run/kind/name con `latest_version`, `approved_version`, `latest_asset_id`, conteggio revisioni), `deliverRunAssets`; `deliverRun` ora marca `delivered` gli asset approvati. Rotte: `GET /api/pipeline/assets/families`, `GET /api/pipeline/assets/:assetId/versions`, `POST …/:assetId/submit`, `POST …/:assetId/decide`.
- **Console:** `console/web/src/pages/Assets.tsx` — filtri per tipo, tabella famiglie (revisioni + versione approvata), pannello revisioni con invio in revisione / approva / rifiuta; hook `useAssetFamilies`/`useAssetVersions`/`useSubmitAsset`/`useDecideAsset`; voce di navigazione "Libreria asset" e rotta `/assets`.
- **Verifica (28/10/2026):** server `gen:schema` OK, `tsc --noEmit` **0**, `build` **0**, `npm run test:metering` **34/34** (incluse 7 asserzioni sulla macchina a stati asset); web `tsc -b --noEmit` **0**, `vite build` OK.
- **Console run/crediti (P0.5):** `pages/Pipeline.tsx` — griglia stadi (brand/website/content/social) per aprire un run, filtri stadio/stato, elenco run e pannello dettaglio con task (stato per task), consumo del run per capacità (`runUsageSummary`), deliverable e azioni HITL (esegui task, approva, consegna, riprova) con gestione errori. `pages/Credits.tsx` — saldo/prenotato/disponibile/tenant, barra quota con soglie (soft = degradazione, 100% = `402`) e tabella ultimi eventi di consumo; avviso quando `METERING_ENABLED=false`. Nuovi tipi (`ExecuteOutcome`, `ExecuteResult`, `CreditQuota`, `CreditBalance`, `UsageEvent`, `UsageEvents`) e hook (`useOpenRun`/`useExecuteRun`/`useApproveRun`/`useDeliverRun`/`useRetryRun`/`useCreditBalance`/`useUsageEvents`); rotte `/pipeline`, `/credits` e voci di navigazione "Pipeline"/"Crediti".
- **Lead + canale outbound + export (P0.6):** la pipeline ora chiude il ciclo fino al "consegnabile".
  - **Macchina a stati lead** (`pipeline/catalog.ts`, puro): `LeadStatus` (`new|contacted|qualified|won|lost|spam`), `LEAD_TRANSITIONS` (`won`/`lost`/`spam` terminali; `spam` raggiungibile da ogni non-terminale), `isLeadStatus`, `canTransitionLead`.
  - **Repo** (`pipeline/repo.ts`): `LeadRow`, `listLeads` (filtri `status`/`runId`, limit 1..500), `getLead`, `updateLeadStatus` (row lock `FOR UPDATE` + transizione validata; idempotente sullo stesso stato; `null` se non ammessa), `markLeadNotified` (idempotente), `leadStatusCounts`, `findActiveIntegrationCredential` (con `secret_enc`, per la decifratura a runtime).
  - **Canale outbound** (`pipeline/notify.ts`, nuovo): risoluzione webhook Slack con **priorità alla credenziale del tenant** (`integration_credential` provider `slack`, segreto decifrato) e **fallback** a `SLACK_WEBHOOK_URL` di stack; timeout 5 s, nessun retry, `notifyText`/`notifyLeadCreated`/`notifyRunDelivered` **non lanciano mai**; se nessun canale è configurato la notifica è un no-op. `config.slackWebhookUrl` + passthrough in `docker-compose.yml`/`.env.example`.
  - **Schema**: `lead.updated_at`/`lead.notified_at` (idempotenti) + indice `lead_tenant_status(tenant_id, status, created_at DESC)`; `schema.ts` rigenerato.
  - **Rotte**: `GET /api/pipeline/leads` (filtri + `counts`), `PATCH /api/pipeline/leads/:id` (400 stato ignoto, 404 assente, 409 transizione non ammessa), `POST /api/pipeline/leads` ora notifica e marca `notified_at`, `POST /api/pipeline/runs/:id/deliver` notifica (best-effort, la consegna non dipende dall'esito), `GET /api/pipeline/runs/:id/export` (manifest `aethersy.run-package/v1`: run, deliverable approvati/consegnati con `storageKey`/mime/size/meta, consumo totale e per capacità; `Content-Disposition: attachment`).
  - **Console**: `pages/Leads.tsx` — elenco lead con filtri per stato e conteggi, azioni di funnel (solo transizioni ammesse), colonne origine/notificato/ricevuto e pannello "Canale outbound" (salva/revoca credenziale `slack`). `api.patch`; tipi `Lead`/`LeadStatus`/`LeadsResponse`/`IntegrationCredential`; hook `useLeads`/`useUpdateLead`/`useIntegrations`/`useSaveIntegration`/`useRevokeIntegration`/`useExportRun`; pulsante "Esporta pacchetto" nel pannello run (visibile su `approved`/`delivered`); voce di navigazione "Lead" e rotta `/leads`.
- **Verifica (28/10/2026):** server `gen:schema` OK, `tsc --noEmit` **0**, `build` **0**, `npm run test:metering` **38/38** (incluse 4 asserzioni sulla macchina a stati lead); web `tsc -b --noEmit` **0**, `vite build` OK.
- **Residuo:** preview/download inline degli artefatti binari, azioni bulk, secondo canale outbound (email/CRM) e retry con backoff; P0.8 (consolidamento frontend).

### Fase 12 — P0.7: QA end-to-end e backup off-site
- **Esito:** `DONE` (28/10/2026). Il percorso pilota (tenant → run → task → asset → approvazione →
  consegna → pacchetto → lead) è coperto da test **end-to-end su Postgres reale**, ed esiste una
  copia di backup **automatica fuori dal VPS**. Metering attivo in produzione.
- **Presentazione run (`pipeline/package.ts`, nuovo):** il formato del pacchetto è estratto dalle
  rotte (`RUN_PACKAGE_FORMAT = "aethersy.run-package/v1"`, `buildRunPackage`, `runPackageFilename`) e
  `GET /api/pipeline/runs/:id/export` ora vi delega — stesso JSON di prima, ma costruibile e
  testabile senza HTTP.
- **Test end-to-end (`console/server/tools/test-e2e-pilot.mjs`, nuovo):** **opt-in** (`E2E_CONFIRM=1`)
  e **solo su DB temporaneo** (`CONSOLE_PGDATABASE=console_e2e`); rifiuta esplicitamente il DB
  `activepieces`. Importa il `dist` compilato (`/app/dist`) e pilota l'API reale con webhook Slack
  finto locale. Copre: migrazioni idempotenti (applicate al primo giro, no-op al secondo),
  provisioning tenant + top-up + saldo/disponibile, apertura run (6 task) con approvazione rifiutata
  in `draft`, `orchestrateRun` con esecutore sintetico e addebito `flow_run`, `flow_run_id` scritto sui
  task, asset v1 in `draft`, `runUsageSummary`, HITL sugli asset (decide su `draft` rifiutata → submit
  → doppio submit rifiutato → approva → `approvedVersion`), approvazione run, consegna (1 asset
  consegnato, doppia consegna rifiutata), notifica di consegna, pacchetto (solo deliverable approvati,
  formato e nome file), round-trip dei segreti AES-GCM, credenziali di integrazione (lista senza
  `secret_enc`, credenziale tenant che vince sul fallback di stack, revoca), lead + notifica +
  `markLeadNotified` + testo notifica, funnel e filtri/conteggi, isolamento fra tenant, eventi di
  consumo finali.
- **Tre bug reali trovati dal deploy live + E2E e corretti:**
  1. **`window` è keyword riservata (Postgres 14):** `metering.quota.window` faceva fallire
     `migrateMetering()` con `syntax error at or near "window"` (container avviato ma schema
     `metering` assente). Rinominata in `quota_window` (+ commento in `schema.sql`),
     `schema.ts` rigenerato, `quotaState()` legge `quota_window AS window` (il tipo TS
     `QuotaState.window` resta invariato).
  2. **`started_at` ambiguo:** in `startTask` l'`UPDATE pipeline.agent_task t … FROM pipeline.pipeline_run r`
     referenziava `started_at`, presente in entrambe le tabelle
     (`column reference "started_at" is ambiguous`). Corretto con `COALESCE(t.started_at, now())`.
     Rivisti anche `finishTask` (già qualificato) e il backfill di `flow_run_id`.
  3. **`request_id` è `uuid`:** `recordFlowRun` passava `"flow_run:<flowRunId>"`, non un UUID
     (`invalid input syntax for type uuid`). Aggiunto `requestIdForFlowRun()`: UUID deterministico
     derivato da `sha256("flow_run:"+flowRunId)`, così il vincolo unico `(request_id, attempt_no)`
     continua a deduplicare i retry. Il `requestId` viene calcolato una volta all'inizio della funzione
     ed è restituito anche nel caso "run inesistente".
- **Guardrail aggiunti (`tools/test-metering.mjs`):** per ogni cartella-schema, (a) nessuna keyword
  riservata usata come nome di colonna (`window|order|group|limit|user|check|end|all`) e (b)
  `schema.ts` deve essere **byte-identico** al bundle di `schema.sql` (fallisce con
  "esegui npm run gen:schema" se si dimentica la rigenerazione). Test: **42/42**.
- **Deploy in produzione (28/10/2026):** `.env` del VPS aggiornato (backup `.env.bak-p07`) con
  `METERING_ENABLED=true`, `METERING_RATE_PER_MINUTE=120`, `METERING_SIGNUP_CREDITS=0` e un
  `CONSOLE_SECRETS_KEY` nuovo (`openssl rand -hex 32`, `chmod 600`); `docker-compose.yml` salvato in
  `.bak-p07`. `docker compose config` OK con segreti mascherati, immagine ricostruita, container
  `healthy`: log `schema metering applicato` + `schema pipeline applicato`, 13 tabelle `metering` e 5
  tabelle `pipeline` verificate via `psql`, `https://console.aethersy.online/api/health` → **200**.
  DB temporaneo `console_e2e` creato per l'E2E e poi rimosso (`DROP DATABASE`).
- **E2E sul VPS:** `docker compose run --rm --no-deps -e E2E_CONFIRM=1 -e CONSOLE_PGDATABASE=console_e2e
  -e METERING_ENABLED=true -v tools:/tools:ro console node /tools/test-e2e-pilot.mjs` →
  **41 ok, 0 falliti** su Postgres reale. Nota operativa: `docker compose run` consuma lo stdin, quindi
  il runner va scritto su file e invocato con `< /dev/null` e redirect su log, altrimenti l'output
  sembra vuoto.
- **Backup off-site (`scripts/offsite-pull.ps1`, nuovo, lato PC):** pull **incrementale** con la chiave
  SSH già esistente (`ssh`/`scp` verso `aethersy-vps`), confronto di dimensione e `sha256` remoto con
  `manifest.tsv`, copia solo di file mancanti/cambiati, verifica `sha256` dopo il trasferimento,
  retention locale (14 daily / 8 weekly), log su `logs/offsite-pull.log`, flag `-DryRun`. Bug corretto:
  `Get-RemoteFiles` che restituiva un array vuoto veniva srotolato a `$null` (errore
  `PropertyNotFoundException` su `.Count`) → `return ,$files`. Verificato: primo giro **6 file**
  (~83 MB), secondo giro **0 copiati / 6 invariati**. Attività pianificata **"Aethersy Offsite Backup"**
  giornaliera alle **04:15** (dopo il backup VPS delle 03:30); `/RL HIGHEST` negato ("Accesso negato")
  quindi task creato senza elevazione, test-run OK. Procedura in `docs/runbook.md` §7.1.
- **`.env.example`:** documentato `CONSOLE_SECRETS_KEY` (64 hex, fallback su `AP_ENCRYPTION_KEY`,
  503 se entrambe assenti).
- **Residuo:** cifratura (gpg/BitLocker) dei dump prima della copia off-site — oggi arrivano in chiaro
  sul PC (vedi avvertenza in `docs/runbook.md` §7.1); E2E in CI con DB effimero; alert dedicato sul
  fallimento del pull off-site (oggi solo log locale + task scheduler).

### Fase 12 — P0.8: layer "Anteprima" (porting di `platform/` in Console)
- **Esito:** `DONE` (28/10/2026). Il frontend standalone `platform/` (React 18 + Tailwind 3, SPA demo
  alimentata solo da `src/mocks/*`) è portato **dentro** la Console come layer di anteprima a dati
  demo: una sola app reale, nessun secondo deploy, nessun endpoint nuovo inventato.
- **Decisione (AskUser):** migrazione **pagina per pagina** mappando solo gli endpoint che esistono
  davvero (oggi: `/api/ap/*`, `/api/pipeline/*`, `/api/ai/*`), `platform/` **tracciata** in git
  (già 94 file tracciati: `git ls-files platform` → 94, di cui 72 in `platform/src`), pagine mock
  **visibili in Console** e marcate come anteprima.
- **Porting:** `platform/src/*` → `console/web/src/preview/` (**64 file** TS/TSX). Dipendenze già
  presenti in Console estese con `lucide-react`, `framer-motion`, `zustand`, `@radix-ui/*`.
  Alias dedicato `@pv` → `src/preview` (`tsconfig.json` + `vite.config.ts`), accanto a `@` → `src`.
- **Namespace colori `pv-*` (motivo tecnico):** i token hanno **nome invertito** fra i due progetti
  (`platform`: `primary` = superficie indaco `#1A0F4A`, `secondary` = testo ciano; Console: opposto).
  Per non toccare la palette della Console si è introdotto un namespace isolato: `@theme` con
  `--color-pv-*`, `--shadow-pv-*`, `--container-content`, `--animate-*`, i `@keyframes`
  (`pulseGlow`, `shake`, `orbit`, `fadeIn`, `slideInLeft`) e il blocco `.pv-layer` (variabili di
  layout, utility gradient/surface, focus) — tutto consolidato in `console/web/src/index.css`
  (il vecchio `preview/index.css` con le direttive Tailwind 3 `@tailwind` è stato eliminato: avrebbe
  rotto la build Tailwind 4).
- **Tema:** anteprima **dark-only**. `lib/theme.ts` e `components/common/ThemeToggle.tsx` eliminati;
  l'Header non ha più il toggle e `SettingsProfile` spiega che la Console usa un solo tema scuro.
  Così l'anteprima non aggiunge classi globali su `<html>` che de-brandizzerebbero la Console.
- **Routing e integrazione:** tutte le rotte riscritte sotto `/preview/*`; `PreviewLayout.tsx`
  monta lo `Shell` originale (Header/Drawer/BottomNav/Fab) dentro `.pv-layer`, mostra il banner fisso
  **"Anteprima — dati demo"** con link "Torna alla Console" e sincronizza il profilo demo
  (`store/auth.ts` → nuovo `setUser`) con la sessione reale. In `App.tsx` la rotta `/preview` è sotto
  `Protected` (auth reale della Console), `index` → `/preview/dashboard`, le pagine sono lazy sotto un
  `<Suspense>` globale. Voce di nav "Piattaforma (demo)" in `components/Layout.tsx`.
- **File eliminati (dead code dal progetto sorgente):** `main.tsx`, `index.css`, `preview.css`,
  `App.tsx`, `components/Protected.tsx`, `components/common/ThemeToggle.tsx`, `lib/theme.ts`,
  `pages/{Landing,Login,Register}.tsx` (la Console ha già auth reale); il logout del Drawer punta a
  `/login` e l'Header espone "Torna alla Console" invece dei link marketing.
- **Dati:** `preview/lib/api.ts` usa **solo** `delay(clone(...))` sui mock — nessuna `fetch`/`axios`,
  quindi nessuna chiamata a endpoint inesistenti (§ analisi di `platform/src/lib/api.ts`).
- **Verifica (28/10/2026):** web `tsc --noEmit -p tsconfig.json` **0**, `vite build` **0** (~7 s,
  `PreviewLayout` chunk ~61 kB, pagine lazy separate); CSS emesso con `bg-pv-indigo`, `text-pv-ink-3`,
  `shadow-pv-glow`, `max-w-content`, `animate-fade-in`, `pv-layer` tutti presenti. Server non toccato.
- **Residuo:** sostituire i mock pagina per pagina con gli endpoint reali, partendo da quelle che hanno
  già copertura (dashboard/lead/asset/crediti → `/api/pipeline/*`, `/api/ai/*`); download/preview dei
  binari; rimozione del vecchio `platform/` quando tutte le pagine saranno migrate.

### Fase 12 — P0.9 Deploy (29/10/2026)

Due esposizioni della stessa piattaforma, un solo codice sorgente:

1. **Console aggiornata** (`https://console.aethersy.online`): rebuild+deploy che porta in produzione i
   commit P0.1–P0.8 (metering/billing, pipeline, asset library, lead+Slack, **layer anteprima
   `/preview`**). L'immagine live era ancora `0.1.0` di 15 h fa, senza `/preview`.
2. **Platform dedicata** (`https://platform.aethersy.online`): la SPA mock-first come **sito autonomo**,
   servita da nginx (`platform/Dockerfile` multi-stage → `nginx:1.27-alpine` + `platform/nginx.conf` con
   fallback SPA e cache immutabile per `/assets/*`).

**Infra:** servizio `platform` in `docker-compose.yml` (nessuna porta pubblicata, nessun env di
runtime), blocco `{$PLATFORM_DOMAIN}` in `caddy/Caddyfile` → `platform:80`, env `PLATFORM_DOMAIN` /
`PLATFORM_VERSION` in `.env.example` e nel `.env` del VPS. `03-deploy.sh` builda `console platform`;
`04-smoke-test.sh` copre 6 step (container, health locale console+platform, app pubblica, MCP, Console,
Platform).

**Procedura eseguita (deploy per copia file, VPS non-git):** backup pre-modifica timestampato
(`.env`, `docker-compose.yml`, `caddy/Caddyfile` → `.bak.20261029-095001`); sync artefatti via tarball
(`console/`, `platform/`, compose, Caddyfile, `scripts/`, `docs/`, `.env.example`; esclusi
`node_modules`/`dist`/`.env`); `docker compose build console platform`; `up -d console platform` +
`up -d --force-recreate caddy` (obbligatorio dopo modifiche a Caddyfile/env).

**Verifica (29/10/2026):** `docker compose ps` → 7 servizi `running` (console/platform `healthy`);
smoke test **6/6 OK**; `console.aethersy.online/api/health` 200, `/preview` 200 (chunk
`PreviewLayout-*.js` presente nell'immagine); `platform.aethersy.online/` 200 con title
"Aethersy — AI Operating Officer", asset 200, fallback SPA su `/settings/profile` 200; TLS
`ssl_verify_result=0` su entrambi; `app` 200 e `mcp` 405 invariati.

### Fase 12 — P0.10: modulo piattaforma "Business Pulse" (adattamento pazi.ai) (29/10/2026)

Adattamento del modello di prodotto **pazi.ai** (Business Pulse / Opportunities / Tasks &
Calendar / Agent Roster / Inbox / Files / Account) sulle superfici **reali** già presenti in
Aethersy, **senza riscrivere lo stack**: nessun Next.js/Clerk/Prisma/Stripe, nessuna seconda
piattaforma. La piattaforma è una **vista** sui dati che la pipeline già produce
(`pipeline_run`, `agent_task`, `asset`, `lead`) più **una sola** tabella nuova: `pipeline.schedule`.

**Backend** — nuovo modulo `console/server/src/platform/`:
- `catalog.ts` — fonte unica di verità (puro, senza dipendenze): roster dei **12 droid** con reparto,
  tagline, skill e stadi; mappa di stato pazi (`open`/`in_progress`/`awaiting_input`/`ready`/`done`/`error`)
  derivata da `RunStatus`; etichette stato/kind dell'agenda.
- `cron.ts` — motore cron a 5 campi **senza dipendenze esterne**: `*`, liste, range, step, nomi
  (`jan..dec`/`sun..sat`), semantica Vixie dom/dow, timezone IANA via `Intl.DateTimeFormat`
  (assorbe l'ora legale con un secondo passaggio); `CronError`.
- `guard.ts` — `requireMeteredTenant` (503 se metering off, 401 se identità assente): riusa la
  guard di metering, nessuna nuova logica di auth.
- `repo.ts` — CRUD agenda (`createSchedule`/`listSchedule`/`getSchedule`/`updateSchedule`/`deleteSchedule`
  + `listScheduleWithNext`/`nextRunAt`/`validateScheduleInput`), `listOpportunities`,
  `businessPulse` (aggregazione **in una sola transazione** + crediti + prossime voci + attention),
  `droidRoster`/`droidDetail`/`runDroidSummary`, `accountSummary`.
- `routes.ts` — `/api/platform/{catalog,overview,opportunities,roster,roster/:droidId,schedule,
  schedule/:id,schedule/:id/pause,resume,cron/preview}`.
- Wiring in `routes.ts` (`registerPlatformRoutes` importato + invocato) — +7 righe.

**Schema** — `pipeline.schedule` (14 colonne: `id, tenant_id FK, run_id FK SET NULL, stage, title,
kind, cron, run_at, timezone DEFAULT 'Europe/Rome', status, meta, last_run_at, created_at, updated_at`;
CHECK su status/kind/presenza riferimento temporale; indici `schedule_tenant_status`/`schedule_time`).
`pipeline/schema.sql` aggiornato e `pipeline/schema.ts` rigenerato con `gen:schema`.

**Frontend (Console)** — pagine **on-brand** già cablate: `Pulse.tsx` (landing `/`), `Opportunities.tsx`
(`/opportunities`, filtri + azioni approva/consegna/riprova), `Schedule.tsx` (`/schedule`, form nuova voce
+ anteprima cron + pause/resume/delete), `AgentRoster.tsx` (`/agents`, reparti + scheda droid). Rotte in
`App.tsx` e voci di nav in `Layout.tsx`; tipi (+106) e hook (+127: `usePulse`, `useOpportunities`,
`useRoster`, `useDroid`, `useSchedule`, `useCreateSchedule`, `useUpdateSchedule`, `useToggleSchedule`,
`useDeleteSchedule`, `useCronPreview`).

**Bug corretto (script typecheck):** `console/web/package.json` aveva
`tsc -b --noEmit false --emitDeclarationOnly false`, che **emetteva 83 file `.js`** dentro `src/`
(ombrando i `.tsx` reali: Vite risolve `.js` prima). Corretto in `tsc -p tsconfig.json --noEmit`;
i 83 artefatti rimossi; riverificato **0**.

**Deploy (VPS non-git, copia file):** backup sorgente console (`backups/console-src-*.tgz`) → tarball
dei 17 file cambiati → `docker compose build console` → `up -d --force-recreate console` → container
**healthy**; log `schema metering applicato` + `schema pipeline applicato`; `pipeline.schedule`
**live con 14 colonne**; bundle `index-BukgNtn8.js` identico al locale.

**Verifica (29/10/2026):**
- `npm run typecheck` (web+server) **0**; `npm run build` **0** (web 7,5 s); modulo `platform/` presente
  nel bundle.
- Endpoint pubblici `https://console.aethersy.online/api/platform/{overview,roster,schedule,catalog}`
  → **401** (`requireMeteredTenant`, auth richiesta — atteso); `POST .../cron/preview` con body JSON
  valido → **401** (parsing corretto).
- **QA E2E esteso** (`console/server/tools/test-e2e-pilot.mjs`): aggiunta la sezione "piattaforma
  (Business Pulse)" + copertura isolamento multi-tenant per l'agenda. Eseguito sul VPS contro il DB
  temporaneo `console_e2e`: **51 ok, 0 falliti** (era 41) — roster 12 droid con carico reale, scheda
  droid, opportunità derivate dai run, contatori Business Pulse, cron valido/invalido, CRUD agenda
  (create → next-run → pause/resume → delete), isolamento fra tenant.
- Telegram relay live (`~/aethersy-tgrelay/relay.py`, PID 200333): `outbox.jsonl` rispecchia i messaggi
  dell'assistente (work updates verso l'utente).

**Debito residuo:** `accountSummary` non è esposto da nessuna rotta (dead code: la pagina Crediti copre
già saldo/quota/consumo); snapshot listini ancora seed statico; stadi P1 (idea/strategia/ads/growth).

### Fase 12 — P1.1: substrato aziendale multi-tenant (obiettivi, memoria, prodotti) (29/10/2026)

Primo incremento del piano **piattaforma multi-tenant** (gestire business di qualunque settore). Qui si
pone la **base dati proprietaria del business** — distinta dal lavoro della pipeline — su cui poggeranno
gli incrementi successivi (P1.2 scheduler reale, P1.3 chat centrale, P1.4 moduli di settore, P1.5 OAuth +
email aziendale + gate di autorizzazione, P1.6 dashboard risultati). Nessuna operazione simulata: solo
persistenza reale + API + UI + test.

**Schema** — nuovo schema Postgres `business` (`console/server/src/business/schema.sql`), creato
idempotentemente all'avvio del BFF dopo `metering` e `pipeline`:
- `business.goal` — obiettivi dell'impresa: `title, description, status` (`active|achieved|paused|abandoned`),
  `priority` (1–5 CHECK), `metric`, `target_date`, `meta jsonb`, `achieved_at`; indici `(tenant_id,status,priority)`
  e `(tenant_id,created_at)`.
- `business.memory` — base di conoscenza: `kind` (`fact|note|preference|constraint|decision|contact`),
  `title, content, source, tags text[]` (indice GIN), `pinned` (indice parziale).
- `business.product` — catalogo offerta: `kind` (`product|service`), `name, sku, description,
  price_cents (>=0), currency char(3) default EUR, status` (`draft|active|archived`); vincolo unico
  `(tenant_id, sku)` dove `sku <> ''`.
- FK `tenant_id → metering.tenant`.

**Backend** — nuovo modulo `console/server/src/business/`:
- `catalog.ts` — fonte unica (puro): stati/kind/etichette + validatori (`isGoalStatus`, `isGoalPriority`,
  `isMemoryKind`, `isProductKind`, `isProductStatus`).
- `migrate.ts` — `migrateBusiness()` idempotente (guarded da `meteringActive()`), usa `BUSINESS_SCHEMA_SQL`.
- `repo.ts` — CRUD tenant-scoped via `withTx` per goal/memory/product; `updateGoal` valorizza/azzera
  `achieved_at` sulle transizioni di stato; `listMemory` filtra per kind/tag (`tags @> ARRAY[]`)/pinned/ricerca
  ILIKE; `businessSummary(tenantId)` restituisce i conteggi per dashboard.
- `routes.ts` — `registerBusinessRoutes(app)`: `GET /api/platform/business/catalog`,
  `GET /api/platform/business/summary`, CRUD `/api/platform/{goals,memory,products}`, tutti dietro
  `requireMeteredTenant`.
- Wiring: `index.ts` esegue `migrateBusiness()` dopo la pipeline; `routes.ts` registra le rotte.
  `tools/gen-schema.mjs` (+`business`) e `tools/test-metering.mjs` (loop guardrail su `["metering","pipeline","business"]`).

**Frontend (Console)** — pagine on-brand: `Goals.tsx` (`/goals`, metriche + priorità + raggiungi/riattiva),
`Memory.tsx` (`/memory`, card + filtri tipo/ricerca + pin/unpin), `Products.tsx` (`/products`, catalogo +
filtri stato/tipo). Tipi (+~90) e hook (+14: `useBusinessSummary`, CRUD `useGoals`/`useMemory`/`useProducts`
con invalidazione del riepilogo). Rotte in `App.tsx`, voci di nav in `Layout.tsx` (Obiettivi/Memoria/Prodotti & Servizi).

**Deploy (VPS non-git, copia file):** backup sorgente console → tarball → `docker compose build console`
→ `up -d --force-recreate console` → container **healthy**. Verificato: schema `business` live con le 3
tabelle; `GET /api/platform/{goals,memory,products,business/summary}` senza sessione → **401** (atteso).

**Verifica (29/10/2026):**
- `npm run typecheck` (web+server) **0**; `npm run build` **0**.
- `npm run test:metering` → **44/44** (incluse le guardrail keyword-riservate e allineamento `schema.ts`
  per `business`).
- **QA E2E esteso** (`test-e2e-pilot.mjs`): nuova sezione "substrato aziendale" + isolamento multi-tenant.
  Eseguito sul VPS contro il DB temporaneo `console_e2e`: **65 ok, 0 falliti** (era 51) — migrazione
  business idempotente, CRUD goal (con `achieved_at`), filtri memoria (kind/tag/pinned/ricerca), validazioni
  prodotto (prezzo/valuta/SKU duplicato), riepilogo, delete, isolamento fra tenant.
- Telegram relay: report inviato su `outbox.jsonl`.

**Prossimo incremento:** P1.2 — scheduler reale (l'esecutore preleva le voci `pipeline.schedule` dovute,
apre run/task, registra il risultato verificato come asset approvato; formalizza la triade
pianificato/eseguito/verificato + log errori).

### Fase 12 — P2.1/P2.2: motore agenti + piattaforma reale (`platform.aethersy.online`) (29/10/2026)

**Contesto.** Il codice P2.1 (motore agenti: `console/server/src/agent/*`, `pipeline/executor.ts`,
`business/chat.ts`) e P2.2 (SPA reale `platform/`: auth cookie-based condiviso, `Protected`,
Studio) era **già presente nel commit `a388492`** ma **non era mai stato deployato** sul VPS.
La decisione del committente: la Console resta **backoffice interno**; `platform.aethersy.online`
è **l'unica app utente reale**, dove gli agenti eseguono lavoro vero e producono deliverable.

**Deploy (VPS non-git, copia file).**
- Bundle da `git archive a388492` (142 file) → backup sorgenti `backups/console.platform.src.bak.20261029-p2.tgz`
  → estrazione sul VPS → `docker compose build console platform` → `up -d --force-recreate console platform`.
- `.env` VPS: `CONSOLE_COOKIE_DOMAIN=.aethersy.online` (sessione condivisa tra `platform.` e `console.`)
  e `AP_ALLOW_OPEN_SIGN_UP=true` (self-service: la registrazione pubblica è **riattivata**, reversibile).
- `caddy/Caddyfile`: aggiunta la rotta `/api/*` → `console:3000` per l'hostname `platform.aethersy.online`.
  **Nota operativa:** il bind-mount del Caddyfile è un file singolo; sostituendo l'inode (tar) il container
  continua a servire la versione vecchia → serve `docker compose up -d --force-recreate caddy`.
  Sintomo risolto: register/chat → 405 (routing su nginx `platform:80`) invece che 400/401.

**Bug reali emersi solo a runtime (corretti).**
1. **`console/server/src/routes.ts`** — la rotta `register` non inviava `trackEvents`/`newsLetter`;
   le API Activepieces rifiutavano con `FST_ERR_VALIDATION` (400). Aggiunti `trackEvents:false,
   newsLetter:false`.
2. **`console/server/src/metering/repo.ts`** — `metering.usage_event.request_id` è di tipo `uuid`, ma
   gli orchestratori generano id idempotenti testuali (`chat:<conv>:<rand>`, `task:<id>:<rand>`,
   `${stage}:<run>:<seq>:<rand>`), causando su ogni turno di chat/settled un `502 AGENT_ERROR:
   invalid input syntax for type uuid "chat:…"`. Aggiunto l'helper `toRequestUuid()` (hash SHA-256
   deterministico → UUID a forma valida; gli id già UUID passano invariati) applicato all'unico INSERT
   in `settleUsageTx`. L'idempotenza `(request_id, attempt_no)` è preservata (stesso id testuale →
   stesso UUID).

**Verifica live (29/10/2026):**
- `platform.aethersy.online`: register/login/session/overview → **200**; cookie `HttpOnly` su
  `.aethersy.online`.
- Chat AI reale: risposta dell'Operating Officer (nessun 502).
- Richiesta di **lavoro** ("Crea il brand…"): apre lo stadio **Brand**, assegna gli specialisti
  (prism, quill, scout, vault), esegue i task con AI reale e genera **asset markdown reali**; il run
  raggiunge `in_review` con **tutti i task `done`, 0 errori**.
- `npm run typecheck` web+server **0** (locale). QA E2E `test-e2e-pilot.mjs` su DB temporaneo
  `console_e2e`: **65 ok, 0 falliti**.

**Prossimo incremento:** P1.2 — scheduler reale.


### Fase 13 — Console buildabile e deployabile (05/11/2026)

**Contesto.** Il commit `0297951` ("Universal Builder Platform implementation complete") lasciava il
BFF **non compilabile**: l'immagine `aethersy-console` non poteva essere ricostruita dal sorgente, quindi
il container in esercizio era una build più vecchia (priva del modulo builder e delle correzioni AI).

**Cause trovate e corrette (91 errori TypeScript → 0).**
1. **Server edge mai esistente** — `src/index.ts` importava `./edge/index.js` (TS2307). Il "prototipo
   edge/auth" esisteva solo come JS compilato (in `console/server/edge/`, fuori da `src/`), era
   incompiuto (manca `adapter.verifyOwner`, router `v2` assente) ed è stato **superato** da
   Caddy + sessione reale del console. Import statico rimosso, con nota in `src/index.ts`.
2. **Barrel `tasks/index.ts` inesistente** — `builder/index.ts` importava `./tasks/index.js`: ora
   riesporta `taskStore` / `taskEngine` / `agentRuntime` / `sandboxProvider` dai moduli reali.
3. **Re-export di `builder/types.ts` verso se stesso** (TS1205/TS2484) e **interfacce duplicate**
   (`PlannerInput`, `ProjectSpec`, `TaskGraph`, … dichiarate due volte): eliminati.
4. **`request.tenant` inesistente** — le rotte `/api/builder/*` usavano `request.tenant.id`, mai
   impostato (TypeError a runtime). Ora: augmentation Fastify (`src/types/fastify.d.ts`), tenant
   risolto per richiesta nell'hook `onRequest` con `resolveTenant()`, fallback di servizio senza DB.
   Fastify 5 non ammette `decorateRequest` con reference type → assegnazione diretta sulla request.
5. **Moduli mai scritti** — `src/telegram.ts` (notifiche Slack del builder), specializzazione
   `devops.ts`, generatori mancanti in `brand.ts` (`generateUiSkeleton`, `generateTailwindBase`) e
   `frontend.ts` (`generateAuthContext`, `generateProtectedRoute`, `generateApiClient`,
   `generateTailwindConfig`, `generateDataHook`, `generateToast`), tipi minimi per `dockerode`
   (`src/types/dockerode.d.ts`).
6. **Bug runtime invisibili al typecheck** — `import { Docker } from "dockerode"` falliva a runtime
   (CommonJS): corretto in `import Docker from "dockerode"`. Rilevato dallo smoke test, non dal compilatore.
7. **Schema `builder` mai creato** — il DDL non conteneva `CREATE SCHEMA IF NOT EXISTS builder`:
   la migrazione falliva con `schema "builder" does not exist`.
8. **Migrazione e motore non avviati** — `migrateBuilder()` non era chiamata da nessuna parte e
   `taskEngine` (creato con `autoStart: false`) non veniva avviato: i task restavano in coda.
9. **NVIDIA NIM** — provider riscritto su catalogo live (`GET {NVIDIA_BASE_URL}/models`), timeout,
   `reasoning_content`, ID verificati; `ai-router.ts` con merge `Promise.allSettled` (un outage di
   OpenRouter non uccide NVIDIA); fallback Replicate su Venice in `generate.ts` con i tipi corretti.
10. **Compose** — aggiunte `NVIDIA_API_KEY/NVIDIA_BASE_URL/NVIDIA_TIMEOUT_MS/NVIDIA_MAX_TOKENS`;
    **rimosso il bind-mount `./console/server/dist:/app/dist:ro`**: ignorava l'immagine appena
    ricostruita e serviva solo per patchare il JS a mano.

**Deploy (VPS non-git, copia file).**
- `console/server/src` + `tsconfig.json` → `/home/deploy/aethersy/console/server/` → `docker compose
  build console` → `up -d --no-deps console`.
- Chiave NVIDIA inserita **solo nel `.env` del VPS** (mai nel repo): `NVIDIA_API_KEY`,
  `NVIDIA_BASE_URL`, `NVIDIA_TIMEOUT_MS`, `NVIDIA_MAX_TOKENS`.
- Log di avvio: `schema metering|pipeline|business|builder applicato` → `universal-builder-platform
  routes registrati` → container `healthy`.

**Verifica live (05/11/2026).**
- `npm run typecheck` console: **0 errori**; `npm run build`: OK. `platform`: `tsc -b --noEmit` OK,
  `vite build` OK.
- Rotte dal container: `/api/health` 200 · `/api/auth/session` 401 (senza cookie) ·
  `/api/builder/projects|credits/balance|agents/available` **200** · `/api/ai/catalog` 401 (corretto).
- QA end-to-end su VPS (`console/server/tools/qa-console-live.mjs`): **8/8** — login, session, saldo,
  **chat LLM reale 200**, 4 rotte builder.
- NVIDIA dal container: catalogo **200 (84 modelli)**, `nvidia/nemotron-3.5-bolt-e4b` presente,
  chat completion **200**.

### Fase 14 — Platform su dati reali + guardia auth (05/11/2026)

**Contesto.** Il frontend `platform/` era ancora in gran parte mock-first e la guardia di autenticazione
rimbalzava a `/login` durante il bootstrap.

**Modifiche.**
- `platform/src/components/Protected.tsx`: durante `status = idle | loading` si mostra lo skeleton; il
  redirect a `/login` avviene **solo** a sessione confermata assente. Prima, un reload su una rotta
  protetta espungeva l'utente dal vivo.
- `platform/src/lib/adapters.ts` (nuovo): converte le risposte reali del BFF nei tipi del frontend.
- `platform/src/lib/{api,platform-api,platform-queries,types}.ts` e le pagine Agents, Dashboard, Login,
  SettingsIntegrations, SocialMedia, Tasks allineate sulle rotte `/api/*` reali del console.

**Deploy e verifica (05/11/2026).**
- `platform/` → VPS → `docker compose build platform` → `up -d --no-deps platform` → `healthy`.
- Browser (Chrome headless + CDP): `https://platform.aethersy.online/login` → login **200** →
  reload su `/dashboard` **resta su `/dashboard`** (nessun rimbalzo a `/login`), contenuto renderizzato
  ("Buon pomeriggio, QA", Task attivi, Agenti, Piattaforme), `/api/auth/session` **200**, **0 errori console**.
- Account di QA creato sul VPS: `qa.builder+<timestamp>@aethersy.online` (registrazione pubblica
  riattivata in Fase 12), con 50 crediti assegnati a mano per la verifica della chat.

**Azioni utente (P0).**
1. **Ruotare la chiave NVIDIA NIM**: è stata condivisa in chat ed è ora in `.env` su tre macchine.
2. **Ruotare la password root del VPS**: condivisa in chat e ripresa in `DEPLOYMENT_SUMMARY.md`
   (file ora escluso dal repo via `.gitignore` — contiene credenziali in chiaro).
3. I modelli `meta/llama-3.3-70b-instruct` e `openai/gpt-oss-120b` su NVIDIA NIM sono **EOL 26/08/2026**:
   il provider seleziona il modello dal catalogo live, quindi la lista si aggiorna da sola.

### Fase 16 — Provider AI: z.ai, fal.ai, Replicate riparato, Stripe/GitHub/Google (05/11/2026)

**Contesto.** Sono arrivate le chiavi dei provider rimasti senza credito (Venice, Replicate, NVIDIA,
OpenRouter, Stripe live, GitHub OAuth, Google OAuth, fal.ai, z.ai). Verifica di ogni chiave con
chiamate reali prima di cablarla, poi cablaggio dei provider ancora assenti.

**Verifica live delle chiavi (05/11/2026).**

| Provider | Esito | Nota |
|---|---|---|
| Venice | 200 su `/models` | chiave valida, **senza credito**: le inferenze rispondono "Insufficient balance" |
| NVIDIA NIM | 200 su `/models` | free tier attivo |
| OpenRouter | 200 su `/models` | già in uso |
| Replicate | 200 su `/models` | da riparare (vedi sotto) |
| Stripe | 200 su `/v1/balance` | chiave **live**, saldo disponibile **0,00 EUR** |
| fal.ai | 200 su `fal.run/fal-ai/fast-sdxl` | immagine reale generata |
| z.ai | 200 su `/models` | free tier: `glm-4.5-flash` / `glm-4.7-flash`; i modelli a pagamento rispondono 429 "Insufficient balance" |

GitHub OAuth e Google OAuth erano **già configurati** sul VPS (stessi valori, confronto per lunghezza
e provider); NVIDIA e OpenRouter erano già attivi.

**Modifiche al codice.**
- `console/server/src/ai-gen/zai.ts` (nuovo): provider z.ai (endpoint OpenAI-compatible). Catalogo
  curato dei soli modelli **free** (`glm-4.5-flash`, `glm-4.7-flash`); i modelli a pagamento non
  entrano a catalogo perché senza credito rispondono 429 e il loro prezzo non è noto. Le chiamate
  usano `thinking: {type: "disabled"}`: senza, i modelli Flash scaricano il budget di token in
  `reasoning_content` e lasciano `content` vuoto (verificato live).
- `console/server/src/ai-gen/fal.ts` (nuovo): fal.ai come **terzo livello** di fallback per `img_out`
  (Venice → Replicate → fal.ai), output 1024×1024 = 1 megapixel esatto, un retry su errore di rete.
- `console/server/src/ai-router.ts`: z.ai diventa il **terzo provider LLM**; catena di preferenza
  NVIDIA → z.ai free → OpenRouter `:free`; numero di candidati portato a 8 per coprire tutta la catena.
- `console/server/src/ai-gen/replicate.ts` — **bug riparato**: l'API Replicate non accetta più
  `POST /predictions` con `model` senza versione (risponde 422 "version is required"): ora si usa
  `POST /v1/models/{owner}/{name}/predictions` (verificato 201). I default erano anche **morti**:
  `stability-ai/sdxl` (404), `riffusion/riffusion` (non è un TTS), `stable-diffusion/video` (inesistente)
  → sostituiti con `black-forest-labs/flux-schnell`, `minimax/speech-02-turbo`,
  `stability-ai/stable-video-diffusion` (verificati live).
- `console/server/src/ai-gen/generate.ts`: il fallback non passa più gli ID modello di Venice a
  Replicate (non esistono lì → 404 inutile); il fallback fal usa `fal-ai/flux/schnell`.
- `console/server/src/metering/schema.sql`: **price book v2** (v1 chiuso, righe copiate) con i prezzi
  reali di NVIDIA/z.ai (free → 1 credito minimo), fal.ai ($0.003 / $0.025 per megapixel) e Replicate
  ($0.003 / $0.025 / $0.04 per immagine, fonte `replicate.com/pricing`).
- `console/server/src/metering/price-snapshot.ts`: lo snapshot automatico (ogni 6h) copia dal book
  precedente le righe dei provider che **non** gestisce (z.ai, fal.ai, Replicate): senza, i prezzi
  verrebbero persi a ogni snapshot.
- `console/server/src/metering/repo.ts`: `min_credits` ora si applica anche quando il prezzo è 0
  (prima i modelli free non addebitavano nulla: 1 credito previsto dal listino, 0 addebitato).
- `console/server/src/builder/schema.sql`: le policy RLS venivano ricreate a ogni avvio senza
  `DROP IF EXISTS` → **errore 42710 "policy already exists"** e migrazione builder fallita
  ("builder inerte") a ogni riavvio. Ora il DDL è idempotente e `builder/schema.ts` è generato da
  `tools/gen-schema.mjs` (prima era copiato a mano e poteva divergere).
- `.env.example` / `docker-compose.yml`: `ZAI_API_KEY`, `ZAI_BASE_URL`, `ZAI_TIMEOUT_MS`,
  `ZAI_MAX_TOKENS`, `FAL_API_KEY`; `STRIPE_SECRET_KEY` documentata (usata dai progetti generati dal
  builder, non ancora dal BFF).

**Deploy e verifica (05/11/2026).**
- Segreti scritti **solo** nel `.env` del VPS (permessi 600): Venice, Replicate, fal.ai, z.ai, Stripe.
- `bash scripts/deploy-console.sh` → immagine ricostruita → container `healthy`.
- Log: `schema metering|pipeline|business|builder applicato` → il builder è vivo (prima: "builder inerte").
- QA live (`console/server/tools/qa-ai-providers.mjs`, nuovo): **5/5** — catalogo 471 modelli con
  NVIDIA e z.ai, chat NVIDIA (`nemotron-3.5-bolt-e4b` → "OK"), chat forzata z.ai (`glm-4.5-flash` →
  "OK"), generazione immagine reale (Venice senza credito → **Replicate** `flux-schnell`, `fallbackFrom:
  venice`), saldo. QA console (`qa-console-live.mjs`): **8/8**.
- Metering verificato in DB: 1 credito per chat NVIDIA, 1 credito per chat z.ai, 69 crediti per
  l'immagine Replicate ($0.003 → 0,0069 EUR con markup 150%), prenotazione 230 (stimata su Venice)
  poi sgravio di 161 al saldo: la differenza prenotazione/consuntivo e' gestita.

**Azioni utente (P0).**
1. **Ruotare le chiavi condivise in chat**: Venice, Replicate, fal.ai, z.ai, OpenRouter, NVIDIA,
   **Stripe live**, GitHub OAuth, Google OAuth. Sono state esposte in una chat di gruppo.
2. **Stripe live**: il saldo disponibile e' 0,00 EUR → nessun addebito riuscirebbe finche' non si
   ricarica l'account. La chiave resta nel `.env` del VPS ma **non** viene iniettata nel container
   console (il BFF non la usa ancora): il sender `metering.billing_outbox → Stripe` resta da fare.
3. **z.ai senza credito**: per usare i modelli a pagamento (GLM-5.x) serve una ricarica su z.ai;
   fino ad allora il free tier (GLM Flash) copre il fabbisogno.

### Fase 17 — Video: provider, prezzo e retrieve (05/11/2026)

**Contesto.** Le rotte generative testo/immagine erano verificate; il video no. Il primo test
end-to-end ha fatto emergere due difetti.

**Difetti trovati e corretti.**
1. **Default video Replicate rotto**: `stability-ai/stable-video-diffusion` esiste a catalogo ma
   `POST /v1/models/stability-ai/stable-video-diffusion/predictions` risponde **404**. Verificati
   live: `minimax/video-01` → 201, `wavespeedai/wan-2.1-t2v-480p` → 201. Il default e' ora
   `minimax/video-01` (6 s, 720p), con listino ufficiale **$0.50 per output video**
   (metadati prezzo della pagina `replicate.com/minimax/video-01`).
2. **Retrieve cablato solo su Venice**: `POST /api/ai/video/retrieve` interrogava sempre
   `venice.retrieveVideo`, quindi un job accodato sul fallback Replicate non era mai recuperabile
   (il queue id Replicate veniva cercato su Venice). Ora la route interroga il provider giusto:
   `provider` esplicito nel body, altrimenti dedotto dal modello (gli id Replicate sono
   `owner/name`, quelli Venice no).

**Prezzi.** Aggiunta la riga `vid_out / minimax/video-01 / replicate / video = 0.50 USD`
(= 11.500 crediti con markup 150% e fx 0.92). I prezzi statici (NVIDIA, z.ai, fal.ai,
Replicate) sono ora applicati al **price book attivo** da un blocco DDL idempotente: a ogni avvio
il book attivo riceve le righe verificate a mano, quindi nessuna riga puo' andare persa fra uno
snapshot automatico e l'altro (lo snapshot continua a copiare i provider che non gestisce).

**Verifica live (05/11/2026).**
- Queue video: 200, `provider=replicate`, `model=minimax/video-01`, 11.500 crediti addebitati,
  `fallbackFrom=venice` (Venice risponde "Insufficient balance").
- Retrieve: `processing` → `succeeded` con URL del video dopo ~90 s (Replicate `predict_time` 141 s
  misurato nella prediction precedente). Nessun nuovo addebito al retrieve.
- Ledger: prenotazione -34.500 (stima Venice, prudente) e sgravio +23.000 al consuntivo =>
  addebito effettivo **11.500 crediti**, pari a $0.50 + markup.
- QA provider **5/5** e QA console **8/8** dopo il deploy.

**Debito tecnico noto.**
- **TTS non addebitato**: Replicate fattura `minimax/speech-02-turbo` a $0.06 per 1000 token di
  input, mentre il metering misura la voce in caratteri: senza un rapporto token/carattere
  verificato la riga di prezzo non e' applicabile, quindi oggi la voce costa 0 crediti al tenant
  (costo provider a carico della piattaforma). Da chiudere leggendo le metriche token della
  prediction Replicate.
- **Nessuna pagina video** nel frontend platform: la rotta API funziona, la UI no.

### Fase 18 — CI GitHub Actions (05/11/2026)

**Contesto.** Il repo GitHub (`mattiadeblasio94-jpg/aethersy-platform`) era fermo a 8 commit di distanza
dalla produzione: nessuna verifica automatica su push/PR, nessun controllo che i segreti restino
fuori dal repo. Il deploy resta manuale (il VPS non ha git: si copia il codice e si lancia
`scripts/deploy-console.sh`).

**Modifiche.**
- `.github/workflows/ci.yml` (nuovo): si attiva su push e PR verso `main` e su `workflow_dispatch`.
  Quattro job, tutti read-only (`permissions: contents: read`), Node 22 come in produzione
  (`node:22-alpine` nei Dockerfile) e cache npm:
  1. `console-server`: `npm ci` → `typecheck` → `build` → `npm run test:metering` (44 test, nessun DB);
  2. `console-web`: `npm ci` → `typecheck` → `build`;
  3. `platform`: `npm ci` → `typecheck` → `build`;
  4. `hygiene`: `scripts/secret-scan.sh` + `docker compose --env-file .env.example config --quiet`.
  `concurrency` annulla i run precedenti sulla stessa ref.
- `scripts/secret-scan.sh` (nuovo): scandisce i **file tracciati** (non il working tree) cercando i
  formati delle chiavi in uso (OpenRouter, NVIDIA, Replicate, fal.ai, Stripe live/test e restricted,
  GitHub, Google, Slack, AWS, chiavi private PEM) e segnala anche file `.env*` tracciati. In caso di
  hit stampa **etichetta e percorso, mai il valore** del segreto, ed esce con codice 1.
  I placeholder di `.env.example` (vuoti o `CHANGEME_...`) non corrispondono ai pattern, quindi il file
  d'esempio viene scandito come tutti gli altri.

**Verifica locale (05/11/2026).**
- `bash scripts/secret-scan.sh` → `OK - 318 file tracciati`; controllo positivo con una chiave fal.ai
  finta in `.env.example` → `TROVATO fal-ai .env.example`, exit 1, valore non stampato.
- `console/server`: typecheck OK, build OK, `test:metering` → **44 test superati, 0 falliti**.
- `console/web`: typecheck + build OK. `platform`: typecheck + build OK.
- `docker compose --env-file .env.example config --quiet` → exit 0 (validato sul VPS, che ha Docker).
- Workflow YAML validato: 4 job, trigger su `main`.

**Stato GitHub.** I commit delle fasi 13-17 non erano mai stati pushati: sono stati portati su
`main` con questa fase (PR `fase-18-ci-github` -> merge). La history è stata verificata: nessuna
occorrenza dei pattern delle chiavi in `git log -p --all`.

### Fase 19 — IA nel platform: 9 pagine su dati reali + fix DELETE JSON (06/11/2026)

**Contesto.** La SPA `platform/` aveva 26 route ma mancavano le nove superfici IA della
parity pazi.ai (`goals`, `scheduled-tasks`, `content-calendar`, `inbox`, `skills`, `members`,
`payouts`, `memory`, `account`): la navigazione non offriva obiettivi, memoria, agenda,
calendario editoriale, inbox, matrice competenze, membri, consumi e account. Il BFF gia'
esponeva tutti i dati necessari: non servivano nuove rotte lato server.

**Modifiche — frontend (`platform/`).**
- `src/lib/platform-api.ts`: tipi `Goal`, `MemoryEntry`, `BusinessCatalog`, `UsageEvent`,
  `UsageResponse` e metodi `getGoals/createGoal/updateGoal/deleteGoal`,
  `getMemory/createMemory/updateMemory/deleteMemory`, `getBusinessCatalog`, `getUsage`,
  `updateSchedule`, `deleteSchedule`.
- `src/lib/platform-queries.ts`: hook `useGoals`, `useCreateGoal`, `useUpdateGoal`,
  `useDeleteGoal`, `useMemory`, `useCreateMemory`, `useUpdateMemory`, `useDeleteMemory`,
  `useBusinessCatalog`, `useUsage`, `useUpdateSchedule`, `useDeleteSchedule`; nuove chiavi
  `realKeys.goals | memory | businessCatalog | usage`.
- 9 pagine nuove in `src/pages/`: `Goals.tsx` (elenco per stato, creazione, priorita' 1-5,
  metrica, data target, "segna raggiunto"), `Memory.tsx` (ricerca, filtro per tipo, pin,
  creazione/edizione/eliminazione), `Inbox.tsx` (thread + conversazione + invio turno),
  `ScheduledTasks.tsx` (agenda con pausa/riattivazione/elimina + attivita' in corso),
  `ContentCalendar.tsx` (calendario mensile + pianificati + contenuti),
  `Skills.tsx` (matrice competenze x agenti, copertura stadi, carico per specialista),
  `Members.tsx` (membri del workspace da `library.invites`, ricerca per email/ruolo),
  `Payouts.tsx` (saldo/riservato/disponibile, eventi di consumo, totale per capability),
  `Account.tsx` (tenant, piano, markup, unita' di credito, stop a saldo zero, FAQ).
- `src/pages/routes.tsx`: 9 route lazy in `APP_ROUTES`. `src/components/layout/Drawer.tsx`:
  nuova sezione di navigazione **Controllo** con le 9 voci.

**Modifiche — BFF (`console/server`).**
- `src/index.ts`: il parser JSON standard rifiutava un corpo vuoto con
  `content-type: application/json` (400 `FST_ERR_CTP_EMPTY_JSON_BODY`). I client che
  inviano l'intestazione anche su DELETE senza corpo ricevevano un 400 invece dell'eliminazione:
  il `DELETE /api/platform/goals/:id` e `DELETE /api/platform/memory/:id` fallivano. Ora il
  corpo vuoto e' tollerato **solo per DELETE**; POST/PATCH continuano a rifiutare il corpo
  vuoto come prima (richiesta troncata = errore).
- `console/web/src/lib/api.ts`: l'intestazione `Content-Type: application/json` viene mandata
  solo quando la richiesta ha un corpo (allineamento al client del platform).

**Verifica (06/11/2026).**
- QA API dentro il container console (`console/server/tools/qa-ia-pages.mjs`, **16/16** rotte consumate
  dalle pagine: goals, memory, catalog, roster, library, account, faq, schedule, social scheduled/
  posts/summary, chat conversations, tasks, `/api/ai/balance`, `/api/ai/usage`) e
  `console/server/tools/qa-ia-crud.mjs` (**7/7**: POST 201 + PATCH 200 + DELETE 200 su obiettivo e
  memoria, POST memoria senza `content` → 400). Le credenziali passano come argomenti: nessun
  segreto nel repo.
- QA browser (`scripts/qa-platform-ui.mjs`, Chrome headless + CDP, nessuna dipendenza esterna):
  login → **9/9** nuove pagine renderizzate con dati reali del tenant QA e **0 errori di console**;
  **5/5** controlli funzionali sulla UI (creazione obiettivo dalla UI, eliminazione, creazione nota,
  eliminazione, nessun errore).
- Deploy VPS: `docker compose build console platform` → `up -d --no-deps` → entrambi `healthy`;
  `platform.aethersy.online` 200, `/api/health` 200. Console: 1 errore DELETE sparito dai log.
- Pulizia: le righe di prova create dalle verifiche API/UI sono state rimosse da
  `business.memory` e `business.goal` (tabelle a 0 righe per il tenant QA).

**Stato.** Le nove pagine sono in produzione su `https://platform.aethersy.online`. Restano da
chiudere: nessuna pagina video/audio nel platform (l'API c'è, la UI no), TTS non addebitato
(metering in caratteri vs listino Replicate in token) e il collegamento Stripe in uscita
(`metering.billing_outbox` → Stripe) ancora assente.

### Fase 20 — Platform a dati reali (zero mock), UI cyber e agenti builder eseguibili (07/11/2026)

**Contesto.** La SPA `platform/` mostrava dati inventati (`src/mocks/*`, `src/lib/api.ts`,
`src/lib/queries.ts`): 19 pagine non interrogavano mai il BFF, `Pulse` mostrava un piano
finto, la chat non aveva collegamento con le conversazioni reali e il "Universal Builder"
produceva task con un piano finto (`generateMockPlan`), sandbox immaginario e QA che
falliva sui workspace non scaffoldati. Obiettivo: **zero mock** end-to-end, agenti
orchestratori realmente eseguibili, UI cyber (HUD su `Pulse`, chat in `Studio`) e ogni
bottone collegato a una API reale.

**Frontend (`platform/`).**
- **Mock rimossi**: `src/mocks/{data,index,stageB,stageC}.ts`, `src/lib/api.ts`,
  `src/lib/queries.ts` (2910 righe). Restano solo i **tipi** in `src/lib/types.ts`, usati
  dai componenti di dominio.
- `src/lib/platform-api.ts`: client HTTP unico verso il BFF; nuovi endpoint
  `getProfile/updateProfile`, `getPreferences/updatePreferences`, `getProducts/create/update/delete`,
  `getLeads/updateLead`, `getLeadCounts`, `getIntegrations`, `getLibraryAsset` (contenuto
  della risorsa), `getBuilderArtifacts`, `deleteBuilderProject/deleteBuilderTask`.
- `src/lib/platform-queries.ts`: hook reali (`useProfile`, `useUpdateProfile`,
  `usePreferences`, `useUpdatePreferences`, `useProducts`, `useCreateProduct`,
  `useUpdateProduct`, `useDeleteProduct`, `useLeads`, `useLeadCounts`, `useUpdateLead`,
  `useIntegrations`, `useBuilderAgents`, `useBuilderTasks`, `useBuilderProjects`,
  `useCreateBuilderTask`, `useBuilderArtifacts`, `useDeleteBuilderTask`,
  `useDeleteBuilderProject`) con chiavi `realKeys.*`.
- 19 pagine riscritte su dati reali: `Ads, Analytics, Website, Outreach, Help, Landing,
  Onboarding, AgentCreate, AgentDetail, AgentLogs, SettingsBilling, SettingsIntegrations,
  SettingsNotifications, SettingsProfile, SocialMedia, SocialPlatformDetail, Products,
  Drawer, Header`. Nessun numero business inventato: solo dati del tenant, empty state
  espliciti e copy in italiano.
- **UI cyber**: nuovo `src/components/common/Cyber.tsx` (`CyberPanel`, `CyberStat`,
  `CyberBar`, `CyberStatus` con toni `neutral|active|attention|idle`), keyframe `scanline` in
  `tailwind.config.js`; `Pulse.tsx` riscritto come HUD (piano reale da `useAccount().plan`,
  crediti reali, tile di stato reali, CTA → `/studio`); `Studio.tsx` ristilizzato con
  deep-link `?conv=<id>` verso le conversazioni reali. Eventi custom morti
  (`open-assistant`) sostituiti dalla navigazione reale in `Pulse.tsx` e `Subscription.tsx`.
- Rotte: `/dashboard` = `Pulse` (era shadowato da `Dashboard`), `Dashboard.tsx` spostato a
  `/overview` con voce di menu **Panoramica** in `Drawer.tsx`.
- **Libreria**: nuova tab **Artefatti** (`useBuilderArtifacts`) con anteprima del
  `metadata.content`; tab **Risorse** con bottone anteprima (nuova rotta
  `GET /api/platform/library/:assetId`), download (Blob dal contenuto reale) e copia link;
  toggle **Filtri** reale; ordinamento per dimensione con `size_bytes` reale; bottone
  "Copia" del messaggio collegato alla clipboard.

**BFF (`console/server`).**
- `src/platform/routes.ts` + `src/platform/repo.ts`: rotte di dominio
  (profilo, preferenze, prodotti, lead, conteggi lead, integrazioni) e
  `GET /api/platform/library/:assetId` (asset di pipeline con `meta.content`, tenant scoped).
- `src/builder/routes.ts`: **tenancy** su `POST /api/builder/tasks` (proprietà del progetto
  verificata, `tenant_id` forzato dalla sessione, default applicati),
  `GET /api/builder/tasks/:id`, `POST/GET /api/builder/artifacts`; nuove rotte
  `GET /api/builder/artifacts` e `DELETE /api/builder/projects|tasks/:id` (cascade su
  task, step e artefatti).
- `src/builder/agents/planner.ts`: il piano viene davvero da un LLM (`chat()` dell'
  ai-router, capability `text`, parsing JSON con fence markdown), tabella `AGENT_ACTIONS`
  delle azioni implementate, `sanitizePlan` (azioni note, agente coerente, dipendenze
  filtriate) e fallback `defaultNodes`/`defaultSpec`. **Rimosso `generateMockPlan`**.
- `src/builder/agents/sandbox.ts`: immagine sandbox da env `BUILDER_SANDBOX_IMAGE`
  (default `aethersy/builder-sandbox:0.1.0`, mai `latest`) e `ensureWorkdir()` che crea
  `/workspace/<project_id>` prima dell'esecuzione.
- `src/builder/agents/runtime.ts`: il contenuto degli artefatti viene salvato in
  `metadata` (`encoding`, `size`, `content` troncato a 65536 byte, `content_truncated`).
- `src/builder/agents/specializations/qa.ts`: probe `scriptDefined` con exit code 3/4/5 →
  check **SKIPPED** con motivo invece di un fallimento; `run_full_qa` produce il report
  PASS/SKIP/FAIL.
- `console/server/builder-sandbox/Dockerfile`: immagine `node:22-alpine` con bash, git,
  openssh, curl, ca-certificates e pnpm 9 (usata per costruire l'immagine sul VPS).

**Auth e infrastruttura.**
- `console/server/src/auth/*`: OAuth Google/GitHub completo (state HMAC + cookie,
  sessione, `requireApToken`, `saveIdentityCredential` con credenziale Activepieces cifrata)
  con schema `auth` applicato in produzione.
- `docker-compose.yml`: console con `PLATFORM_PUBLIC_URL`, `CONSOLE_PUBLIC_URL`,
  `BUILDER_SANDBOX_IMAGE` e volume `/var/run/docker.sock` (necessario al sandbox);
  `.env.example` con `BUILDER_SANDBOX_IMAGE`; `caddy/Caddyfile` e `platform/Dockerfile`
  aggiornati (niente più percorso "mock-first").

**Verifica (07/11/2026).**
- `npm run typecheck` + `npm run build` verdi in `platform/` e `console/server`.
- QA API reale (tenant QA): `login`, `session`, `overview`, `profile`, `preferences`,
  `roster`, `products`, `leads`, `builder/agents|available`, `builder/tasks`,
  `builder/projects`, `builder/artifacts`, `faq` → **200**.
- **Pipeline reale**: `POST /api/pipeline/runs` (stage `website`) + `execute` → 7 task
  `done` (forge, quill, prism, …) con 46 crediti ciascuno e **7 asset** salvati con
  contenuto; `GET /api/platform/library` li elenca e `GET /api/platform/library/:assetId`
  restituisce il testo reale del deliverable.
- **Agenti builder**: `POST /api/builder/projects` + `POST /api/builder/tasks` → task
  `completed` (190 e 225 crediti), **11 step** eseguiti e **artefatti reali** scritti nel
  container sandbox sul VPS; crediti addebitati sul tenant.
- QA browser (`scripts/qa-platform-routes.mjs`, Chrome headless + CDP): **30/30** rotte
  verificate (login, navigazione, marker attesi, 0 errori di console, 0 risposte HTTP ≥ 400),
  screenshot di `/dashboard`, `/studio`, `/library`, `/agents`, `/library?tab=artefatti`,
  `/library?tab=risorse`.
- QA interazioni (script temporaneo, fuori dal repo): anteprima risorsa con contenuto reale
  **OK**, toggle filtri **OK**, artefatto con contenuto + bottone copia **OK**.
- Deploy VPS: `docker compose build console platform` → `up -d --no-deps` → entrambi
  `healthy`; immagine `aethersy/builder-sandbox:0.1.0` costruita sul VPS.
- Pulizia tenant QA: 7 progetti di prova e i task falliti eliminati con le nuove rotte
  `DELETE` (cascade verificato: 575 → 164 artefatti), progetto superstiti rinominato.

**Stato.** La piattaforma è in produzione su `https://platform.aethersy.online` senza mock:
le pagine leggono e scrivono il BFF, la pipeline produce deliverable reali, gli agenti
builder eseguono task reali con crediti addebitati e artefatti persistiti. Restano fuori
dal codice: rotazione delle chiavi provider, saldo Stripe (0 EUR e sender
`metering.billing_outbox` → Stripe assente), crediti z.ai/Venice, fatture/metodi di pagamento
e metriche per canale non esposti dal BFF, e la decisione su `console.aethersy.online`.

### Fase 20 — Sito pubblicabile dal run pipeline (07/11/2026)

**Contesto.** I deliverable dello stadio `website` erano solo documenti di lavoro
consultabili in `/library`: nessun sito raggiungibile, quindi nessun output vendibile.
Il passo richiesto e' trasformare i testi reali prodotti dal modello (copy, sitemap,
SEO) in una pagina web pubblica servita dal BFF.

**Implementazione.**
- `console/server/src/platform/site.ts`: parser dei deliverable (`Titolo H1:`, `Sottotitolo:`,
  `Call to Action (CTA):`, elenchi numerati, voci sitemap, Title Tag e Meta Description)
  e renderer HTML autonomo (CSS inline, nessuna dipendenza esterna) con header, navigazione,
  hero, griglia servizi, sezioni di pagina e contatti.
- `console/server/src/platform/routes.ts`: `GET /api/platform/sites/:runId` → `200` con
  `text/html; charset=utf-8`. La rotta e' **pubblica** (il sito e' il deliverable che il
  cliente riceve via link; la chiave e' il UUID del run, non enumerabile) e pubblica solo i
  documenti di copy, sitemap e SEO.
- `platform/src/pages/Website.tsx`: bottone **"Apri sito"** su ogni esecuzione dello stadio
  `website`, con link diretto alla pagina pubblica.

**Verifica (07/11/2026).**
- `GET /api/platform/sites/0b7390c8-ea63-45f5-bf35-89e86eb179f1` → **200**, 5.410 byte,
  `text/html`, **senza cookie di sessione** (visita anonima come un cliente).
- Contenuto reale verificato: `title` "Sistemi Growth & Marketing Aethersy | Traffico
  Qualificato", `h1` "L'Infrastruttura Digitale del Futuro.", CTA "Scopri le Soluzioni /
  Richiedi una Consulenza", sezioni `home`, `servizi`, `chi-siamo`, `contatti-lead-form`,
  `contatti`.
- QA browser (CDP, Chrome headless): titolo e `h1` corretti, 5 link interni, **0 errori di
  console**, screenshot del sito pubblico.

**Stato.** La pipeline produce ora un sito pubblicabile e raggiungibile via URL stabile.

### Fase 20 — Lead dal sito pubblicato (form reale + Slack) (07/11/2026)

**Contetto.** Un sito raggiungibile non monetizza se il visitatore non ha un modo per
lasciare un contatto: il form sul sito pubblicato era un placeholder.

**Implementazione.**
- `console/server/src/platform/site.ts`: sezione "Contatti" con form reale (nome, email,
  messaggio, honeypot anti-bot) e script di invio; `createSiteLead()` crea il lead nella
  tabella `pipeline.lead` con `tenant_id` e `run_id` del run e inoltra il lead al canale
  outbound Slack (`notifyLeadCreated`, `markLeadNotified`).
- `console/server/src/platform/routes.ts`: `POST /api/platform/sites/:runId/leads` (pubblica,
  validazione email, risposta `201` con messaggio mostrato al visitatore).

**Verifica (07/11/2026).**
- `POST` da terminale → **201** con id lead; `GET /api/pipeline/leads` → lead `source=website`,
  `status=new`, `notified_at` valorizzato (webhook Slack ha risposto 2xx).
- QA browser (CDP): click reale sul bottone "Invia richiesta" → richiesta `201` al BFF,
  messaggio a video "Richiesta inviata. Rispondiamo entro 24 ore.", **0 errori console**;
  screenshot del sito con form e conferma.
- I lead compaiono nella tab "Contatti del sito" della pagina Sito web (sorgente dati
  `/api/pipeline/leads`, nessuna copia locale).

**Stato.** Il percorso commerciale e' reale: sito pubblico → lead in piattaforma → notifica
Slack. Resta la fatturazione (Stripe bloccata dai fondi) e la rotazione delle credenziali.

### Fase 20 — Notifiche reali, webhook firmato e notifica di deploy (07/11/2026)

**Contesto.** Le "notifiche" erano solo preferenze salvate (email/push/ore silenziose)
senza alcun evento, nessuna campana e nessuna consegna: il canale Slack esisteva ma
solo come fallback d'ambiente, non configurabile dal tenant. Mancava inoltre un modo per
sapere che un deploy era andato a buon fine.

**Implementazione.**
- Schema `pipeline.notification` (scope `tenant`/`platform`, severita', `read_at`) e modulo
  `console/server/src/pipeline/notifications.ts`: creazione, elenco, non lette, lettura,
  "segna tutte come lette" e inoltro ai canali outbound.
- API: `GET /api/platform/notifications`, `POST /api/platform/notifications/:id/read`,
  `POST /api/platform/notifications/read-all`.
- Eventi che generano notifiche reali: `lead.created` (form del sito pubblicato),
  `run.delivered` (run consegnata) e `deploy` (hook `POST /api/internal/deploys`, protetto
  da `DEPLOY_HOOK_TOKEN` con confronto a tempo costante).
- **Webhook in uscita**: `POST /api/pipeline/webhooks` registra l'endpoint del tenant
  (URL + secret di firma cifrati insieme, AES-256-GCM). Gli eventi `lead.created`,
  `run.delivered` e `deploy` arrivano come POST JSON con `X-Aethersy-Event` e
  `X-Aethersy-Signature` (HMAC-SHA256). Sono ammessi `http` solo su host privati o di
  loopback.
- **Slack configurabile dal tenant**: pagina Integrazioni con URL del webhook, cifrato a
  riposo, pulsante "Invia test" che invia davvero un messaggio e revoca. Rimossa la
  connessione fittizia che creava credenziali vuote.
- UI: pagina `/notifications` (elenco, filtri per stato, lettura, "segna tutte come
  lette"), campana con badge delle non lette nell'header, voce nel menu laterale.
- `scripts/deploy-stack.sh`: deploy di console e platform (archivio + scp + build +
  riavvio + health check) che registra la versione e il commit nell'env del VPS e chiama
  l'hook di notifica: **ogni deploy produce una notifica**.

**Verifica (07/11/2026).**
- Deploy reale con lo script: `201` dall'hook con `outbound: {slack: true, webhook: true}`;
  notifica in piattaforma "Deploy Aethersy 734e431" con commit e nota del deploy.
- Evento `lead.created` ricevuto dal webhook con **firma HMAC-SHA256 verificata**
  (`sha256=` + ricalcolo locale uguale) e contenuto reale del lead.
- Test Slack dal tenant: `{"ok":true,"provider":"slack","status":200}` e segreto non
  presente nelle risposte dell'API (`grep` del webhook: 0 occorrenze).
- QA browser: badge campana = 2, pagina `/notifications` con le due notifiche di deploy,
  click su una notifica -> badge = 1, **0 errori di console**, nessuna risposta HTTP >= 400.
- Lead di prova dal sito pubblicato -> notifica in-app "Nuovo lead dal sito: Notifica Prova".
- Endpoint di verifica permanente: `POST /api/internal/webhook-echo/:tenantId` registra
  le consegne in `pipeline.webhook_delivery`; `GET /api/platform/webhook-deliveries` le
  espone al tenant e la pagina Integrazioni mostra "Eventi realmente consegnati" con
  l'evento e l'inizio della firma. Il webhook del tenant QA punta a
  `http://console:3000/api/internal/webhook-echo/<tenant>`: evento `lead.created` registrato
  con firma `sha256=...`, QA browser con 0 errori di console. Il webhook di prova con
  listener locale (morto a ogni deploy) e' stato revocato.

### Fase 21 — Login sociale reale Google/GitHub (08/11/2026)

**Problema.** I bottoni "Continua con Google/GitHub" dalla pagina di login non
portavano a una sessione: il callback finiva su risposte JSON (502/400) e non
sulla pagina di login. Diagnosi live (non da documentazione):

- **Google**: credenziali accettate da Google (`invalid_grant` = codice
  fasullo, non `invalid_client`) e `redirect_uri` registrata correttamente
  (l'authorize risponde 302, non 400 `redirect_uri_mismatch`).
- **GitHub**: `POST /login/oauth/access_token` rispondeva `{"error":"Not Found"}`
  = `client_id`/`client_secret` non riconosciuti. Cause: il `client_secret`
  era vecchio (rigenerato) e, in aggiunta, l'errore non era mai mostrato
  all'utente.

**Cosa e' cambiato (server)**

- `console/server/src/auth/social.ts`: client OAuth2 dei due provider
  (authorize/token/userinfo, `nonce` OIDC, `prompt=select_account` per Google
  invece del consenso forzato), mappatura degli errori del provider in messaggi
  leggibili, stato dell'ultimo errore per provider. Endpoint sovrascrivibili
  via env (`GOOGLE_TOKEN_URL`, `GITHUB_USERINFO_URL`, ...) per i test.
- `console/server/src/auth/social-routes.ts`: rotte del flusso. Il login **non
  si blocca piu'**: se Activepieces rifiuta la creazione account, non e'
  raggiungibile o l'archivio credenziali non funziona, si apre comunque la
  sessione (il tenant e' risolto via email). Ogni errore rientra alla pagina
  di login con `?error=&message=`.
- `GET /api/auth/social/providers`: stato dei provider (configurati, scope,
  ultimo errore) usato dalla UI.
- `console/server/src/routes.ts`: il blocco OAuth inline (361 righe) e' stato
  sostituito dal modulo dedicato.
- `scripts/deploy-stack.sh`: la nota del deploy viene sanitizzata (apostrofi e
  virgolette rompevano il quoting della notifica: il deploy partiva ma la
  notifica non veniva registrata).

**Cosa e' cambiato (UI)**

- `platform/src/pages/Login.tsx`: banner di errore OAuth, hint sotto ogni
  bottone social (ultimo errore del provider), bottone disabilitato se il
  provider non e' configurato, divisore "o continua con" non piu' sovrapposto.
- `platform/src/lib/platform-api.ts`: `getSocialProviders()`.
- `console/web/src/pages/Login.tsx`: banner di errore OAuth.

**Verifica (live, 08/11/2026)**

- Test automatici: `npm run test:social` -> **19/19 verdi** (provider finto in
  locale: URL di autorizzazione, scambio token, profilo, anti-CSRF, callback
  completo con cookie di sessione, rientro al login su errore).
- `GET /api/auth/social/providers` -> 200, `google.configured=true`,
  `github.configured=true`.
- Avvio Google/GitHub -> 302 al provider con `client_id`, `redirect_uri` e
  `state` corretti.
- Callback GitHub con codice fasullo -> **redirect a
  `/login?error=OAUTH_CODE_INVALID&message=...`** (prima: pagina JSON).
- QA browser reale: click "Continua con Google" -> `accounts.google.com`
  (client_id corretto); click "Continua con GitHub" -> `github.com/login` con
  `client_id` e `redirect_uri` corretti; banner d'errore visibile; **0 errori
  console**.
- Credenziali GitHub: con il secret rigenerato, il token endpoint risponde
  `bad_verification_code` (non `Not Found`): le credenziali sono riconosciute
  e il `redirect_uri` registrato coincide.

**Stato**: `DONE`. Resta da fare l'utente: il consenso sul provider (schermata
Google/GitHub) e la verifica che la schermata di consenso Google non sia in
modalita' "Testing" (in quel caso serve aggiungere l'account come test user).

### Fase 22 — Connettori reali: login ai provider, niente connessioni finte (08/11/2026)

**Obiettivo**: sostituire le "connessioni" simulate con collegamenti **reali**
ai provider richiesti. Regola di progetto fissata dal committente: *il
collegamento deve avvenire tramite login diretto*. Traduzione tecnica:

- **Login Google** -> i 12 servizi Google (Gmail, Drive, Calendar, Sheets,
  Slides, Docs, Tasks, Meet, YouTube, Maps, Analytics, Ads) si collegano con
  la **stessa app Google** del login della piattaforma (un solo consenso,
  scope per servizio).
- **Login GitHub** -> GitHub (repo, issue, PR, workflow) con la **stessa app
  GitHub** del login.
- **Login del provider** -> Slack, Notion, Figma, Linear, Canva, Salesforce,
  Zoom, Outlook, Microsoft Teams, Instagram, Facebook, Meta Ads, LinkedIn,
  TikTok, TikTok Ads, X, Reddit, Wix, PayPal, Stripe: il flusso e' identico
  (login -> consenso -> token cifrato), serve accreditare nel VPS l'app OAuth
  del provider.
- **Credenziale personale** -> solo dove il provider non offre un OAuth per
  account (Telegram, WhatsApp Cloud, Cloudflare, Supabase, ElevenLabs,
  Mailchimp, DataForSEO, GoDaddy, WordPress, Activepieces): l'utente incolla la
  credenziale del **proprio** account.

**Cosa e' cambiato (server)**

- `console/server/src/connectors/catalog.ts`: catalogo di **43 provider** reali
  (id, categoria, tipo di login, scope, capacita' dichiarate, istruzioni
  `howTo`, endpoint OAuth, campi credenziale, **verifica reale** con chiamata
  all'API del provider). Slack accetta anche il canale webhook gia' salvato dal
  tenant (la verifica invia un messaggio reale sul canale).
- `console/server/src/connectors/oauth.ts`: OAuth2 unico per i tre casi
  (Google, GitHub, app dedicate) con PKCE, redirect derivato da
  `PLATFORM_PUBLIC_URL`, client dedicati da env
  `CONNECTOR_<ID>_CLIENT_ID/_CLIENT_SECRET/_REDIRECT_URI/_TOKEN_URL`, bundle
  token cifrato con AES-256-GCM (`pipeline/secrets.ts`).
- `console/server/src/connectors/state.ts`: `state` firmato (HMAC con
  `CONSOLE_SESSION_SECRET`) che porta tenant + connettore + nonce, con
  confronto obbligatorio del cookie httpOnly e scadenza 10 minuti.
- **Callback unificato**: Google e GitHub accettano **un solo callback URL per
  app**, quindi il login e il collegamento dei connettori devono tornare dalla
  stessa porta. I connettori Google/GitHub usano il callback gia' registrato
  (`/api/auth/social/{google,github}/callback`) e il flusso si distingue dal
  contenuto dello `state` firmato (campo `c` = connettore): il callback sociale
  riconosce gli `state` di connettore e completa il collegamento
  (`console/server/src/connectors/complete.ts`). Le app OAuth dedicate dei
  provider hanno invece il proprio callback
  `/api/pipeline/connectors/<id>/callback`. Senza questo, GitHub avrebbe
  risposto `404 Not Found` sul callback del connettore.
- `console/server/src/connectors/routes.ts`: `GET /api/pipeline/connectors`
  (catalogo + stato reale per tenant), `GET /:id/connect` (redirect al
  provider), `GET /:id/callback` (scambio codice -> credenziale cifrata ->
  rientro in UI), `POST /:id/api-key`, `POST /:id/test` (chiamata reale al
  provider), `POST /:id/disconnect` (revoca).
- `console/server/src/routes.ts`: **eliminata la credenziale placeholder** di
  `POST /api/platform/platforms/:id/connect` (era la fonte delle connessioni
  finte: creava una riga con `secret_enc` vuoto). Ora la rotta risponde con il
  redirect al login del provider e **non crea nulla**. La riga finita rimasta
  in produzione (`provider=webhook`, `kind=oauth`, `secret_enc` vuoto) e' stata
  cancellata dal DB: in tabella restano solo 3 credenziali reali (canale Slack
  + 2 webhook di verifica).

**Cosa e' cambiato (UI)**

- `platform/src/pages/Connectors.tsx`: pagina `/connectors` con catalogo
  filtrabile per categoria e ricerca, stato per connettore (collegato / pronto
  / da attivare), pulsante di login per provider, modulo per le credenziali
  quando il provider non ha OAuth, **Prova** (verifica live) e **Scollega**.
- `platform/src/lib/platform-api.ts` + `platform-queries.ts`: API e hook dei
  connettori; `useConnectPlatform` ora **manda l'utente al login del provider**
  invece di creare una connessione vuota.
- `platform/src/components/layout/Drawer.tsx`: voce "Connettori" nel menu.

**Verifica**

- `npm run test:connectors` -> **27/27 verdi** (catalogo coerente, `state`
  valido/manomesso/scaduto, URL di autorizzazione Google/GitHub/app dedicate
  con PKCE, callback unificato riconosciuto dal login sociale, scambio codice
  con provider finto, cifratura del token, rotte montate).
- `npm run test:social` -> **19/19 verdi** (nessuna regressione sul login).
- Build BFF (`tsc`) e build platform (`tsc -b && vite build`) OK.

**Stato**: `DONE` per la parte Google/GitHub (collegamento funzionante dal
primo giorno) e per la parte Slack/Notion/Figma/... (il codice e' pronto e
attivabile appena l'app OAuth del provider viene accreditata nel VPS). Per i
provider senza OAuth resta da fare l'utente (creare l'app o recuperare la
credenziale del proprio account).

### Fase 23 — Collegamento ai provider: un solo accesso Google + app OAuth registrate dal tenant (08/11/2026)

**Richiesta**: "dalla piattaforma manda nella pagina login del provider e fa fare accesso con consenso tramite login". La
fase 22 aveva il codice del flusso, ma due ostacoli restavano: (a) i servizi Google si collegavano uno alla volta,
(b) i provider con app OAuth dedicata (Slack, Notion, Figma, ...) non si potevano attivare senza toccare il `.env` del
VPS. Ora il collegamento parte dalla piattaforma ed e' il tenant a fare login e consenso sulla pagina del provider.

**Cosa e' cambiato (backend)**

- **Connettore master Google** (`console/server/src/connectors/catalog.ts`): `google` — "Google (tutti i servizi)" con
  il consenso unificato sui 12 servizi (Gmail, Drive, Calendar, Sheets, Slides, Docs, Tasks, Meet, YouTube, Maps,
  Analytics, Ads). Un solo login, una sola schermata di consenso. `googleServicesForScopes()` calcola quali servizi
  copre il token concesso: al rientro dal callback il token viene salvato per **ogni** servizio incluso nel consenso.
- **App OAuth registrate dal tenant** (nuova tabella `pipeline.oauth_app`, `console/server/src/connectors/app-store.ts`):
  il tenant crea l'app nella console del provider e registra `client_id`/`client_secret` **dalla piattaforma**; il
  secret e' cifrato a riposo (AES-256-GCM). Le app sono per tenant (`tenant_id`, `provider`), quindi un tenant non
  tocca gli altri; la `redirect_uri` resta quella del provider (`/api/pipeline/connectors/<id>/callback`).
- `console/server/src/connectors/oauth.ts`: `resolveConnectorClient()` risolve il client con priorita' app di
  piattaforma (env) -> app del tenant; `connectorAuthorizeUrl()`/`exchangeConnectorCode()` accettano il client
  risolto; `googleScopes()` con override `CONNECTOR_GOOGLE_SCOPES` (per ridurre il consenso unificato se Google
  rifiuta uno scope "restricted" su app non verificate).
- `console/server/src/connectors/routes.ts`: `POST /api/pipeline/connectors/:id/app` (registra l'app),
  `DELETE /api/pipeline/connectors/:id/app` (la rimuove), catalogo arricchito con `signupUrl` (console sviluppatore),
  `appRegistered`, `master`, `masterServices`.
- `console/server/src/connectors/complete.ts`: al rientro dal callback il token e' salvato per il connettore e per
  tutti i servizi Google coperti dal consenso (master: tutti e 12).

**Cosa e' cambiato (UI)**

- `platform/src/pages/Connectors.tsx`: card master in testa con badge "Un solo accesso" e l'elenco dei servizi che
  attiva; per i provider con app dedicata il pulsante diventa **"Registra l'app"** e apre un modal con il link alla
  console del provider, il `callback` da copiare e i campi client id/secret; pulsante "Rimuovi app"; dopo la
  registrazione il pulsante passa a "Accedi con <Provider>" e manda alla pagina di login del provider.
- `platform/src/lib/platform-api.ts` + `platform-queries.ts`: `registerConnectorApp`, `deleteConnectorApp` e relativi
  hook (`useRegisterConnectorApp`, `useDeleteConnectorApp`).

**Verifica**

- `npm run test:connectors` -> **35/35 verdi** (catalogo con master e 12 servizi, mappa scope->servizi, console
  sviluppatore per ogni provider con app, risoluzione client con app del tenant e priorita' dell'app di piattaforma,
  URL di autorizzazione master con 12 scope + PKCE).
- `npm run test:social` -> **19/19 verdi** (nessuna regressione sul login sociale).
- Build BFF (`tsc`) e build platform (`tsc -b && vite build`) OK.
- **Live su produzione** (deploy `0aeb2a9`, notifica `d15620dc`): tabella `pipeline.oauth_app` creata dalla
  migrazione; `GET /api/pipeline/connectors` -> 44 connettori (master in testa, 24 pronti, 20 provider con
  `signupUrl`); `POST /api/pipeline/connectors/notion/app` -> 200 e `GET .../notion/connect` -> **302 alla pagina di
  login di Notion** con il `client_id` del tenant, il `state` firmato e gli scope; nel DB il secret e' cifrato
  (`v1:...`, il valore in chiaro non compare); `DELETE .../app` -> rimozione e stato tornato "da attivare"
  (nessun resto di test: 0 righe in `oauth_app`).
- **QA browser** (utente QA reale): prima card "Google (tutti i servizi)" con badge "Un solo accesso" e l'elenco dei
  12 servizi; pulsante "Registra l'app" su 19 provider; modal con link alla console del provider, callback da
  copiare e campi Client ID/Secret; **0 errori console**; screenshot `shots/connettori-app.png`.

**Stato**: `DONE`. Il flusso richiesto e' operativo: dalla piattaforma si clicca il provider, l'utente viene
mandato alla pagina di login/consenso del provider e al rientro la connessione e' attiva con il token cifrato. Restano
azioni utente: completare il consenso Google (aggiungere il proprio account come utente di test se la Console lo
chiede) e creare l'app del provider nella sua console (il pulsante "Registra l'app" guida passo passo).

### Fase 24 — Correzione scope Google e avviso "utente di test" (08/11/2026)

**Problema**: il consenso unificato Google falliva con `Errore 400: invalid_scope`. L'errore di Google era
esplicito: `valid=[gmail.modify, drive.file, calendar, spreadsheets, presentations, documents, tasks,
youtube.upload, analytics.readonly, adwords]`, `invalid=[maps-api, meetings.space]`. `maps-api` e
`meetings.space` **non sono scope validi per questo progetto** (le API Maps Platform e Meet non sono abilitate),
e la presenza di un solo scope non valido fa fallire l'intera richiesta. Inoltre il collegamento reale
riusciva solo su Google Drive: gli ambiti sensibili (Gmail, Calendar, Docs, YouTube, Ads) vengono concessi solo
agli **utenti di test** finche' l'app non e' verificata, e Drive funziona perche' non e' un ambito sensibile.

**Cosa e' cambiato**

- `console/server/src/connectors/catalog.ts`: il connettore master Google chiede ora **solo i 10 scope validi**
  (`maps-api` e `meetings.space` eliminati); i servizi **Google Meet** e **Google Maps** escono dal catalogo
  (le rispettive API non sono abilitate nel progetto: si possono riaggiungere abilitandole).
- `console/server/src/connectors/oauth.ts`: `googleConsentHint()` traduce gli errori di Google in indicazioni
  operative (`invalid_scope` -> collegare i servizi uno alla volta; app non verificata -> aggiungere l'account
  come utente di test).
- `console/server/src/connectors/routes.ts` e `console/server/src/auth/social-routes.ts`: il callback mostra il
  messaggio operativo invece del codice grezzo del provider.
- `platform/src/pages/Connectors.tsx`: ogni card Google mostra l'avviso "app non verificata / utenti di test" con
  il link alla console del progetto Google (`apis/credentials/consent`).
- `GOOGLE_CONSOLE_URL` e `GOOGLE_TEST_USER_NOTICE` centralizzati nel catalogo.

**Verifica**: `npm run test:connectors` -> **37/37 verdi** (nuovo test: gli scope non validi non devono comparire
in nessun connettore; nuovo test sui messaggi di consenso), `npm run test:social` -> **19/19**, build BFF e
platform OK.

**Azione utente** (2 minuti, una volta sola): Google Cloud Console -> progetto AIFORGE -> "Schermata di consenso
OAuth" -> stato pubblicazione **In test** -> "Utenti di test" -> aggiungi `mattiadeblasio94@gmail.com` -> Salva.
Da quel momento Gmail, Calendar, Docs, Sheets, YouTube, Ads si collegano con un solo accesso (in modalita' test il
refresh token scade dopo 7 giorni: la piattaforma riusa il token finche' e' valido). Alternativa a lungo termine:
richiedere la verifica dell'app.

### Fase 25 — Modello "app di piattaforma": l'utente non deve creare app OAuth (08/11/2026)

**Domanda del committente**: "serve avere la console? posso avere tutto sulla piattaforma? gli utenti che useranno
la piattaforma devono fare tutto sto casino o si collegano tramite le mie API?"

**Risposta implementata**: l'utente finale **non crea piu' app**. Per ogni provider la piattaforma dichiara come si
attiva il collegamento e l'utente vede solo il pulsante di login/consenso. La creazione dell'app e' un lavoro
una-tantum della piattaforma (non degli utenti).

**Cosa e' cambiato**

- `console/server/src/connectors/catalog.ts`: nuovo `CONNECTOR_DISTRIBUTION` con 4 stati di attivazione:
  - `platform` — l'app di piattaforma e' gia' attiva (GitHub): l'utente collega con un clic;
  - `self_serve` — l'app di piattaforma si registra in pochi minuti nella console del provider (Slack, Notion,
    Linear, Outlook/Microsoft Teams, Salesforce): una volta sola, poi tutti collegano con un clic;
  - `review` — il provider chiede la revisione dell'app (Google, Meta, LinkedIn, TikTok, X, Reddit, Stripe,
    PayPal, Zoom, Canva, Wix, Figma, YouTube/Ads/Analytics): giorni o settimane, ma **una volta sola**;
  - `byo` — il provider non offre app multi-tenant (Telegram, WhatsApp, Cloudflare, Supabase, ElevenLabs,
    Mailchimp, DataForSEO, GoDaddy, WordPress, Activepieces): l'utente inserisce la credenziale del proprio account,
    unico caso in cui l'utente deve fare qualcosa.
  Il campo `platformApp` marca i provider con app di proprieta' della piattaforma (Google e i suoi 10 servizi,
  GitHub): sono gli unici in cui l'utente e' davvero "plug-and-play".
- `console/server/src/connectors/routes.ts` e `platform/src/lib/platform-api.ts`: il catalogo espone `distribution`
  (modo + requisito + `platformApp`).
- `platform/src/pages/Connectors.tsx`: ogni card mostra lo stato di attivazione, il requisito e la frase
  "L'app e' di Aethersy: devi solo fare login e consenso". Il pulsante "Registra l'app" diventa **"Porta la tua app
  (opzionale)"** ed e' visibile solo quando la piattaforma non ha ancora l'app del provider: resta un fallback
  avanzato, non il percorso predefinito.
- `platform/src/pages/Legal.tsx` (nuovo) + rotte pubbliche `/privacy` e `/terms`: la Console Google richiede una
  privacy policy pubblica per la verifica dell'app. Il testo elenca i dati realmente trattati (profilo del provider,
  contenuti dei servizi autorizzati, token cifrati, deliverable, crediti), il passaggio ai provider AI
  (OpenRouter/Venice) e i diritti dell'interessato. Link nel footer di `Login.tsx`.
- `console/server/src/auth/social-routes.ts`: il callback unificato usa `googleConsentHint()` anche per il login
  sociale (modifica inclusa in questo commit, gia' presente nel build deployato della fase 24).

**Verifica**: `npm run test:connectors` -> **40/40 verdi** (3 nuovi test: ogni connettore dichiara come si attiva,
`platformApp` coerente con il tipo di auth, i connettori a credenziale sono `byo`), `npm run test:social` -> **19/19**,
build BFF e platform OK.

**Azione utente (una volta sola, ~2 minuti)**: Google Cloud Console -> progetto AIFORGE -> "Schermata di consenso
OAuth" -> stato **In test** -> "Utenti di test" -> aggiungi `mattiadeblasio94@gmail.com`. Da quel momento Gmail,
Calendar, Docs, Sheets, YouTube e Ads si collegano con un solo accesso (in test il refresh token scade dopo 7
giorni). Per gli altri provider: creare l'app di piattaforma una volta sola (stato `self_serve`) e avviare la
revisione per quelli in `review`.

### Fase 26 — Console unificata dentro la piattaforma (08/11/2026)

**Domanda del committente**: "serve avere la console? non posso avere tutto sulla piattaforma? voglio che sposti la
console sulla piattaforma!"

**Stato prima**: due app separate — `console.aethersy.online` (SPA React operativa + BFF Fastify) e
`platform.aethersy.online` (SPA utente). La SPA della console non era nemmeno pubblicata dal Caddy (manca
`CONSOLE_DOMAIN` nella configurazione) e conteneva un layer "anteprima" con il porting demo della piattaforma: due
copie della stessa UI, una sola realmente in uso.

**Cosa e' cambiato**

- `platform/src/console/` (nuovo): le 16 pagine operative reali (Pulse, Obiettivi, Memoria, Prodotti, Opportunita',
  Schedule, Roster Agenti, Pipeline, Lead, Libreria asset, Crediti, Dashboard, Flows, Runs, Connections, AI Center)
  e il loro client API tipizzato (`lib/api.ts`, `lib/query.ts`, `lib/types.ts`) sono ora dentro la piattaforma e
  rispondono su `/console/*` (`platform/src/App.tsx`).
- `platform/src/console/components/Layout.tsx`: barra laterale operativa con le rotte prefixed `/console/*`, link
  "Torna alla piattaforma", logout e rimozione del collegamento all'anteprima demo.
- `platform/src/index.css`: scope `.console-root` con i token e le classi del design system della console
  (`.card`, `.btn`, `.input`, `.badge`, `.nav-link`, `.glow`): l'area operativa resta identica ma non tocca i token
  della piattaforma ne' il tema chiaro.
- Conversione delle classi Tailwind v4 -> v3 per le pagine portate (`text-[--color-muted]` ->
  `text-[color:var(--color-muted)]`): senza questa conversione le utility arbitrarie non verrebbero generate dal
  Tailwind v3 della piattaforma e i colori andrebbero persi.
- `platform/src/components/layout/Drawer.tsx`: voce "Console operativa" nella sezione secondaria del menu.
- `console/web/` **eliminata** (SPA, layer anteprima, assets duplicati): `console/Dockerfile` ora builda solo il BFF
  e `console/package.json` espone solo gli script del server. Il BFF resta il container `console:3000` (Caddy
  inoltra `/api*` -> `console:3000`), ma non serve piu' nessun frontend.
- `scripts/sync-console-brand.sh` ora sincronizza gli asset di brand in `platform/public`; CI: eliminato il job
  `console/web` (il job `platform` typechecka e builda anche la Console unificata); `docs/runbook.md` e
  `caddy/Caddyfile` aggiornati.

**Verifica**: `tsc -b --force` (platform) senza errori, build Vite OK, `npm run test:connectors` -> **40/40**,
`npm run test:social` -> **19/19**, build BFF OK.

**Esito**: una sola app, un solo dominio (`platform.aethersy.online`), una sola sessione. L'utente va su `/console`
dalla stessa navigazione in cui usa Studio, Agenti e Connettori; il BFF resta un servizio interno, senza UI propria.
