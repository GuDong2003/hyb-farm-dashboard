import test from 'node:test';
import assert from 'node:assert/strict';

import worker, {
  buildPriceChangeWindows,
  publishLatestSnapshot
} from '../worker/index.js';

const LATEST_AT = Date.parse('2026-09-30T00:00:00.000Z');
const WINDOWS = ['1h', '6h', '12h', '24h', '7d', '30d'];

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

function publishedSnapshot() {
  return {
    version: 1,
    source: 'cloud-default',
    capturedAt: LATEST_AT,
    historySnapshotCount: 2337,
    prices: { shop: { carrot: 100 } },
    priceChangeWindows: Object.fromEntries(WINDOWS.map((window) => [window, {
      carrot: {
        rate: 10,
        baseAt: LATEST_AT - 60 * 60 * 1000,
        endAt: LATEST_AT,
        basePrice: 90,
        endPrice: 100
      }
    }]))
  };
}

test('default and compact trend reads use the published KV snapshot before D1', async () => {
  const cache = createMemoryCache();
  const snapshot = publishedSnapshot();
  let d1Reads = 0;
  const env = {
    LATEST_KV: {
      async get(key, options) {
        assert.equal(key, 'latest-snapshot-v1');
        assert.deepEqual(options, { type: 'json' });
        return snapshot;
      }
    },
    PRICE_DB: {
      prepare() {
        d1Reads += 1;
        throw new Error('KV hit must not read D1');
      }
    }
  };

  await withMemoryCache(cache, async () => {
    const defaultResponse = await worker.fetch(new Request('https://cache.test/api/default-prices'), env);
    assert.equal(defaultResponse.status, 200);
    assert.deepEqual((await defaultResponse.json()).snapshot.priceChangeWindows['24h'].carrot.rate, 10);

    const trendResponse = await worker.fetch(new Request('https://cache.test/api/price-trends?window=24h'), env);
    assert.equal(trendResponse.status, 200);
    assert.deepEqual((await trendResponse.json()).trends.carrot.rate, 10);
  });

  assert.equal(d1Reads, 0);
});

test('incomplete trend hydration is retryable and never caches an empty result', async () => {
  const cache = createMemoryCache();
  const snapshot = publishedSnapshot();
  delete snapshot.priceChangeWindows;
  let d1Reads = 0;
  const env = {
    LATEST_KV: { async get() { return snapshot; } },
    PRICE_DB: {
      prepare() {
        d1Reads += 1;
        throw new Error('temporary history failure');
      }
    }
  };

  await withMemoryCache(cache, async () => {
    const response = await worker.fetch(new Request('https://cache.test/api/price-trends?window=24h'), env);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('retry-after'), '60');
    assert.deepEqual(await response.json(), {
      ok: false,
      error: 'price_trend_unavailable',
      window: '24h',
      retryable: true
    });
  });

  assert.equal(d1Reads, 1);
  assert.equal(cache.entries.size, 0, 'an unavailable trend must not poison the edge cache');
});

test('legacy published snapshots hydrate the cloud history count from a dedicated KV key', async () => {
  const cache = createMemoryCache();
  const legacy = publishedSnapshot();
  delete legacy.historySnapshotCount;
  const kvReads = [];
  const env = {
    LATEST_KV: {
      async get(key, options) {
        kvReads.push({ key, options });
        if (key === 'latest-snapshot-v1') return legacy;
        if (key === 'history-count-v1') return 2337;
        return null;
      }
    },
    PRICE_DB: { prepare: () => { throw new Error('complete legacy snapshot should not read D1'); } }
  };

  await withMemoryCache(cache, async () => {
    const response = await worker.fetch(new Request('https://cache.test/api/default-prices'), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).snapshot.historySnapshotCount, 2337);
  });

  assert.deepEqual(kvReads, [
    { key: 'latest-snapshot-v1', options: { type: 'json' } },
    { key: 'history-count-v1', options: { type: 'json' } }
  ]);
});

test('legacy published snapshots backfill compact windows once and remain readable', async () => {
  const cache = createMemoryCache();
  const legacy = {
    version: 1,
    source: 'cloud-default',
    capturedAt: LATEST_AT,
    prices: { shop: { carrot: 100 } }
  };
  let d1Reads = 0;
  const puts = [];
  const env = {
    LATEST_KV: {
      async get() { return legacy; },
      async put(key, value) { puts.push({ key, value: JSON.parse(value) }); }
    },
    PRICE_DB: {
      prepare() {
        d1Reads += 1;
        return {
          bind() {
            return { async all() { return { results: [] }; } };
          }
        };
      }
    }
  };

  await withMemoryCache(cache, async () => {
    const response = await worker.fetch(new Request('https://cache.test/api/default-prices'), env);
    const body = await response.json();
    assert.deepEqual(Object.keys(body.snapshot.priceChangeWindows), WINDOWS);
  });

  assert.equal(d1Reads, 1);
  assert.equal(puts.length, 1);
  assert.deepEqual(Object.keys(puts[0].value.priceChangeWindows), WINDOWS);
});

