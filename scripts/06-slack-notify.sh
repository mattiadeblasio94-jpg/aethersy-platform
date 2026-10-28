#!/usr/bin/env bash
# 06-slack-notify.sh — Fase 6
# Scopo: inviare un messaggio su Slack usando SLACK_WEBHOOK_URL dal .env.
# Prerequisiti: SLACK_WEBHOOK_URL valorizzato in .env; curl disponibile.
# Effetto: POST verso il webhook Slack. Nessuna modifica locale.
#   Uso: ./06-slack-notify.sh "testo del messaggio" [emoji]
set -euo pipefail

cd "$(dirname "$0")/.."

TEXT="${1:-}"
EMOJI="${2:-:information_source:}"

if [[ -z "${TEXT}" ]]; then
  echo "Uso: $0 <messaggio> [emoji]" >&2
  exit 2
fi

WEBHOOK="$(grep -E '^SLACK_WEBHOOK_URL=' .env | head -1 | cut -d= -f2- || true)"
if [[ -z "${WEBHOOK}" ]]; then
  echo "ERRORE: SLACK_WEBHOOK_URL non impostato in .env" >&2
  exit 1
fi

# Escape minimo per JSON (backslash e doppi apici).
ESC="${TEXT//\\/\\\\}"
ESC="${ESC//\"/\\\"}"

PAYLOAD="{\"text\":\"${EMOJI} ${ESC}\"}"

code="$(curl -s -o /tmp/slack_notify_resp -w '%{http_code}' \
  -X POST -H 'Content-type: application/json' \
  --data "${PAYLOAD}" "${WEBHOOK}" || echo 000)"
rm -f /tmp/slack_notify_resp

if [[ "${code}" != "200" ]]; then
  echo "ERRORE: Slack ha risposto HTTP ${code}" >&2
  exit 1
fi
echo "Slack OK (HTTP 200)"
