#!/usr/bin/env bash
# deploy-console.sh — ricostruisce l'immagine del Console dal sorgente e la riavvia.
#
# Scopo: il VPS non e' un clone git: il sorgente viene copiato a mano e l'immagine
#       ricostruita. Questo script automatizza la parte fragile (build + restart
#       del solo servizio console, senza toccare gli altri).
# Prerequisiti: /home/deploy/aethersy con .env compilato, Docker + Compose v2.
# Effetto: `docker compose build console` + `up -d --no-deps console`.
#           Non modifica .env e non tocca postgres/redis/app/worker/platform/caddy.

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/home/deploy/aethersy}"
cd "$DEPLOY_DIR"

if [[ ! -f .env ]]; then
  echo "ERRORE: .env mancante in $DEPLOY_DIR (vedi .env.example)" >&2
  exit 1
fi

if ! grep -q '^NVIDIA_API_KEY=' .env; then
  echo "AVVISO: NVIDIA_API_KEY non presente in .env: il provider NVIDIA resta disattivato." >&2
fi

echo "[deploy-console] build immagine"
docker compose build console

echo "[deploy-console] riavvio container"
docker compose up -d --no-deps console

echo "[deploy-console] stato"
docker compose ps console

echo "[deploy-console] attesa health check"
for _ in $(seq 1 30); do
  status="$(docker inspect -f '{{.State.Health.Status}}' aethersy-console 2>/dev/null || echo unknown)"
  if [[ "$status" == "healthy" ]]; then
    echo "[deploy-console] container healthy"
    exit 0
  fi
  sleep 2
done

echo "ERRORE: il container non e' diventato healthy entro 60s" >&2
docker compose logs console --tail=40 >&2
exit 1
