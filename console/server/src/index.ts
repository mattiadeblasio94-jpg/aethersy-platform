import Fastify from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { registerRoutes } from "./routes.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// In produzione `dist/index.js` -> public/ sta in ../public (COPY nel Dockerfile).
const publicDir = path.resolve(here, "..", "public");

const app = Fastify({ logger: true, trustProxy: true });

await app.register(cookie);

app.get("/api/health", async () => ({ status: "ok", service: "aethersy-console" }));

// Migrazione idempotente dello schema `metering` (no-op se METERING_ENABLED=false).
// Un DB non raggiungibile NON blocca l'avvio: le rotte AI rispondono comunque,
// ma il metering resta inerte finche' il DB non torna disponibile.
try {
  const { migrateMetering } = await import("./metering/migrate.js");
  const res = await migrateMetering();
  if (res.applied) app.log.info("schema metering applicato");
} catch (err) {
  app.log.error({ err }, "migrazione metering fallita: metering inerte");
}

await registerRoutes(app);

// Chiusura ordinata dei pool (Postgres/Redis) su SIGTERM/SIGINT.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, async () => {
    app.log.info(`ricevuto ${signal}: chiusura in corso`);
    try {
      const { closeRedis } = await import("./metering/guard.js");
      const { closePool } = await import("./metering/db.js");
      await Promise.allSettled([closeRedis(), closePool()]);
      await app.close();
    } finally {
      process.exit(0);
    }
  });
}

// SPA statica + fallback su index.html per il client router.
// In sviluppo la cartella public/ puo' non esistere: in quel caso il frontend
// gira su Vite (:5173) che proxa /api verso questo server.
if (fs.existsSync(publicDir)) {
  await app.register(fastifyStatic, { root: publicDir, wildcard: false });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send({ code: "NOT_FOUND", message: "Rotta inesistente" });
    }
    return reply.sendFile("index.html");
  });
} else {
  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({ code: "NOT_FOUND", message: `Nessuna rotta: ${request.url}` });
  });
}

app
  .listen({ port: config.port, host: config.host })
  .then(() => app.log.info(`Aethersy Console in ascolto su :${config.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
