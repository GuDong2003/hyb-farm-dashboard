import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../web/userscripts/hyb-farm-dashboard-capture.user.js', import.meta.url), 'utf8');

const SEED_IDS = [
  'carrot', 'tomato', 'corn', 'pumpkin', 'blueberry', 'strawberry',
  'watermelon', 'mango', 'potato', 'eggplant', 'chili', 'sunflower',
  'honey_peach', 'golden_wheat', 'emerald_cabbage', 'agate_bean',
  'platinum_taro', 'dragon_fruit', 'starfruit', 'durian', 'golden_apple',
  'amber_pear', 'frost_plum', 'blue_rose', 'crystal_grape', 'stardust_berry',
  'rainbow_pineapple', 'moonflower', 'aurora_melon', 'sunfire_lotus',
  'weekly_lotus'
];

function currentPriceResponse() {
  return {
    success: true,
    data: SEED_IDS.map((seedId, index) => ({ seedId, recyclePrice: String((index + 1) * 500000) })),
    exchangeRecomputedAt: 1789224300000,
    exchangeCacheHit: true
  };
}

async function runDashboardBridge(fetchImpl) {
  const listeners = new Map();
  const messages = [];
  let resolveResponse;
  const responsePromise = new Promise((resolve) => { resolveResponse = resolve; });
  const window = {
    addEventListener(type, listener) {
      const group = listeners.get(type) || [];
      group.push(listener);
      listeners.set(type, group);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter((item) => item !== listener));
    },
    postMessage(message) {
      messages.push(message);
      if (message && message.type === 'HYB_FARM_DASHBOARD_PRICE_RESPONSE') resolveResponse(message);
    },
    setTimeout,
    clearTimeout
  };
  const context = {
    window,
    document: { readyState: 'complete' },
    location: { origin: 'https://hyb.gudong226.com' },
    fetch: fetchImpl,
    Response,
    Request,
    URL,
    AbortController,
    TextEncoder,
    console,
    setTimeout,
    clearTimeout,
    alert() {},
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    unescape,
    encodeURIComponent
  };
  vm.runInNewContext(source.replace('const SCRIPT_DISABLED = true;', 'const SCRIPT_DISABLED = false;'), context);
  for (const listener of listeners.get('message') || []) {
    listener({
      origin: 'https://hyb.gudong226.com',
      data: {
        type: 'HYB_FARM_DASHBOARD_PRICE_REQUEST',
        requestId: 'request-1',
        observedCapturedAt: 1789220700000
      }
    });
  }
  return { response: await responsePromise, messages };
}

test('one granted refresh fetches only the current-price batch and returns 31 prices', async () => {
  const calls = [];
  const leaseId = '00000000-0000-4000-8000-000000000001';
  const result = await runDashboardBridge(async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });
    if (String(url).endsWith('/api/price-sync-gate')) {
      return Response.json({ ok: true, granted: true, leaseId, leaseExpiresAt: Date.now() + 180000 });
    }
    if (String(url) === 'https://cdk.hybgzs.com/api/farm/recycle/prices') {
      return Response.json(currentPriceResponse());
    }
    throw new Error(`unexpected request: ${url}`);
  });

  assert.deepEqual(calls, [
    { url: 'https://hyb.gudong226.com/api/price-sync-gate', method: 'POST' },
    { url: 'https://cdk.hybgzs.com/api/farm/recycle/prices', method: 'GET' }
  ]);
  assert.equal(result.response.ok, true);
  assert.equal(result.response.scriptVersion, '0.6.0');
  assert.equal(result.response.snapshot.scriptVersion, '0.6.0');
  assert.equal(result.response.snapshot.syncLeaseId, leaseId);
  assert.equal(result.response.snapshot.sourceUpdatedAt, 1789224300000);
  assert.equal(result.response.snapshot.matched, 31);
  assert.equal(Object.keys(result.response.snapshot.prices.shop).length, 31);
  assert.equal(result.response.snapshot.prices.shop.carrot, 1);
  assert.equal('farmProfile' in result.response.snapshot, false);
  assert.equal('priceTrends' in result.response.snapshot, false);
  assert.equal('priceChangeRates' in result.response.snapshot, false);
});

test('a denied shared interval never contacts CDK', async () => {
  const calls = [];
  const nextAllowedAt = Date.now() + 30 * 60 * 1000;
  const result = await runDashboardBridge(async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });
    return Response.json({
      ok: true,
      granted: false,
      reason: 'fresh_snapshot',
      nextAllowedAt,
      capturedAt: 1789220700000
    });
  });

  assert.deepEqual(calls, [
    { url: 'https://hyb.gudong226.com/api/price-sync-gate', method: 'POST' }
  ]);
  assert.equal(result.response.ok, true);
  assert.equal(result.response.skipped, true);
  assert.equal(result.response.reason, 'fresh_snapshot');
  assert.equal(result.response.nextAllowedAt, nextAllowedAt);
  assert.equal('snapshot' in result.response, false);
});

test('a current-price failure releases the shared lease without making fallback requests', async () => {
  const calls = [];
  const leaseId = '00000000-0000-4000-8000-000000000001';
  const result = await runDashboardBridge(async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body || '' });
    if (String(url).endsWith('/api/price-sync-gate')) {
      const body = JSON.parse(options.body);
      if (body.action === 'acquire') {
        return Response.json({ ok: true, granted: true, leaseId, leaseExpiresAt: Date.now() + 180000 });
      }
      assert.equal(body.action, 'release');
      assert.equal(body.leaseId, leaseId);
      return Response.json({ ok: true, released: true, nextAllowedAt: Date.now() + 60000 });
    }
    return new Response('{}', { status: 500 });
  });

  assert.equal(calls.length, 3);
  assert.equal(calls[1].url, 'https://cdk.hybgzs.com/api/farm/recycle/prices');
  assert.equal(calls[2].url, 'https://hyb.gudong226.com/api/price-sync-gate');
  assert.equal(result.response.ok, false);
});
