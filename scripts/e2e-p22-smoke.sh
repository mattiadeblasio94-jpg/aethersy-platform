#!/usr/bin/env bash
set -uo pipefail
B=https://platform.aethersy.online
J=$(mktemp)
EMAIL="e2e-$(date +%s)@aethersy.online"
PASS="StrongPass12345"

echo "=== 1) register ($EMAIL) ==="
curl -s -w "\nHTTP %{http_code}\n" -X POST $B/api/auth/register -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"firstName\":\"E2E\",\"lastName\":\"Test\"}" | head -c 400

echo ""
echo "=== 2) login ==="
curl -s -c "$J" -w "\nHTTP %{http_code}\n" -X POST $B/api/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | head -c 400

echo ""
echo "=== 3) session ==="
curl -s -b "$J" -w "\nHTTP %{http_code}\n" $B/api/auth/session | head -c 400

echo ""
echo "=== 4) overview ==="
curl -s -b "$J" -w "\nHTTP %{http_code}\n" $B/api/platform/overview | head -c 700

echo ""
echo "=== 5) roster ==="
curl -s -b "$J" -w "\nHTTP %{http_code}\n" $B/api/platform/roster | head -c 300

echo ""
echo "=== 6) chat: avvia lavoro (brand) ==="
RESP=$(curl -s -b "$J" -X POST $B/api/platform/chat -H 'Content-Type: application/json' -d '{"text":"Crea il brand e l identita visiva per la mia startup di caffe"}')
echo "$RESP" | head -c 700
RID=$(echo "$RESP" | grep -o '"runId":"[^"]*"' | head -1 | cut -d'"' -f4)
echo ""
echo "runId=$RID"

echo "=== 7) poll run ==="
for i in $(seq 1 12); do
  sleep 8
  ST=$(curl -s -b "$J" $B/api/pipeline/runs/$RID | grep -o '"status":"[^"]*"' | head -1)
  echo "poll $i: $ST"
  case "$ST" in
    *in_review*|*approved*|*delivered*|*failed*) break;;
  esac
done

echo ""
echo "=== 8) run detail ==="
curl -s -b "$J" $B/api/pipeline/runs/$RID | python3 -c "import sys,json; d=json.load(sys.stdin); print('status:',d['run']['status']); [print(' -',t['droid'],t['status'],'|',t['title'],'| err:',t.get('error')) for t in d.get('tasks',[])]" 2>/dev/null | head -30

echo ""
echo "=== 9) assets ==="
curl -s -b "$J" $B/api/pipeline/assets | python3 -c "import sys,json; d=json.load(sys.stdin); print('assets:',len(d)); [print(' -',a['status'],'|',a['name']) for a in d[:8]]" 2>/dev/null | head -20

rm -f "$J"
