'use strict';

/** Serve web/dist. Asset hashati immutabili, HTML senza cache. */

const fs = require('node:fs');
const path = require('node:path');

const DIST = path.resolve(__dirname, '..', 'web', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
};

function serve(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const full = path.join(DIST, path.normalize(rel));
  if (!full.startsWith(DIST)) { res.writeHead(403); return res.end('Vietato'); }

  fs.readFile(full, (err, data) => {
    if (err) {
      // SPA fallback: rotte client-side su index.html
      return fs.readFile(path.join(DIST, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(404); return res.end('Non trovato'); }
        res.writeHead(200, { 'content-type': MIME['.html'] });
        res.end(html);
      });
    }
    const ext = path.extname(full);
    const hashato = /\.[a-z0-9]{8,}\.(js|css)$/i.test(full);
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': hashato ? 'public, max-age=31536000, immutable' : 'no-cache'
    });
    res.end(data);
  });
}

module.exports = { serve, DIST };
