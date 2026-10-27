# runbook.md — Operazioni quotidiane

> Comandi da eseguire sul VPS, come utente `deploy`, nella root del repo.
> Convenzione: `cd ~/aethersy` prima di ogni blocco (percorso reale sul VPS: `/home/deploy/aethersy`).

## 1. Stato dello stack

```bash
docker compose ps                 # servizi e stato
docker compose logs -f app        # log app in tempo reale
docker compose logs -f worker     # log worker (esecuzione flow)
docker compose logs --tail=200 caddy
```

Health check:

```bash
curl -fsS http://127.0.0.1:8080/api/v1/health
curl -fsS https://app.aethersy.online/api/v1/health
```

Smoke test completo (container + health locale + health pubblico + MCP):

```bash
./scripts/04-smoke-test.sh
```

## 2. Start / stop / restart

```bash
docker compose up -d                 # avvio (o riconciliazione dopo modifiche)
docker compose stop                  # ferma i container, volumi intatti
docker compose restart app worker    # riavvia app e worker
docker compose down                  # rimuove i container, VOLUMI INTATTI
```

> **Mai** `docker compose down -v` in produzione: cancella i volumi (database e Redis).

## 3. Aggiornamento di versione

1. Controlla l'ultima release: https://github.com/activepieces/activepieces/releases
2. Backup **prima** di toccare la versione:
   ```bash
   ./scripts/backup.sh
   ```
3. Cambia il tag in `.env`:
   ```
   AP_VERSION=<nuova-versione>
   ```
4. Applica:
   ```bash
   docker compose pull
   docker compose up -d
   ./scripts/04-smoke-test.sh
   ```

Le migrazioni del database girano automaticamente all'avvio dell'app.

### 3.1 Dove vivono le variabili (app vs worker)

App e worker condividono lo stesso `.env` (`env_file`), ma non tutte le variabili vengono lette dallo stesso processo:

- **Lette dall'app e pushate al worker via socket:** `AP_EXECUTION_MODE`, `AP_NETWORK_MODE`, `AP_SSRF_ALLOW_LIST`, `AP_FLOW_TIMEOUT_SECONDS`, `AP_MAX_FILE_SIZE_MB`, `AP_SANDBOX_MEMORY_LIMIT`, `AP_FILE_STORAGE_LOCATION`, `AP_S3_USE_SIGNED_URLS`.
- **Lette localmente dal worker:** `AP_CONTAINER_TYPE`, `AP_FRONTEND_URL`, `AP_WORKER_TOKEN`, `AP_WORKER_CONCURRENCY`, `AP_REUSE_SANDBOX`, `AP_PREWARM_CACHE_ON_STARTUP`, `AP_CACHE_BASE_PATH`, log/OTel.

Conseguenza pratica: modificare `AP_EXECUTION_MODE` o `AP_NETWORK_MODE` richiede il riavvio dell'**app** (che ripusha le impostazioni), non solo del worker. Tenere le variabili in un unico `.env` condiviso evita disallineamenti.

## 4. Rollback di versione

Il rollback dell'immagine **non** annulla le migrazioni del DB. Procedura sicura:

1. Riporta `AP_VERSION` alla versione precedente in `.env`.
2. `docker compose up -d`.
3. Se l'app non parte per schema DB incompatibile: ripristina il dump precedente (vedi `docs/restore.md`).
4. Verifica con `./scripts/04-smoke-test.sh`.

## 5. Segreti

`.env` contiene tutti i segreti. Permessi attesi: `600`, owner `deploy`.

```bash
chmod 600 .env
ls -l .env
```

