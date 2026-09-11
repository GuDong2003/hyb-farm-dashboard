import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker/index.js';

const VISITOR_USAGE_COUNT_KV_KEY = 'farm:usage:visitors:v1';

function createMemoryKv(entries = {}) {
  const values = new Map(Object.entries(entries));
  const puts = [];
  let gets = 0;
  return {
    values,
    puts,
    getCount() { return gets; },
    async get(key) {
      gets += 1;
      return values.has(key) ? values.get(key) : null;
    },
    async put(key, value) {
      puts.push({ key, value });
      values.set(key, String(value));
    }
  };
}

function request(method, body) {
  return new Request('https://farm.test/api/visitor-usage', {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
}

test('first visitor registration increments KV without reading D1', async () => {
  const kv = createMemoryKv();
  const env = {
    LATEST_KV: kv,
    PRICE_DB: { prepare() { throw new Error('visitor usage must not access D1'); } }
  };

  const response = await worker.fetch(request('POST', { visitorId: 'visitor-aaaaaaaaaaaaaaaa' }), env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, visitors: 1, counted: true });
  assert.equal(kv.values.get(VISITOR_USAGE_COUNT_KV_KEY), '1');
  assert.equal(kv.puts.length, 2);
});

test('the same visitor registration does not increment the count twice', async () => {
  const kv = createMemoryKv();
  const env = { LATEST_KV: kv };
  const first = await worker.fetch(request('POST', { visitorId: 'visitor-bbbbbbbbbbbbbbbb' }), env);
  const second = await worker.fetch(request('POST', { visitorId: 'visitor-bbbbbbbbbbbbbbbb' }), env);

  assert.equal((await first.json()).visitors, 1);
  assert.deepEqual(await second.json(), { ok: true, visitors: 1, counted: false });
  assert.equal(kv.values.get(VISITOR_USAGE_COUNT_KV_KEY), '1');
  assert.equal(kv.puts.length, 2);
});

test('visitor usage GET is edge-cached and does not depend on D1', async () => {
  const kv = createMemoryKv({ [VISITOR_USAGE_COUNT_KV_KEY]: '37' });
  const cacheEntries = new Map();
  const edgeCache = {
    async match(request) {
      const response = cacheEntries.get(new URL(request.url).href);
      return response ? response.clone() : undefined;
    },
    async put(request, response) {
      cacheEntries.set(new URL(request.url).href, response.clone());
    }
  };
  const previousCaches = globalThis.caches;
  globalThis.caches = { default: edgeCache };
  try {
    const env = {
      LATEST_KV: kv,
      PRICE_DB: { prepare() { throw new Error('visitor usage must not access D1'); } }
    };
    const first = await worker.fetch(request('GET'), env);
    const second = await worker.fetch(request('GET'), env);

    assert.deepEqual(await first.json(), { ok: true, visitors: 37 });
    assert.deepEqual(await second.json(), { ok: true, visitors: 37 });
    assert.equal(kv.getCount(), 1, 'the second GET is served from the edge cache');
    assert.match(first.headers.get('cache-control'), /s-maxage=600/);
  } finally {
    if (previousCaches === undefined) delete globalThis.caches;
    else globalThis.caches = previousCaches;
  }
});

test('missing or malformed visitor ids are rejected before KV writes', async () => {
  const kv = createMemoryKv();
  const env = { LATEST_KV: kv };
  for (const body of [{}, { visitorId: 'too-short' }]) {
    const response = await worker.fetch(request('POST', body), env);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'invalid_visitor_id');
  }
  assert.equal(kv.puts.length, 0);
});
