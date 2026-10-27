#!/usr/bin/env bash
# 03-deploy.sh — Fase 3
# Scopo: validare .env e avviare lo stack aethersy.
# Prerequisiti: docker + compose v2; file .env compilato nella root del repo.
# Effetto: docker compose pull + up -d. Non distrugge volumi esistenti.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "ERRORE: .env assente. Copia .env.example in .env e compila i valori." >&2
  exit 1
fi

echo "==> [1/4] Controllo placeholder nei segreti"
# Rifiuta i valori placeholder rimasti da .env.example.
if grep -E '^(AP_ENCRYPTION_KEY|AP_JWT_SECRET|AP_POSTGRES_PASSWORD|AP_REDIS_PASSWORD)=.*CHANGEME' .env >/dev/null; then
  echo "ERRORE: .env contiene ancora valori 'CHANGEME'. Genera i segreti:" >&2
  echo "  openssl rand -hex 16   # AP_ENCRYPTION_KEY" >&2
  echo "  openssl rand -hex 32   # AP_JWT_SECRET / AP_POSTGRES_PASSWORD / AP_REDIS_PASSWORD" >&2
  exit 1
fi

echo "==> [2/4] Controllo variabili obbligatorie"
required=(AP_VERSION AP_FRONTEND_URL AP_MCP_URL AP_ENCRYPTION_KEY AP_JWT_SECRET \
          AP_POSTGRES_PASSWORD AP_REDIS_PASSWORD ACME_EMAIL)
missing=0
for v in "${required[@]}"; do
  if ! grep -qE "^${v}=.+" .env; then
    echo "    MANCANTE o vuota: ${v}"
    missing=1
  fi
done
[[ "${missing}" -eq 0 ]] || { echo "ERRORE: compila le variabili mancanti." >&2; exit 1; }

echo "==> [3/4] Validazione compose"
docker compose config --quiet

echo "==> [4/4] Avvio stack"
docker compose pull
docker compose up -d

echo
echo "Stack avviato. Stato:"
docker compose ps
echo
echo "Health check locale: curl -fsS http://127.0.0.1:\${AP_HOST_PORT:-8080}/api/v1/health"
