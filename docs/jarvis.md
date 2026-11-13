# Jarvis — architettura e deployment

> Documento tecnico dell'assistente. La visione di prodotto e' in
> `docs/product-vision.md`; lo stato di esecuzione in `docs/phases.md`.

## 1. Dove vive

| Componente | Dove | Note |
|---|---|---|
| Server OpenJarvis (chat + STT) | **VPS dedicato `85.235.151.215`** (container `aethersy-jarvis`) | host dedicato, accesso SSH con chiave (`deploy` + sudo), root/password disabilitati |
| Reverse proxy / TLS | VPS dedicato, container `aethersy-jarvis-caddy` (profilo `public`) | TLS automatico su `jarvis.aethersy.online` (record A → `85.235.151.215`) |
| API piattaforma (BFF) | VPS Aruba `195.231.79.221` | `console/server` |
| UI piattaforma | VPS Aruba | `platform` (pagina `/jarvis`) |
| Tool e skill Jarvis | versionati in `jarvis/` di questo repository | copiati nel container |
| Istanza di riserva | VPS Aruba, container `aethersy-jarvis` | Jarvis interno alla rete Docker della piattaforma (`http://aethersy-jarvis:8000`): resta il fallback se il dominio non e' raggiungibile |

La piattaforma **non ospita** il modello: chiama Jarvis via API
OpenAI-compatibile. Jarvis richiama la piattaforma con i suoi tool.

I due VPS hanno ruoli distinti: Aruba ospita piattaforma, API e UI; il VPS
dedicato ospita **solo** Jarvis (chat + STT + TLS), cosi' l'assistente non
condivide il ciclo di vita della piattaforma.

## 2. Flusso di una richiesta

```
Browser (microfono o testo)
  -> POST /api/platform/jarvis/transcribe   (BFF -> Jarvis /v1/speech/transcribe, faster-whisper locale)
  -> POST /api/platform/jarvis/chat         (BFF -> Jarvis /v1/chat/completions + memoria del tenant)
  -> Jarvis usa i tool:
       aethersy_control  -> /api/platform/* (Wix, business, obiettivi, siti)
       aethersy_memory   -> /api/platform/memory (+ graph, vault)
       aethersy_change   -> opencode (coding agent, sandbox)
       aethersy_speak    -> /api/ai/generate (TTS) e riproduzione locale
```

Il BFF passa a Jarvis il contesto del tenant (memoria in evidenza, id tenant,
email utente) e conserva l'autenticazione: Jarvis agisce sempre nel perimetro
del tenant che ha aperto la chat.

## 3. Engine e provider

Configurazione in `jarvis/config/config.toml`:

- engine `nim` (NVIDIA `integrate.api.nvidia.com`) — **scelta di default**:
  il tool-calling e' verificato;
- disponibili anche `openrouter` e `zai` (stesse chiavi gia' configurate nella
  piattaforma);
- **nessun Ollama**: non viene installato e non viene usato;
- STT: `faster-whisper` locale (modello `base`, lingua `it`, CPU, int8);
- TTS: la piattaforma (Venice/kokoro) via `aethersy_speak`.

Nota sui modelli OpenRouter free: in precedenza hanno restituito tool-call con
nome funzione vuoto (errore HTTP 400 del provider). Per questo il default
e' NVIDIA; OpenRouter resta come engine alternativo.

## 4. Tool e skill (versionati in `jarvis/`)

| Tool | Funzione | Scritture |
|---|---|---|
| `aethersy_control` | dati business reali: Wix, prodotti, obiettivi, siti, agenti | `confirm: true` |
| `aethersy_memory` | vault markdown del tenant: list/search/get/graph/vault/create/update | `confirm: true` |
| `aethersy_change` | delega i cambiamenti di codice a `opencode` | `confirm: true` (prima piano) |
| `aethersy_speak` | pronuncia la risposta | — |

| Skill | Contenuto |
|---|---|
| `aethersy` | regole operative: mai inventare numeri, prima il piano poi l'azione, memoria costruttiva |
| `self-hosted-backend` | come si progetta un backend dati self-hosted (Postgres su VPS, schema per progetto, RLS, client drop-in) senza cambiare i provider AI |

## 5. Deployment

Il kit e' in esercizio sul **VPS dedicato** (`85.235.151.215`): l'immagine
OpenJarvis gira in `aethersy-jarvis`, Caddy in `aethersy-jarvis-caddy` espone
`https://jarvis.aethersy.online` (record A → `85.235.151.215`).

```bash
# VPS dedicato (utente 'deploy' con sudo, alias SSH oppure utente@ip):
JARVIS_PROFILE=public bash scripts/deploy-jarvis.sh deploy@85.235.151.215 "nota del deploy"
```

Sul VPS Aruba resta l'istanza interna (fallback, nessuna porta pubblica):

```bash
bash scripts/deploy-jarvis.sh aethersy-vps "nota del deploy"
```

Lo script copia `jarvis/`, normalizza i fine riga a **LF**, crea
`jarvis/.env` dal modello **solo se assente** (importa le chiavi provider dal
`.env` principale del VPS), ricostruisce l'immagine, rilancia il container e
verifica `/v1/speech/health` con token. Con `JARVIS_PROFILE=public` avvia
anche Caddy.

Variabili d'ambiente:

