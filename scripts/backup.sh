#!/usr/bin/env bash
# backup.sh — Fase 9
# Scopo: backup di PostgreSQL + volumi rilevanti, con rotazione e verifica.
# Prerequisiti: stack avviato; `deploy` nel gruppo docker.
# Effetto: scrive dump e tar in backups/ (fuori dal repo via .gitignore).
# Rotazione: 7 giornalieri + 4 settimanali.
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DAY="$(date +%u)"            # 1..7
KEEP_DAILY=7
KEEP_WEEKLY=4

mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly"

AP_POSTGRES_USERNAME="$(grep -E '^AP_POSTGRES_USERNAME=' .env | cut -d= -f2-)"
AP_POSTGRES_DATABASE="$(grep -E '^AP_POSTGRES_DATABASE=' .env | cut -d= -f2-)"

echo "==> [1/4] Dump PostgreSQL"
PG_DUMP="${BACKUP_DIR}/daily/postgres-${STAMP}.sql.gz"
docker compose exec -T postgres \
  pg_dump -U "${AP_POSTGRES_USERNAME}" "${AP_POSTGRES_DATABASE}" \
  | gzip > "${PG_DUMP}"

if [[ ! -s "${PG_DUMP}" ]]; then
  echo "ERRORE: dump vuoto, backup interrotto." >&2
  rm -f "${PG_DUMP}"
  exit 1
fi
echo "    ${PG_DUMP} ($(du -h "${PG_DUMP}" | cut -f1))"

echo "==> [2/4] Volume Redis (appendonly)"
REDIS_TAR="${BACKUP_DIR}/daily/redis-${STAMP}.tar.gz"
docker run --rm \
  -v aethersy_redis_data:/data:ro \
  -v "$(pwd)/${BACKUP_DIR}/daily":/backup \
  alpine tar czf "/backup/redis-${STAMP}.tar.gz" -C /data .
echo "    ${REDIS_TAR}"

echo "==> [3/4] Copia settimanale (la domenica)"
if [[ "${DAY}" == "7" ]]; then
  cp "${PG_DUMP}" "${BACKUP_DIR}/weekly/"
  cp "${REDIS_TAR}" "${BACKUP_DIR}/weekly/"
  echo "    copia settimanale creata."
fi

echo "==> [4/4] Rotazione"
# Tiene gli ultimi N file per pattern. Un glob che non matcha nulla NON e' un
# errore (es. weekly/ vuoto prima della prima domenica): `ls` esce 2 e con
# `set -e`/`pipefail` abortirebbe lo script. Gestiamo l'assenza esplicitamente.
rotate() {
  local pattern="$1" keep="$2"
  local files
  files="$(ls -1t ${pattern} 2>/dev/null || true)"
  [[ -z "${files}" ]] && return 0
  echo "${files}" | tail -n +$((keep + 1)) | xargs -r rm -f
}
rotate "${BACKUP_DIR}/daily/postgres-*.sql.gz" "${KEEP_DAILY}"
rotate "${BACKUP_DIR}/daily/redis-*.tar.gz"    "${KEEP_DAILY}"
rotate "${BACKUP_DIR}/weekly/postgres-*.sql.gz" "${KEEP_WEEKLY}"
rotate "${BACKUP_DIR}/weekly/redis-*.tar.gz"    "${KEEP_WEEKLY}"

echo
echo "Backup completato in ${BACKUP_DIR}."
echo "ATTENZIONE: scarica i backup fuori dal VPS. Un backup che vive solo sul server non e' un backup."
