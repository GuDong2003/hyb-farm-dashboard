import test from 'node:test';
import assert from 'node:assert/strict';

import worker, { AdminAuth } from '../worker/index.js';

const CONFIG_KEY = 'admin:site-config:v1';

function createStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    values,
    async get(key) { return values.has(key) ? values.get(key) : undefined; },
    async put(key, value) {
      if (key && typeof key === 'object' && !Array.isArray(key)) {
        for (const [entryKey, entryValue] of Object.entries(key)) values.set(entryKey, entryValue);
        return;
      }
      values.set(key, value);
    },
    async delete(key) { values.delete(key); }
  };
}

function createAdminNamespace(password = 'test-secret') {
  const storage = createStorage();
  const object = new AdminAuth({ storage }, { ADMIN_PASSWORD: password });
  return {
    storage,
    idFromName(name) { return `admin-auth:${name}`; },
    get() { return { fetch: (request) => object.fetch(request) }; }
  };
}

function createKv(initial, { failPut = false } = {}) {
  const values = new Map(Object.entries(initial || {}));
  return {
    values,
    async get(key) { return values.get(key); },
    async put(key, value) {
      if (failPut) throw new Error('kv unavailable');
      values.set(key, value);
    }
  };
}

function request(path, body, { cookie = '', origin = 'https://farm.test', csrf = '' } = {}) {
  const headers = { 'content-type': 'application/json', origin };
  if (cookie) headers.cookie = cookie;
  if (csrf) headers['x-hyb-admin-csrf'] = csrf;
  return new Request(`https://farm.test${path}`, {
    method: path === '/api/site-config' ? 'GET' : 'POST',
    headers,
    body: body == null ? undefined : JSON.stringify(body)
  });
}

function gateRequest(body) {
  return new Request('https://farm.test/api/price-sync-gate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scriptVersion: '0.6.0', ...body })
  });
}

async function loginFixture(env) {
  const response = await worker.fetch(request('/api/admin/login', { password: 'test-secret' }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  return { cookie: (response.headers.get('set-cookie') || '').split(';', 1)[0], csrf: body.csrfToken };
}

test('missing or malformed KV config uses safe capture and upload defaults', async () => {
  const response = await worker.fetch(new Request('https://farm.test/api/site-config'), {
    LATEST_KV: { async get() { return '{bad'; } }
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    config: {
      siteEnabled: true,
      priceCaptureEnabled: false,
      cloudUploadEnabled: false,
      priceCaptureMinute: 1,
      maintenanceMessage: '',
      updatedAt: 0
    }
  });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('admin config accepts the five public fields after authenticated csrf validation', async () => {
  const adminAuth = createAdminNamespace();
  const kv = createKv();
  const env = { ADMIN_AUTH: adminAuth, ADMIN_PASSWORD: 'test-secret', LATEST_KV: kv };
  const { cookie, csrf } = await loginFixture(env);
  const response = await worker.fetch(request('/api/admin/config', {
    siteEnabled: false,
    priceCaptureEnabled: true,
    cloudUploadEnabled: true,
    priceCaptureMinute: 5,
    maintenanceMessage: '维护中',
    unexpected: 'ignored'
  }, { cookie, csrf }), env);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.config, {
    siteEnabled: false,
    priceCaptureEnabled: true,
    cloudUploadEnabled: true,
    priceCaptureMinute: 5,
    maintenanceMessage: '维护中',
    updatedAt: body.config.updatedAt
  });
  assert.ok(Number.isFinite(body.config.updatedAt));
  assert.deepEqual(JSON.parse(kv.values.get(CONFIG_KEY)), body.config);
});

test('admin config rejects an out-of-range fixed capture minute', async () => {
  const adminAuth = createAdminNamespace();
  const env = { ADMIN_AUTH: adminAuth, ADMIN_PASSWORD: 'test-secret', LATEST_KV: createKv() };
  const { cookie, csrf } = await loginFixture(env);
  const response = await worker.fetch(request('/api/admin/config', {
    priceCaptureMinute: 60
  }, { cookie, csrf }), env);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: 'invalid_site_config' });
});

test('disabled capture gate rejects before requesting the Durable Object', async () => {
  let gateCalls = 0;
  const response = await worker.fetch(gateRequest({ action: 'acquire' }), {
    LATEST_KV: { async get() { return { siteEnabled: true, priceCaptureEnabled: false, cloudUploadEnabled: true }; } },
    PRICE_SYNC_GATE: {
      idFromName() { gateCalls += 1; return 'never'; },
      get() { gateCalls += 1; return null; }
    }
  });

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'sync_disabled');
  assert.equal(gateCalls, 0);
});

test('disabled upload rejects before any D1 prepare call', async () => {
  let d1Reads = 0;
  const response = await worker.fetch(new Request('https://farm.test/api/price-submissions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ snapshot: { scriptVersion: '0.6.0' } })
  }), {
    LATEST_KV: { async get() { return { siteEnabled: true, priceCaptureEnabled: true, cloudUploadEnabled: false }; } },
    PRICE_DB: { prepare() { d1Reads += 1; throw new Error('must not read D1'); } }
  });

  assert.equal(response.status, 403);
  assert.equal((await response.json()).reason, 'cloud_upload_disabled');
  assert.equal(d1Reads, 0);
});

test('failed KV config writes preserve the previous configuration', async () => {
  const previous = JSON.stringify({
    siteEnabled: true,
    priceCaptureEnabled: false,
    cloudUploadEnabled: false,
    maintenanceMessage: '',
    updatedAt: 42
  });
  const env = {
    ADMIN_AUTH: createAdminNamespace(),
    ADMIN_PASSWORD: 'test-secret',
    LATEST_KV: createKv({ [CONFIG_KEY]: previous }, { failPut: true })
  };
  const { cookie, csrf } = await loginFixture(env);
  const response = await worker.fetch(request('/api/admin/config', {
    siteEnabled: false,
    priceCaptureEnabled: true,
    cloudUploadEnabled: true,
    maintenanceMessage: '不会写入'
  }, { cookie, csrf }), env);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: 'site_config_unavailable' });
  assert.equal(env.LATEST_KV.values.get(CONFIG_KEY), previous);
});
