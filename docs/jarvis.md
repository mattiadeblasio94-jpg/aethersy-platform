# Jarvis — architettura e deployment

> Documento tecnico dell'assistente. La visione di prodotto e' in
> `docs/product-vision.md`; lo stato di esecuzione in `docs/phases.md`.

## 1. Dove vive

| Componente | Dove | Note |
|---|---|---|
| Server OpenJarvis (chat + STT) | VPS dedicato (`85.235.151.215`, in attesa di accesso SSH) | container `aethersy-jarvis` |
| Reverse proxy / TLS | Caddy sullo stesso VPS | `jarvis.aethersy.online` |
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

```bash
# Sul VPS dedicato (utente con sudo):
#   - .env compilato (NVIDIA/z.ai/OpenRouter, credenziali piattaforma)
#   - record DNS di jarvis.aethersy.online -> IP del VPS
bash scripts/deploy-jarvis.sh jarvis-vps "nota del deploy"
```

Lo script copia `jarvis/` e il repository, crea `.env` dal modello solo se
assente, ricostruisce l'immagine, rilancia i container e verifica
`/v1/speech/health`.

Sul VPS Aruba (piattaforma), per abilitare la sezione Jarvis:

```
ADMIN_EMAILS=mattiadeblasio94@gmail.com
JARVIS_BASE_URL=https://jarvis.aethersy.online
JARVIS_API_KEY=<token opzionale>
```

## 6. Sicurezza

- Segreti solo in `.env` (mai nel repository, mai nell'immagine).
- Il BFF e' l'unico a parlare con la piattaforma: le richieste passano dal
  tenant risolto dal cookie di sessione.
- Le scritture dei tool richiedono `confirm: true`; nessuna cancellazione.
- Il coding agent gira in sandbox (`aethersy/builder-sandbox`) e il deploy
  passa dagli script del repository.
- Il container di Jarvis non pubblica porte: solo Caddy e' raggiungibile.

## 7. Stato

- **Fatto (locale)**: tool e skill, config, Dockerfile, compose, Caddyfile,
  script di deploy, proxy BFF (`/api/platform/jarvis/*`), pagina `/jarvis`,
  esenzione admin e pannello di controllo.
- **Bloccato**: deploy sul VPS dedicato (mancano credenziali SSH) e quindi
  l'uso reale di Jarvis in produzione.
- **Verificato in locale**: trascrizione (faster-whisper) e tool-calling
  (NVIDIA) con risposta fedele agli errori reali della piattaforma.
