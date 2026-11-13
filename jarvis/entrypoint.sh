#!/usr/bin/env bash
# Avvia il server OpenJarvis in ascolco su 0.0.0.0:8000.
# La configurazione arriva da OPENJARVIS_CONFIG (template in jarvis/config/config.toml).
# L'ambiente Python e' gia' pronto (uv sync in build): --no-sync evita di
# risolvere le dipendenze a runtime.
set -euo pipefail

JARVIS_HOST="${JARVIS_HOST:-0.0.0.0}"
JARVIS_PORT="${JARVIS_PORT:-8000}"

echo "[jarvis] avvio server su ${JARVIS_HOST}:${JARVIS_PORT}"
exec uv run --project /opt/openjarvis --no-sync jarvis serve --host "${JARVIS_HOST}" --port "${JARVIS_PORT}"
