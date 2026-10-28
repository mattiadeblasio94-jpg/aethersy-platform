# aethersy-infra

Infrastruttura self-hosted per **aethersy**: [Activepieces](https://www.activepieces.com/) brandizzato, su un VPS Aruba (Ubuntu 24.04), con TLS automatico, Postgres + Redis, worker separato, provider AI **OpenRouter** (primario) / **Venice.ai**, endpoint **MCP** su un hostname dedicato e la **Aethersy Console** (frontend proprietario + BFF con AI Router).

Specifica operativa completa: [`AGENTS.md`](AGENTS.md). Stato e log delle fasi: [`docs/phases.md`](docs/phases.md).

## Domini

| Dominio | Servizio | Note |
|---|---|---|
| `app.aethersy.online` | Activepieces (UI + API + webhook + consent MCP) | engine/admin/fallback |
| `mcp.aethersy.online` | Endpoint MCP (OAuth) | hostname dedicato, ≠ `AP_FRONTEND_URL` |
| `console.aethersy.online` | Aethersy Console (SPA + BFF) | app proprietaria brandizzata |
| `aethersy.online` + `www` | Redirect 301 → `app.` | apex |

## Architettura

```
Internet ──▶ ufw (22/80/443) ──▶ caddy (TLS) ──┬─▶ app.aethersy.online ─┐
                                               ├─▶ mcp.aethersy.online ─┤
                                               └─▶ console.aethersy.online
                                                                        ▼
                                                app:80 (UI + API + MCP) ─┬─▶ postgres
                                                                        └─▶ redis ◀─ worker
                                                     console:3000 ◀─ (BFF: /api/ap/* → app)
                                                                                       │
                                                             api.openrouter.ai ◀───────┤
                                                              api.venice.ai ◀──────────┘
```

- **caddy** — unico ingresso pubblico, TLS Let's Encrypt, route MCP e Console dedicate.
- **app** — UI, API REST, webhook, endpoint MCP (porta interna `80`; host `127.0.0.1:8080`).
- **worker** — esecuzione dei flow (`AP_CONTAINER_TYPE=WORKER`), mai esposto.
- **console** — SPA React + BFF Fastify (`:3000`, non pubblicata: passa da Caddy); sessione httpOnly firmata, proxy `/api/ap/*` verso `app` e AI Router.
- **postgres** — `pgvector/pgvector:0.8.0-pg14`, solo rete interna.
- **redis** — `redis:7.0.7` con `requirepass` e appendonly, solo rete interna.

## Struttura

```
.
├── AGENTS.md              # specifica operativa (leggere prima)
├── docker-compose.yml     # stack (caddy, app, worker, postgres, redis, console)
├── .env.example           # template variabili (copiare in .env)
├── caddy/Caddyfile        # reverse proxy + TLS + route MCP + Console
├── branding/              # tema e asset Aethersy (bind-mount read-only)
│   ├── theme.js           # defaultTheme patchato (nome/colori/loghi)
│   └── web/               # logo.svg, favicon.ico, logo-*.png, brand/, brand/aethersy.css
├── console/               # Aethersy Console (web React + server Fastify BFF)
├── scripts/
│   ├── 00-bootstrap.sh    # pacchetti base, timezone, swap, Docker
│   ├── 01-hardening.sh    # utente deploy, SSH, ufw, fail2ban
│   ├── 02-dns-check.sh    # verifica record A dei sottodomini
│   ├── 03-deploy.sh       # valida .env e avvia lo stack (+ branding)
│   ├── 04-smoke-test.sh   # health check end-to-end
│   ├── 05-branding.sh     # patch version-aware di index.html (titolo/favicon/css)
│   ├── 06-slack-*.sh      # notify / alert cron / flow Slack
│   ├── gen_brand_assets.py# genera gli asset trasparenti dal logo sorgente
│   └── backup.sh          # dump Postgres + Redis, rotazione
└── docs/
    ├── runbook.md         # operazioni quotidiane, update, rollback
    ├── security.md        # modello di minaccia + hardening + rotazione credenziali
    ├── phases.md          # log delle fasi + verifica §11
    ├── restore.md         # procedura di ripristino (testata)
    ├── agents.md          # roster droid + guida alla delega
    └── delivery-report.md # report finale di consegna (§13 AGENTS.md)
```

## Quickstart

### Sul VPS (una sola volta)

```bash
# 1. Bootstrap del sistema (come root)
sudo ./scripts/00-bootstrap.sh

# 2. Hardening: utente deploy, SSH, firewall, fail2ban
sudo ./scripts/01-hardening.sh "ssh-ed25519 AAAA... utente@macchina"
#    -> da un'altra shell verifica `ssh deploy@<IP>` PRIMA di chiudere questa

# 3. DNS: i record A di app./mcp./console. devono puntare all'IP del VPS
./scripts/02-dns-check.sh <IP_VPS>
```

### Deploy dello stack

```bash
git clone <repo> aethersy-infra && cd aethersy-infra
cp .env.example .env
# Genera i segreti e compila .env
openssl rand -hex 16   # -> AP_ENCRYPTION_KEY
openssl rand -hex 32   # -> AP_JWT_SECRET, AP_POSTGRES_PASSWORD, AP_REDIS_PASSWORD, CONSOLE_SESSION_SECRET
nano .env
chmod 600 .env

./scripts/03-deploy.sh
./scripts/04-smoke-test.sh
```

Primo accesso: apri `https://app.aethersy.online` e crea l'account admin, poi chiudi le registrazioni pubbliche (vedi `docs/runbook.md` §6). La **Aethersy Console** è su `https://console.aethersy.online` (usa le credenziali Activepieces).

### Aggiornamento versione

```bash
./scripts/backup.sh          # sempre prima
# modifica AP_VERSION in .env
docker compose pull && docker compose up -d
./scripts/05-branding.sh     # ripatcha index.html (titolo/favicon/css) dopo il pull
./scripts/04-smoke-test.sh
```

> Dopo **qualsiasi** modifica a `caddy/Caddyfile` o alle env di Caddy serve `docker compose up -d --force-recreate caddy` (bind-mount di singolo file: l'inode cambia e `reload` non basta).

## Comandi operativi

| Azione | Comando |
|---|---|
| Stato | `docker compose ps` |
| Log app | `docker compose logs -f app` |
| Log worker | `docker compose logs -f worker` |
| Riavvio | `docker compose restart app worker` |
| Stop | `docker compose stop` |
| Update | cambia `AP_VERSION` → `docker compose pull && docker compose up -d` |
| Backup | `./scripts/backup.sh` |
| Restore | `docs/restore.md` |
| Smoke test | `./scripts/04-smoke-test.sh` |

> **Mai** `docker compose down -v`: cancella i volumi (database e Redis).

## Sicurezza in breve

- Zero segreti nel repo: tutto in `.env` (git-ignorato).
- Solo 22/80/443 pubblici; Postgres, Redis e worker solo rete interna.
- SSH a chiave, root disabilitato, fail2ban attivo, ufw default-deny.
- `AP_ENCRYPTION_KEY` e `AP_JWT_SECRET`: **salvati offline**. Se perdi `AP_ENCRYPTION_KEY`, le credenziali dei flow sono irrecuperabili.

Dettagli in [`docs/security.md`](docs/security.md).

## Stato attuale

**Tutte le fasi sono `DONE`** (0–11) e verificate live sul VPS. Lo stack gira su `https://app.aethersy.online`, `https://mcp.aethersy.online` e `https://console.aethersy.online` con TLS Let's Encrypt valido.

- **Activepieces** (Fase 3–5): stack healthy, provider **OpenRouter** attivo (464 modelli), flow "Ask AI" verificato end-to-end (output `PONG`).
- **MCP** (Fase 7): handshake OAuth completo con client reale → **42 tool**; consent su `app.` (fix Caddy `X-Forwarded-Host`).
- **Branding** (Fase 8): nome/logo/palette **Aethersy** applicati (patch `theme.js` + design token CSS); verificati live.
- **Backup** (Fase 9): `backup.sh` con rotazione; **restore testato** su DB temporaneo.
- **Consegna** (Fase 10): clean-clone verificato (repo + `.env` → `docker compose config`/build OK).
- **Aethersy Console** (Fase 11): SPA + BFF con sessione httpOnly e **AI Router** multimodale (modelli gratuiti OpenRouter per testo/immagine/audio/video).

Restano **solo azioni utente** (non automatizzabili): la rotazione delle credenziali esposte in chat (P0–P2) e il backup offline di `AP_ENCRYPTION_KEY` + `AP_JWT_SECRET`. Dettagli in [`docs/security.md`](docs/security.md) §6.1/§8 e riepilogo in [`docs/delivery-report.md`](docs/delivery-report.md).

Provider AI: configurati a runtime in **Platform Admin → AI Center → Providers** (Activepieces non li legge da env). La stessa `OPENROUTER_API_KEY` è consumata dalla Console per il suo AI Router.
