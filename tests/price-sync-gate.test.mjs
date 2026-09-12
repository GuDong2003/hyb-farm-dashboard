import test from 'node:test';
import assert from 'node:assert/strict';

import worker, { PriceSyncGate } from '../worker/index.js';

function createStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    values,
    async get(key) {
      return values.has(key) ? values.get(key) : undefined;
    },
    async put(key, value) {
      if (key && typeof key === 'object' && !Array.isArray(key)) {
        for (const [entryKey, entryValue] of Object.entries(key)) values.set(entryKey, entryValue);
        return;
      }
      values.set(key, value);
    },
    async delete(key) {
      values.delete(key);
    }
  };
}

function createGateNamespace(entries = {}) {
  const storage = createStorage(entries);
  const object = new PriceSyncGate({ storage }, {});
  return {
    storage,
    idFromName(name) { return `price-sync-gate:${name}`; },
    get() { return { fetch: (request) => object.fetch(request) }; }
  };
}

function gateRequest(body, version = '0.6.0') {
  return new Request('https://farm.test/api/price-sync-gate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scriptVersion: version, ...body })
  });
}

async function internalGateRequest(gate, path, body) {
  const stub = gate.get(gate.idFromName('global'));
  return stub.fetch(new Request(`https://price-sync-gate${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }));
}

test('concurrent users share one active three-minute capture lease without D1', async () => {
  const gate = createGateNamespace();
  const env = {
    PRICE_SYNC_GATE: gate,
    PRICE_DB: { prepare() { throw new Error('gate acquisition must not read D1'); } }
  };

  const responses = await Promise.all([
    worker.fetch(gateRequest({ action: 'acquire' }), env),
    worker.fetch(gateRequest({ action: 'acquire' }), env),
    worker.fetch(gateRequest({ action: 'acquire' }), env)
  ]);
  const bodies = await Promise.all(responses.map((response) => response.json()));
  const granted = bodies.filter((body) => body.granted);
  const denied = bodies.filter((body) => !body.granted);

  assert.equal(granted.length, 1);
  assert.match(granted[0].leaseId, /^[a-f0-9-]{36}$/);
  assert.ok(granted[0].leaseExpiresAt >= Date.now() + 179_000);
  assert.equal(denied.length, 2);
  assert.ok(denied.every((body) => body.reason === 'lease_active'));
  assert.ok(denied.every((body) => body.nextAllowedAt === granted[0].leaseExpiresAt));
});

test('a failed owner releases its lease and applies a shared sixty-second retry cooldown', async () => {
  const gate = createGateNamespace();
  const env = { PRICE_SYNC_GATE: gate };
  const acquired = await (await worker.fetch(gateRequest({ action: 'acquire' }), env)).json();

  const releasedResponse = await worker.fetch(gateRequest({
    action: 'release',
    leaseId: acquired.leaseId
  }), env);
  const released = await releasedResponse.json();
  assert.equal(released.released, true);
  assert.ok(released.nextAllowedAt >= Date.now() + 59_000);

  const retried = await (await worker.fetch(gateRequest({ action: 'acquire' }), env)).json();
  assert.equal(retried.granted, false);
  assert.equal(retried.reason, 'retry_cooldown');
  assert.equal(retried.nextAllowedAt, released.nextAllowedAt);
});

test('an abandoned expired lease can be replaced by another user', async () => {
  const gate = createGateNamespace({
    activeLease: { leaseId: '00000000-0000-4000-8000-000000000000', expiresAt: Date.now() - 1 }
  });
  const result = await (await worker.fetch(gateRequest({ action: 'acquire' }), {
    PRICE_SYNC_GATE: gate
  })).json();

  assert.equal(result.granted, true);
  assert.notEqual(result.leaseId, '00000000-0000-4000-8000-000000000000');
});

test('a completed upload aligns the next capture to one hour after the upstream timestamp', async () => {
  const gate = createGateNamespace();
  const acquired = await (await internalGateRequest(gate, '/acquire', {})).json();
  const sourceUpdatedAt = Date.now() - 5 * 60 * 1000;
  const capturedAt = Date.now();
  const completed = await (await internalGateRequest(gate, '/complete', {
    leaseId: acquired.leaseId,
    sourceUpdatedAt,
    capturedAt
  })).json();

  assert.equal(completed.completed, true);
  assert.equal(completed.latestCapturedAt, capturedAt);
  assert.equal(completed.sourceUpdatedAt, sourceUpdatedAt);
  assert.equal(completed.nextAllowedAt, sourceUpdatedAt + 61 * 60 * 1000);

  const denied = await (await internalGateRequest(gate, '/acquire', {})).json();
  assert.equal(denied.granted, false);
  assert.equal(denied.reason, 'fresh_snapshot');
  assert.equal(denied.nextAllowedAt, completed.nextAllowedAt);
});

test('old scripts and missing gate bindings fail before any source work can be granted', async () => {
  let namespaceCalls = 0;
  const oldResponse = await worker.fetch(gateRequest({ action: 'acquire' }, '0.5.1'), {
    PRICE_SYNC_GATE: {
      idFromName() { namespaceCalls += 1; return 'unused'; },
      get() { namespaceCalls += 1; return null; }
    }
  });
  assert.equal(oldResponse.status, 400);
  assert.deepEqual(await oldResponse.json(), {
    ok: false,
    error: 'script_update_required',
    requiredScriptVersion: '0.6.0'
  });
  assert.equal(namespaceCalls, 0);

  const unavailable = await worker.fetch(gateRequest({ action: 'acquire' }), {});
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error, 'price_sync_gate_unavailable');
});
