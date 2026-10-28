#!/usr/bin/env bash
# 06-smoke-alert.sh — Fase 6
# Scopo: eseguire 04-smoke-test.sh e notificare Slack SOLO in caso di fallimento.
# Prerequisiti: SLACK_WEBHOOK_URL in .env; stack avviato.
# Effetto: sola lettura sullo stack; invia un messaggio Slack se il test fallisce.
#   Da schedulare in cron (es. ogni ora). Esce != 0 se lo smoke test fallisce.
set -euo pipefail

cd "$(dirname "$0")/.."

LOG="/tmp/aethersy-smoke.log"
HOST="$(hostname -f 2>/dev/null || hostname)"

if ./scripts/04-smoke-test.sh >"${LOG}" 2>&1; then
  # Tutto ok: nessun rumore su Slack.
  exit 0
fi

# Fallimento: invia le ultime righe del log.
TAIL="$(tail -n 12 "${LOG}" | tr '\n' ' ' | sed 's/  */ /g')"
./scripts/06-slack-notify.sh \
  "*SMOKE TEST FALLITO* su \`${HOST}\` — $(date -Is). Dettaglio: \`${TAIL}\`" \
  ":rotating_light:" || true

exit 1
