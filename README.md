# aethersy-infra

Infrastruttura self-hosted per **aethersy**: [Activepieces](https://www.activepieces.com/) brandizzato, su un VPS Aruba (Ubuntu 24.04), con TLS automatico, Postgres + Redis, worker separato, provider AI **OpenRouter** (primario) / **Venice.ai** ed endpoint **MCP** su un hostname dedicato.

Specifica operativa completa: [`AGENTS.md`](AGENTS.md).

## Architettura

```
Internet ──▶ ufw (22/80/443) ──▶ caddy (TLS) ──┬─▶ app.aethersy.com ─┐
                                               └─▶ mcp.aethersy.com ─┤
                                                                     ▼
                                            app:80 (UI + API + MCP) ─┬─▶ postgres
                                                                    └─▶ redis ◀─ worker
                                                                                   │
                                                       api.openrouter.ai ◀─────────┤
                                                        api.venice.ai ◀────────────┘
```

- **caddy** — unico ingresso pubblico, TLS Let's Encrypt, route MCP dedicate.
- **app** — UI, API REST, webhook, endpoint MCP (porta interna `80`; host `127.0.0.1:8080`).
- **worker** — esecuzione dei flow (`AP_CONTAINER_TYPE=WORKER`), mai esposto.
- **postgres** — `pgvector/pgvector:0.8.0-pg14`, solo rete interna.
- **redis** — `redis:7.0.7` con `requirepass` e appendonly, solo rete interna.

## Struttura

```
.
├── AGENTS.md              # specifica operativa (leggere prima)
├── docker-compose.yml     # stack (caddy, app, worker, postgres, redis)
├── .env.example           # template variabili (copiare in .env)
├── caddy/Caddyfile        # reverse proxy + TLS + route MCP
├── scripts/
│   ├── 00-bootstrap.sh    # pacchetti base, timezone, swap, Docker
│   ├── 01-hardening.sh    # utente deploy, SSH, ufw, fail2ban
│   ├── 02-dns-check.sh    # verifica record A dei sottodomini
│   ├── 03-deploy.sh       # valida .env e avvia lo stack
│   ├── 04-smoke-test.sh   # health check end-to-end
│   └── backup.sh          # dump Postgres + Redis, rotazione
└── docs/
    ├── runbook.md         # operazioni quotidiane, update, rollback
    ├── security.md        # modello di minaccia + hardening
    ├── phases.md          # log delle fasi + verifica §11
    └── restore.md         # procedura di ripristino
```

## Quickstart

### Sul VPS (una sola volta)

```bash
# 1. Bootstrap del sistema (come root)
sudo ./scripts/00-bootstrap.sh

# 2. Hardening: utente deploy, SSH, firewall, fail2ban
sudo ./scripts/01-hardening.sh "ssh-ed25519 AAAA... utente@macchina"
#    -> da un'altra shell verifica `ssh deploy@<IP>` PRIMA di chiudere questa

# 3. DNS: i record A di app./mcp. devono puntare all'IP del VPS
./scripts/02-dns-check.sh <IP_VPS>
```

### Deploy dello stack

```bash
git clone <repo> aethersy-infra && cd aethersy-infra
cp .env.example .env
# Genera i segreti e compila .env
openssl rand -hex 16   # -> AP_ENCRYPTION_KEY
openssl rand -hex 32   # -> AP_JWT_SECRET, AP_POSTGRES_PASSWORD, AP_REDIS_PASSWORD
nano .env
chmod 600 .env

./scripts/03-deploy.sh
./scripts/04-smoke-test.sh
```

Primo accesso: apri `https://app.aethersy.com` e crea l'account admin, poi chiudi le registrazioni pubbliche (vedi `docs/runbook.md` §6).

### Aggiornamento versione

```bash
./scripts/backup.sh          # sempre prima
# modifica AP_VERSION in .env
docker compose pull && docker compose up -d
./scripts/04-smoke-test.sh
```

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

Lo scaffolding locale è completo e verificato contro le doc ufficiali (vedi `docs/phases.md` → "Verifica §11"). Le fasi che richiedono il VPS sono **bloccate** in attesa degli input elencati in `AGENTS.md` §6 (IP del VPS, accesso SSH, chiavi provider AI, email TLS, webhook Slack, accesso DNS).

Provider AI: configurati a runtime in **Platform Admin → AI Center → Providers** (Activepieces non li legge da env). Chiavi testate il 27/10/2026: OpenRouter funzionante; Venice valida ma senza credito. Dettagli in `docs/runbook.md` §6.1.
