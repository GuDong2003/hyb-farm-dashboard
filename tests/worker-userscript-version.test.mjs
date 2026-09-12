import test from 'node:test';
import assert from 'node:assert/strict';

import worker, {
  normalizeSubmission,
  userscriptVersionSupported
} from '../worker/index.js';

const CAPTURED_AT = Date.parse('2026-09-12T12:00:00.000Z');
const PRICE_IDS = [
  'carrot', 'tomato', 'corn', 'pumpkin', 'blueberry', 'strawberry',
  'watermelon', 'mango', 'potato', 'eggplant', 'chili', 'sunflower',
  'honey_peach', 'golden_wheat', 'emerald_cabbage'
];
const prices = Object.fromEntries(PRICE_IDS.map((id, index) => [id, index + 1]));

function snapshot(scriptVersion) {
  return {
    scriptVersion,
    syncLeaseId: '00000000-0000-4000-8000-000000000001',
    capturedAt: CAPTURED_AT,
    prices: { shop: prices }
  };
}

function enabledKv() {
  return {
    async get(key) {
      if (key !== 'admin:site-config:v1') return undefined;
      return {
        siteEnabled: true,
        priceCaptureEnabled: true,
        cloudUploadEnabled: true,
        maintenanceMessage: '',
        updatedAt: 1
      };
    }
  };
}

function createAcceptedSubmissionEnv(gate) {
  return {
    LATEST_KV: enabledKv(),
    PRICE_SYNC_GATE: gate,
    PRICE_DB: {
      prepare(sql) {
        if (sql.includes('SELECT * FROM default_prices')) return { async first() { return null; } };
        if (sql.includes('INSERT INTO price_submissions')) {
          return { bind() { return { async run() { return { meta: { last_row_id: 1 } }; } }; } };
        }
        if (sql.includes('SELECT captured_at, prices_json')) {
          return { bind() { return { async all() { return { results: [] }; } }; } };
        }
        return { bind() { return {}; } };
      },
      async batch() { return []; }
    }
  };
}

test('only v0.6.0 and newer userscripts are supported', () => {
  assert.equal(userscriptVersionSupported('0.5.1'), false);
  assert.equal(userscriptVersionSupported('0.6.0'), true);
  assert.equal(userscriptVersionSupported('0.6.1'), true);
  assert.equal(userscriptVersionSupported('0.10.0'), true);
  assert.equal(userscriptVersionSupported(''), false);
  assert.equal(userscriptVersionSupported('legacy'), false);
});

test('old or missing userscript versions are rejected before D1 access', async () => {
  for (const value of ['0.5.1', undefined]) {
    const body = { snapshot: snapshot(value) };
    if (value === undefined) delete body.snapshot.scriptVersion;
    let d1Reads = 0;
    const response = await worker.fetch(new Request('https://farm.test/api/price-submissions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }), {
      PRICE_DB: {
        prepare() {
          d1Reads += 1;
          throw new Error('outdated script must not reach D1');
        }
      },
      LATEST_KV: enabledKv()
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      ok: false,
      status: 'rejected',
      reason: 'script_update_required',
      requiredScriptVersion: '0.6.0'
    });
    assert.equal(d1Reads, 0);
  }
});

test('supported submissions retain the userscript version in normalized data', () => {
  const input = snapshot('0.6.0');
  input.sourceUpdatedAt = CAPTURED_AT - 120000;
  const normalized = normalizeSubmission({ snapshot: input }, CAPTURED_AT);
  assert.equal(normalized.ok, true);
  assert.equal(normalized.scriptVersion, '0.6.0');
  assert.equal(normalized.sourceUpdatedAt, CAPTURED_AT - 120000);
});

test('a D1 failure releases the active lease into the shared retry cooldown', async () => {
  const gateCalls = [];
  const fakeGate = {
    idFromName() { return 'price-sync-gate:global'; },
    get() {
      return {
        async fetch(request) {
          const path = new URL(request.url).pathname;
          const body = await request.json();
          gateCalls.push({ path, body });
          if (path === '/validate') return Response.json({ ok: true, valid: true });
          if (path === '/release') return Response.json({ ok: true, released: true });
          return Response.json({ ok: true, completed: true });
        }
      };
    }
  };
  const input = snapshot('0.6.0');
  input.sourceUpdatedAt = CAPTURED_AT;
  await assert.rejects(() => worker.fetch(new Request('https://farm.test/api/price-submissions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ snapshot: input })
  }), {
    PRICE_SYNC_GATE: fakeGate,
    PRICE_DB: {
      prepare() {
        return { async first() { throw new Error('d1 unavailable'); } };
      }
    },
    LATEST_KV: enabledKv()
  }), /d1 unavailable/);
  assert.deepEqual(gateCalls.map(({ path }) => path), ['/validate', '/release']);
});

test('userscript uploads require a valid lease before the existing D1 flow runs', async () => {
  const fakeGate = {
    idFromName() { return 'price-sync-gate:global'; },
    get() {
      return {
        async fetch(request) {
          const path = new URL(request.url).pathname;
          if (path === '/complete') return new Response(JSON.stringify({ ok: true, completed: true }));
          return new Response(JSON.stringify({ ok: true }));
        }
      };
    }
  };
  const env = createAcceptedSubmissionEnv(fakeGate);
  const withoutLease = await worker.fetch(new Request('https://farm.test/api/price-submissions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ snapshot: snapshot('0.6.0') })
  }), env);

  assert.equal(withoutLease.status, 400);
  assert.equal((await withoutLease.json()).reason, 'invalid_sync_lease');
});

test('accepted cloud snapshots preserve the upstream source refresh timestamp', async () => {
  const sourceUpdatedAt = CAPTURED_AT - 90 * 1000;
  const input = snapshot('0.6.0');
  input.sourceUpdatedAt = sourceUpdatedAt;
  const gate = {
    idFromName() { return 'price-sync-gate:global'; },
    get() {
      return {
        async fetch(request) {
          const path = new URL(request.url).pathname;
          if (path === '/validate') return Response.json({ ok: true, valid: true });
          if (path === '/complete') return Response.json({ ok: true, completed: true });
          return Response.json({ ok: true });
        }
      };
    }
  };
  const response = await worker.fetch(new Request('https://farm.test/api/price-submissions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ snapshot: input })
  }), createAcceptedSubmissionEnv(gate));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'accepted');
  assert.equal(body.snapshot.sourceUpdatedAt, sourceUpdatedAt);
});
