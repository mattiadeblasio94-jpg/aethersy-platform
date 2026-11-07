# Aethersy Builder Sandbox — ambiente di esecuzione degli agenti specializzati.
#
# Immagine usata dal DockerSandboxProvider (console/server/src/builder/agents/sandbox.ts):
# ogni progetto attivo riceve un container con questo stack, montato su /workspace.
# Contenuto: node + pnpm + git + bash (nientiente agenti, niente segreti).
# Il tag e' pinnato: niente `latest` in produzione (vedi AGENTS.md §4.2).

FROM node:22-alpine

RUN apk add --no-cache bash git openssh-client curl ca-certificates \
    && npm install -g pnpm@9 \
    && mkdir -p /workspace

WORKDIR /workspace

ENV CI=1 \
    GIT_TERMINAL_PROMPT=0

CMD ["sleep", "infinity"]
