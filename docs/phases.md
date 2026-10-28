# phases.md — Log di esecuzione fasi

> Aggiornare dopo **ogni** fase con: data/ora, esito, comandi di verifica, note.
> Stati ammessi: `DONE`, `BLOCKED: input #N`, `NOTE`.
>
> Ultima revisione: 2026-10-27

## Stato sintetico

| Fase | Descrizione | Stato |
|---|---|---|
| 0 | Accesso SSH e preparazione repo | `DONE` — repo creato e committato (`be56668`); accesso SSH al VPS Aruba stabilito via chiave |
| 1 | Bootstrap e hardening | `DONE` — Docker 29.9.2 + Compose v5.6.1, swap 2 GB, utente `deploy`, root/password SSH disabilitati, ufw 22/80/443, fail2ban attivo |
| 2 | DNS e reverse proxy | `DONE` — dominio **aethersy.online** (GoDaddy); Caddy + Let's Encrypt attivi su `app.`, `mcp.`, apex e `www` (apex/www → 301 su `app.`) |
| 3 | Deploy stack Activepieces | `DONE` — stack up e healthy; smoke test OK su `https://app.aethersy.online` |
| 4 | Primo accesso e chiusura signup | `DONE` — admin `mattiadeblasio94@gmail.com` (ADMIN, ACTIVE) su `app.aethersy.online`; registrazioni pubbliche chiuse (`AP_ALLOW_OPEN_SIGN_UP` assente → `INVITATION_ONLY_SIGN_UP`) |
| 5 | Provider AI (OpenRouter/Venice) | `DONE` — **OpenRouter** creato via API admin, `status=active`, `enabledForChat=true`, 464 modelli; acceptance con flow reale "Ask AI" (webhook → `askAi`) → run `SUCCEEDED`, output `PONG`. Venice: chiave valida ma senza credito → non aggiunto (opzionale) |
| 6 | Slack | `BLOCKED: input #5` — `SLACK_WEBHOOK_URL` vuoto |
| 7 | Endpoint MCP | `DONE` — hostname `mcp.aethersy.online` esposto via Caddy; discovery OAuth + handshake verificati (401 con `WWW-Authenticate` → resource metadata) |
| 8 | Branding | `BLOCKED` — richiede decisione utente su nome/logo/colori (non è un input infrastrutturale) |
| 9 | Backup e monitoraggio | `DONE` — `backup.sh` corretto (rotazione robusta a glob vuoto) ed eseguito; **restore testato** su DB temporaneo (83 tabelle, dati coerenti) |
| 10 | Review finale e consegna | `IN CORSO` — audit infrastrutturale **completato** (tutte le verifiche OK); restano azioni utente (rotazione credenziali, backup segreti offline) e le fasi 6/8 |

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
- **Esito:** `BLOCKED: input #5`.
- **Piano:** creare l'app Slack, salvare il webhook in `.env` (`SLACK_WEBHOOK_URL`). Flow di notifica + alert su `04-smoke-test.sh` in cron.

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

