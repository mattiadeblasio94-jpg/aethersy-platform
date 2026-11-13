# Visione di prodotto — Aethersy con Jarvis

> Documento di riferimento del prodotto. Non e' una specifica tecnica: e' la
> direzione che il prodotto deve avere. Le scelte tecniche stanno in
> `docs/jarvis.md` (assistente), `docs/phases.md` (stato reale) e nel codice.

## 1. Il prodotto e' Jarvis

Aethersy non e' "una piattaforma con un chatbot": e' **un assistente che
dirige la piattaforma**. L'utente non naviga menu: **parla**.

```
Utente (parla o scrive)
        |
        v
Jarvis  ---> ascolta, capisce, pianifica, agisce, risponte con la voce
        |
        +--> dati business reali (Wix, ordini, catalogo, contatti)
        +--> memoria del tenant (vault markdown, stile Obsidian)
        +--> agenti e servizi della piattaforma (Activepieces/MCP)
        +--> coding agent (opencode): progetti, contenuti, deploy
        +--> altri utenti registrati: ognuno con il proprio tenant
```

Jarvis e' il punto d'ingresso unico: dopo averlo usato, l'utente non deve
ricordare dove sono le funzioni. La UI resta (per chi preferisce leggere
tabelle e report), ma e' il*piano di controllo* di Jarvis, non il contrario.

**Requisiti non negoziabili del prodotto:**

- Nessuna risposta numerica inventata: ogni dato arriva da una API reale.
- Ogni azione distruttiva richiede conferma esplicita.
- Ogni consumo di provider e' attribuito all'utente che lo ha generato.
- L'admin non viene addebitato, ma i costi reali restano visibili.

## 2. Memoria costruttiva (il modello Obsidian)

La memoria della piattaforma e' un **vault di file markdown** del tenant, non
una tabella di note etichettate:

- ogni voce ha un **percorso** nel vault (`Progetti/Aethersy/launch.md`);
- i contenuti si collegano con **wiki link** (`[[NomeCliente]]`), che il
  backend estrae e risolve in un grafo;
- il vault e' **portabile**: si esporta, si versiona, si legge con qualsiasi
  editor (Obsidian, VS Code, un repo git);
- Jarvis scrive nel vault cio' che apprende (vincoli, preferenze, decisioni)
  e lo rilegge invece di reinventarlo.

Perche' questo modello: e' **leggibile dall'umano**, **versionabile**,
**senza lock-in** e **componibile** (un agente di codice puo' modificare gli
stessi file che legge l'utente).

Implementazione: `business.memory` con `path` e `links`, API
`/api/platform/memory`, `/api/platform/memory/graph`, `/api/platform/memory/vault`,
tool Jarvis `aethersy_memory`.

## 3. Il coding agent, senza codice

La piattaforma ha **un proprio coding agent** che l'utente lancia parlando:

- "Fammi un'app per gestire le ferie del team" → l'agente capisce l'entita',
  propone lo schema dati, genera backend + frontend, testa e propone il deploy;
- "Aggiungi una sezione alla guida passo-passo" → l'agente modifica i file
  giusti, aggiorna la documentazione e prepara la commit;
- il lavoro passa dal tool Jarvis `aethersy_change` (che delega a `opencode`
  dentro una sandbox), mai con comandi shell diretti dal modello.

Vincoli: nessun segreto nel repository, deploy solo tramite gli script del
repository, ogni fase chiusa da test e documentata in `docs/phases.md`.

## 4. Contabilita' per utente, admin esente

Ogni servizio usato (testo, generazioni, TTS, orchestrazione, storage) ha un
costo provider reale. La piattaforma lo registra **per utente**:

- `metering.usage_event` riceve `user_email`: chi ha fatto la richiesta;
- il credito viene addebitato al tenant dell'utente secondo il listino;
- **gli admin sono esenti**: il consumo resta registrato (costo reale visibile
  nel pannello) ma i crediti non vengono scalati e i blocchi per saldo non
  valgono (`ADMIN_EMAILS`, oppure `plan = 'admin'` sul tenant).

Il pannello di controllo mostra: richieste, ricavo addebitato, costo provider,
margine, consumi per provider e per capacita', costi per utente, saldi e ultimi
eventi.

## 5. Pannello di controllo

Un'unica pagina (`/admin`) per l'amministratore:

| Blocchetto | Contenuto |
|---|---|
| KPI | richieste 30gg, ricavo, costo provider, margine, crediti in circolazione, tenant, utenti |
| Provider | richieste, costo reale, ricavo, crediti per provider |
| Capacita' | testo, generazione, TTS, orchestrazione: dove vanno i consumi |
| Utenti | costo e richieste per utente |
| Tenant | attivita', ricavo, saldo crediti |
| Eventi | ultimi consumi con utente, modello, costo e addebitato |

## 6. Cosa resta da costruire

| Fase | Oggetto | Stato |
|---|---|---|
| 35 | Esenzione admin, costi per utente, pannello, memoria vault, proxy Jarvis, fix Wix | **in corso** |
| 36 | VPS dedicato di Jarvis: deploy reale (serve accesso SSH al VPS) | bloccata su credenziali |
| 37 | Frontend Jarvis (Tauri) e integrazione voce nella UI di produzione | da fare |
| 38 | Coding agent: generazione progetti con dati persistenti (skill `self-hosted-backend`) | da fare |
| 39 | Jarvis multi-tenant: ogni utente registrato con il proprio vault, le propri licenze e il proprio budget | da fare |
| 40 | Bilingue: il prodotto parla la lingua dell'utente | da fare |

## 7. Cosa non facciamo

- Non introduciamo Ollama: si usano i provider gia' configurati (NVIDIA,
  z.ai, OpenRouter, Venice, fal.ai, Replicate).
- Non cambiamo i provider AI per adattarci a progetti esterni: si adattano i
  progetti ai provider gia' in uso.
- Non vendiamo "funzionalita' finte": ogni pulsante della UI ha un endpoint
  reale dietro, o non esiste.