| Variabile | Dove | Valore |
|---|---|---|
| `OPENJARVIS_API_KEY` | `jarvis/.env` (VPS) | token del server OpenJarvis (obbligatorio per `0.0.0.0`) |
| `JARVIS_API_KEY` | `.env` (VPS, console) | stesso token: il BFF lo invia come `Authorization: Bearer` |
| `JARVIS_BASE_URL` | `.env` (VPS, console) | `https://jarvis.aethersy.online` (VPS dedicato) oppure `http://aethersy-jarvis:8000` (istanza interna su Aruba) |
| `JARVIS_MODEL` | `.env` (VPS, console) | id modello reale del server (es. `nvidia/nemotron-3.5-lightning-30b-a3b`): un alias libero come `jarvis` viene rifiutato |
| `JARVIS_TIMEOUT_MS` | `.env` (VPS, console) | timeout delle chiamate (default 120000) |
| `NIM_API_KEY` | `jarvis/.env` (VPS) | chiave NVIDIA per l'engine `nim` |
| `AETHERSY_API_BASE`, `AETHERSY_EMAIL`, `AETHERSY_PASSWORD` | `jarvis/.env` (VPS) | account con cui i tool di Jarvis leggono la piattaforma |
| `ACME_EMAIL` | `jarvis/.env` (VPS) | contatto per i certificati Let's Encrypt: **obbligatorio**, altrimenti Caddy non parte (`email {$ACME_EMAIL}`) |
| `ADMIN_EMAILS` | `.env` (VPS, console) | lista degli admin esenti dai costi |

Dettagli tecnici della build (verificati in produzione):

- `uv pip install` invece di `uv sync`: il `uv.lock` del fork usa un formato
  piu' recente di uv, il `pyproject` resta la fonte dei vincoli;
- `SETUPTOOLS_SCM_PRETEND_VERSION`: il clone e' shallow e senza tag;
- `OPENJARVIS_HOME=/var/lib/openjarvis`: OpenJarvis rifiuta di scrivere lo stato
  runtime dentro il proprio sorgente;
- script e `Dockerfile` con fine riga **LF** (i CRLF rompono l'entrypoint);
- health check con header `Authorization: Bearer` (il server risponde 401
  anche su `/v1/speech/health`).

Dettagli dell'hardening del VPS dedicato:

- accesso SSH solo con chiave: `PermitRootLogin no`, `PasswordAuthentication no`,
  utente `deploy` con `sudo` **NOPASSWD**;
- `ufw` default-deny con sole porte 22/80/443; `fail2ban` sulla jail `sshd`
  (`maxretry 5`, `bantime 10m`, IP Aruba in `ignoreip`);
- swap 2 GB (`vm.swappiness=10`), `unattended-upgrades` attivo, log Docker
  ruotati (`json-file`, 10 MB x 3).

Backup dello stato locale del server (volume `jarvis_state`: knowledge.db,
tracce, config) con `scripts/backup-jarvis.sh`: cron giornaliero alle 03:17
sul VPS dedicato, 7 copie in `/home/deploy/backups/jarvis/`. Il vault vero e
proprio (memoria markdown del tenant) resta sulla piattaforma e ha il suo
backup.

## 6. Sicurezza

- Segreti solo in `.env` (mai nel repository, mai nell'immagine).
- Il BFF e' l'unico a parlare con la piattaforma: le richieste passano dal
  tenant risolto dal cookie di sessione.
- Le scritture dei tool richiedono `confirm: true`; nessuna cancellazione.
- Il coding agent gira in sandbox (`aethersy/builder-sandbox`) e il deploy
  passa dagli script del repository.
- Il container di Jarvis non pubblica porte: solo Caddy e' raggiungibile.

## 7. Stato

- **In esercizio (VPS dedicato `85.235.151.215`, 13/11/2026)**: stack clonato
  rimosso e VPS riutilizzato da zero per Jarvis; container `aethersy-jarvis`
  healthy (`/v1/speech/health` 200, faster-whisper disponibile), container
  `aethersy-jarvis-caddy` con TLS automatico; accesso SSH con chiave e sudo
  NOPASSWD per `deploy`, root e password disabilitati.
- **Account di servizio**: `jarvis@aethersy.online` creato sulla piattaforma
  (ruolo `MEMBER`, tenant unico): i tool di Jarvis leggono e scrivono la
  memoria con quel tenant. La memoria del chiamante resta iniettata dal BFF
  nel prompt.
- **In esercizio (VPS Aruba, fallback)**: istanza interna del container
  `aethersy-jarvis` sulla rete `aethersy_aethersy`; usata dalla console
  finche' il dominio pubblico non e' operativo.
- **Fatto**: tool e skill, config, Dockerfile, compose, Caddyfile, script di
  deploy, proxy BFF (`/api/platform/jarvis/*`), pagina `/jarvis`, esenzione
  admin e pannello di controllo.
- **Bloccato (azione utente)**: record DNS A `jarvis.aethersy.online` →
  `85.235.151.215` su GoDaddy: senza il record Caddy non puo' emettere il
  certificato e il passaggio della console al dominio pubblico resta sospeso.
- **Verificato in locale**: trascrizione (faster-whisper) e tool-calling
  (NVIDIA) con risposta fedele agli errori reali della piattaforma.