test('cold D1 snapshot hydration reuses the single history read for trend data', async () => {
  const cache = createMemoryCache();
  let prepareCount = 0;
  const preparedSql = [];
  const env = {
    PRICE_DB: {
      prepare(sql) {
        prepareCount += 1;
        preparedSql.push(sql);
        if (sql.includes('SELECT * FROM default_prices')) {
          return {
            async first() {
              return {
                captured_at: LATEST_AT,
                updated_at: LATEST_AT,
                matched_count: 1,
                total_count: 1,
                prices_json: JSON.stringify({ carrot: 100 }),
                price_change_rates_json: '{}',
                price_trends_json: '{}'
              };
            }
          };
        }
        return {
          bind() {
            return {
              async all() {
                return {
                  results: [{
                    captured_at: LATEST_AT,
                    prices_json: JSON.stringify({ carrot: 100 }),
                    history_snapshot_count: 2337
                  }]
                };
              }
            };
          }
        };
      }
    },
    LATEST_KV: { async put() {} }
  };

  await withMemoryCache(cache, async () => {
    const response = await worker.fetch(new Request('https://cache.test/api/default-prices'), env);
    assert.equal(response.status, 200);
    assert.equal((await response.clone().json()).snapshot.historySnapshotCount, 2337);
  });

  assert.equal(prepareCount, 2);
  assert.match(preparedSql[1], /COUNT\(\*\)/i);
  assert.match(preparedSql[1], /history_snapshot_count/i);
});

test('trend windows use independent edge keys and short/long cache lifetimes', async () => {
  const cache = createMemoryCache();
  const env = {
    LATEST_KV: { get: async () => publishedSnapshot() },
    PRICE_DB: { prepare: () => { throw new Error('published snapshot should be enough'); } }
  };

  await withMemoryCache(cache, async () => {
    for (const window of WINDOWS) {
      const response = await worker.fetch(new Request(`https://cache.test/api/price-trends?window=${window}`), env);
      assert.equal(response.status, 200);
    }
  });

  for (const window of WINDOWS) {
    const key = `https://cache.test/api/price-trends?window=${window}&_cache=v2`;
    const cached = cache.entries.get(key);
    assert.ok(cached, `edge cache contains ${window}`);
    const cacheControl = cached.headers.get('cache-control');
    if (['1h', '6h', '12h', '24h'].includes(window)) assert.match(cacheControl, /s-maxage=600/);
    else assert.match(cacheControl, /s-maxage=3600/);
  }
});

test('window summaries select the correct historical anchor', () => {
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  const rows = [
    { captured_at: LATEST_AT - 30 * day, prices_json: JSON.stringify({ carrot: 10 }) },
    { captured_at: LATEST_AT - 7 * day, prices_json: JSON.stringify({ carrot: 20 }) },
    { captured_at: LATEST_AT - 24 * hour, prices_json: JSON.stringify({ carrot: 50 }) },
    { captured_at: LATEST_AT - 12 * hour, prices_json: JSON.stringify({ carrot: 60 }) },
    { captured_at: LATEST_AT - 6 * hour, prices_json: JSON.stringify({ carrot: 70 }) },
    { captured_at: LATEST_AT - hour, prices_json: JSON.stringify({ carrot: 90 }) },
    { captured_at: LATEST_AT, prices_json: JSON.stringify({ carrot: 100 }) }
  ];
  const result = buildPriceChangeWindows(rows, {
    capturedAt: LATEST_AT,
    prices: { shop: { carrot: 100 } }
  });

  assert.ok(Math.abs(result['1h'].carrot.rate - (100 / 90 * 100 - 100)) < 1e-6);
  assert.ok(Math.abs(result['6h'].carrot.rate - (100 / 70 * 100 - 100)) < 1e-6);
  assert.ok(Math.abs(result['12h'].carrot.rate - (100 / 60 * 100 - 100)) < 1e-6);
  assert.ok(Math.abs(result['24h'].carrot.rate - (100 / 50 * 100 - 100)) < 1e-6);
  assert.ok(Math.abs(result['7d'].carrot.rate - (100 / 20 * 100 - 100)) < 1e-6);
  assert.ok(Math.abs(result['30d'].carrot.rate - (100 / 10 * 100 - 100)) < 1e-6);
});

test('accepted snapshots can be published to KV without changing the response path', async () => {
  const snapshot = publishedSnapshot();
  const calls = [];
  const env = {
    LATEST_KV: {
      async put(key, value, options) {
        calls.push({ key, value: JSON.parse(value), options });
      }
    }
  };

  assert.equal(await publishLatestSnapshot(env, snapshot), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, 'latest-snapshot-v1');
  assert.deepEqual(calls[0].value, snapshot);
});

test('older snapshots cannot overwrite a newer published KV snapshot', async () => {
  const newer = publishedSnapshot();
  newer.capturedAt += 60 * 60 * 1000;
  let putCount = 0;
  const env = {
    LATEST_KV: {
      async get() { return newer; },
      async put() { putCount += 1; }
    }
  };

  assert.equal(await publishLatestSnapshot(env, publishedSnapshot()), false);
  assert.equal(putCount, 0);
});

test('versioned KV snapshots select the newest capture without a mutable pointer', async () => {
  const older = publishedSnapshot();
  const newer = publishedSnapshot();
  newer.capturedAt += 60 * 60 * 1000;
  const entries = new Map([
    ['latest-snapshot-v1:00001759152000000:00001759152000000', older],
    ['latest-snapshot-v1:00001759155600000:00001759155600000', newer]
  ]);
  const env = {
    LATEST_KV: {
      async list({ prefix }) {
        return { keys: Array.from(entries.keys()).filter((key) => key.startsWith(prefix)).map((name) => ({ name })) };
      },
      async get(key) {
        return entries.get(key) || null;
      }
    },
    PRICE_DB: { prepare: () => { throw new Error('versioned KV hit must not read D1'); } }
  };

  await withMemoryCache(createMemoryCache(), async () => {
    const response = await worker.fetch(new Request('https://cache.test/api/default-prices'), env);
    assert.equal((await response.json()).snapshot.capturedAt, newer.capturedAt);
  });
});
