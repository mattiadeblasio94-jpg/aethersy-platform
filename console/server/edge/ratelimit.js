'use strict';

/** Finestra scorrevole in memoria. Con piu' istanze va sostituito da Redis. */

function createLimiter({ max, windowMs }) {
  const hits = new Map();

  return function check(key) {
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      hits.set(key, list);
      return { ok: false, retryAfter: Math.ceil((windowMs - (now - list[0])) / 1000) };
    }
    list.push(now);
    hits.set(key, list);
    return { ok: true };
  };
}

module.exports = { createLimiter };
