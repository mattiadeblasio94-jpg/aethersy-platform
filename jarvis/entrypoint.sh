#!/usr/bin/env bash
# Avvia il server OpenJarvis in ascolto su 0.0.0.0:8000.
# La configurazione arriva da OPENJARVIS_CONFIG (template in jarvis/config/config.toml).
set -euo pipefail

JARVIS_HOST="${JARVIS_HOST:-0.0.0.0}"
JARVIS_PORT="${JARVIS_PORT:-8000}"

echo "[jarvis] avvio server su ${JARVIS_HOST}:${JARVIS_PORT}"
exec python -m uv run --project /opt/openjarvis jarvis serve --host "${JARVIS_HOST}" --port "${JARVIS_PORT}"
