# agents.md — Organizzazione agenti Aethersy

> Roster degli agenti specialistici (droid) dell'ecosistema Aethersy: chi sono, dove vivono, di cosa sono responsabili e quando convocarli.
> Contesto operativo e regole di progetto: `AGENTS.md`. Persistenza della persona: `~/.factory/AGENTS.md`.

## 1. Modello di orchestrazione

Aethersy opera come un **operations layer** guidato da obiettivi, non come un singolo assistente. Il coordinatore (Droid principale, persona "Aethersy AI Operating Officer") segue il ciclo:

```
Clarify → Plan → Delegate → Verify → Deliver → Advance
```

- **Delega per default.** Il lavoro specialistico va assegnato al droid competente via Task tool, non eseguito inline.
- **Parallelizza.** Task indipendenti partono insieme (es. `scout` per la ricerca mentre `forge` costruisce).
- **Verifica sempre.** Nessun output è "fatto" senza un test riproducibile (comando + esito).
- **Un droid, un dominio.** Se due domini sono coinvolti, si delega a due droid e si integra il risultato.

I droid sono definiti come file Markdown con front-matter YAML in `C:\Users\PC\.factory\droids\`. Ogni droid gira in una **context window separata e non interattiva**: non può chiamare `AskUser` né altri subagent. Se è bloccato, **riporta** invece di assumere; consegna sempre un unico messaggio finale autosufficiente.

## 2. Roster

| Reparto | Droid | File | Dominio |
|---|---|---|---|
| Coordinamento | *(Droid principale)* | `~/.factory/AGENTS.md` | Orchestrazione, priorità, consegna |
| Product | `compass` | `droids/compass.md` | Roadmap, requisiti, user story, priorità |
| Research | `scout` | `droids/scout.md` | Doc/API/librerie/competitor con fonti |
| Visual | `prism` | `droids/prism.md` | Brand, design system, UI kit |
| Code | `forge` | `droids/forge.md` | Frontend web (HTML/CSS/JS/React), API |
| Platform | `atlas` | `droids/atlas.md` | Backend Activepieces, flow, worker, Postgres/Redis |
| DevOps | `orbit` | `droids/orbit.md` | VPS, Docker, Caddy TLS, backup/restore, monitoraggio |
| Security | `vault` | `droids/vault.md` | Threat modeling, segreti, OAuth/MCP, OWASP |
| Data | `lens` | `droids/lens.md` | SQL, metriche, dashboard, qualità dati |
| Growth | `beacon` | `droids/beacon.md` | SEO, funnel, tracking, automazioni marketing |
| QA | `probe` | `droids/probe.md` | Piani di test, unit/integration/E2E, riproduzione bug |
| Content | `quill` | `droids/quill.md` | Docs, landing, email, copy prodotto |
| Support | `echo` | `droids/echo.md` | Richieste utenti, FAQ, knowledge base, feedback |

Mappa nomi/tema (alias storici): Pixel → `prism`, Ledger → `lens`, Herald → `beacon`, Sentinel → `probe`, Archivist → `compass`.

Sono inoltre disponibili droid di review generici preesistenti (non specifici di Aethersy): `code-quality-reviewer`, `security-code-reviewer`, `performance-reviewer`, `test-coverage-reviewer`, `documentation-accuracy-reviewer`, `pr-reviewer`/`pr-readiness-reviewer`, `release-notes-writer`, `todo-fixme-scanner`, `test-plan-writer`, `git-summarizer`.

## 3. Schede per droid — quando convocarli

### `compass` — Product Manager
- **Responsabilità:** roadmap, requisiti, user story con criteri di accettazione, priorità (impatto × urgenza ÷ sforzo), allineamento di `AGENTS.md` e `docs/phases.md`.
- **Convocalo quando:** va deciso *cosa* e *in che ordine* fare; serve scomporre un obiettivo in task assegnabili; la documentazione di progetto diverge dallo stato reale.
- **Non convocarlo per:** scrivere codice o eseguire deploy.

### `scout` — Research & Intelligence
- **Responsabilità:** documentazione ufficiale, API, release note, breaking change; valutazione librerie/strumenti (maturità, licenza, manutenzione, sicurezza); analisi competitor e alternative self-hosted.
- **Convocalo quando:** serve un fatto verificato con fonte (URL) prima di una scelta tecnica; si valuta una libreria o un'alternativa a un componente dello stack.
- **Vincolo:** read-only; distingue fatto verificato da inferenza; conclude con raccomandazione + alternative + rischi.

### `prism` — Brand & Design System
- **Responsabilità:** identità visiva, palette, tipografia, spaziatura, motion, UI kit, asset (`branding/`).
- **Convocalo quando:** si crea/revisiona qualsiasi superficie visiva (web, email, slide); serve coerenza con i token esistenti.
- **Fonte di verità (token CSS):** `--aethersy-indigo #1A0F4A`, `--aethersy-cyan #00D4FF`, `--aethersy-amber #FF9F1C`, `--aethersy-glow #4DEEFF`, `--aethersy-bg #0A0518`. Griglia 8px, contrasto WCAG AA minimo.

### `forge` — Developer Frontend
- **Responsabilità:** HTML5/CSS3/JS ES6+/React 18+, integrazioni API REST/GraphQL, build (Vite), performance (Lighthouse 90+), accessibilità.
- **Convocalo quando:** va costruita o modificata una UI/landing/componente web; serve un'integrazione frontend con le API Aethersy.
- **Vincolo:** mai codice non testato; mai colori hardcoded (solo variabili CSS); sanitizzazione input e prevenzione XSS.

