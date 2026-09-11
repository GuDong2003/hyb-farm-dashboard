import test from 'node:test';
import assert from 'node:assert/strict';

import worker, { VisitorCounter } from '../worker/index.js';

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

function createMemoryDurableObjectStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    values,
    async get(key) {
      await Promise.resolve();
      return values.has(key) ? values.get(key) : undefined;
    },
    async put(key, value) {
      await Promise.resolve();
      if (key instanceof Map) {
        for (const [entryKey, entryValue] of key.entries()) values.set(entryKey, entryValue);
        return;
      }
      if (key && typeof key === 'object') {
        for (const [entryKey, entryValue] of Object.entries(key)) values.set(entryKey, entryValue);
        return;
      }
      values.set(key, value);
    }
  };
}

function createVisitorCounterNamespace(env, entries = {}, storage = null) {
  storage = storage || createMemoryDurableObjectStorage(entries);
  const state = { storage };
  const object = new VisitorCounter(state, env);
  return {
    storage,
    idFromName(name) { return `visitor-counter:${name}`; },
    get() { return { fetch: (request) => object.fetch(request) }; }
  };
}

test('first visitor registration increments through the durable counter without reading D1', async () => {
  const kv = createMemoryKv();
  const env = {
    LATEST_KV: kv,
    PRICE_DB: { prepare() { throw new Error('visitor usage must not access D1'); } }
  };
  env.VISITOR_COUNTER = createVisitorCounterNamespace(env);

  const response = await worker.fetch(request('POST', { visitorId: 'visitor-aaaaaaaaaaaaaaaa' }), env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, visitors: 1, counted: true });
  assert.equal(kv.puts.length, 0);
  assert.equal(kv.getCount(), 0);
});

test('the same visitor registration does not increment the count twice', async () => {
  const kv = createMemoryKv();
  const env = { LATEST_KV: kv };
  env.VISITOR_COUNTER = createVisitorCounterNamespace(env);
  const first = await worker.fetch(request('POST', { visitorId: 'visitor-bbbbbbbbbbbbbbbb' }), env);
  const second = await worker.fetch(request('POST', { visitorId: 'visitor-bbbbbbbbbbbbbbbb' }), env);

  assert.equal((await first.json()).visitors, 1);
  assert.deepEqual(await second.json(), { ok: true, visitors: 1, counted: false });
  assert.equal(kv.puts.length, 0);
  assert.equal(kv.getCount(), 0);
});

test('durable visitor counter serializes concurrent registrations without losing increments', async () => {
  const kv = createMemoryKv({ [VISITOR_USAGE_COUNT_KV_KEY]: '2' });
  const env = { LATEST_KV: kv };
  env.VISITOR_COUNTER = createVisitorCounterNamespace(env, { count: '2' });

  const uniqueResults = await Promise.all([
    worker.fetch(request('POST', { visitorId: 'visitor-cccccccccccccccc' }), env),
    worker.fetch(request('POST', { visitorId: 'visitor-dddddddddddddddd' }), env),
    worker.fetch(request('POST', { visitorId: 'visitor-eeeeeeeeeeeeeeee' }), env)
  ]);
  const uniqueBodies = await Promise.all(uniqueResults.map((response) => response.json()));
  assert.deepEqual(uniqueBodies.map((body) => body.visitors).sort((a, b) => a - b), [3, 4, 5]);
  assert.equal(uniqueBodies.filter((body) => body.counted).length, 3);

  const duplicateResults = await Promise.all([
    worker.fetch(request('POST', { visitorId: 'visitor-ffffffffffffffff' }), env),
    worker.fetch(request('POST', { visitorId: 'visitor-ffffffffffffffff' }), env)
  ]);
  const duplicateBodies = await Promise.all(duplicateResults.map((response) => response.json()));
  assert.equal(duplicateBodies.filter((body) => body.counted).length, 1);
  assert.equal(duplicateBodies.filter((body) => !body.counted).length, 1);

  const current = await worker.fetch(request('GET'), env);
  assert.deepEqual(await current.json(), { ok: true, visitors: 6 });
  assert.equal(kv.values.get(VISITOR_USAGE_COUNT_KV_KEY), '2');
  assert.equal(kv.puts.length, 0);
});

