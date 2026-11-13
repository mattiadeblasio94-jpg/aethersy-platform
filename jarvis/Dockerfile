# =============================================================================
# Jarvis — assistente vocale della piattaforma Aethersy.
#
# Immagine self-hosted di OpenJarvis (fork upstream, vedi docs/jarvis.md):
#   - server API OpenAI-compatibile (/v1/chat/completions)
#   - trascrizione vocale locale con faster-whisper (STT, senza provider esterno)
#   - tool Aethersy (piattaforma, memoria, coding agent, voce)
#   - skill: aethersy, self-hosted-backend
#
# Nessun segreto nell'immagine: le chiavi arrivano dall'ambiente (.env sul VPS).
# =============================================================================

FROM python:3.12-slim-bookworm AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    OPENJARVIS_HOME=/opt/openjarvis

# Dipendenze di sistema: audio (sounddevice), compilazione dei pacchetti.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential curl libsndfile1 portaudio19-dev git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/openjarvis

# Dipendenze Python: core OpenJarvis + extras desktop/speech (faster-whisper).
COPY jarvis/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Codice di OpenJarvis: clone del fork al commit pinnato (nessun "latest").
ARG OPENJARVIS_REPO=https://github.com/mattiadeblasio94-jpg/OpenJarvis.git
ARG OPENJARVIS_REF=main
RUN git clone --depth 1 --branch "${OPENJARVIS_REF}" "${OPENJARVIS_REPO}" /tmp/openjarvis \
    && cp -a /tmp/openjarvis/. /opt/openjarvis/ \
    && rm -rf /tmp/openjarvis

# Tool e skill Aethersy (versionati in questo repository).
COPY jarvis/tools/ /opt/openjarvis/src/openjarvis/tools/
COPY jarvis/skills/ /opt/openjarvis/skills/aethersy-plugins/
COPY jarvis/config/config.toml /opt/openjarvis/config.toml
COPY jarvis/entrypoint.sh /usr/local/bin/jarvis-entrypoint
RUN chmod +x /usr/local/bin/jarvis-entrypoint

ENV OPENJARVIS_CONFIG=/opt/openjarvis/config.toml \
    OPENJARVIS_SKILLS_DIR=/opt/openjarvis/skills/aethersy-plugins

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/v1/speech/health || exit 1

ENTRYPOINT ["/usr/local/bin/jarvis-entrypoint"]