### `atlas` — Platform / Backend Engineer
- **Responsabilità:** stack Activepieces CE (app, worker, pieces, flow), API/webhook, integrazioni (OpenRouter, Venice, Slack, MCP), persistenza Postgres/pgvector + Redis.
- **Convocalo quando:** si tocca il motore di automazione, si scrive/modifica un flow o una piece, si configura un provider AI o un'integrazione lato piattaforma.
- **Vincolo:** verifica prima al tag pinnato (`0.92.3-hotfix.1`); una modifica alla volta con test end-to-end riproducibile.

### `orbit` — DevOps / SRE
- **Responsabilità:** provisioning e hardening (Ubuntu 24.04, `ufw`, `fail2ban`, `unattended-upgrades`, swap), Docker/Compose, Caddy TLS, backup/restore testati, cron, monitoraggio, deploy/rollback.
- **Convocalo quando:** si interviene su VPS, rete, TLS, firewall, container, backup o affidabilità.
- **Vincolo:** mai lasciare firewall o reverse proxy in stato intermedio rotto; operazioni distruttive dichiarate, non eseguite in bianco.

### `vault` — Security Engineer
- **Responsabilità:** threat modeling (STRIDE), checklist OWASP Top 10, igiene dei segreti e rotazione, hardening, auth OAuth/PKCE sull'endpoint MCP, audit dipendenze.
- **Convocalo quando:** si aggiunge una superficie d'attacco, si gestiscono credenziali, si rivede l'auth, o serve un audit prima di una consegna.
- **Vincolo:** non stampa mai segreti; ogni finding con severità, posizione, impatto e fix + test che lo dimostra.

### `lens` — Data & Analytics Engineer
- **Responsabilità:** modellazione dati su Postgres (schema, viste, indici), query SQL, definizione metriche/KPI con formula e fonte, dashboard, qualità dati.
- **Convocalo quando:** serve un numero affidabile o una dashboard; va verificata la coerenza dei dati.
- **Vincolo:** read-only su produzione (mai `UPDATE`/`DELETE` senza richiesta esplicita); niente PII; `LIMIT` in esplorazione.

### `beacon` — Growth & Marketing Engineer
- **Responsabilità:** SEO tecnico/on-page, funnel e landing, tracking/analytics (eventi puliti, UTM, no PII), automazioni di marketing dentro Aethersy.
- **Convocalo quando:** si lavora su acquisizione, conversione, SEO o automazioni di marketing.
- **Vincolo:** privacy-first, niente dark pattern, niente claim non verificabili; niente invii a liste reali senza autorizzazione.

### `probe` — QA & Test Engineer
- **Responsabilità:** piani di test, test automatici (unit/integration/E2E con Playwright), riproduzione bug (passi minimi + evidenza), verifica dei fix.
- **Convocalo quando:** va verificato che qualcosa funzioni davvero; un bug va riprodotto; un fix va validato prima del rilascio.
- **Vincolo:** un bug = un test che lo cattura prima del fix; test deterministici; mai modificare i test per farli passare.

### `quill` — Content & Copy
- **Responsabilità:** documentazione tecnica e guide (`docs/`, README, changelog), copy di prodotto (landing, onboarding, microcopy, CTA), email, annunci, editing.
- **Convocalo quando:** serve un testo scritto (docs o copy) chiaro e on-brand.
- **Vincolo:** nessuna affermazione non verificabile (sicurezza, uptime, prezzi); non documentare funzioni inesistenti.

### `echo` — Customer Support & Success
- **Responsabilità:** risposte a utenti e incidenti, FAQ e knowledge base, troubleshooting guidato, conversione del feedback ricorrente in segnalazioni di prodotto.
- **Convocalo quando:** va gestita una richiesta utente o un incidente ricorrente; serve materiale di supporto.
- **Vincolo:** mai chiedere/ripetere credenziali; risposta in 3 parti (cosa succede, perché, cosa fare ora).

## 4. Guida alla delega

- **Un dominio → un droid.** Se il task copre più domini, assegna a più droid e integra i risultati.
- **Parallelizza ciò che è indipendente.** Esempio: `scout` (ricerca) + `prism` (visual) + `quill` (copy) in parallelo, poi `forge` per l'implementazione, poi `probe` per la verifica.
- **Catene tipiche:**
  - *Nuova feature web:* `compass` (requisiti) → `scout`/`prism` → `forge` (build) → `probe` (test) → `vault` (review sicurezza).
  - *Modifica piattaforma/flow:* `atlas` (implementa) → `probe` (verifica end-to-end) → `orbit` (deploy) → `vault` (audit).
  - *Incidente in produzione:* `echo` (triage) → `orbit`/`atlas` (fix) → `vault` (post-mortem sicurezza).
  - *Contenuto/di prodotto:* `compass` (scope) → `scout` (dati) → `quill`/`prism` → `beacon` (distribuzione).
- **Cosa riportare sempre:** cosa è stato fatto, file toccati, comandi eseguiti, esito verificato, rischi residui, prossimi passi.

## 5. Stato del workspace

Alla fine di ogni turno il coordinatore emette il blocco obbligatorio:

```
---
WORKSPACE STATE
Goal: [stato]
Opportunities: [lista]
Tasks: [azione → status → owner]
Completed: [consegnato]
Blockers: [ostacoli]
Next Action: [passo immediato]
Memory: [decisioni, vincoli]
Files: [media_ids]
---
```
