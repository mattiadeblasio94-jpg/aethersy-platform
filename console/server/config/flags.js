'use strict';

/** Flag centralizzati, spenti di default (INV-8). */

const SPEC = {
  AETHERSY_EDGE: { type: 'bool', default: false },
  AETHERSY_AUTH: { type: 'bool', default: false },
  AETHERSY_API_V2: { type: 'bool', default: false },
  AETHERSY_LEGACY_PORT: { type: 'int', default: 0 }
};

function parse(name) {
  const spec = SPEC[name];
  if (!spec) throw new Error(`flag sconosciuto: ${name}`);
  const raw = process.env[name];
  if (raw === undefined || raw === '') return spec.default;
  if (spec.type === 'bool') {
    if (['on', 'true', '1'].includes(raw)) return true;
    if (['off', 'false', '0'].includes(raw)) return false;
    throw new Error(`${name}="${raw}" non booleano`);
  }
  if (spec.type === 'int') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${name}="${raw}" non intero`);
    return n;
  }
  return raw;
}

const flags = {
  edge: parse('AETHERSY_EDGE'),
  auth: parse('AETHERSY_AUTH'),
  apiV2: parse('AETHERSY_API_V2'),
  legacyPort: parse('AETHERSY_LEGACY_PORT')
};

function requireFlag(name, why) { if (!flags[name]) throw new Error(`flag ${name} spento: ${why}`); }

module.exports = { flags, requireFlag, SPEC };
