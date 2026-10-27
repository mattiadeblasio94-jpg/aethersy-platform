# security.md — Modello di minaccia e hardening

> Riferimento per la checklist di §9 di `AGENTS.md`.
> Stato: documento redatto in fase di scaffolding; le voci "verificato" vanno
> spuntate **solo** dopo esecuzione sul VPS (attualmente `BLOCKED: input #1/#2`).

## 1. Modello di minaccia (sintesi)

| Minaccia | Superficie | Mitigazione |
|---|---|---|
| Accesso SSH non autorizzato | porta 22 | solo chiavi ed25519, `PasswordAuthentication no`, `PermitRootLogin no`, fail2ban |
| Esposizione DB/cache | Postgres, Redis | nessuna porta pubblicata; solo rete Docker `aethersy` |
| Intercettazione traffico | 80/443 | TLS automatico Caddy, redirect HTTP→HTTPS |
| Furto di segreti dal repo | repo git | `.env` git-ignorato; solo `${VAR}` nel compose |
| Furto di segreti dal VPS | filesystem | `.env` 600 owner `deploy`; segreti critici salvati offline |
| Signup pubblico indesiderato | UI | chiusura registrazioni da Platform Admin (+ Turnstile/ZeroBounce) |
| Escalation via codice dei flow | esecuzione flow | `AP_EXECUTION_MODE`; vedi §5 |
| SSRF / accesso a reti interne dai flow | egress codice utente | `AP_NETWORK_MODE=STRICT` (+ `AP_SSRF_ALLOW_LIST`); vedi §5.2 |
| Escalation via Docker socket | host | nessun container con `network_mode: host`, nessun mount di `/var/run/docker.sock` |
| Esaurimento disco per i log | host | log driver `json-file` con `max-size=10m`, `max-file=5` |

## 2. Superficie di rete

- **Pubblico:** solo Caddy su 80 e 443. SSH su 22.
- **Interno Docker (bridge `aethersy`):** `app`, `worker`, `postgres`, `redis`.
- **Host loopback:** `127.0.0.1:${AP_HOST_PORT}` → app, usato solo per gli health check locali.
- Postgres e Redis **non** hanno `ports:`. Il worker **non** ha `ports:`.

Verifica sul VPS:

```bash
sudo ss -tlnp | grep -E ':(22|80|443|5432|6379)\b'
sudo ufw status verbose
```

Atteso: 22/80/443 in ascolto; 5432 e 6379 **assenti** dall'elenco pubblico.

## 3. SSH

Configurato da `scripts/01-hardening.sh` in `/etc/ssh/sshd_config.d/99-hardening.conf`:

```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
ChallengeResponseAuthentication no
KbdInteractiveAuthentication no
X11Forwarding no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
```

Lo script valida con `sshd -t` e fa rollback della config se non valida, per non chiudere fuori l'accesso.

## 4. Firewall e fail2ban

- `ufw default deny incoming` / `allow outgoing`.
- Regole: `22/tcp`, `80/tcp`, `443/tcp` (commentate).
- `fail2ban` jail `sshd`: `maxretry=5`, `findtime=10m`, `bantime=1h`.

```bash
sudo ufw status verbose
sudo fail2ban-client status sshd
```

## 5. Esecuzione dei flow e isolamento

Due scelte indipendenti: **come** gira il codice (`AP_EXECUTION_MODE`) e **cosa può raggiungere** (`AP_NETWORK_MODE`).

### 5.1 Modalità di esecuzione — `AP_EXECUTION_MODE`

Valori: `UNSANDBOXED`, `SANDBOX_PROCESS`, `SANDBOX_CODE_ONLY`, `SANDBOX_CODE_AND_PROCESS`. Il default di questo repo è `UNSANDBOXED` (il più semplice in Community).

| Modalità | Meccanismo | Costo | Nota |
|---|---|---|---|
| `UNSANDBOXED` | `fork()` + memory cap | nessun privilegio | nessun isolamento V8 sui Code step |
| `SANDBOX_CODE_ONLY` | `fork()` + isolamento V8 per Code step (128 MB, no `require`, no FS) | nessun privilegio | **consigliato** per multi-tenant; è ciò che usa Activepieces Cloud |
| `SANDBOX_PROCESS` | binario `isolate` (namespace Linux) | richiede `CAP_SYS_ADMIN` → container **privilegiato** | solo se servono pacchetti npm arbitrari nei Code step |
| `SANDBOX_CODE_AND_PROCESS` | entrambi | privilegiato | — |

Rischio con `UNSANDBOXED`: il codice dei flow gira senza sandbox nel worker. Ridurre al minimo le persone che possono creare/modificare flow. Valutare `SANDBOX_CODE_ONLY` (nessun privilegio, sicuro in multi-tenant).

`AP_EDITION=ee` (Enterprise) **rifiuta** `UNSANDBOXED` all'avvio: va usato `SANDBOX_CODE_ONLY`.

### 5.2 Egress di rete — `AP_NETWORK_MODE`

- `UNRESTRICTED` (default upstream): nessuna guardia in uscita.
- `STRICT`: guardia SSRF in-process prima di ogni codice utente; blocca private/RFC1918, loopback, link-local, cloud-metadata (`169.254.169.254`) e non-unicast su tutti i path Node (`axios`, `fetch`, `undici`, `http`/`net`). Eccezioni via `AP_SSRF_ALLOW_LIST` (IP/CIDR separati da virgola).

