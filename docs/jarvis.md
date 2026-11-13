# Jarvis — architettura e deployment

> Documento tecnico dell'assistente. La visione di prodotto e' in
> `docs/product-vision.md`; lo stato di esecuzione in `docs/phases.md`.

## 1. Dove vive

| Componente | Dove | Note |
|---|---|---|
| Server OpenJarvis (chat + STT) | **VPS Aruba `195.231.79.221`** (container `aethersy-jarvis`) | VPS dedicato `85.235.151.215` ancora senza accesso SSH: resta la destinazione per l'esposizione pubblica |
| Reverse proxy / TLS | profilo `public` del compose (Caddy) | oggi non attivo: la console parla a Jarvis sulla rete Docker interna |
| API piattaforma (BFF) | VPS Aruba `195.231.79.221` | `console/server` |
| UI piattaforma | VPS Aruba | `platform` (pagina `/jarvis`) |
| Tool e skill Jarvis | versionati in `jarvis/` di questo repository | copiati nel container |

La piattaforma **non ospita** il modello: chiama Jarvis via API
OpenAI-compatibile. Jarvis richiama la piattaforma con i suoi tool.

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

Il kit e' gia' in esercizio sul VPS Aruba, sulla stessa rete Docker della
piattaforma: la console chiama `http://aethersy-jarvis:8000` (nessuna porta
pubblica, nessun DNS aggiuntivo).

```bash
# VPS Aruba (alias SSH in ~/.ssh/config):
bash scripts/deploy-jarvis.sh aethersy-vps "nota del deploy"
```

Lo script copia `jarvis/`, crea `jarvis/.env` dal modello **solo se assente**
(importa le chiavi provider dal `.env` principale del VPS), ricostruisce
l'immagine, rilancia il container e verifica `/v1/speech/health` con token.

Variabili d'ambiente:

| Variabile | Dove | Valore |
|---|---|---|
| `OPENJARVIS_API_KEY` | `jarvis/.env` (VPS) | token del server OpenJarvis (obbligatorio per `0.0.0.0`) |
| `JARVIS_API_KEY` | `.env` (VPS, console) | stesso token: il BFF lo invia come `Authorization: Bearer` |
| `JARVIS_BASE_URL` | `.env` (VPS, console) | `http://aethersy-jarvis:8000` (oppure `https://jarvis.aethersy.online` quando il dominio sara' attivo) |
| `JARVIS_MODEL` | `.env` (VPS, console) | id modello reale del server (es. `nvidia/nemotron-3.5-lightning-30b-a3b`): un alias libero come `jarvis` viene rifiutato |
| `JARVIS_TIMEOUT_MS` | `.env` (VPS, console) | timeout delle chiamate (default 120000) |
| `NIM_API_KEY` | `jarvis/.env` (VPS) | chiave NVIDIA per l'engine `nim` |
| `AETHERSY_API_BASE`, `AETHERSY_EMAIL`, `AETHERSY_PASSWORD` | `jarvis/.env` (VPS) | account con cui i tool di Jarvis leggono la piattaforma |
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

Per l'esposizione pubblica (VPS dedicato):

```bash
bash scripts/deploy-jarvis.sh <host> "nota"      # build + avvio
docker compose -f jarvis/docker-compose.jarvis.yml --profile public up -d caddy
```

e nel `.env` della piattaforma: `JARVIS_BASE_URL=https://jarvis.aethersy.online`.

## 6. Sicurezza

- Segreti solo in `.env` (mai nel repository, mai nell'immagine).
- Il BFF e' l'unico a parlare con la piattaforma: le richieste passano dal
  tenant risolto dal cookie di sessione.
- Le scritture dei tool richiedono `confirm: true`; nessuna cancellazione.
- Il coding agent gira in sandbox (`aethersy/builder-sandbox`) e il deploy
  passa dagli script del repository.
- Il container di Jarvis non pubblica porte: solo Caddy e' raggiungibile.

## 7. Stato

- **In esercizio (VPS Aruba, 13/11/2026)**: container `aethersy-jarvis` sulla
  rete `aethersy_aethersy`; `/v1/speech/health` risponde 200 (STT
  faster-whisper disponibile); la piattaforma vede "Jarvis online" nella UI
  `/jarvis`; chat reale verificata end-to-end (browser -> console -> Jarvis ->
  NVIDIA NIM -> risposta), con la memoria del tenant iniettata nel prompt e il
  tool `aethersy_memory` funzionante dentro il container.
- **Fatto**: tool e skill, config, Dockerfile, compose, Caddyfile, script di
  deploy, proxy BFF (`/api/platform/jarvis/*`), pagina `/jarvis`, esenzione
  admin e pannello di controllo.
- **Limite noto**: i tool di Jarvis usano un **account di servizio**
  (`AETHERSY_EMAIL`/`AETHERSY_PASSWORD`), quindi leggono la memoria di quel
  tenant; la memoria del chiamante e' comunque iniettata dal BFF nel prompt.
  Per un uso multi-tenant completo serve un account di servizio dedicato (o la
  sessione del chiamante inoltrata a Jarvis).
- **Bloccato**: deploy sul VPS dedicato `85.235.151.215` (mancano credenziali
  SSH) e quindi l'esposizione pubblica `jarvis.aethersy.online`.
- **Verificato in locale**: trascrizione (faster-whisper) e tool-calling
  (NVIDIA) con risposta fedele agli errori reali della piattaforma.