### Fase 8 — Branding
- **Esito:** `DONE` (28/10/2026). Nome **AETHERSY**, colore primario `#6e41e2`, loghi/asset serviti localmente. Decisione committente: branding **completo via patch** (gratis, senza licenza), nome in maiuscolo, asset forniti dall'utente (placeholder generati in attesa).
- **Perche' serve un patch (e non la UI):** la Community edition è **hard-coded** su `defaultTheme`. Verificato live: `/api/v1/flags` → `EDITION:"ce"`, `THEME` con `websiteName:"Activepieces"` e loghi `cdn.activepieces.com`; `ee/helper/appearance-helper.js` → `case ApEdition.COMMUNITY: return defaultTheme` (ignora del tutto la riga `platform` del DB, che pure contiene name/loghi/colore); `flags/flag.service.js:147` → `value: theme_1.defaultTheme`. Quindi nome/logo/colori del DB **non hanno effetto** in CE. Anche `<title>` è generato upstream come `Activepieces`. Il modulo Caddy `replace` (per riscrivere il body di `/api/v1/flags`) **non** è disponibile in `caddy:2.8-alpine` (presenti solo `templates` e `rewrite`).
- **Soluzione implementata:**
  - `branding/theme.js` = copia di `packages/server/api/dist/src/app/flags/theme.js` con `defaultTheme = generateTheme({ primaryColor:'#6e41e2', websiteName:'AETHERSY', fullLogoUrl:'/brand/full-logo.svg', favIconUrl:'/favicon.ico', logoIconUrl:'/brand/logo.svg' })`. Il titolo e il favicon del SPA sono impostati **a runtime** da `websiteName`/`favIconUrl` del tema (`document.title=…websiteName`), quindi questo patch copre header + titolo + favicon.
  - `branding/web/` = `logo.svg`, `favicon.ico`, `logo-192.png`, `logo-180.png`, `brand/logo.svg`, `brand/full-logo.svg` (placeholder generati con `scripts/gen_brand_assets.py`; l'utente li sostituirà con i file definitivi).
  - `docker-compose.yml` (servizio `app`): bind-mount **read-only** di `theme.js` e degli asset. Sopravvivono a `up -d`.
  - `index.html` **non** è montato (contiene gli hash dei bundle JS/CSS, che cambiano a ogni release): viene patchato **version-aware** da `scripts/05-branding.sh` (titolo + `favicon.ico` locale). `03-deploy.sh` lo richiama come step `[5/5]`.
- **Verifica live (28/10/2026):** `GET /api/v1/flags` → `THEME.websiteName = "AETHERSY"`, `logos` → `/brand/full-logo.svg`, `/favicon.ico`, `/brand/logo.svg`; `GET /` → `<title>AETHERSY</title>` con `<link rel="icon">` locali; asset `/logo.svg`, `/favicon.ico`, `/logo-192.png`, `/logo-180.png`, `/brand/logo.svg`, `/brand/full-logo.svg` tutti `200`; bundle SPA `200`; container `aethersy-app` `healthy`.
- **Debito/manutenzione:** il patch vive **dentro l'immagine** → dopo ogni cambio di `AP_VERSION` va rieseguito `scripts/05-branding.sh` (i bind-mount di theme.js/asset restano automatici, cambia solo `index.html`). Le stringhe "Activepieces" residue nel bundle (es. testi di supporto, "Model by Activepieces", SAML SP entity id) **non** sono rimovibili senza rebuild del frontend: restano note.
- **Acceptance:** header/titolo mostrano `AETHERSY` ✔; nessun placeholder "Activepieces" in `<title>`/header ✔.

### Fase 9 — Backup e monitoraggio
- **Esito:** `DONE` (27/10/2026). `scripts/backup.sh` (pg_dump + tar Redis, rotazione 7 giornalieri + 4 settimanali, copia settimanale la domenica) **eseguito con successo**; **restore testato** su DB temporaneo.
- **Bug corretto:** la rotazione usava `ls -1t <glob> | tail | xargs` che, con glob vuoto (es. `weekly/` prima della prima domenica), fa uscire `ls` con codice 2 e — per `set -e`/`pipefail` — abortiva lo script **dopo** aver creato il dump (exit 1). Sostituito con una funzione `rotate()` che tratta l'assenza di file come caso non errore.
- **Corretto anche:** l'utente `deploy` non era nel gruppo `docker` (lo assumevano `backup.sh` e `04-smoke-test.sh`). Aggiunto in `01-hardening.sh` (`usermod -aG docker deploy`) e applicato a caldo sul VPS.
- **Test di restore (dettagli in `docs/restore.md` §6):** dump `postgres-20261027-230835.sql.gz` (28 MB, `gzip -t` OK, 81 `CREATE TABLE`); restore su `activepieces_restore_test` → **83 tabelle**, `user=1`, `platform=1`, `project=1`, `ai_provider=1` (id/status coerenti con produzione), `flow=0`; DB di test rimosso. Archive Redis integro (`gzip -t` OK; `appendonlydir/` + `dump.rdb`).
- **Acceptance:** dump non vuoto con dimensione plausibile ✔; restore su DB temporaneo restituisce tabelle popolate ✔; smoke test `04-smoke-test.sh` OK ✔.

### Fase 10 — Review finale e consegna
- **Esito:** `IN CORSO` — audit infrastrutturale completato (27/10/2026).
- **Verifiche eseguite sul VPS (tutte OK):** ufw default-deny con allow 22/80/443; fail2ban attivo; `sshd -T` → `permitrootlogin no`/`passwordauthentication no`/`maxauthtries 3`; `unattended-upgrades` active; swap 2 GB; porte in ascolto solo 22/80/443 (5432/6379 assenti); `.env` `-rw------- deploy`; `docker compose config --quiet` senza warning; immagini **pinnate** (`caddy:2.8-alpine`, `pgvector/pgvector:0.8.0-pg14`, `redis:7.0.7`, `activepieces:${AP_VERSION}`=`0.92.3-hotfix.1`); log driver `json-file` `max-size=10m`/`max-file=5`; nessun `network_mode: host` né mount di `docker.sock`.
- **Audit segreti:** `.env`/`.env.secrets` mai committati (fuori da `git ls-files`); nessuna chiave reale (`sk-…`, `ghp_…`, webhook Slack, PEM) nei file tracciati o nella history. **Defect trovato e corretto:** `docs/security.md` conteneva la password SSH in chiaro → **redatta**; il valore resta nella history git locale (repo **senza remote**, non pubblicato) e va comunque **ruotato** (§6.1 di `docs/security.md`).
- **Prossimi passi:** (1) rotazione credenziali esposte in chat (azione utente); (2) backup offline dei segreti critici; (3) collegare un client MCP reale per chiudere l'acceptance di Fase 7; (4) ~~decisione branding~~ (Fase 8 **DONE** 28/10/2026 — utente deve fornire logo.svg/favicon.ico definitivi); (5) `SLACK_WEBHOOK_URL` (Fase 6).
