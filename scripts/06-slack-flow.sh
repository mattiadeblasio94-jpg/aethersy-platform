#!/usr/bin/env bash
# fase6-flow.sh — Fase 6
# Scopo: creare/pubblicare/abilitare un flow Activepieces "Slack notification":
#        webhook trigger -> HTTP POST verso SLACK_WEBHOOK_URL.
# Prerequisiti: stack avviato; SLACK_WEBHOOK_URL in .env.
# Effetto: crea un flow nel progetto, lo pubblica e lo abilita; poi lo invoca.
set -uo pipefail
cd /home/deploy/aethersy

JWT_SECRET=$(grep -E '^AP_JWT_SECRET=' .env | cut -d= -f2-)
SLACK_URL=$(grep -E '^SLACK_WEBHOOK_URL=' .env | head -1 | cut -d= -f2-)
PLATFORM_ID=YhzQp0r4OPfe9ldpvWgdD
PROJECT_ID=gywxRL8I2uHuepqatbkjL
USER_ID=kdvce6pZZNQ3H1WxY8DbP
IDENTITY_ID=k8j6NANvKkLQFJhNTjwAh
API=https://app.aethersy.online/api/v1

if [[ -z "${SLACK_URL}" ]]; then echo "ERRORE: SLACK_WEBHOOK_URL vuoto" >&2; exit 1; fi

TOKEN_VERSION=$(docker compose exec -T postgres psql -U postgres -d activepieces -t -A -c "SELECT \"tokenVersion\" FROM user_identity WHERE id='$IDENTITY_ID';" < /dev/null | tr -d '[:space:]')

TOKEN=$(docker compose exec -T app node -e '
const jwt = require("jsonwebtoken");
const payload = { id: process.argv[1], type: "USER", platform: { id: process.argv[2] }, tokenVersion: process.argv[3] };
process.stdout.write(jwt.sign(payload, process.argv[4], { algorithm: "HS256", keyid: "1", expiresIn: 600, issuer: "activepieces" }));
' "$USER_ID" "$PLATFORM_ID" "$TOKEN_VERSION" "$JWT_SECRET" < /dev/null)
echo "token_len=${#TOKEN}"

echo "=== crea o riusa flow ==="
FLOW_ID=""
# 1) lookup dal DB per displayName (robusto, non dipende da /tmp)
FLOW_ID=$(docker compose exec -T postgres psql -U postgres -d activepieces -t -A -c \
  "SELECT \"flowId\" FROM flow_version WHERE \"displayName\"='Slack notification' ORDER BY created DESC LIMIT 1;" < /dev/null | tr -d '[:space:]')
# 2) fallback sul file temporaneo
if [[ -z "$FLOW_ID" && -f /tmp/f6_flow_id.txt ]]; then
  FLOW_ID="$(cat /tmp/f6_flow_id.txt)"
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$API/flows/$FLOW_ID")
  [[ "$code" != "200" ]] && FLOW_ID=""
fi
if [[ -z "$FLOW_ID" ]]; then
  curl -s -o /tmp/f6_create.json -w "%{http_code}\n" -X POST "$API/flows" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"displayName\":\"Slack notification\",\"projectId\":\"$PROJECT_ID\"}"
  FLOW_ID=$(jq -r '.id // empty' /tmp/f6_create.json)
fi
echo "FLOW_ID=$FLOW_ID"
if [[ -z "$FLOW_ID" ]]; then echo "ERRORE creazione flow"; head -c 400 /tmp/f6_create.json; exit 1; fi

NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
cat > /tmp/f6_import.json <<EOF
{
  "type": "IMPORT_FLOW",
  "request": {
    "displayName": "Slack notification",
    "schemaVersion": "27",
    "notes": [],
    "trigger": {
      "name": "trigger",
      "valid": true,
      "displayName": "Catch Webhook",
      "lastUpdatedDate": "$NOW",
      "type": "PIECE_TRIGGER",
      "settings": {
        "pieceName": "@activepieces/piece-webhook",
        "pieceVersion": "0.1.42",
        "triggerName": "catch_webhook",
        "input": { "authType": "none" },
        "propertySettings": { "authType": { "type": "MANUAL" } }
      },
      "nextAction": {
        "name": "step_1",
        "valid": true,
        "displayName": "Notify Slack",
        "lastUpdatedDate": "$NOW",
        "type": "PIECE",
        "settings": {
          "pieceName": "@activepieces/piece-http",
          "pieceVersion": "0.13.0",
          "actionName": "send_request",
          "input": {
            "method": "POST",
            "url": "$SLACK_URL",
            "authType": "NONE",
            "body_type": "json",
            "body": { "data": { "text": ":bell: *Aethersy* — notifica dal flow Activepieces." } },
            "failureMode": "continue_none"
          },
          "propertySettings": {
            "method": { "type": "MANUAL" },
            "url": { "type": "MANUAL" },
            "authType": { "type": "MANUAL" },
            "body_type": { "type": "MANUAL" },
            "body": { "type": "MANUAL" },
            "failureMode": { "type": "MANUAL" }
          }
        }
      }
    }
  }
}
EOF

echo "=== IMPORT_FLOW ==="
curl -s -o /tmp/f6_imp.json -w "%{http_code}\n" -X POST "$API/flows/$FLOW_ID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d @/tmp/f6_import.json
head -c 400 /tmp/f6_imp.json; echo

echo "=== LOCK_AND_PUBLISH ==="
curl -s -o /tmp/f6_pub.json -w "%{http_code}\n" -X POST "$API/flows/$FLOW_ID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"LOCK_AND_PUBLISH","request":{}}'
head -c 300 /tmp/f6_pub.json; echo

echo "=== CHANGE_STATUS ENABLED ==="
curl -s -o /tmp/f6_en.json -w "%{http_code}\n" -X POST "$API/flows/$FLOW_ID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"CHANGE_STATUS","request":{"status":"ENABLED"}}'
head -c 300 /tmp/f6_en.json; echo

echo "$FLOW_ID" > /tmp/f6_flow_id.txt
echo "FLOW_ID=$FLOW_ID"
