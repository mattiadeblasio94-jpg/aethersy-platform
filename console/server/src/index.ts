import "dotenv/config";
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

// Il parser JSON standard rifiuta un corpo vuoto quando il client manda
// `content-type: application/json` (400 FST_ERR_CTP_EMPTY_JSON_BODY). I client
// web che inviano la stessa intestazione anche su DELETE senza corpo (es.
// console/web) ricevevano quindi un 400 invece del 204/200 atteso. Qui il
// corpo vuoto e' tollerato solo per i metodi senza payload (DELETE): per POST
// e PATCH resta l'errore standard, cosi' una richiesta troncata continua a
// essere rifiutata.
app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
  const text = typeof body === "string" ? body : String(body);
  if (text.trim() === "") {
    if (request.method === "DELETE") {
      done(null, undefined);
      return;
    }
    const error = new Error(
      "Body cannot be empty when content-type is set to 'application/json'",
    ) as Error & { statusCode: number; code: string };
    error.statusCode = 400;
    error.code = "FST_ERR_CTP_EMPTY_JSON_BODY";
    done(error, undefined);
    return;
  }
  try {
    done(null, JSON.parse(text));
  } catch (error) {
    (error as Error & { statusCode: number }).statusCode = 400;
    done(error as Error, undefined);
  }
});

await app.register(cookie);
await registerRoutes(app);

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

// Migrazione idempotente dello schema `pipeline` (P0.3). Dipende da
// `metering.tenant` (FK): gira solo dopo il metering e solo se questo e' attivo.
try {
  const { migratePipeline } = await import("./pipeline/migrate.js");
  const res = await migratePipeline();
  if (res.applied) app.log.info("schema pipeline applicato");
} catch (err) {
  app.log.error({ err }, "migrazione pipeline fallita: pipeline inerte");
}

// Migrazione idempotente dello schema `business` (P1.1): substrato aziendale
// (obiettivi, memoria, prodotti/servizi). Dipende da `metering.tenant` (FK).
try {
  const { migrateBusiness } = await import("./business/migrate.js");
  const res = await migrateBusiness();
  if (res.applied) app.log.info("schema business applicato");
} catch (err) {
  app.log.error({ err }, "migrazione business fallita: business inerte");
}

// Migrazione idempotente dello schema `builder` (Universal Builder Platform).
// Senza questa chiamata le tabelle builder.* non esistevano mai: le rotte
// /api/builder/* rispondevano 500 su Postgres "relation does not exist".
try {
  const { migrateBuilder } = await import("./builder/migrate.js");
  const res = await migrateBuilder();
  if (res.applied) app.log.info("schema builder applicato");
} catch (err) {
  app.log.error({ err }, "migrazione builder fallita: builder inerte");
}

// Avvia lo scheduler per lo snapshot automatico dei listini (price_book + fx_usd_eur).
// Cron: "0 */6 * * *" (ogni 6h, minuto 0) in timezone Europe/Rome.
try {
  const { schedulePriceSnapshot } = await import("./metering/price-snapshot.js");
  await schedulePriceSnapshot();
  app.log.info("price-snapshot scheduler avviato");
} catch (err) {
  app.log.error({ err }, "impossibile avviare price-snapshot scheduler");
}

// Avvia il modulo Universal Builder Platform
try {
  const { builderRoutes } = await import("./builder/routes.js");
  await builderRoutes(app);

  // Il motore dei task e' creato con autoStart=false: senza start() i task
  // creati restavano in coda senza mai essere eseguiti.
  const { taskEngine } = await import("./builder/tasks/engine.js");
  taskEngine.start();

  app.log.info("universal-builder-platform routes registrati");
} catch (err) {
  app.log.error({ err }, "impossibile registrare builder routes");
}

// Chiusura ordinata dei pool (Postgres/Redis) su SIGTERM/SIGINT.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, async () => {
    app.log.info(`ricevuto ${signal}: chiusura in corso`);
    try {
      const { taskEngine } = await import("./builder/tasks/engine.js");
      taskEngine.stop();
      const { closeRedis } = await import("./metering/guard.js");
      const { closePool } = await import("./metering/db.js");
      await Promise.allSettled([closeRedis(), closePool()]);
      await app.close();
    } finally {
      process.exit(0);
    }
  });
}

// Server edge (ADR 0002, fase 1b): rimosso.
// Il prototipo edge/auth non e' mai stato completato (nessun modulo `src/edge/`
// nel repo, adapter di verifica assente, router v2 non implementato) e la sua
// importazione statica rendeva il BFF NON COMPILABILE: `npm run build` falliva
// con "Cannot find module './edge/index.js'", quindi l'immagine console non
// poteva essere ricostruita dal sorgente.
//
// Architettura oggi: Caddy (TLS) -> platform (nginx, SPA) e -> console (BFF)
// che espone la sessione reale (/api/auth/login, /api/auth/session, cookie
// httpOnly). Il livello edge e' quindi superato dal reverse proxy + dalla
// sessione del console. Se in futuro serve, va reintrodotto come modulo
// completo e opzionale (import dinamico dentro il try/catch), non come
// import statico obbligatorio.
// Riferimento: docs/phases.md -> "Edge auth: prototipo rimosso".

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