test('durable visitor counter ignores the compatibility KV after its state exists', async () => {
  const kv = createMemoryKv({ [VISITOR_USAGE_COUNT_KV_KEY]: '2' });
  const env = { LATEST_KV: kv };
  env.VISITOR_COUNTER = createVisitorCounterNamespace(env, { count: '2' });

  const first = await worker.fetch(request('GET'), env);
  assert.deepEqual(await first.json(), { ok: true, visitors: 2 });

  kv.values.set(VISITOR_USAGE_COUNT_KV_KEY, '5');
  const second = await worker.fetch(request('GET'), env);
  assert.deepEqual(await second.json(), { ok: true, visitors: 2 });
  assert.equal(kv.getCount(), 0, 'visitor reads stay inside the durable counter');
});

test('durable counter binding failures do not fall back to unsafe KV increments', async () => {
  const kv = createMemoryKv({ [VISITOR_USAGE_COUNT_KV_KEY]: '4' });
  const env = {
    LATEST_KV: kv,
    VISITOR_COUNTER: {
      idFromName() { return 'visitor-counter:global'; },
      get() { throw new Error('counter unavailable'); }
    }
  };

  const response = await worker.fetch(request('POST', { visitorId: 'visitor-gggggggggggggggg' }), env);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: 'visitor_counter_unavailable',
    visitors: null,
    counted: false
  });
  assert.equal(kv.getCount(), 0);
  assert.equal(kv.puts.length, 0);
});

test('missing durable counter binding never performs a KV read-modify-write', async () => {
  const kv = createMemoryKv({ [VISITOR_USAGE_COUNT_KV_KEY]: '4' });
  const env = { LATEST_KV: kv };

  const responses = await Promise.all([
    worker.fetch(request('POST', { visitorId: 'visitor-hhhhhhhhhhhhhhhh' }), env),
    worker.fetch(request('POST', { visitorId: 'visitor-iiiiiiiiiiiiiiii' }), env)
  ]);

  for (const response of responses) {
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: 'visitor_counter_unavailable',
      visitors: null,
      counted: false
    });
  }
  assert.equal(kv.values.get(VISITOR_USAGE_COUNT_KV_KEY), '4');
  assert.equal(kv.getCount(), 0);
  assert.equal(kv.puts.length, 0);
});

test('durable counter registration keeps count and marker atomic when storage fails', async () => {
  const kv = createMemoryKv({ [VISITOR_USAGE_COUNT_KV_KEY]: '7' });
  const storage = createMemoryDurableObjectStorage({ count: '7' });
  const originalPut = storage.put.bind(storage);
  storage.put = async (key, value) => {
    const keys = key instanceof Map
      ? [...key.keys()]
      : key && typeof key === 'object'
        ? Object.keys(key)
        : [key];
    if (keys.some((entryKey) => String(entryKey).startsWith('visitor:'))) {
      throw new Error('marker write failed');
    }
    return originalPut(key, value);
  };
  const env = { LATEST_KV: kv };
  env.VISITOR_COUNTER = createVisitorCounterNamespace(env, {}, storage);

  const response = await worker.fetch(request('POST', { visitorId: 'visitor-jjjjjjjjjjjjjjjj' }), env);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: 'visitor_counter_unavailable',
    visitors: null,
    counted: false
  });
  assert.equal(storage.values.get('count'), '7', 'a failed registration must not persist a partial count');
  assert.equal([...storage.values.keys()].some((key) => String(key).startsWith('visitor:')), false);
});

test('durable visitor counter keeps its count without a compatibility KV', async () => {
  const env = {};
  env.VISITOR_COUNTER = createVisitorCounterNamespace(env, { count: '4' });

  const response = await worker.fetch(request('GET'), env);

  assert.deepEqual(await response.json(), { ok: true, visitors: 4 });
});

test('visitor usage GET reads the durable counter without edge caching', async () => {
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
    env.VISITOR_COUNTER = createVisitorCounterNamespace(env, { count: '37' });
    const first = await worker.fetch(request('GET'), env);
    kv.values.set(VISITOR_USAGE_COUNT_KV_KEY, '38');
    const second = await worker.fetch(request('GET'), env);

    assert.deepEqual(await first.json(), { ok: true, visitors: 37 });
    assert.deepEqual(await second.json(), { ok: true, visitors: 37 });
    assert.equal(kv.getCount(), 0, 'visitor GETs do not read KV');
    assert.equal(cacheEntries.size, 0, 'visitor usage must not be written to edge cache');
    assert.equal(first.headers.get('cache-control'), 'no-store');
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
