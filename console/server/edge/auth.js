'use strict';

/**
 * Autenticazione sull'edge (ADR 0002).
 * Il legacy non vede mai le credenziali del founder: riceve l'account di
 * servizio iniettato qui (INV-11).
 */

const session = require('./session');
const { createLimiter } = require('./ratelimit');

const PUBBLICHE = new Set([
  '/api/salute',
  '/__edge/health',
  '/anteprima', '/anteprima/', '/anteprima.html',
  '/setup', '/api/setup',
  '/login', '/api/login', '/logout', '/api/logout',
  '/manifest.webmanifest', '/sw.js'
]);

const limiter = createLimiter({ max: 8, windowMs: 15 * 60 * 1000 });

function serviceAuth() {
  const u = process.env.AETHERSY_SERVICE_USER;
  const p = process.env.AETHERSY_SERVICE_PASS;
  if (!u || !p) throw new Error('account di servizio non configurato');
  return 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

function json(res, status, body, extra = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...extra });
  res.end(JSON.stringify(body));
}

function createAuth({ adapter, enabled }) {
  async function handle(req, res) {
    const p = new URL(req.url, 'http://edge').pathname;
    const ip = clientIp(req);

    if (p === '/api/login' && req.method === 'POST') {
      const rl = limiter.check(`login:${ip}`);
      if (!rl.ok) return json(res, 429, { error: 'troppi_tentativi' }, { 'retry-after': String(rl.retryAfter) });

      let body = '';
      for await (const chunk of req) body += chunk;
      let creds;
      try { creds = JSON.parse(body); } catch { return json(res, 400, { error: 'json_non_valido' }); }

      const ok = await adapter.verifyOwner(String(creds.username || ''), String(creds.password || ''));
      if (!ok) return json(res, 401, { error: 'credenziali_non_valide' });

      const s = session.issue(String(creds.username));
      return json(res, 200, { ok: true }, {
        'set-cookie': session.cookieHeader(s.value, s.expires, req.headers['x-forwarded-proto'] === 'https')
      });
    }

    if (p === '/api/logout' && req.method === 'POST') {
      return json(res, 200, { ok: true }, { 'set-cookie': session.clearHeader() });
    }

    const s = session.read(req.headers.cookie);
    req.aetherUser = s ? { id: s.id } : null;

    if (PUBBLICHE.has(p)) return false;

    if (!enabled) {
      // Auth spenta: si inoltra comunque l'account di servizio se configurato.
      if (process.env.AETHERSY_SERVICE_USER) req.headers.authorization = serviceAuth();
      return false;
    }

    if (!s) {
      if (p.startsWith('/api/')) return json(res, 401, { error: 'non_autenticato' }), true;
      res.writeHead(302, { location: '/login' });
      return res.end(), true;
    }

    req.headers.authorization = serviceAuth();
    return false;
  }

  return { handle };
}

module.exports = { createAuth, PUBBLICHE };
