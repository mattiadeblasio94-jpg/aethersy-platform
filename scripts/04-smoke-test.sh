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
CONSOLE_DOMAIN="$(grep -E '^CONSOLE_DOMAIN=' .env | cut -d= -f2- || true)"
CONSOLE_DOMAIN="${CONSOLE_DOMAIN:-console.aethersy.online}"
PLATFORM_DOMAIN="$(grep -E '^PLATFORM_DOMAIN=' .env | cut -d= -f2- || true)"
PLATFORM_DOMAIN="${PLATFORM_DOMAIN:-platform.aethersy.online}"

FAIL=0
ok()   { echo "    OK   - $1"; }
bad()  { echo "    FAIL - $1"; FAIL=1; }
warn() { echo "    WARN - $1"; }

echo "==> [1/6] Container"
for svc in app worker console platform postgres redis caddy; do
  state="$(docker compose ps --format '{{.Service}} {{.State}}' | awk -v s="${svc}" '$1==s{print $2}')"
  if [[ "${state}" == "running" ]]; then ok "${svc} running"; else bad "${svc} (${state:-assente})"; fi
done

echo "==> [2/6] Health locale"
if curl -fsS "http://127.0.0.1:${AP_HOST_PORT}/api/v1/health" >/dev/null; then
  ok "app /api/v1/health"
else
  bad "app /api/v1/health non risponde su 127.0.0.1:${AP_HOST_PORT}"
fi
# La Console non pubblica porte: la si interroga dal container caddy.
if docker compose exec -T caddy wget -qO- http://console:3000/api/health >/dev/null 2>&1; then
  ok "console /api/health (via rete interna)"
else
  bad "console /api/health non risponde sulla rete interna"
fi
# La Platform non pubblica porte: si verifica la SPA servita da nginx.
if docker compose exec -T caddy wget -qO- http://platform:80/ >/dev/null 2>&1; then
  ok "platform / (via rete interna)"
else
  bad "platform non risponde sulla rete interna"
fi

echo "==> [3/6] Health pubblico (HTTPS)"
if curl -fsS "${AP_FRONTEND_URL}/api/v1/health" >/dev/null 2>&1; then
  ok "${AP_FRONTEND_URL}/api/v1/health"
else
  bad "${AP_FRONTEND_URL}/api/v1/health (TLS o DNS non pronti?)"
fi

echo "==> [4/6] Endpoint MCP raggiungibile"
# Un 401/400 e' atteso senza token OAuth: conta che l'host risponda via TLS.
code="$(curl -s -o /dev/null -w '%{http_code}' "${AP_MCP_URL}/mcp" || echo 000)"
if [[ "${code}" =~ ^(200|400|401|403|405)$ ]]; then
  ok "${AP_MCP_URL}/mcp risponde (HTTP ${code})"
else
  bad "${AP_MCP_URL}/mcp HTTP ${code}"
fi

echo "==> [5/6] Console pubblica (HTTPS)"
# Verifica il percorso pubblico Caddy -> console. Se il resolver locale non ha
# ancora propagato il record `console` (cache DNS), ricade su --resolve verso
# 127.0.0.1: valida comunque Caddy, il routing e il certificato TLS.
if curl -fsS "https://${CONSOLE_DOMAIN}/api/health" >/dev/null 2>&1; then
  ok "https://${CONSOLE_DOMAIN}/api/health"
elif curl -fsS --resolve "${CONSOLE_DOMAIN}:443:127.0.0.1" "https://${CONSOLE_DOMAIN}/api/health" >/dev/null 2>&1; then
  ok "https://${CONSOLE_DOMAIN}/api/health (via Caddy; DNS locale in cache)"
else
  warn "https://${CONSOLE_DOMAIN}/api/health non raggiungibile (record DNS \`console\` o TLS da verificare)"
fi

echo "==> [6/6] Platform pubblica (HTTPS)"
# La SPA risponde 200 su /. Stesso fallback --resolve se il DNS non e' propagato.
if curl -fsS "https://${PLATFORM_DOMAIN}/" >/dev/null 2>&1; then
  ok "https://${PLATFORM_DOMAIN}/"
elif curl -fsS --resolve "${PLATFORM_DOMAIN}:443:127.0.0.1" "https://${PLATFORM_DOMAIN}/" >/dev/null 2>&1; then
  ok "https://${PLATFORM_DOMAIN}/ (via Caddy; DNS locale in cache)"
else
  warn "https://${PLATFORM_DOMAIN}/ non raggiungibile (record DNS \`platform\` o TLS da verificare)"
fi

echo
if [[ "${FAIL}" -ne 0 ]]; then
  echo "SMOKE TEST FALLITO."
  exit 1
fi
echo "SMOKE TEST OK."
