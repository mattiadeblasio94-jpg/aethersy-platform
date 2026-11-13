#!/usr/bin/env bash
# backup-jarvis.sh — Fase 35
# Scopo: backup dello stato runtime di Jarvis (volume `jarvis_state`: knowledge.db,
#        tracce, config) sul VPS dedicato, con rotazione.
# Prerequisiti: stack Jarvis avviato; `deploy` nel gruppo docker.
# Effetto: scrive un archivio in BACKUP_DIR (fuori dal repo) e mantiene
#          KEEP copie giornaliere.
# Il vault vero e proprio (memoria markdown del tenant) vive sulla piattaforma
# e ha il proprio backup: qui si salva solo lo stato locale del server.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/deploy/backups/jarvis}"
STAMP="$(date +%Y%m%d-%H%M%S)"
KEEP=7
VOLUME="${JARVIS_STATE_VOLUME:-jarvis_jarvis_state}"

mkdir -p "${BACKUP_DIR}"

echo "==> Backup del volume ${VOLUME}"
OUT="${BACKUP_DIR}/jarvis-state-${STAMP}.tar.gz"
docker run --rm \
  -v "${VOLUME}:/state:ro" \
  -v "${BACKUP_DIR}:/backup" \
  alpine:3.20 \
  tar -czf "/backup/$(basename "$OUT")" -C /state .

if [[ ! -s "$OUT" ]]; then
  echo "ERRORE: archivio vuoto, backup interrotto." >&2
  rm -f "$OUT"
  exit 1
fi

echo "==> Rotazione: tengo ${KEEP} copie"
ls -1t "${BACKUP_DIR}"/jarvis-state-*.tar.gz | tail -n "+$((KEEP + 1))" | xargs -r rm -f

echo "==> Backup completato: ${OUT} ($(du -h "$OUT" | cut -f1))"
