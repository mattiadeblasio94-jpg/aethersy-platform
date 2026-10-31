'use strict';

function createRouter({ legacy, v2, auth, staticServer, apiV2Enabled }) {
  return async function route(req, res) {
    const p = new URL(req.url, 'http://edge').pathname;

    if (p === '/__edge/health') {
      const s = legacy.stats();
      res.writeHead(s.state === 'ready' ? 200 : 503, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ edge: 'ok', legacy: s, v2: apiV2Enabled }));
    }

    const fermato = await auth.handle(req, res);
    if (fermato) return;

    if (p === '/v2' || p.startsWith('/v2/')) {
      if (!apiV2Enabled) {
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'v2_spenta' }));
      }
      return v2(req, res);
    }

    if (p.startsWith('/api/') || p.startsWith('/anteprima') || p === '/imposta-accesso') {
      return legacy.handler(req, res);
    }

    return staticServer(req, res, p);
  };
}

module.exports = { createRouter };