Generazione (una sola volta, all'inizio):

```bash
openssl rand -hex 16   # AP_ENCRYPTION_KEY
openssl rand -hex 32   # AP_JWT_SECRET, AP_POSTGRES_PASSWORD, AP_REDIS_PASSWORD
```

- `AP_ENCRYPTION_KEY` perso = credenziali delle connessioni irrecuperabili. Conservalo **offline**.
- `AP_JWT_SECRET` cambiato = tutti gli utenti vengono disconnessi.

## 6. Primo accesso admin (Fase 4)

1. Apri `https://app.aethersy.online` e crea il primo account: diventa **admin di piattaforma**.
2. Le registrazioni pubbliche sono **chiuse per default** su una piattaforma esistente: il gate è `AP_ALLOW_OPEN_SIGN_UP` (assente ≠ `true`). Senza invito il signup risponde `INVITATION_ONLY_SIGN_UP`. Per aggiungere utenti: **Platform Admin → Users → Invite**. Solo se serve un signup aperto, impostare temporaneamente `AP_ALLOW_OPEN_SIGN_UP=true` (sconsigliato in produzione). `AP_SIGN_UP_ENABLED` **non esiste**: non impostarla.
3. Registra qui **solo** il riferimento al gestore password, mai la password in chiaro:

   | Voce | Valore |
   |---|---|
   | Email admin | `<inserire>` |
   | Gestore password | `<inserire voce/etichetta>` |

## 6.1 Provider AI (OpenRouter / Venice)

**Activepieces non legge i provider AI da variabili d'ambiente.** Non esiste `AP_AI_PROVIDER` né una env per le chiavi dei provider: le chiavi in `.env` (`.env.example` → sezione *Provider AI*) sono solo di riferimento locale. La configurazione va fatta a runtime nella UI:

**Platform Admin → AI Center → Providers**

1. **OpenRouter (provider primario) — GIÀ CONFIGURATO.** È un provider *Gateway* nativo. Configurato il 27/10/2026: `status=active`, `enabledForChat=true`, 464 modelli disponibili; test end-to-end "Ask AI" (`openai/gpt-4o-mini`) → risposta reale. Per ricrearlo/modificarlo: **Add Provider → OpenRouter**, incollare `OPENROUTER_API_KEY`, salvare, abilitare "Enabled for chat".
2. **Venice (opzionale).** Rientra in **Other (OpenAI Compatible)**: base URL `https://api.venice.ai/api/v1`, chiave `VENICE_API_KEY`. Testato il 27/10/2026: la chiave autentica (`GET /models` → 200) ma **ogni inferenza risponde `Insufficient USD or Diem balance`** → serve ricaricare credito su https://venice.ai/settings/api prima di usarla.
3. **Failover.** Activepieces **non** fa failover automatico tra provider: ogni step/agente sceglie un provider+modello. Il failover si delega a **OpenRouter** (provider failover automatico + model fallback opt-in via array `models` nel payload). Quindi OpenRouter è la scelta robusta come provider primario.

Sintomo tipico "il provider non risponde sempre": con Venice è (quasi sempre) **credito esaurito**, non un problema di rete. Verifica con:

```bash
curl -s https://api.venice.ai/api/v1/models -H "Authorization: Bearer $VENICE_API_KEY" -o /dev/null -w '%{http_code}\n'
```


## 6.2 Server MCP (Fase 7)

Il server MCP è esposto su `https://mcp.aethersy.online` (hostname dedicato, diverso da `AP_FRONTEND_URL`). L'autenticazione è **OAuth** (nessun token statico): il client MCP scopre i metadata e completa il flusso `authorization_code` + PKCE.

**Collegare un client (Claude / ChatGPT / altri client MCP):**

1. Aggiungi un server MCP remoto con URL: `https://mcp.aethersy.online/mcp`
2. Il client esegue da sé:
   - `GET /.well-known/oauth-protected-resource/mcp` → scopre l'authorization server;
   - `POST /register` → registrazione dinamica del client;
   - `/authorize` (+ PKCE `S256`) → apre il consent sull'host principale `app.aethersy.online` (`/mcp-authorize`); **serve una sessione già autenticata** nel browser;
   - `POST /token` → ottiene access + refresh token (scope `mcp openid email profile`).
3. Fatto: il client elenca e invoca i tool Activepieces.

**Verifica rapida:**

```bash
# Senza token deve rispondere 401 con l'header WWW-Authenticate (annuncio OAuth)
curl -si -X POST https://mcp.aethersy.online/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' \
  | grep -i '^www-authenticate'

curl -s https://mcp.aethersy.online/.well-known/oauth-authorization-server | jq .
curl -s https://mcp.aethersy.online/.well-known/oauth-protected-resource/mcp | jq .
```

Troubleshooting: `/mcp` risponde 404 pubblico → Caddy non instrada (verifica `AP_MCP_URL` e le route nel Caddyfile; l'hostname MCP deve differire da `AP_FRONTEND_URL`). Il consent screen va servito su `AP_FRONTEND_URL`, quindi il dominio MCP **non** deve essere lo stesso dell'app.


## 7. Backup

```bash
./scripts/backup.sh
ls -lh backups/daily
```

Cron notturno consigliato (eseguito come `deploy`):

```bash
crontab -e
# 03:30 ogni notte
30 3 * * * cd /home/deploy/aethersy && ./scripts/backup.sh >> /home/deploy/aethersy/backups/backup.log 2>&1
# smoke test ogni 15 minuti
*/15 * * * * cd /home/deploy/aethersy && ./scripts/04-smoke-test.sh >> /home/deploy/aethersy/backups/smoke.log 2>&1
```

> Prerequisito: `deploy` deve essere nel gruppo `docker` (`usermod -aG docker deploy`, fatto da `01-hardening.sh`), altrimenti `docker compose` fallisce con *permission denied*.

Scarica i backup **fuori dal VPS** (rsync/rclone verso storage esterno). Un backup solo sul server non è un backup.

## 8. Troubleshooting

| Sintomo | Diagnosi | Rimedio |
|---|---|---|
| `app` in restart loop | log app | `docker compose logs --tail=200 app`; spesso `.env` incompleto o DB non pronto |
| Certificato TLS non emesso | log caddy; DNS | `docker compose logs caddy`; `./scripts/02-dns-check.sh <IP>`; verifica che 80/443 siano aperti |
| 502 da Caddy | app non in ascolto | `docker compose ps app`; health locale |
| Worker non esegue | log worker | `docker compose logs -f worker`; verifica `AP_CONTAINER_TYPE=WORKER` e `AP_FRONTEND_URL=http://app` |
| Worker connesso ma "Workers page" vuota | socket worker→app | il worker deve raggiungere `http://app` (nome servizio). `localhost` = il worker stesso. Vedi `docs/phases.md` §11 voce 15 |
| `/mcp` risponde 404 pubblico | Caddy non instrada | verifica `AP_MCP_URL` e le route esatte nel Caddyfile; l'hostname MCP deve differire da `AP_FRONTEND_URL` |
| Login tutti gli utenti persi | `AP_JWT_SECRET` cambiato | ripristina il valore precedente |
| Connessioni dei flow rotte | `AP_ENCRYPTION_KEY` cambiato | ripristina il valore originale |
| Flow AI fallisce con "Insufficient balance" | provider senza credito (Venice) | ricarica credito o passa a OpenRouter (Platform Admin → AI Center → Providers). Vedi §6.1 |
| Provider AI "non risponde" | nessun failover tra provider in Activepieces | usa OpenRouter come primario e delegagli il failover. Vedi §6.1 |

## 9. Riavvio da zero (macchina pulita)

```bash
git clone <repo> aethersy-infra && cd aethersy-infra
cp .env.example .env && nano .env      # compila i segreti
chmod 600 .env
./scripts/03-deploy.sh
./scripts/04-smoke-test.sh
```

Se il database ha già dati, il ripristino del dump è in `docs/restore.md`.
