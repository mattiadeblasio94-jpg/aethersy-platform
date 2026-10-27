#!/usr/bin/env bash
# 02-dns-check.sh — Fase 2
# Scopo: verificare che i sottodomini puntino all'IP del VPS prima di emettere TLS.
# Prerequisiti: record A per app./mcp. creati sul DNS di aethersy.com (Vercel); IP del VPS noto.
#   Uso: ./02-dns-check.sh <IP_VPS> [dominio_base]
# Effetto: sola lettura, nessuna modifica. Esce != 0 se la propagazione e' incompleta.
set -euo pipefail

IP="${1:-}"
BASE_DOMAIN="${2:-aethersy.com}"

if [[ -z "${IP}" ]]; then
  echo "Uso: $0 <IP_VPS> [dominio_base]" >&2
  exit 1
fi

HOSTS=("app.${BASE_DOMAIN}" "mcp.${BASE_DOMAIN}")
FAIL=0

for h in "${HOSTS[@]}"; do
  echo "==> ${h}"
  resolved="$(dig +short A "${h}" | tail -n1 || true)"
  if [[ -z "${resolved}" ]]; then
    echo "    ERRORE: nessun record A risolto."
    FAIL=1
    continue
  fi
  echo "    risolve a: ${resolved}"
  if [[ "${resolved}" == "${IP}" ]]; then
    echo "    OK: coincide con l'IP del VPS."
  else
    echo "    ATTENZIONE: atteso ${IP}. Propagazione DNS in corso o record errato."
    FAIL=1
  fi
done

if [[ "${FAIL}" -ne 0 ]]; then
  echo
  echo "Propagazione incompleta. Attendi il TTL e riesegui. Non procedere col deploy."
  exit 1
fi

echo
echo "DNS OK su tutti gli hostname."