Limiti noti: la guardia è **best-effort e in-process**; `worker_threads`, `child_process`, addon nativi e `process.binding` possono aggirarla. Il confine reale va imposto a livello infrastrutturale (firewall egress/network policy). Trattare `STRICT` come defense-in-depth.

Il layer **server-side** (OAuth token, Vault, Conjur, webhook di destinazione, pager, validazione tool MCP) è **sempre filtrato**, indipendentemente da `AP_NETWORK_MODE`, e condivide `AP_SSRF_ALLOW_LIST`.

Rollout consigliato: partire da `UNRESTRICTED`, identificare gli IP interni legittimi, aggiungerli ad `AP_SSRF_ALLOW_LIST`, poi passare a `STRICT` monitorando i log del worker per `SSRFBlockedError`. **Non** attivare `STRICT` senza verificare prima che il worker raggiunga l'app interna (`http://app`).

## 6. Gestione dei segreti

| Segreto | Dove | Criticità | Backup |
|---|---|---|---|
| `AP_ENCRYPTION_KEY` | `.env` | **critico** — cifra le credenziali delle connessioni | offline, obbligatorio |
| `AP_JWT_SECRET` | `.env` | alto — sessioni utente | offline, consigliato |
| `AP_POSTGRES_PASSWORD` | `.env` | alto | offline |
| `AP_REDIS_PASSWORD` | `.env` | medio | offline |
| `VENICE_API_KEY` | UI AI Center (riferimento in `.env`) | alto — costo/abuso API | offline |
| `OPENROUTER_API_KEY` | UI AI Center (riferimento in `.env`) | alto — costo/abuso API | offline |
| `SLACK_WEBHOOK_URL` | `.env` | medio | offline |
| Chiave privata SSH | workstation | alto | gestore password |

Regole:
- Nessun segreto in `docker-compose.yml`, `Caddyfile`, script o docs.
- `.env` fuori dal versionamento (`.gitignore`).
- Rotazione: cambiare `AP_JWT_SECRET` disconnette tutti gli utenti; cambiare `AP_ENCRYPTION_KEY` rende **irrecuperabili** le connessioni esistenti (non ruotabile senza re-inserire le credenziali dei flow).

### 6.1 Rotazione obbligatoria — credenziali esposte (27/10/2026)

> **AZIONE RICHIESTA (utente).** Le seguenti credenziali sono state condivise in chat in chiaro
> e vanno considerate **compromesse**: ruotarle **prima** di andare in produzione.

| Credenziale | Dove è stata esposta | Azione di rotazione | Stato |
|---|---|---|---|
| Password SSH VPS Aruba (`J18nyq2z`) | chat | cambiare la password root dal pannello Aruba / `passwd`; in alternativa disabilitare il login a password e usare solo chiavi | **da fare** |
| Password pannello SiteGround | chat | cambiare da Site Tools → Account → Password | **da fare** |
| `VENICE_API_KEY` | chat | revocare e rigenerare da venice.ai → Settings → API | **da fare** |
| `RENDER_API_KEY` | chat | rigenerare da Render → Account Settings → API Keys | **da fare** |
| `NVIDIA_API_KEY` | chat | rigenerare dal portale NVIDIA | **da fare** |
| `OPENROUTER_API_KEY` | chat | rigenerare da openrouter.ai → Keys | **da fare** |

Nota: le chiavi di provider non vanno mai inserite in file versionati; restano solo in `.env` (git-ignorato) e/o nella UI AI Center.

## 7. Hardening del VPS

- `unattended-upgrades` attivo per i security update (da `00-bootstrap.sh`).
- Swap 2 GB con `vm.swappiness=10`.
- Docker dal repo ufficiale; log con rotazione per ogni servizio.
- Da valutare: `apt` automatic reboot window, monitoring disco/memoria, accesso SSH limitato per IP.

Verifica:

```bash
systemctl status unattended-upgrades
sudo unattended-upgrade --dry-run -d | tail -n 20
```

## 8. Checklist §9 AGENTS.md

| Voce | Stato |
|---|---|
| ufw default deny, allow 22/80/443 | definito in `01-hardening.sh` — da eseguire sul VPS |
| fail2ban jail `sshd` attiva | definito in `01-hardening.sh` |
| `PasswordAuthentication no`, `PermitRootLogin no` | definito in `01-hardening.sh` |
| utente `deploy` con sudo | definito in `01-hardening.sh` |
| `unattended-upgrades` attivo | definito in `00-bootstrap.sh` |
| log driver con `max-size` | definito in `docker-compose.yml` |
| nessun `network_mode: host` | verificato nel compose |
| porte pubbliche = solo Caddy | verificato nel compose (app su 127.0.0.1) |
| nessun segreto nel compose | verificato (solo `${...}`) |
| `.env` 600 owner `deploy` | da applicare sul VPS (`chmod 600 .env`) |
| backup segreti critici offline | da fare manualmente |

## 9. Audit segreti (da eseguire prima della consegna)

```bash
git log --all -p | grep -iE 'ap_encryption_key|ap_jwt_secret|venice_api_key|openrouter_api_key|slack_webhook|password=' | grep -v CHANGEME
```

Atteso: nessun risultato con valori reali. Se emerge un segreto nella history, ruotare il segreto e riscrivere la history (`git filter-repo`) prima di considerare il repo consegnabile.
