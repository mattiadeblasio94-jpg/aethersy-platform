"use strict";

/**
 * Server HTTP reale (solo moduli nativi Node.js, nessuna dipendenza esterna).
 * Espone:
 *  - API REST per inviare richieste, vederle, approvarle o rifiutarle
 *  - API REST per leggere/configurare gli agenti (/api/agenti)
 *  - il dashboard statico (cartella public/)
 *  - /anteprima: un'anteprima statica NON autenticata con dati dimostrativi
 *    fissi (nessuna lettura di dati reali), per mostrare il prodotto senza
 *    condividere le credenziali del workspace.
 *  - /imposta-accesso: pagina di auto-configurazione dell'accesso proprietario
 *    (nome utente + password scelti dal fondatore stesso), protetta da un
 *    token monouso impostato come variabile d'ambiente Render e mai scritto
 *    nel codice. Dopo la configurazione, l'accesso avviene con Basic Auth
 *    usando le credenziali scelte dal fondatore, verificate contro un hash
 *    salato (nessuna password in chiaro viene mai salvata o loggata).
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

// Protezione legacy opzionale con Basic Auth statica: se BASIC_AUTH_USER e
// BASIC_AUTH_PASS sono impostate, restano un secondo modo valido di accesso
// (invariato rispetto a prima), ma il modo principale consigliato è ora
// l'accesso proprietario configurato dal fondatore stesso via /imposta-accesso.
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER;
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS;

// Token monouso per la pagina di auto-configurazione dell'accesso: impostato
// come variabile d'ambiente Render, non scritto nel repository né qui.
const SETUP_TOKEN = process.env.SETUP_TOKEN || "";

// Rotte accessibili senza credenziali: la sonda di salute, l'anteprima
// sicura pubblica (solo dati dimostrativi statici, nessuna scrittura) e la
// pagina/endpoint di auto-configurazione dell'accesso (protetti a loro volta
// dal token monouso, non dalla Basic Auth generale).
const ROTTE_SENZA_AUTH = new Set([
  "/api/salute",
  "/anteprima",
  "/anteprima/",
  "/anteprima.html",
  "/imposta-accesso",
  "/api/imposta-accesso"
]);

function isAuthorized(req) {
  const ownerConfigured = !!store.getOwner();
  const legacyConfigured = !!(BASIC_AUTH_USER && BASIC_AUTH_PASS);

  // Nessuna protezione ancora configurata (es. uso locale di sviluppo):
  // comportamento invariato rispetto alle fasi precedenti, resta aperto.
  if (!ownerConfigured && !legacyConfigured) return true;

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

  if (ownerConfigured && store.verifyOwner(user, pass)) return true;
  if (legacyConfigured && user === BASIC_AUTH_USER && pass === BASIC_AUTH_PASS) return true;
  return false;
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function serveSetupPage(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const token = url.searchParams.get("token") || "";
  const owner = store.getOwner();
  let body;

  if (owner) {
    body = `
      <p class="ok">L'accesso proprietario è già configurato per questo workspace (utente: ${escapeHtml(owner.username)}).</p>
      <p>Vai alla <a href="/">pagina principale</a> e accedi con il nome utente e la password che hai scelto tu stesso in questa pagina. Non è stato salvato da nessuna parte un testo in chiaro della tua password: solo tu la conosci.</p>
    `;
  } else if (!SETUP_TOKEN || token !== SETUP_TOKEN) {
    body = `<p class="err">Link di configurazione mancante o non valido. Richiedi un nuovo link di accesso.</p>`;
  } else {
    body = `
      <p>Scegli tu stesso il nome utente e la password per entrare nel workspace. Nessuno, compreso chi ha costruito questa piattaforma, vedrà o salverà la tua password: viene trasformata subito in un'impronta crittografica (hash) non reversibile.</p>
      <form id="f">
        <label>Nome utente
          <input name="username" required minlength="3" autocomplete="username" />
        </label>
        <label>Password (almeno 8 caratteri)
          <input name="password" type="password" required minlength="8" autocomplete="new-password" />
        </label>
        <label>Conferma password
          <input name="password2" type="password" required minlength="8" autocomplete="new-password" />
        </label>
        <button type="submit">Imposta il mio accesso</button>
      </form>
      <p id="msg"></p>
      <script>
        document.getElementById('f').addEventListener('submit', async function (e) {
          e.preventDefault();
          var f = e.target;
          var msg = document.getElementById('msg');
          if (f.password.value !== f.password2.value) {
            msg.textContent = 'Le due password non coincidono.';
            msg.className = 'err';
            return;
          }
          msg.textContent = 'Invio in corso...';
          msg.className = '';
          try {
            var r = await fetch('/api/imposta-accesso', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                token: ${JSON.stringify(token)},
                username: f.username.value,
                password: f.password.value
              })
            });
            var data = await r.json();
            if (r.ok) {
              msg.textContent = 'Fatto. Il tuo accesso è stato impostato: vai alla pagina principale e accedi con queste credenziali.';
              msg.className = 'ok';
              f.remove();
            } else {
              msg.textContent = 'Errore: ' + (data.error || 'sconosciuto');
              msg.className = 'err';
            }
          } catch (err) {
            msg.textContent = 'Errore di rete, riprova.';
            msg.className = 'err';
          }
        });
      </script>
    `;
  }

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, nofollow" />
<title>Imposta il tuo accesso — Aethersy</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#F6F4EF;color:#140D30;max-width:30rem;margin:3rem auto;padding:0 1.2rem;}
  h1{color:#2A1B5D;font-size:1.3rem;}
  label{display:block;margin-bottom:.9rem;font-size:.9rem;}
  input{display:block;width:100%;padding:.5rem;margin-top:.3rem;border:1px solid #e3ddf3;border-radius:8px;box-sizing:border-box;font-size:1rem;}
  button{background:#2A1B5D;color:#F6F4EF;border:none;padding:.6rem 1.1rem;border-radius:8px;font-weight:700;cursor:pointer;font-size:1rem;}
  a{color:#0E7A82;}
  .ok{color:#1d5f42;}
  .err{color:#a5293b;}
</style>
</head>
<body>
  <h1>Imposta il tuo accesso al workspace Aethersy</h1>
  ${body}
</body>
</html>`;
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  if ((p === "/anteprima" || p === "/anteprima/") && req.method === "GET") {
    return serveStatic(req, res, "/anteprima.html");
  }

  if (p === "/imposta-accesso" && req.method === "GET") {
    return serveSetupPage(req, res);
  }

  if (!ROTTE_SENZA_AUTH.has(p) && !isAuthorized(req)) {
    res.writeHead(401, {
      "WWW-Authenticate": 'Basic realm="Aethersy - workspace"',
      "Content-Type": "application/json; charset=utf-8"
    });
    return res.end(JSON.stringify({ error: "non_autorizzato" }));
  }

  try {
    if (p === "/api/imposta-accesso" && req.method === "POST") {
      const body = await readBody(req);
      if (store.getOwner()) {
        return sendJson(res, 409, { error: "proprietario_gia_configurato" });
      }
      if (!SETUP_TOKEN || body.token !== SETUP_TOKEN) {
        return sendJson(res, 401, { error: "token_non_valido" });
      }
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (username.length < 3 || password.length < 8) {
        return sendJson(res, 400, { error: "dati_non_validi" });
      }
      const owner = store.setOwner(username, password);
      return sendJson(res, 201, { ok: true, username: owner.username });
    }

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

    if (p === "/api/agenti" && req.method === "GET") {
      return sendJson(res, 200, store.listAgents());
    }

    const matchAgentUpdate = p.match(/^\/api\/agenti\/([^/]+)$/);
    if (matchAgentUpdate && req.method === "PUT") {
      const body = await readBody(req);
      const updated = store.updateAgent(matchAgentUpdate[1], body);
      if (!updated) return sendJson(res, 404, { error: "agente_non_trovato" });
      return sendJson(res, 200, updated);
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
