#!/usr/bin/env bash
# =============================================================================
# Deploy di Jarvis (Fase 35).
#
#   bash scripts/deploy-jarvis.sh [host_ssh] [nota]
#
# Variabili d'ambiente:
#   JARVIS_REMOTE_DIR  directory remota del repository (default /home/deploy/aethersy)
#   JARVIS_PROFILE     "public" per avviare anche Caddy (TLS) sul VPS dedicato
#
# Cosa fa:
#   1. copia la cartella jarvis/ (tool, skill, config, Dockerfile, compose)
#      sul VPS;
#   2. prepara <REMOTE_DIR>/jarvis/.env: non sovrascrive mai i segreti gia'
#      presenti, importa le chiavi provider dal .env principale del VPS;
#   3. ricostruisce l'immagine e riavvia il servizio jarvis;
#   4. verifica /v1/speech/health dentro il container.
#
# Due esercizi possibili:
#   - VPS Aruba (alias "aethersy-vps"): Jarvis e' interno alla rete Docker della
#     piattaforma, la console lo raggiunge con http://aethersy-jarvis:8000;
#   - VPS dedicato (JARVIS_PROFILE=public): Caddy pubblica
#     https://jarvis.aethersy.online e la console lo chiama da fuori.
#
# Prerequisiti:
#   - accesso SSH al VPS (alias in ~/.ssh/config oppure utente@ip);
#   - .env del VPS gia' compilato (NVIDIA/z.ai/OpenRouter, credenziali
#     piattaforma per il container: AETHERSY_EMAIL/AETHERSY_PASSWORD oppure
#     AETHERSY_API_KEY).
# =============================================================================
set -euo pipefail

HOST="${1:-aethersy-vps}"
NOTE="${2:-deploy jarvis}"
PROFILE="${JARVIS_PROFILE:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REMOTE_DIR="${JARVIS_REMOTE_DIR:-/home/deploy/aethersy}"
COMPOSE="docker compose -f jarvis/docker-compose.jarvis.yml"

echo "==> Deploy di Jarvis su ${HOST} in ${REMOTE_DIR} (${NOTE})"

TARBALL="$(mktemp -t aethersy-jarvis-XXXXXX.tar.gz)"
trap 'rm -f "$TARBALL"' EXIT
tar -czf "$TARBALL" -C "$REPO_DIR" jarvis
scp "$TARBALL" "${HOST}:/home/deploy/"

ssh "${HOST}" "set -euo pipefail
  mkdir -p '${REMOTE_DIR}'
  tar -xzf /home/deploy/$(basename "$TARBALL") -C '${REMOTE_DIR}'
  cd '${REMOTE_DIR}'
  # Fine riga LF: i CRLF rompono l'entrypoint del container.
  sed -i 's/\r$//' jarvis/Dockerfile jarvis/entrypoint.sh jarvis/docker-compose.jarvis.yml jarvis/Caddyfile
  # .env di Jarvis: creato solo se assente, mai sovrascritto.
  if [ ! -f jarvis/.env ]; then
    cp jarvis/.env.example jarvis/.env
    chmod 600 jarvis/.env
  fi
  # Le chiavi provider arrivano dal .env principale del VPS (mai dal repo).
  for key in NVIDIA_API_KEY NIM_API_KEY ZAI_API_KEY OPENROUTER_API_KEY AETHERSY_EMAIL AETHERSY_PASSWORD AETHERSY_API_KEY; do
    value=\"\$(grep -m1 -E \"^\\\${key}=\" .env 2>/dev/null | cut -d= -f2- || true)\"
    if [ -n \"\$value\" ] && ! grep -q -E \"^\\\${key}=\" jarvis/.env; then
      printf '%s=%s\n' \"\$key\" \"\$value\" >> jarvis/.env
    fi
  done
  chmod 600 jarvis/.env
  echo '--- jarvis/.env (chiavi presenti) ---'
  cut -d= -f1 jarvis/.env | tr '\n' ' '; echo"

echo "==> Build immagine (puo' richiedere diversi minuti: dipendenze Python)"
ssh "${HOST}" "cd '${REMOTE_DIR}' && ${COMPOSE} build jarvis"

echo "==> Avvio servizio"
ssh "${HOST}" "cd '${REMOTE_DIR}' && ${COMPOSE} up -d jarvis && ${COMPOSE} ps"

if [ -n "${PROFILE}" ]; then
  echo "==> Avvio reverse proxy (profilo ${PROFILE})"
  ssh "${HOST}" "cd '${REMOTE_DIR}' && ${COMPOSE} --profile ${PROFILE} up -d caddy"
fi

echo "==> Verifica health"
ssh "${HOST}" "for i in \$(seq 1 60); do
  if docker exec aethersy-jarvis sh -c 'curl -fsS -H "Authorization: Bearer \${OPENJARVIS_API_KEY:-}" http://127.0.0.1:8000/v1/speech/health' >/dev/null 2>&1; then
    echo 'jarvis: healthy'; exit 0
  fi
  sleep 5
done
echo 'jarvis: NON healthy'
docker logs --tail 60 aethersy-jarvis
exit 1"

echo "==> Deploy completato: ${NOTE}"
echo "    Per collegarlo alla piattaforma: JARVIS_BASE_URL=http://aethersy-jarvis:8000"
echo "    (VPS dedicato con profilo public: JARVIS_BASE_URL=https://jarvis.aethersy.online)"
