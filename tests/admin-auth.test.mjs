import test from 'node:test';
import assert from 'node:assert/strict';

import worker, { AdminAuth } from '../worker/index.js';

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
    },
    async list() {
      return new Map(values);
    }
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

function adminRequest(path, body, { cookie = '', origin = 'https://farm.test', csrf = '' } = {}) {
  const headers = {
    'content-type': 'application/json',
    origin
  };
  if (cookie) headers.cookie = cookie;
  if (csrf) headers['x-hyb-admin-csrf'] = csrf;
  return new Request(`https://farm.test${path}`, {
    method: path === '/api/admin/session' ? 'GET' : 'POST',
    headers,
    body: body == null ? undefined : JSON.stringify(body)
  });
}

function createEnv() {
  const adminAuth = createAdminNamespace();
  return { ADMIN_PASSWORD: 'test-secret', ADMIN_AUTH: adminAuth };
}

test('correct password creates a cookie session and csrf token', async () => {
  const env = createEnv();
  const response = await worker.fetch(adminRequest('/api/admin/login', { password: 'test-secret' }), env);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie') || '', /__Host-hyb-admin=/);
  assert.equal((await response.json()).ok, true);
  assert.match((await worker.fetch(adminRequest('/api/admin/login', { password: 'test-secret' }), env)).headers.get('set-cookie') || '', /Secure/);
});

test('five failed attempts enter a temporary lock without revealing the reason', async () => {
  const env = createEnv();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await worker.fetch(adminRequest('/api/admin/login', { password: 'wrong' }), env);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: 'admin_login_failed' });
  }

  const locked = await worker.fetch(adminRequest('/api/admin/login', { password: 'test-secret' }), env);
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers.get('retry-after')) >= 60);
  assert.deepEqual(await locked.json(), { ok: false, error: 'admin_login_failed' });
});

test('session endpoint rejects expired or missing cookies', async () => {
  const env = createEnv();
  const response = await worker.fetch(adminRequest('/api/admin/session'), env);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: 'admin_auth_required' });
});

test('logout clears a valid session only after origin and csrf checks', async () => {
  const env = createEnv();
  const login = await worker.fetch(adminRequest('/api/admin/login', { password: 'test-secret' }), env);
  const loginBody = await login.json();
  const csrf = loginBody.csrfToken;
  const cookie = (login.headers.get('set-cookie') || '').split(';', 1)[0];

  const rejected = await worker.fetch(adminRequest('/api/admin/logout', null, {
    cookie,
    origin: 'https://evil.test',
    csrf
  }), env);
  assert.equal(rejected.status, 403);

  const loggedOut = await worker.fetch(adminRequest('/api/admin/logout', null, {
    cookie,
    origin: 'https://farm.test',
    csrf
  }), env);
  assert.equal(loggedOut.status, 200);
  assert.match(loggedOut.headers.get('set-cookie') || '', /Max-Age=0/);
});

test('session storage keeps only hashes and timestamps', async () => {
  const env = createEnv();
  const login = await worker.fetch(adminRequest('/api/admin/login', { password: 'test-secret' }), env);
  const cookie = (login.headers.get('set-cookie') || '').split(';', 1)[0];
  const entries = [...env.ADMIN_AUTH.storage.values.entries()];
  const session = entries.find(([key]) => key.startsWith('admin-session:'));

  assert.ok(session);
  assert.equal(typeof session[1].tokenHash, 'string');
  assert.equal(typeof session[1].csrfHash, 'string');
  assert.equal(typeof session[1].createdAt, 'number');
  assert.equal(typeof session[1].expiresAt, 'number');
  assert.equal(typeof session[1].absoluteExpiresAt, 'number');
  assert.equal(session[1].token, undefined);
  assert.equal(session[1].csrfToken, undefined);
  assert.doesNotMatch(JSON.stringify(entries), /test-secret/);
  assert.match(cookie, /^__Host-hyb-admin=/);
});
