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
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    OPENJARVIS_HOME=/opt/openjarvis

# Dipendenze di sistema: audio (sounddevice), compilazione, git.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential curl git libsndfile1 portaudio19-dev \
    && rm -rf /var/lib/apt/lists/*

# uv: gestore ambienti Python usato anche da OpenJarvis.
RUN pip install --no-cache-dir uv==0.5.11

WORKDIR /opt/openjarvis

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

# Ambiente Python precompilato: le dipendenze si risolvono in build, non a runtime.
#   --extra server  -> API FastAPI/uvicorn
#   --extra desktop -> faster-whisper (STT) + sounddevice
# L'installazione usa `uv pip` (non `uv sync`): il lock del fork puo' usare un
# formato piu' recente di uv, mentre il pyproject resta la fonte dei vincoli.
# SETUPTOOLS_SCM_PRETEND_VERSION: il clone e' shallow e senza tag, quindi la
# versione (hatch-vcs) viene dichiarata esplicitamente.
RUN rm -f /opt/openjarvis/uv.lock \
    && uv venv --python 3.12 /opt/openjarvis/.venv \
    && SETUPTOOLS_SCM_PRETEND_VERSION=0.3.0 HATCH_VCS_PRETEND_VERSION=0.3.0 \
       uv pip install --python /opt/openjarvis/.venv \
         -e "/opt/openjarvis[server,desktop]" "httpx==0.27.2"

ENV OPENJARVIS_CONFIG=/opt/openjarvis/config.toml \
    OPENJARVIS_SKILLS_DIR=/opt/openjarvis/skills/aethersy-plugins \
    UV_PROJECT_ENVIRONMENT=/opt/openjarvis/.venv

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/v1/speech/health || exit 1

ENTRYPOINT ["/usr/local/bin/jarvis-entrypoint"]
