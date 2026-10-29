# Aethersy Platform - build multi-stage
#   stage build -> build Vite (React + TS + Tailwind), dati demo (mock layer)
#   runtime     -> nginx minimale che serve la SPA con fallback su index.html
#
# Nessun segreto nel build: l'app di piattaforma e' interamente mock-first
# (nessun endpoint di rete), quindi l'immagine non ha env di runtime.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
