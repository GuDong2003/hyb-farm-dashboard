import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker/index.js';

const LATEST_AT = Date.parse('2026-09-30T00:00:00.000Z');
const HOUR = 60 * 60 * 1000;

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

test('price-series reads only the requested crop/window and caches each query independently', async () => {
  const cache = createMemoryCache();
  const prepareCalls = [];
  const env = {
    PRICE_DB: {
      prepare(sql) {
        prepareCalls.push(sql);
        return {
          bind(...bindings) {
            assert.equal(bindings[0], 7 * 24 * HOUR);
            assert.equal(bindings[1], 7 * 24 * HOUR + HOUR);
            return {
              async all() {
                return {
                  results: [
                    { id: 1, accepted_at: LATEST_AT - HOUR, captured_at: LATEST_AT - HOUR, source: 'a', price: 10 },
                    { id: 2, accepted_at: LATEST_AT, captured_at: LATEST_AT, source: 'b', price: 12 }
                  ]
                };
              }
            };
          }
        };
      }
    }
  };

  await withMemoryCache(cache, async () => {
    const first = await worker.fetch(new Request('https://cache.test/api/price-series?seedId=carrot&window=7d'), env);
    const second = await worker.fetch(new Request('https://cache.test/api/price-series?seedId=carrot&window=7d'), env);
    const otherCrop = await worker.fetch(new Request('https://cache.test/api/price-series?seedId=corn&window=7d'), env);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(otherCrop.status, 200);
    assert.deepEqual((await first.json()).series, [{ seedId: 'carrot', points: [
      { submissionId: 1, source: 'a', capturedAt: LATEST_AT - HOUR, price: 10 },
      { submissionId: 2, source: 'b', capturedAt: LATEST_AT, price: 12 }
    ] }]);
    assert.equal((await otherCrop.json()).seedId, 'corn');
  });

  assert.equal(prepareCalls.length, 2, 'the same crop/window is served from edge cache');
  assert.match(prepareCalls[0], /json_extract\(prices_json, '\$\.carrot'\)/);
  assert.match(prepareCalls[0], /captured_at >=/);
  assert.doesNotMatch(prepareCalls[0], /SELECT id, submitted_at, accepted_at, captured_at, source, prices_json/);
  assert.ok(cache.entries.has('https://cache.test/api/price-series?seedId=carrot&window=7d'));
  assert.ok(cache.entries.has('https://cache.test/api/price-series?seedId=corn&window=7d'));
});

test('price-series rejects unknown crops and windows before touching D1', async () => {
  let reads = 0;
  const env = {
    PRICE_DB: {
      prepare() {
        reads += 1;
        throw new Error('invalid parameters must not read D1');
      }
    }
  };

  const invalidCrop = await worker.fetch(new Request('https://cache.test/api/price-series?seedId=unknown&window=7d'), env);
  const invalidWindow = await worker.fetch(new Request('https://cache.test/api/price-series?seedId=carrot&window=2h'), env);

  assert.equal(invalidCrop.status, 400);
  assert.equal(invalidWindow.status, 400);
  assert.equal(reads, 0);
});
