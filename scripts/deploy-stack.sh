#!/usr/bin/env bash
# deploy-stack.sh — deploy di console e platform sul VPS, con notifica.
#
# Il VPS non e' un clone git: il sorgente viene copiato come archivio e
# l'immagine ricostruita. Lo script esegue l'intera sequenza e, prima del
# riavvio, scrive nell'env del VPS la versione e il commit del deploy: il BFF
# li usa per la notifica di deploy (in-app + Slack + webhook in uscita).
#
# Uso:  ./scripts/deploy-stack.sh [servizi] [nota]
#   servizi: default "console platform" (spazi separati)
#   nota:    testo libero aggiunto alla notifica (opzionale)
#
# Prerequisiti: alias ssh `aethersy-vps`, docker compose v2 sul VPS, .env gia'
# compilato sul VPS.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${AETHERSY_HOST:-aethersy-vps}"
REMOTE_DIR="${AETHERSY_REMOTE_DIR:-/home/deploy/aethersy}"
SERVICES="${1:-console platform}"
NOTE="${2:-}"
# La nota viaggia dentro un payload JSON passato al container via shell: gli
# apici singoli e le virgolette doppie vanno rimossi, altrimenti il quoting
# della chiamata ssh si rompe e la notifica di deploy non viene registrata.
NOTE="${NOTE//\'/}"
NOTE="${NOTE//\"/}"
NOTE="${NOTE//\\/}"
NOTE="${NOTE//$'\n'/ }"
VERSION="$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
COMMIT="${DEPLOY_COMMIT:-$VERSION}"

cd "$REPO_DIR"

echo "[deploy] archivio sorgente (versione $VERSION)"
TARBALL="$(mktemp -t aethersy-deploy-XXXXXX.tar.gz)"
trap 'rm -f "$TARBALL"' EXIT
tar -czf "$TARBALL" \
  --exclude='node_modules' --exclude='dist' --exclude='.vite' \
  console platform docker-compose.yml

echo "[deploy] copia sul VPS ($HOST)"
scp "$TARBALL" "$HOST:/home/deploy/"

echo "[deploy] build + riavvio: $SERVICES"
ssh "$HOST" "cd $REMOTE_DIR && \
  tar -xzf /home/deploy/$(basename "$TARBALL") && \
  sed -i '/^APP_VERSION=/d;/^DEPLOY_COMMIT=/d;/^DEPLOY_SERVICES=/d' .env && \
  printf 'APP_VERSION=%s\nDEPLOY_COMMIT=%s\nDEPLOY_SERVICES=%s\n' \
    '$VERSION' '$COMMIT' '$(echo "$SERVICES" | tr ' ' ',')' >> .env && \
  docker compose build $SERVICES && \
  docker compose up -d --no-deps $SERVICES"

echo "[deploy] attesa health check"
for _ in $(seq 1 60); do
  ok=1
  for svc in $SERVICES; do
    status="$(ssh "$HOST" "docker inspect -f '{{.State.Health.Status}}' aethersy-$svc 2>/dev/null || echo unknown")"
    if [[ "$status" != "healthy" ]]; then ok=0; fi
  done
  if [[ "$ok" == "1" ]]; then
    echo "[deploy] servizi healthy: $SERVICES"
    echo "[deploy] registrazione notifica di deploy"
    payload="{\"version\":\"$VERSION\",\"commit\":\"$COMMIT\",\"services\":\"$(echo "$SERVICES" | tr ' ' ',')\",\"note\":\"$NOTE\"}"
    ssh "$HOST" "cd $REMOTE_DIR && docker compose exec -T console node -e \"
      const body = process.argv[1];
      fetch('http://127.0.0.1:3000/api/internal/deploys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Deploy-Token': process.env.DEPLOY_HOOK_TOKEN || '' },
        body,
      }).then(async (res) => {
        const text = await res.text();
        console.log('[deploy] notifica:', res.status, text.slice(0, 240));
        process.exit(res.ok ? 0 : 1);
      }).catch((err) => { console.log('[deploy] notifica non riuscita:', err.message); process.exit(1); });
    \" '$payload'"
    exit 0
  fi
  sleep 2
done

echo "[deploy] ATTENZIONE: un servizio non e' healthy dopo 120s" >&2
exit 1
