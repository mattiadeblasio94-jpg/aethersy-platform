#!/usr/bin/env bash
# =============================================================================
# Deploy di Jarvis sul VPS dedicato (Fase 35).
#
#   bash scripts/deploy-jarvis.sh [host_ssh] [nota]
#
# Cosa fa:
#   1. copia il repository (o la parte necessaria) sul VPS;
#   2. prepara /opt/aethersy-infra/jarvis/.env a partire dal modello, senza
#      toccare i segreti gia' presenti;
#   3. ricostruisce l'immagine e riavvia jarvis + caddy;
#   4. verifica /v1/speech/health e che la piattaforma risponda.
#
# Prerequisiti:
#   - accesso SSH al VPS (utente con sudo);
#   - .env del VPS gia' compilato (NVIDIA/z.ai/OpenRouter, credenziali piattaforma);
#   - record DNS del dominio Jarvis puntato all'IP del VPS.
# =============================================================================
set -euo pipefail

HOST="${1:-jarvis-vps}"
NOTE="${2:-deploy jarvis}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REMOTE_DIR="/opt/aethersy-infra"

echo "==> Deploy di Jarvis su ${HOST} (${NOTE})"

ssh "${HOST}" "mkdir -p ${REMOTE_DIR}/jarvis/config"

# Il codice che serve al container: tool, skill, config, Dockerfile, compose.
rsync -az --delete \
  --exclude '.env' \
  --exclude 'node_modules' \
  --exclude '.git' \
  "${REPO_DIR}/jarvis/" "${HOST}:${REMOTE_DIR}/jarvis/"

# Il repository serve al coding agent (aethersy_change): lo sincronizziamo
# escludendo i segreti.
rsync -az --delete \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'backups' \
  "${REPO_DIR}/" "${HOST}:${REMOTE_DIR}/"

# .env: si crea solo se assente, mai sovrascritto.
ssh "${HOST}" "test -f ${REMOTE_DIR}/jarvis/.env || cp ${REMOTE_DIR}/jarvis/.env.example ${REMOTE_DIR}/jarvis/.env"

ssh "${HOST}" "cd ${REMOTE_DIR} && docker compose -f jarvis/docker-compose.jarvis.yml build --pull jarvis"
ssh "${HOST}" "cd ${REMOTE_DIR} && docker compose -f jarvis/docker-compose.jarvis.yml up -d"
ssh "${HOST}" "cd ${REMOTE_DIR} && docker compose -f jarvis/docker-compose.jarvis.yml ps"

echo "==> Verifica health"
ssh "${HOST}" "for i in \$(seq 1 30); do \
  if curl -fsS http://127.0.0.1:8000/v1/speech/health >/dev/null 2>&1 || \
     docker exec aethersy-jarvis curl -fsS http://127.0.0.1:8000/v1/speech/health >/dev/null 2>&1; then \
    echo 'jarvis: healthy'; exit 0; \
  fi; sleep 5; \
done; echo 'jarvis: NON healthy'; docker logs --tail 50 aethersy-jarvis; exit 1"

echo "==> Deploy completato: ${NOTE}"
