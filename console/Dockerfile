# Aethersy Console - build multi-stage
#   stage web    -> build Vite (React + TS + Tailwind)
#   stage server -> build Fastify BFF (TypeScript -> JS)
#   runtime      -> Node minimale: solo dist server + dist web + deps di produzione
#
# Nessun segreto nel build: OPENROUTER_API_KEY / AP_JWT_SECRET arrivano a runtime via env.

FROM node:22-alpine AS web
WORKDIR /w
COPY web/package.json web/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM node:22-alpine AS server
WORKDIR /s
COPY server/package.json server/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY server/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=server /s/dist ./dist
COPY --from=web /w/dist ./public
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
