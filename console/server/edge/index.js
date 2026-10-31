'use strict';

const http = require('node:http');
const { flags, requireFlag } = require('../config/flags');
const { createLegacyMount } = require('../legacy/mount');
const { createRouter } = require('./router');
const { createAuth } = require('./auth');
const staticServer = require('./static');
const { createAdapter } = require('../services/persistence/adapter');

async function main({ app, publicDir, config }) {
  requireFlag('edge', 'avvia con AETHERSY_EDGE=on');

  const adapter = createAdapter();
  await adapter.init();

  const legacy = createLegacyMount({ port: flags.legacyPort, app });

  const edgeAuth = createAuth({
    adapter,
    enabled: flags.auth
  });

  const apiV2Enabled = flags.apiV2;

  const router = createRouter({
    legacy,
    v2: undefined,
    auth: edgeAuth,
    staticServer,
    apiV2Enabled
  });

  // Attach the edge router to the main app
  // Edge routes are mounted at /__edge prefix
  app.get('/__edge/*', async (req, reply) => {
    // Extract the real path after /__edge/
    const realPath = req.url.replace('/__edge/', '/');
    // Route through the edge router
    await router(req, reply);
  });

  // Health check endpoint
  app.get('/__edge/health', async (req, reply) => {
    const s = legacy.stats();
    reply.code(s.state === 'ready' ? 200 : 503);
    reply.type('application/json').send({ edge: 'ok', legacy: s, v2: apiV2Enabled });
  });

  // Serve static web/dist assets through edge
  const distDir = path.resolve(publicDir, '..', 'web', 'dist');
  if (fs.existsSync(distDir)) {
    await app.register(fastifyStatic, { root: distDir, wildcard: true });
    app.log.info('static assets serviti dall\'edge');
  }
}

module.exports = { main, createAuth, createRouter };
