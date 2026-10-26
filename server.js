"use strict";

/**
 * Server HTTP reale (solo moduli nativi Node.js, nessuna dipendenza esterna).
 * Espone:
 *  - API REST per inviare richieste, vederle, approvarle o rifiutarle
 *  - l'interfaccia di prova statica (cartella public/)
 *
 * Avvio: node server.js  (porta di default 8787, sovrascrivibile con PORT)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { handleNewRequest, approveRequest, rejectRequest } = require("./orchestrator");
const store = require("./store");

const PORT = process.env.PORT || 8787;
const PUBLIC_DIR = path.join(__dirname, "public");

// Protezione opzionale con Basic Auth: se BASIC_AUTH_USER e BASIC_AUTH_PASS
// sono impostate (es. su un deploy pubblico reale), ogni rotta tranne
// /api/salute richiede quelle credenziali. Senza quelle variabili d'ambiente
// (uso locale, come nei test di questa fase) il server resta aperto come già
// verificato: il comportamento locale non cambia.
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER;
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS;

function isAuthorized(req) {
  if (!BASIC_AUTH_USER || !BASIC_AUTH_PASS) return true;
  const header = req.headers["authorization"] || "";
  if (!header.startsWith("Basic ")) return false;
  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch (e) {
    return false;
  }
  const sep = decoded.indexOf(":");
  if (sep === -1) return false;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  return user === BASIC_AUTH_USER && pass === BASIC_AUTH_PASS;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res, urlPath) {
  let filePath = urlPath === "/" ? "/index.html" : urlPath;
  filePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, "");
  const full = path.join(PUBLIC_DIR, filePath);
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Vietato");
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Non trovato");
    }
    const ext = path.extname(full);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  if (p !== "/api/salute" && !isAuthorized(req)) {
    res.writeHead(401, {
      "WWW-Authenticate": 'Basic realm="Aethersy - ambiente di prova"',
      "Content-Type": "application/json; charset=utf-8"
    });
    return res.end(JSON.stringify({ error: "non_autorizzato" }));
  }

  try {
    if (p === "/api/richieste" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.testo || !String(body.testo).trim()) {
        return sendJson(res, 400, { error: "campo_testo_obbligatorio" });
      }
      const record = handleNewRequest(String(body.testo).trim(), body.mittente || "Cliente sintetico");
      return sendJson(res, 201, record);
    }

    if (p === "/api/richieste" && req.method === "GET") {
      return sendJson(res, 200, store.listRequests());
    }

    const matchDetail = p.match(/^\/api\/richieste\/([^/]+)$/);
    if (matchDetail && req.method === "GET") {
      const record = store.getRequest(matchDetail[1]);
      if (!record) return sendJson(res, 404, { error: "richiesta_non_trovata" });
      return sendJson(res, 200, record);
    }

    const matchApprove = p.match(/^\/api\/richieste\/([^/]+)\/approva$/);
    if (matchApprove && req.method === "POST") {
      const body = await readBody(req);
      const result = approveRequest(matchApprove[1], {
        testoModificato: body.testoModificato,
        confermaConflitto: !!body.confermaConflitto
      });
      if (result && result.error) return sendJson(res, 409, result);
      return sendJson(res, 200, result);
    }

    const matchReject = p.match(/^\/api\/richieste\/([^/]+)\/rifiuta$/);
    if (matchReject && req.method === "POST") {
      const body = await readBody(req);
      const result = rejectRequest(matchReject[1], body.motivo);
      if (result && result.error) return sendJson(res, 409, result);
      return sendJson(res, 200, result);
    }

    if (p === "/api/outbox" && req.method === "GET") {
      return sendJson(res, 200, store.listOutbox());
    }

    if (p === "/api/salute" && req.method === "GET") {
      return sendJson(res, 200, { stato: "ok", ora: new Date().toISOString() });
    }

    if (req.method === "GET") {
      return serveStatic(req, res, p);
    }

    sendJson(res, 404, { error: "rotta_non_trovata" });
  } catch (e) {
    sendJson(res, 500, { error: "errore_interno", dettaglio: String(e && e.message || e) });
  }
});

store.init();
server.listen(PORT, () => {
  console.log(`Server Aethersy in ascolto su http://localhost:${PORT}`);
});

module.exports = server;
