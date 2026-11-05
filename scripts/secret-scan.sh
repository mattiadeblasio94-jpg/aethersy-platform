#!/usr/bin/env bash
# secret-scan.sh - verifica che nessun segreto sia tracciato in git.
#
# Prerequisiti: git (per elencare i file tracciati), grep, bash.
# Effetto: stampa i file sospetti (pattern + percorso, MAI il valore) e
#          esce con codice 1 se trova una corrispondenza.
#
# Uso:  bash scripts/secret-scan.sh
#       (usato anche dal job "hygiene" della pipeline GitHub Actions)

set -euo pipefail

cd "$(dirname "$0")/.."

# pattern:etichetta -> il valore del segreto non viene mai stampato.
PATTERNS=(
  'sk-or-v1-[A-Za-z0-9_-]{20,}:openrouter'
  'nvapi-[A-Za-z0-9_-]{20,}:nvidia-nim'
  'r8_[A-Za-z0-9]{20,}:replicate'
  'fal_[A-Za-z0-9_-]{20,}:fal-ai'
  'sk_live_[A-Za-z0-9]{20,}:stripe-secret'
  'sk_test_[A-Za-z0-9]{20,}:stripe-secret-test'
  'rk_live_[A-Za-z0-9]{20,}:stripe-restricted'
  'rk_test_[A-Za-z0-9]{20,}:stripe-restricted-test'
  'gh[pousr]_[A-Za-z0-9]{30,}:github-token'
  'AIza[0-9A-Za-z_-]{30,}:google-api-key'
  'xox[baprs]-[0-9A-Za-z-]{10,}:slack-token'
  'AKIA[0-9A-Z]{16}:aws-access-key'
  'sk-[A-Za-z0-9]{32,}:openai-style-key'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----:private-key'
)

# I placeholder (.env.example: valori vuoti o "CHANGEME_...") non corrispondono
# ai pattern, quindi .env.example viene scandito come tutti gli altri file.

failed=0
checked=0

while IFS= read -r -d '' file; do
  case "$file" in
    *.png|*.jpg|*.jpeg|*.gif|*.ico|*.webp|*.woff|*.woff2|*.zip|*.mp4|*.pdf) continue ;;
  esac
  if [ ! -f "$file" ]; then
    continue
  fi
  checked=$((checked + 1))
  for entry in "${PATTERNS[@]}"; do
    pattern="${entry%%:*}"
    label="${entry##*:}"
    if grep -IqE "$pattern" "$file" 2>/dev/null; then
      printf 'TROVATO  %-16s %s\n' "$label" "$file"
      failed=1
    fi
  done
done < <(git ls-files -z)

# Nessun file .env reale deve essere tracciato.
while IFS= read -r -d '' file; do
  base="$(basename "$file")"
  if [[ "$base" == ".env" || ( "$base" == ".env.*" && "$base" != ".env.example" ) ]]; then
    printf 'TROVATO  %-16s %s\n' 'env-file' "$file"
    failed=1
  fi
done < <(git ls-files -z)

if [ "$failed" -ne 0 ]; then
  echo "secret-scan: FALLITO - i segreti sopra vanno rimossi dal repo e ruotati."
  exit 1
fi

echo "secret-scan: OK - ${checked} file tracciati, nessun segreto rilevato."
