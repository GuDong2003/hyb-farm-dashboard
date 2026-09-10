import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../worker/index.js';

const [app, workerSource] = await Promise.all([
  readFile(new URL('../web/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../worker/index.js', import.meta.url), 'utf8')
]);

const initSource = app.match(/async function init\(\)[\s\S]*?(?=\n  init\(\))/)?.[0] || '';

test('dashboard defers cloud history reads until history features are opened', () => {
  assert.match(initSource, /await loadCloudDefaultPrices\(false\)/);
  assert.doesNotMatch(initSource, /loadHistoryAlerts\(false\)/);
  assert.match(app, /const historyPromise = loadHistoryAlerts\(false\)/);
  assert.match(app, /cache: force \? 'reload' : 'default'/);
  assert.match(app, /CLOUD_DEFAULT_ENDPOINT[\s\S]*?cache: 'default'/);
});

test('public cloud reads use edge caching and accepted uploads invalidate cached responses', () => {
  assert.match(workerSource, /caches\.default/);
  assert.match(workerSource, /cache\.match\(/);
  assert.match(workerSource, /cache\.put\(/);
  assert.match(workerSource, /cache\.delete\(/);
  assert.match(workerSource, /s-maxage=60/);
  assert.match(workerSource, /await purgePriceResponseCaches\(request\)/);
});

function createMemoryCache() {
  const entries = new Map();
  return {
    entries,
    async match(request) {
      const response = entries.get(new URL(request.url).href);
      return response ? response.clone() : undefined;
    },
    async put(request, response) {
      entries.set(new URL(request.url).href, response.clone());
    },
    async delete(request) {
      return entries.delete(new URL(request.url).href);
    }
  };
}

async function withMemoryCache(cache, callback) {
  const previousCaches = globalThis.caches;
  globalThis.caches = { default: cache };
  try {
    return await callback();
  } finally {
    if (previousCaches === undefined) delete globalThis.caches;
    else globalThis.caches = previousCaches;
  }
}

test('default-price and history GETs reuse edge responses until an explicit refresh', async () => {
  const cache = createMemoryCache();
  await withMemoryCache(cache, async () => {
    let defaultReads = 0;
    const defaultEnv = {
      PRICE_DB: {
        prepare() {
          defaultReads += 1;
          return { first: async () => null };
        }
      }
    };
    const defaultUrl = 'https://cache.test/api/default-prices';
    await worker.fetch(new Request(defaultUrl), defaultEnv);
    await worker.fetch(new Request(defaultUrl), defaultEnv);
    assert.equal(defaultReads, 1, 'cached default response avoids a second D1 read');
    assert.match(cache.entries.get(defaultUrl).headers.get('cache-control'), /s-maxage=60/);

    await worker.fetch(new Request(defaultUrl, { headers: { 'cache-control': 'no-cache' } }), defaultEnv);
    assert.equal(defaultReads, 2, 'explicit refresh bypasses the edge response');

    let historyReads = 0;
    const historyEnv = {
      PRICE_DB: {
        prepare() {
          historyReads += 1;
          return { all: async () => ({ results: [] }) };
        }
      }
    };
    const historyUrl = 'https://cache.test/api/price-history?threshold=20';
    await worker.fetch(new Request(historyUrl), historyEnv);
    await worker.fetch(new Request(historyUrl), historyEnv);
    assert.equal(historyReads, 1, 'cached history response avoids a second D1 read');
  });
});
