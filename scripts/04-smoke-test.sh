#!/usr/bin/env bash
# 04-smoke-test.sh — Fase 3 / Fase 10
# Scopo: verificare end-to-end che lo stack risponda (locale + pubblico).
# Prerequisiti: stack avviato; DNS propagato per i test pubblici.
# Effetto: sola lettura. Esce != 0 se un controllo fallisce (usabile da cron/Slack).
set -euo pipefail

cd "$(dirname "$0")/.."

# Carica le variabili non segrete che ci servono.
AP_HOST_PORT="$(grep -E '^AP_HOST_PORT=' .env | cut -d= -f2- || true)"
AP_HOST_PORT="${AP_HOST_PORT:-8080}"
AP_FRONTEND_URL="$(grep -E '^AP_FRONTEND_URL=' .env | cut -d= -f2- || true)"
AP_MCP_URL="$(grep -E '^AP_MCP_URL=' .env | cut -d= -f2- || true)"

FAIL=0
ok()   { echo "    OK   - $1"; }
bad()  { echo "    FAIL - $1"; FAIL=1; }

echo "==> [1/4] Container"
for svc in app worker postgres redis caddy; do
  state="$(docker compose ps --format '{{.Service}} {{.State}}' | awk -v s="${svc}" '$1==s{print $2}')"
  if [[ "${state}" == "running" ]]; then ok "${svc} running"; else bad "${svc} (${state:-assente})"; fi
done

echo "==> [2/4] Health locale"
if curl -fsS "http://127.0.0.1:${AP_HOST_PORT}/api/v1/health" >/dev/null; then
  ok "app /api/v1/health"
else
  bad "app /api/v1/health non risponde su 127.0.0.1:${AP_HOST_PORT}"
fi

echo "==> [3/4] Health pubblico (HTTPS)"
if curl -fsS "${AP_FRONTEND_URL}/api/v1/health" >/dev/null 2>&1; then
  ok "${AP_FRONTEND_URL}/api/v1/health"
else
  bad "${AP_FRONTEND_URL}/api/v1/health (TLS o DNS non pronti?)"
fi

echo "==> [4/4] Endpoint MCP raggiungibile"
# Un 401/400 e' atteso senza token OAuth: conta che l'host risponda via TLS.
code="$(curl -s -o /dev/null -w '%{http_code}' "${AP_MCP_URL}/mcp" || echo 000)"
if [[ "${code}" =~ ^(200|400|401|403|405)$ ]]; then
  ok "${AP_MCP_URL}/mcp risponde (HTTP ${code})"
else
  bad "${AP_MCP_URL}/mcp HTTP ${code}"
fi

echo
if [[ "${FAIL}" -ne 0 ]]; then
  echo "SMOKE TEST FALLITO."
  exit 1
fi
echo "SMOKE TEST OK."
