const SEED_IDS = [
  'carrot',
  'tomato',
  'corn',
  'pumpkin',
  'blueberry',
  'strawberry',
  'watermelon',
  'mango',
  'potato',
  'eggplant',
  'chili',
  'sunflower',
  'honey_peach',
  'golden_wheat',
  'emerald_cabbage',
  'agate_bean',
  'platinum_taro',
  'dragon_fruit',
  'starfruit',
  'durian',
  'golden_apple',
  'amber_pear',
  'frost_plum',
  'blue_rose',
  'crystal_grape',
  'stardust_berry',
  'rainbow_pineapple',
  'moonflower',
  'aurora_melon',
  'sunfire_lotus',
  'weekly_lotus'
];

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const REQUIRED_USERSCRIPT_VERSION = '0.6.0';
const MIN_MATCHED_PRICES = 15;
const MAX_PRICE_USD = 1000000;
const MAX_TREND_POINTS_PER_SERIES = 200;
const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;
const DEFAULT_PRICE_CHANGE_THRESHOLD = 20;
const PUBLIC_DEFAULT_CACHE_CONTROL = 'public, max-age=0, s-maxage=600, stale-while-revalidate=60';
const PUBLIC_HISTORY_CACHE_CONTROL = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=300';
const VISITOR_USAGE_CACHE_CONTROL = 'no-store';
const PRICE_TREND_WINDOWS = Object.freeze({
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
});
const PRICE_TREND_WINDOW_VALUES = Object.freeze(Object.keys(PRICE_TREND_WINDOWS));
const PRICE_SERIES_WINDOWS = Object.freeze({
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  all: 0
});
const PRICE_SERIES_WINDOW_VALUES = Object.freeze(Object.keys(PRICE_SERIES_WINDOWS));
const LATEST_SNAPSHOT_KV_KEY = 'latest-snapshot-v1';
const LATEST_SNAPSHOT_KV_PREFIX = `${LATEST_SNAPSHOT_KV_KEY}:`;
const HISTORY_COUNT_KV_KEY = 'history-count-v1';
const PRICE_TREND_CACHE_VERSION = 'v2';
// Kept as a migration reference for existing KV data; visitor traffic no longer reads or writes it.
export const VISITOR_USAGE_COUNT_KV_KEY = 'farm:usage:visitors:v1';
const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const VISITOR_COUNTER_NAME = 'global';
const VISITOR_COUNTER_COUNT_KEY = 'count';
const VISITOR_COUNTER_VISITOR_PREFIX = 'visitor:';
const VISITOR_HASH_PATTERN = /^[a-f0-9]{64}$/;
const MAX_PUBLISHED_SNAPSHOT_VERSIONS = 8;
const PRICE_SYNC_GATE_NAME = 'global';
const PRICE_SYNC_LEASE_MS = 3 * 60 * 1000;
const PRICE_SYNC_RETRY_COOLDOWN_MS = 60 * 1000;
const PRICE_SYNC_SOURCE_GRACE_MS = 60 * 1000;
const PRICE_SYNC_ACTIVE_LEASE_KEY = 'activeLease';
const PRICE_SYNC_NEXT_ALLOWED_KEY = 'nextAllowedAt';
const PRICE_SYNC_LATEST_CAPTURED_KEY = 'latestCapturedAt';
const PRICE_SYNC_SOURCE_UPDATED_KEY = 'sourceUpdatedAt';
const PRICE_SYNC_COOLDOWN_REASON_KEY = 'cooldownReason';
const ADMIN_AUTH_NAME = 'global';
const ADMIN_COOKIE_NAME = '__Host-hyb-admin';
const ADMIN_CSRF_HEADER = 'x-hyb-admin-csrf';
const ADMIN_FAILURE_PREFIX = 'admin-failure:';
const ADMIN_SESSION_PREFIX = 'admin-session:';
const ADMIN_FAILURE_WINDOW_MS = 10 * 60 * 1000;
const ADMIN_FAILURE_THRESHOLD = 5;
const ADMIN_LOCK_DURATIONS_MS = [60 * 1000, 5 * 60 * 1000, 30 * 60 * 1000];
const ADMIN_MAX_LOCK_MS = 24 * 60 * 60 * 1000;
const ADMIN_SESSION_TTL_MS = 30 * 60 * 1000;
const ADMIN_SESSION_MAX_MS = 2 * 60 * 60 * 1000;
export const ADMIN_SITE_CONFIG_KEY = 'admin:site-config:v1';
export const DEFAULT_SITE_CONFIG = Object.freeze({
  siteEnabled: true,
  priceCaptureEnabled: false,
  cloudUploadEnabled: false,
  maintenanceMessage: '',
  updatedAt: 0
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/default-prices' && request.method === 'GET') {
      return getDefaultPrices(request, env);
    }

    if (url.pathname === '/api/price-history' && request.method === 'GET') {
      return getPriceHistory(request, env);
    }

    if (url.pathname === '/api/price-series' && request.method === 'GET') {
      return getPriceSeries(request, env);
    }

    if (url.pathname === '/api/price-trends' && request.method === 'GET') {
      return getPriceTrends(request, env);
    }

    if (url.pathname === '/api/visitor-usage' && request.method === 'GET') {
      return getVisitorUsage(request, env);
    }

    if (url.pathname === '/api/visitor-usage' && request.method === 'POST') {
      return postVisitorUsage(request, env);
    }

    if (url.pathname === '/api/site-config' && request.method === 'GET') {
      return getSiteConfig(env);
    }

    if (url.pathname === '/api/admin/config' && request.method === 'POST') {
      return updateAdminConfig(request, env);
    }

    if (url.pathname === '/api/admin/login' && request.method === 'POST') {
      return loginAdmin(request, env);
    }

    if (url.pathname === '/api/admin/session' && request.method === 'GET') {
      return getAdminSession(request, env);
    }

    if (url.pathname === '/api/admin/logout' && request.method === 'POST') {
      return logoutAdmin(request, env);
    }

    if (url.pathname === '/api/price-sync-gate' && request.method === 'POST') {
      return postPriceSyncGate(request, env);
    }

    if (url.pathname === '/api/price-submissions' && request.method === 'POST') {
      return submitPrices(request, env);
    }

    if (url.pathname.startsWith('/api/')) {
      return jsonResponse({ ok: false, error: 'not_found' }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};

async function loginAdmin(request, env) {
  if (!isSecureRequest(request)) return adminAuthFailureResponse(400, 'admin_login_failed');

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return adminAuthFailureResponse(401, 'admin_login_failed');
  }
  const password = String(body && body.password != null ? body.password : '').trim();
  const stub = adminAuthStub(env);
  if (!stub) return jsonResponse({ ok: false, error: 'admin_auth_unavailable' }, 503, { 'cache-control': 'no-store' });

  try {
    const response = await stub.fetch(new Request('https://admin-auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        password,
        ip: String(request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown')
      })
    }));
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      const headers = { 'cache-control': 'no-store' };
      if (response.status === 429 && Number(data.retryAfter) > 0) headers['retry-after'] = String(Math.ceil(Number(data.retryAfter)));
      return jsonResponse({ ok: false, error: 'admin_login_failed' }, response.status === 429 ? 429 : 401, headers);
    }
    return jsonResponse({ ok: true, csrfToken: data.csrfToken, expiresAt: data.expiresAt }, 200, {
      'cache-control': 'no-store',
      'set-cookie': adminSessionCookie(data.token)
    });
  } catch (error) {
    console.error('admin_login_failed', { message: String(error && error.message || error).slice(0, 160) });
    return jsonResponse({ ok: false, error: 'admin_auth_unavailable' }, 503, { 'cache-control': 'no-store' });
  }
}

async function getAdminSession(request, env) {
  const token = readAdminCookie(request);
  if (!token) return jsonResponse({ ok: false, error: 'admin_auth_required' }, 401, { 'cache-control': 'no-store' });
  const stub = adminAuthStub(env);
  if (!stub) return jsonResponse({ ok: false, error: 'admin_auth_unavailable' }, 503, { 'cache-control': 'no-store' });
  try {
    const response = await stub.fetch(new Request('https://admin-auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token })
    }));
    const data = await response.json().catch(() => ({}));
    return jsonResponse(
      data.ok
        ? { ok: true, csrfToken: data.csrfToken, expiresAt: data.expiresAt, config: await loadSiteConfig(env) }
        : { ok: false, error: 'admin_auth_required' },
      data.ok ? 200 : 401,
      { 'cache-control': 'no-store' }
    );
  } catch (error) {
    console.error('admin_session_failed', { message: String(error && error.message || error).slice(0, 160) });
    return jsonResponse({ ok: false, error: 'admin_auth_unavailable' }, 503, { 'cache-control': 'no-store' });
  }
}

async function getSiteConfig(env) {
  return jsonResponse({ ok: true, config: await loadSiteConfig(env) }, 200, { 'cache-control': 'no-store' });
}

async function updateAdminConfig(request, env) {
  const authorization = await verifyAdminMutation(request, env);
  if (authorization.response) return authorization.response;

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400, { 'cache-control': 'no-store' });
  }
  const current = await loadSiteConfig(env);
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  for (const field of ['siteEnabled', 'priceCaptureEnabled', 'cloudUploadEnabled']) {
    if (Object.prototype.hasOwnProperty.call(input, field) && typeof input[field] !== 'boolean') {
      return jsonResponse({ ok: false, error: 'invalid_site_config' }, 400, { 'cache-control': 'no-store' });
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, 'maintenanceMessage') && typeof input.maintenanceMessage !== 'string') {
    return jsonResponse({ ok: false, error: 'invalid_site_config' }, 400, { 'cache-control': 'no-store' });
  }

  const config = normalizeSiteConfig({
    ...current,
    siteEnabled: Object.prototype.hasOwnProperty.call(input, 'siteEnabled') ? input.siteEnabled : current.siteEnabled,
    priceCaptureEnabled: Object.prototype.hasOwnProperty.call(input, 'priceCaptureEnabled') ? input.priceCaptureEnabled : current.priceCaptureEnabled,
    cloudUploadEnabled: Object.prototype.hasOwnProperty.call(input, 'cloudUploadEnabled') ? input.cloudUploadEnabled : current.cloudUploadEnabled,
    maintenanceMessage: Object.prototype.hasOwnProperty.call(input, 'maintenanceMessage') ? input.maintenanceMessage : current.maintenanceMessage,
    updatedAt: Date.now()
  });
  try {
    if (!env || !env.LATEST_KV || typeof env.LATEST_KV.put !== 'function') throw new Error('LATEST_KV binding is not configured');
    await env.LATEST_KV.put(ADMIN_SITE_CONFIG_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('admin_site_config_write_failed', { message: String(error && error.message || error).slice(0, 160) });
    return jsonResponse({ ok: false, error: 'site_config_unavailable' }, 503, { 'cache-control': 'no-store' });
  }
  return jsonResponse({ ok: true, config }, 200, { 'cache-control': 'no-store' });
}

async function verifyAdminMutation(request, env) {
  if (!isSecureRequest(request) || !hasSameOrigin(request)) {
    return { response: jsonResponse({ ok: false, error: 'admin_origin_invalid' }, 403, { 'cache-control': 'no-store' }) };
  }
  const token = readAdminCookie(request);
  const csrfToken = String(request.headers.get(ADMIN_CSRF_HEADER) || '');
  if (!token || !csrfToken) {
    return { response: jsonResponse({ ok: false, error: 'admin_auth_required' }, 401, { 'cache-control': 'no-store' }) };
  }
  const stub = adminAuthStub(env);
  if (!stub) {
    return { response: jsonResponse({ ok: false, error: 'admin_auth_unavailable' }, 503, { 'cache-control': 'no-store' }) };
  }
  try {
    const response = await stub.fetch(new Request('https://admin-auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, csrfToken })
    }));
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      return {
        response: jsonResponse(
          { ok: false, error: data.error === 'admin_csrf_invalid' ? 'admin_csrf_invalid' : 'admin_auth_required' },
          response.status === 403 ? 403 : 401,
          { 'cache-control': 'no-store' }
        )
      };
    }
    return { ok: true, expiresAt: data.expiresAt };
  } catch (error) {
    console.error('admin_session_verify_failed', { message: String(error && error.message || error).slice(0, 160) });
    return { response: jsonResponse({ ok: false, error: 'admin_auth_unavailable' }, 503, { 'cache-control': 'no-store' }) };
  }
}

export async function loadSiteConfig(env) {
  if (!env || !env.LATEST_KV || typeof env.LATEST_KV.get !== 'function') return { ...DEFAULT_SITE_CONFIG };
  try {
    const raw = await env.LATEST_KV.get(ADMIN_SITE_CONFIG_KEY);
    return normalizeSiteConfig(raw);
  } catch (_) {
    return { ...DEFAULT_SITE_CONFIG };
  }
}

export function normalizeSiteConfig(value) {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (_) {
      source = null;
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return { ...DEFAULT_SITE_CONFIG };
  return {
    siteEnabled: typeof source.siteEnabled === 'boolean' ? source.siteEnabled : DEFAULT_SITE_CONFIG.siteEnabled,
    priceCaptureEnabled: typeof source.priceCaptureEnabled === 'boolean' ? source.priceCaptureEnabled : DEFAULT_SITE_CONFIG.priceCaptureEnabled,
    cloudUploadEnabled: typeof source.cloudUploadEnabled === 'boolean' ? source.cloudUploadEnabled : DEFAULT_SITE_CONFIG.cloudUploadEnabled,
    maintenanceMessage: typeof source.maintenanceMessage === 'string' ? source.maintenanceMessage.slice(0, 240) : DEFAULT_SITE_CONFIG.maintenanceMessage,
    updatedAt: Number.isFinite(Number(source.updatedAt)) && Number(source.updatedAt) > 0 ? Math.floor(Number(source.updatedAt)) : DEFAULT_SITE_CONFIG.updatedAt
  };
}

async function logoutAdmin(request, env) {
  if (!isSecureRequest(request) || !hasSameOrigin(request)) return jsonResponse({ ok: false, error: 'admin_origin_invalid' }, 403, { 'cache-control': 'no-store' });
  const token = readAdminCookie(request);
  const csrfToken = String(request.headers.get(ADMIN_CSRF_HEADER) || '');
  if (!token || !csrfToken) return jsonResponse({ ok: false, error: 'admin_auth_required' }, 401, { 'cache-control': 'no-store' });
  const stub = adminAuthStub(env);
  if (!stub) return jsonResponse({ ok: false, error: 'admin_auth_unavailable' }, 503, { 'cache-control': 'no-store' });
  try {
    const response = await stub.fetch(new Request('https://admin-auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, csrfToken })
    }));
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      return jsonResponse({ ok: false, error: data.error === 'admin_csrf_invalid' ? 'admin_csrf_invalid' : 'admin_auth_required' }, response.status === 403 ? 403 : 401, { 'cache-control': 'no-store' });
    }
    return jsonResponse({ ok: true }, 200, {
      'cache-control': 'no-store',
      'set-cookie': expiredAdminSessionCookie()
    });
  } catch (error) {
    console.error('admin_logout_failed', { message: String(error && error.message || error).slice(0, 160) });
    return jsonResponse({ ok: false, error: 'admin_auth_unavailable' }, 503, { 'cache-control': 'no-store' });
  }
}

function adminAuthStub(env) {
  const namespace = env && env.ADMIN_AUTH;
  if (!namespace || typeof namespace.idFromName !== 'function' || typeof namespace.get !== 'function') return null;
  try {
    return namespace.get(namespace.idFromName(ADMIN_AUTH_NAME));
  } catch (_) {
    return null;
  }
}

function isSecureRequest(request) {
  return new URL(request.url).protocol === 'https:';
}

function hasSameOrigin(request) {
  const url = new URL(request.url);
  return String(request.headers.get('origin') || '') === url.origin;
}

function readAdminCookie(request) {
  const cookie = String(request.headers.get('cookie') || '');
  const item = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${ADMIN_COOKIE_NAME}=`));
  return item ? item.slice(ADMIN_COOKIE_NAME.length + 1) : '';
}

function adminSessionCookie(token) {
  return `${ADMIN_COOKIE_NAME}=${token}; Max-Age=${Math.floor(ADMIN_SESSION_MAX_MS / 1000)}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function expiredAdminSessionCookie() {
  return `${ADMIN_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function adminAuthFailureResponse(status, error) {
  return jsonResponse({ ok: false, error }, status, { 'cache-control': 'no-store' });
}

async function getDefaultPrices(request, env) {
  return withPublicCache(request, async () => {
    const snapshot = await loadLatestSnapshot(env);
    return jsonResponse({ ok: true, snapshot }, 200, {
      'cache-control': PUBLIC_DEFAULT_CACHE_CONTROL
    });
  });
}

async function getPriceTrends(request, env) {
  const url = new URL(request.url);
  const windowValue = normalizeTrendWindow(url.searchParams.get('window'));
  if (!windowValue) return jsonResponse({ ok: false, error: 'invalid_window' }, 400, { 'cache-control': 'no-store' });

  return withPublicCache(request, async () => {
    const snapshot = await loadLatestSnapshot(env);
    if (!hasPriceTrendWindow(snapshot, windowValue)) {
      return jsonResponse({
        ok: false,
        error: 'price_trend_unavailable',
        window: windowValue,
        retryable: true
      }, 503, {
        'cache-control': 'no-store',
        'retry-after': '60'
      });
    }
    const trends = snapshot.priceChangeWindows[windowValue];
    return jsonResponse({
      ok: true,
      window: windowValue,
      capturedAt: Number(snapshot && snapshot.capturedAt) || 0,
      updatedAt: Number(snapshot && snapshot.defaultUpdatedAt) || 0,
      trends
    }, 200, {
      'cache-control': priceTrendCacheControl(windowValue)
    });
  });
}

function hasPriceTrendWindow(snapshot, windowValue) {
  const windows = snapshot && snapshot.priceChangeWindows;
  const trends = windows && windows[windowValue];
  if (!windows || !Object.prototype.hasOwnProperty.call(windows, windowValue)) return false;
  if (!trends || typeof trends !== 'object' || Array.isArray(trends)) return false;
  const entries = Object.entries(trends);
  return entries.length > 0 && entries.every(([, item]) => (
    item
      && typeof item === 'object'
      && !Array.isArray(item)
      && item.rate !== null
      && item.rate !== undefined
      && String(item.rate).trim() !== ''
      && Number.isFinite(Number(item.rate))
  ));
}

function normalizePriceChangeWindow(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => (
    item
      && typeof item === 'object'
      && !Array.isArray(item)
      && item.rate !== null
      && item.rate !== undefined
      && String(item.rate).trim() !== ''
      && Number.isFinite(Number(item.rate))
  )));
}

export function mergePriceChangeWindows(existing, incoming) {
  const merged = {};
  for (const windowValue of PRICE_TREND_WINDOW_VALUES) {
    const previous = normalizePriceChangeWindow(existing && existing[windowValue]);
    const next = normalizePriceChangeWindow(incoming && incoming[windowValue]);
    const combined = { ...previous, ...next };
    if (Object.keys(combined).length) merged[windowValue] = combined;
  }
  return merged;
}

function hasCompletePriceTrendWindows(snapshot) {
  return PRICE_TREND_WINDOW_VALUES.every((windowValue) => hasPriceTrendWindow(snapshot, windowValue));
}

async function getVisitorUsage(request, env) {
  const counter = visitorCounterStub(env);
  if (counter) {
    try {
      const response = await counter.fetch(new Request('https://visitor-counter/read', { method: 'GET' }));
      const data = await response.json().catch(() => ({}));
      const count = normalizeVisitorCount(data && data.visitors);
      if (!response.ok || !data || data.ok === false || count === null) throw new Error('invalid_counter_response');
      return jsonResponse({ ok: true, visitors: count }, 200, {
        'cache-control': VISITOR_USAGE_CACHE_CONTROL
      });
    } catch (error) {
      console.error('visitor_usage_counter_read_failed', {
        message: String(error && error.message || error).slice(0, 240)
      });
    }
  }
  return visitorCounterUnavailableResponse();
}

async function postVisitorUsage(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400, {
      'cache-control': VISITOR_USAGE_CACHE_CONTROL
    });
  }

  const visitorId = normalizeVisitorId(body && body.visitorId);
  if (!visitorId) return jsonResponse({ ok: false, error: 'invalid_visitor_id' }, 400, {
    'cache-control': VISITOR_USAGE_CACHE_CONTROL
  });

  const counter = visitorCounterStub(env);
  if (counter) {
    try {
      const visitorHash = await hashVisitorId(visitorId);
      const response = await counter.fetch(new Request('https://visitor-counter/record', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visitorHash })
      }));
      const data = await response.json().catch(() => ({}));
      const count = normalizeVisitorCount(data && data.visitors);
      if (!response.ok || !data || data.ok === false || count === null) throw new Error('invalid_counter_response');
      return jsonResponse({
        ok: true,
        visitors: count,
        counted: Boolean(data.counted)
      }, 200, {
        'cache-control': VISITOR_USAGE_CACHE_CONTROL
      });
    } catch (error) {
      console.error('visitor_usage_counter_write_failed', {
        message: String(error && error.message || error).slice(0, 240)
      });
      return visitorCounterUnavailableResponse();
    }
  }

  return visitorCounterUnavailableResponse();
}

async function visitorCounterUnavailableResponse() {
  return jsonResponse({
    ok: false,
    error: 'visitor_counter_unavailable',
    visitors: null,
    counted: false
  }, 503, {
    'cache-control': VISITOR_USAGE_CACHE_CONTROL,
    'retry-after': '60'
  });
}

function normalizeVisitorCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : null;
}

function normalizeVisitorId(value) {
  const visitorId = String(value == null ? '' : value).trim();
  return VISITOR_ID_PATTERN.test(visitorId) ? visitorId : '';
}

async function hashVisitorId(visitorId) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(visitorId));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function visitorCounterStub(env) {
  const namespace = env && env.VISITOR_COUNTER;
  if (!namespace || typeof namespace.idFromName !== 'function' || typeof namespace.get !== 'function') return null;
  try {
    return namespace.get(namespace.idFromName(VISITOR_COUNTER_NAME));
  } catch (_) {
    return null;
  }
}

export class VisitorCounter {
  constructor(state, env) {
    this.state = state;
    this.env = env || {};
    this.operation = Promise.resolve();
  }

  fetch(request) {
    const operation = this.operation.then(
      () => this.handle(request),
      () => this.handle(request)
    );
    this.operation = operation.catch(() => {});
    return operation;
  }

  async handle(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/read') {
      return jsonResponse({ ok: true, visitors: await this.readCount() }, 200, {
        'cache-control': VISITOR_USAGE_CACHE_CONTROL
      });
    }

    if (request.method !== 'POST' || url.pathname !== '/record') {
      return jsonResponse({ ok: false, error: 'not_found' }, 404, {
        'cache-control': VISITOR_USAGE_CACHE_CONTROL
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (_) {
      return jsonResponse({ ok: false, error: 'invalid_json' }, 400, {
        'cache-control': VISITOR_USAGE_CACHE_CONTROL
      });
    }

    const visitorHash = String(body && body.visitorHash || '').trim();
    if (!VISITOR_HASH_PATTERN.test(visitorHash)) {
      return jsonResponse({ ok: false, error: 'invalid_visitor_hash' }, 400, {
        'cache-control': VISITOR_USAGE_CACHE_CONTROL
      });
    }

    const count = await this.readCount();
    const markerKey = `${VISITOR_COUNTER_VISITOR_PREFIX}${visitorHash}`;
    if (await this.state.storage.get(markerKey) != null) {
      return jsonResponse({ ok: true, visitors: count, counted: false }, 200, {
        'cache-control': VISITOR_USAGE_CACHE_CONTROL
      });
    }

    const next = count + 1;
    await this.state.storage.put({
      [VISITOR_COUNTER_COUNT_KEY]: String(next),
      [markerKey]: '1'
    });
    return jsonResponse({ ok: true, visitors: next, counted: true }, 200, {
      'cache-control': VISITOR_USAGE_CACHE_CONTROL
    });
  }

  async readCount() {
    return normalizeVisitorCount(await this.state.storage.get(VISITOR_COUNTER_COUNT_KEY)) ?? 0;
  }
}

export class AdminAuth {
  constructor(state, env) {
    this.state = state;
    this.env = env || {};
    this.operation = Promise.resolve();
  }

  fetch(request) {
    const operation = this.operation.then(
      () => this.handle(request),
      () => this.handle(request)
    );
    this.operation = operation.catch(() => {});
    return operation;
  }

  async handle(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || !['/login', '/session', '/verify', '/logout'].includes(url.pathname)) {
      return jsonResponse({ ok: false, error: 'not_found' }, 404, { 'cache-control': 'no-store' });
    }

    let body;
    try {
      body = await request.json();
    } catch (_) {
      return jsonResponse({ ok: false, error: 'invalid_json' }, 400, { 'cache-control': 'no-store' });
    }
    if (url.pathname === '/login') return this.login(body);
    if (url.pathname === '/session') return this.session(body);
    if (url.pathname === '/verify') return this.verify(body);
    return this.logout(body);
  }

  async login(body) {
    const now = Date.now();
    const ipHash = await hashAdminValue(String(body && body.ip || 'unknown'));
    const failureKey = `${ADMIN_FAILURE_PREFIX}${ipHash}`;
    let failure = await this.state.storage.get(failureKey);
    if (failure && Number(failure.lockUntil) > now) {
      return jsonResponse({ ok: false, retryAfter: Math.ceil((Number(failure.lockUntil) - now) / 1000) }, 429, { 'cache-control': 'no-store' });
    }
    if (!failure || now - Number(failure.windowStartedAt) >= ADMIN_FAILURE_WINDOW_MS) {
      failure = {
        count: 0,
        windowStartedAt: now,
        lockLevel: failure && Number.isFinite(Number(failure.lockLevel)) ? Number(failure.lockLevel) : 0,
        lockUntil: 0
      };
    }

    const expected = String(this.env.ADMIN_PASSWORD == null ? '' : this.env.ADMIN_PASSWORD);
    const supplied = String(body && body.password != null ? body.password : '');
    if (!timingSafeStringEqual(supplied, expected) || !expected) {
      failure.count += 1;
      if (failure.count >= ADMIN_FAILURE_THRESHOLD) {
        const level = Math.max(0, Number(failure.lockLevel) || 0);
        const duration = level < ADMIN_LOCK_DURATIONS_MS.length
          ? ADMIN_LOCK_DURATIONS_MS[level]
          : ADMIN_MAX_LOCK_MS;
        failure.lockUntil = now + Math.min(duration, ADMIN_MAX_LOCK_MS);
        failure.lockLevel = Math.min(level + 1, ADMIN_LOCK_DURATIONS_MS.length);
        failure.count = 0;
        failure.windowStartedAt = now;
      }
      await this.state.storage.put(failureKey, failure);
      return jsonResponse({ ok: false, retryAfter: failure.lockUntil > now ? Math.ceil((failure.lockUntil - now) / 1000) : 0 }, 401, { 'cache-control': 'no-store' });
    }

    await this.state.storage.delete(failureKey);
    const token = crypto.randomUUID();
    const csrfToken = crypto.randomUUID();
    const tokenHash = await hashAdminValue(token);
    const csrfHash = await hashAdminValue(csrfToken);
    const createdAt = now;
    const expiresAt = now + ADMIN_SESSION_TTL_MS;
    const absoluteExpiresAt = now + ADMIN_SESSION_MAX_MS;
    await this.state.storage.put(`${ADMIN_SESSION_PREFIX}${tokenHash}`, {
      tokenHash,
      csrfHash,
      createdAt,
      expiresAt,
      absoluteExpiresAt
    });
    return jsonResponse({ ok: true, token, csrfToken, expiresAt }, 200, { 'cache-control': 'no-store' });
  }

  async session(body) {
    const session = await this.readSession(body && body.token);
    if (!session) return jsonResponse({ ok: false, error: 'admin_auth_required' }, 401, { 'cache-control': 'no-store' });
    const csrfToken = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = Math.min(now + ADMIN_SESSION_TTL_MS, Number(session.absoluteExpiresAt));
    session.csrfHash = await hashAdminValue(csrfToken);
    session.expiresAt = expiresAt;
    await this.state.storage.put(`${ADMIN_SESSION_PREFIX}${session.tokenHash}`, session);
    return jsonResponse({ ok: true, csrfToken, expiresAt }, 200, { 'cache-control': 'no-store' });
  }

  async verify(body) {
    const session = await this.readSession(body && body.token);
    if (!session) return jsonResponse({ ok: false, error: 'admin_auth_required' }, 401, { 'cache-control': 'no-store' });
    const csrfHash = await hashAdminValue(String(body && body.csrfToken || ''));
    if (!timingSafeStringEqual(csrfHash, String(session.csrfHash || ''))) {
      return jsonResponse({ ok: false, error: 'admin_csrf_invalid' }, 403, { 'cache-control': 'no-store' });
    }
    const now = Date.now();
    session.expiresAt = Math.min(now + ADMIN_SESSION_TTL_MS, Number(session.absoluteExpiresAt));
    await this.state.storage.put(`${ADMIN_SESSION_PREFIX}${session.tokenHash}`, session);
    return jsonResponse({ ok: true, expiresAt: session.expiresAt }, 200, { 'cache-control': 'no-store' });
  }

  async logout(body) {
    const session = await this.readSession(body && body.token);
    if (!session) return jsonResponse({ ok: false, error: 'admin_auth_required' }, 401, { 'cache-control': 'no-store' });
    const csrfHash = await hashAdminValue(String(body && body.csrfToken || ''));
    if (!timingSafeStringEqual(csrfHash, String(session.csrfHash || ''))) {
      return jsonResponse({ ok: false, error: 'admin_csrf_invalid' }, 403, { 'cache-control': 'no-store' });
    }
    await this.state.storage.delete(`${ADMIN_SESSION_PREFIX}${session.tokenHash}`);
    return jsonResponse({ ok: true }, 200, { 'cache-control': 'no-store' });
  }

  async readSession(token) {
    const normalized = String(token || '');
    if (!normalized) return null;
    const tokenHash = await hashAdminValue(normalized);
    const key = `${ADMIN_SESSION_PREFIX}${tokenHash}`;
    const session = await this.state.storage.get(key);
    if (!session || Number(session.expiresAt) <= Date.now() || Number(session.absoluteExpiresAt) <= Date.now()) {
      if (session) await this.state.storage.delete(key);
      return null;
    }
    return session;
  }
}

async function hashAdminValue(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeStringEqual(left, right) {
  const leftBytes = new TextEncoder().encode(String(left));
  const rightBytes = new TextEncoder().encode(String(right));
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  return difference === 0;
}

async function postPriceSyncGate(request, env) {
  const siteConfig = await loadSiteConfig(env);
  if (!siteConfig.siteEnabled || !siteConfig.priceCaptureEnabled) {
    return jsonResponse({ ok: false, error: 'sync_disabled' }, 403, { 'cache-control': 'no-store' });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400, { 'cache-control': 'no-store' });
  }

  if (!userscriptVersionSupported(body && body.scriptVersion)) {
    return jsonResponse({
      ok: false,
      error: 'script_update_required',
      requiredScriptVersion: REQUIRED_USERSCRIPT_VERSION
    }, 400, { 'cache-control': 'no-store' });
  }

  const action = String(body && body.action || '').trim();
  if (action !== 'acquire' && action !== 'release') {
    return jsonResponse({ ok: false, error: 'invalid_action' }, 400, { 'cache-control': 'no-store' });
  }
  const stub = priceSyncGateStub(env);
  if (!stub) return priceSyncGateUnavailableResponse();

  const path = action === 'acquire' ? '/acquire' : '/release';
  const payload = action === 'acquire'
    ? { observedCapturedAt: Number(body && body.observedCapturedAt) || 0 }
    : { leaseId: String(body && body.leaseId || '') };
  try {
    return await stub.fetch(new Request(`https://price-sync-gate${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    }));
  } catch (error) {
    console.error('price_sync_gate_failed', {
      action,
      message: String(error && error.message || error).slice(0, 240)
    });
    return priceSyncGateUnavailableResponse();
  }
}

function priceSyncGateStub(env) {
  const namespace = env && env.PRICE_SYNC_GATE;
  if (!namespace || typeof namespace.idFromName !== 'function' || typeof namespace.get !== 'function') return null;
  try {
    return namespace.get(namespace.idFromName(PRICE_SYNC_GATE_NAME));
  } catch (_) {
    return null;
  }
}

function priceSyncGateUnavailableResponse() {
  return jsonResponse({ ok: false, error: 'price_sync_gate_unavailable' }, 503, {
    'cache-control': 'no-store',
    'retry-after': '60'
  });
}

async function callPriceSyncGate(env, path, body) {
  const stub = priceSyncGateStub(env);
  if (!stub) return null;
  try {
    const response = await stub.fetch(new Request(`https://price-sync-gate${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {})
    }));
    if (!response || !response.ok) return null;
    return response.json();
  } catch (_) {
    return null;
  }
}

async function validatePriceSyncLease(env, leaseId) {
  const normalized = String(leaseId || '');
  if (!/^[a-f0-9-]{36}$/i.test(normalized)) return false;
  const result = await callPriceSyncGate(env, '/validate', { leaseId: normalized });
  return Boolean(result && result.valid);
}

async function releasePriceSyncLease(env, leaseId) {
  const normalized = String(leaseId || '');
  if (!/^[a-f0-9-]{36}$/i.test(normalized)) return false;
  const result = await callPriceSyncGate(env, '/release', { leaseId: normalized });
  return Boolean(result && result.released);
}

async function completePriceSyncLease(env, normalized, capturedAt) {
  const result = await callPriceSyncGate(env, '/complete', {
    leaseId: normalized && normalized.syncLeaseId,
    capturedAt: Number(capturedAt) || 0,
    sourceUpdatedAt: Number(normalized && normalized.sourceUpdatedAt) || 0
  });
  return Boolean(result && result.completed);
}

export class PriceSyncGate {
  constructor(state, env) {
    this.state = state;
    this.env = env || {};
    this.operation = Promise.resolve();
  }

  fetch(request) {
    const operation = this.operation.then(
      () => this.handle(request),
      () => this.handle(request)
    );
    this.operation = operation.catch(() => {});
    return operation;
  }

  async handle(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || !['/acquire', '/release', '/validate', '/complete'].includes(url.pathname)) {
      return jsonResponse({ ok: false, error: 'not_found' }, 404, { 'cache-control': 'no-store' });
    }

    let body;
    try {
      body = await request.json();
    } catch (_) {
      return jsonResponse({ ok: false, error: 'invalid_json' }, 400, { 'cache-control': 'no-store' });
    }
    if (url.pathname === '/acquire') return this.acquire(body);
    if (url.pathname === '/release') return this.release(body);
    if (url.pathname === '/validate') return this.validate(body);
    return this.complete(body);
  }

  async acquire(body) {
    const now = Date.now();
    const activeLease = await this.state.storage.get(PRICE_SYNC_ACTIVE_LEASE_KEY);
    if (validActivePriceSyncLease(activeLease, now)) {
      return jsonResponse({
        ok: true,
        granted: false,
        reason: 'lease_active',
        nextAllowedAt: Number(activeLease.expiresAt)
      }, 200, { 'cache-control': 'no-store' });
    }
    if (activeLease) await this.state.storage.delete(PRICE_SYNC_ACTIVE_LEASE_KEY);

    const observedCapturedAt = normalizePriceSyncTimestamp(body && body.observedCapturedAt, now);
    const storedLatestCapturedAt = normalizePriceSyncTimestamp(
      await this.state.storage.get(PRICE_SYNC_LATEST_CAPTURED_KEY),
      now
    );
    const latestCapturedAt = Math.max(observedCapturedAt, storedLatestCapturedAt);
    let nextAllowedAt = normalizePriceSyncTimestamp(
      await this.state.storage.get(PRICE_SYNC_NEXT_ALLOWED_KEY),
      Number.MAX_SAFE_INTEGER
    );
    if (observedCapturedAt > storedLatestCapturedAt) {
      nextAllowedAt = Math.max(
        nextAllowedAt,
        observedCapturedAt + REFRESH_INTERVAL_MS + PRICE_SYNC_SOURCE_GRACE_MS
      );
      await this.state.storage.put({
        [PRICE_SYNC_LATEST_CAPTURED_KEY]: observedCapturedAt,
        [PRICE_SYNC_NEXT_ALLOWED_KEY]: nextAllowedAt,
        [PRICE_SYNC_COOLDOWN_REASON_KEY]: 'fresh_snapshot'
      });
    }
    if (nextAllowedAt > now) {
      const storedReason = String(await this.state.storage.get(PRICE_SYNC_COOLDOWN_REASON_KEY) || 'fresh_snapshot');
      return jsonResponse({
        ok: true,
        granted: false,
        reason: storedReason === 'retry_cooldown' ? storedReason : 'fresh_snapshot',
        nextAllowedAt,
        capturedAt: latestCapturedAt || 0
      }, 200, { 'cache-control': 'no-store' });
    }

    const leaseId = crypto.randomUUID();
    const leaseExpiresAt = now + PRICE_SYNC_LEASE_MS;
    await this.state.storage.put(PRICE_SYNC_ACTIVE_LEASE_KEY, { leaseId, expiresAt: leaseExpiresAt });
    return jsonResponse({
      ok: true,
      granted: true,
      leaseId,
      leaseExpiresAt,
      nextAllowedAt: leaseExpiresAt,
      capturedAt: latestCapturedAt || 0
    }, 200, { 'cache-control': 'no-store' });
  }

  async release(body) {
    const activeLease = await this.state.storage.get(PRICE_SYNC_ACTIVE_LEASE_KEY);
    const leaseId = String(body && body.leaseId || '');
    if (!activeLease || !leaseId || activeLease.leaseId !== leaseId) {
      return jsonResponse({ ok: true, released: false }, 200, { 'cache-control': 'no-store' });
    }

    const nextAllowedAt = Date.now() + PRICE_SYNC_RETRY_COOLDOWN_MS;
    await this.state.storage.delete(PRICE_SYNC_ACTIVE_LEASE_KEY);
    await this.state.storage.put({
      [PRICE_SYNC_NEXT_ALLOWED_KEY]: nextAllowedAt,
      [PRICE_SYNC_COOLDOWN_REASON_KEY]: 'retry_cooldown'
    });
    return jsonResponse({ ok: true, released: true, nextAllowedAt }, 200, { 'cache-control': 'no-store' });
  }

  async validate(body) {
    const now = Date.now();
    const activeLease = await this.state.storage.get(PRICE_SYNC_ACTIVE_LEASE_KEY);
    const leaseId = String(body && body.leaseId || '');
    const valid = Boolean(
      validActivePriceSyncLease(activeLease, now)
      && leaseId
      && activeLease.leaseId === leaseId
    );
    return jsonResponse({
      ok: true,
      valid,
      leaseExpiresAt: valid ? Number(activeLease.expiresAt) : 0
    }, 200, { 'cache-control': 'no-store' });
  }

  async complete(body) {
    const activeLease = await this.state.storage.get(PRICE_SYNC_ACTIVE_LEASE_KEY);
    const leaseId = String(body && body.leaseId || '');
    if (!activeLease || !leaseId || activeLease.leaseId !== leaseId) {
      return jsonResponse({ ok: true, completed: false }, 200, { 'cache-control': 'no-store' });
    }

    const now = Date.now();
    const capturedAt = normalizePriceSyncTimestamp(body && body.capturedAt, now) || now;
    const sourceUpdatedAt = normalizePriceSyncTimestamp(body && body.sourceUpdatedAt, now) || capturedAt;
    const nextAllowedAt = Math.max(
      sourceUpdatedAt + REFRESH_INTERVAL_MS + PRICE_SYNC_SOURCE_GRACE_MS,
      now + PRICE_SYNC_RETRY_COOLDOWN_MS
    );
    await this.state.storage.delete(PRICE_SYNC_ACTIVE_LEASE_KEY);
    await this.state.storage.put({
      [PRICE_SYNC_NEXT_ALLOWED_KEY]: nextAllowedAt,
      [PRICE_SYNC_LATEST_CAPTURED_KEY]: capturedAt,
      [PRICE_SYNC_SOURCE_UPDATED_KEY]: sourceUpdatedAt,
      [PRICE_SYNC_COOLDOWN_REASON_KEY]: 'fresh_snapshot'
    });
    return jsonResponse({
      ok: true,
      completed: true,
      latestCapturedAt: capturedAt,
      sourceUpdatedAt,
      nextAllowedAt
    }, 200, { 'cache-control': 'no-store' });
  }
}

function validActivePriceSyncLease(value, now) {
  return Boolean(
    value
    && typeof value === 'object'
    && /^[a-f0-9-]{36}$/i.test(String(value.leaseId || ''))
    && Number(value.expiresAt) > now
  );
}

function normalizePriceSyncTimestamp(value, futureLimit) {
  const timestamp = Math.floor(Number(value));
  if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > futureLimit + FUTURE_TOLERANCE_MS) return 0;
  return timestamp;
}

async function getPriceHistory(request, env) {
  return withPublicCache(request, async () => {
    assertDatabase(env);
    const url = new URL(request.url);
    const threshold = normalizeChangeThreshold(url.searchParams.get('threshold'));
    const rows = await env.PRICE_DB.prepare(`
      SELECT id, submitted_at, accepted_at, captured_at, source, prices_json
      FROM price_submissions
      WHERE accepted = 1
      ORDER BY captured_at ASC, id ASC
    `).all();
    const result = buildPriceChangeHistory((rows && rows.results) || [], threshold);
    return jsonResponse({
      ok: true,
      threshold,
      totalSnapshots: result.totalSnapshots,
      eventCount: result.eventCount,
      groups: result.groups,
      series: result.series
    }, 200, {
      'cache-control': PUBLIC_HISTORY_CACHE_CONTROL
    });
  });
}

async function getPriceSeries(request, env) {
  const url = new URL(request.url);
  const seedId = normalizePriceSeriesSeed(url.searchParams.get('seedId'));
  const windowValue = normalizePriceSeriesWindow(url.searchParams.get('window'));
  if (!seedId) return jsonResponse({ ok: false, error: 'invalid_seed_id' }, 400, { 'cache-control': 'no-store' });
  if (!windowValue) return jsonResponse({ ok: false, error: 'invalid_window' }, 400, { 'cache-control': 'no-store' });

  return withPublicCache(request, async () => {
    assertDatabase(env);
    const threshold = normalizeChangeThreshold(url.searchParams.get('threshold'));
    const rows = await queryPriceSeriesRows(env, seedId, windowValue);
    const result = buildPriceSeries(rows, seedId, threshold);
    return jsonResponse({
      ok: true,
      seedId,
      window: windowValue,
      threshold,
      totalSnapshots: result.totalSnapshots,
      eventCount: result.eventCount,
      groups: result.groups,
      series: result.series
    }, 200, {
      'cache-control': priceSeriesCacheControl(windowValue)
    });
  });
}

async function submitPrices(request, env) {
  const siteConfig = await loadSiteConfig(env);
  if (!siteConfig.siteEnabled || !siteConfig.cloudUploadEnabled) {
    return jsonResponse({ ok: false, status: 'rejected', reason: 'cloud_upload_disabled' }, 403, { 'cache-control': 'no-store' });
  }
  assertDatabase(env);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ ok: false, status: 'rejected', reason: 'invalid_json' }, 400);
  }

  const now = Date.now();
  const normalized = normalizeSubmission(body, now);
  if (!normalized.ok) {
    if (normalized.reason !== 'script_update_required') {
      await releasePriceSyncLease(env, body && body.snapshot && body.snapshot.syncLeaseId);
    }
    const responseBody = { ok: false, status: 'rejected', reason: normalized.reason };
    if (normalized.reason === 'script_update_required') responseBody.requiredScriptVersion = REQUIRED_USERSCRIPT_VERSION;
    return jsonResponse(responseBody, 400);
  }

  if (!await validatePriceSyncLease(env, normalized.syncLeaseId)) {
    return jsonResponse({ ok: false, status: 'rejected', reason: 'invalid_sync_lease' }, 400);
  }

  let leaseSettled = false;
  try {
    const current = await env.PRICE_DB.prepare('SELECT * FROM default_prices WHERE id = 1').first();
    const currentCapturedAt = current ? Number(current.captured_at) : 0;
    const currentSignature = current ? String(current.price_signature || '') : '';
    const samePrices = currentSignature && currentSignature === normalized.priceSignature;
    const rejectionReason = current && normalized.capturedAt <= currentCapturedAt
      ? 'stale_or_existing_data'
      : current && samePrices && normalized.capturedAt < currentCapturedAt + REFRESH_INTERVAL_MS
        ? 'same_refresh_interval'
        : '';
    const submitterHash = await hashSubmitter(request);

    const insertResult = await env.PRICE_DB.prepare(`
      INSERT INTO price_submissions (
        submitted_at,
        captured_at,
        captured_bucket,
        source,
        matched_count,
        total_count,
        price_signature,
        prices_json,
        price_change_rates_json,
        price_trends_json,
        submitter_hash,
        accepted,
        accepted_at,
        rejection_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
    `).bind(
      now,
      normalized.capturedAt,
      normalized.capturedBucket,
      normalized.source,
      normalized.matchedCount,
      normalized.totalCount,
      normalized.priceSignature,
      normalized.pricesJson,
      normalized.priceChangeRatesJson,
      normalized.priceTrendsJson,
      submitterHash,
      rejectionReason || null
    ).run();

    const submissionId = Number(insertResult.meta && insertResult.meta.last_row_id) || 0;

    if (rejectionReason) {
      leaseSettled = await completePriceSyncLease(env, normalized, currentCapturedAt || normalized.capturedAt);
      return jsonResponse({ ok: true, status: 'rejected', reason: rejectionReason, submissionId });
    }

    await acceptSubmission(env, normalized, submissionId, now);
    await publishAcceptedSnapshot(env, normalized, submissionId, now);
    await purgePriceResponseCaches(request);
    leaseSettled = await completePriceSyncLease(env, normalized, normalized.capturedAt);

    return jsonResponse({
      ok: true,
      status: 'accepted',
      mode: current ? 'new_refresh_interval' : 'bootstrap',
      submissionId,
      refreshIntervalMs: REFRESH_INTERVAL_MS,
      snapshot: snapshotFromNormalized(normalized, now)
    });
  } catch (error) {
    if (!leaseSettled) await releasePriceSyncLease(env, normalized.syncLeaseId);
    throw error;
  }
}

export function normalizeSubmission(body, now) {
  const snapshot = body && body.snapshot ? body.snapshot : body;
  if (!snapshot || typeof snapshot !== 'object') return { ok: false, reason: 'missing_snapshot' };

  const scriptVersion = String(snapshot.scriptVersion == null ? '' : snapshot.scriptVersion).trim();
  if (!userscriptVersionSupported(scriptVersion)) return { ok: false, reason: 'script_update_required' };
  const syncLeaseId = String(snapshot.syncLeaseId == null ? '' : snapshot.syncLeaseId).trim();
  if (!/^[a-f0-9-]{36}$/i.test(syncLeaseId)) return { ok: false, reason: 'invalid_sync_lease' };

  const capturedAt = Math.floor(Number(snapshot.capturedAt));
  if (!Number.isFinite(capturedAt) || capturedAt <= 0) return { ok: false, reason: 'invalid_captured_at' };
  if (capturedAt > now + FUTURE_TOLERANCE_MS) return { ok: false, reason: 'future_captured_at' };

  const priceSource = snapshot.prices && snapshot.prices.shop ? snapshot.prices.shop : snapshot.prices;
  if (!priceSource || typeof priceSource !== 'object') return { ok: false, reason: 'missing_prices' };

  const prices = {};
  for (const id of SEED_IDS) {
    const value = Number(priceSource[id]);
    if (!Number.isFinite(value)) continue;
    if (value < 0 || value > MAX_PRICE_USD) return { ok: false, reason: 'price_out_of_range' };
    prices[id] = Number(value.toFixed(5));
  }

  const matchedCount = Object.keys(prices).length;
  if (matchedCount < MIN_MATCHED_PRICES) return { ok: false, reason: 'too_few_prices' };

  const priceSignature = Object.keys(prices)
    .sort()
    .map((id) => `${id}:${prices[id].toFixed(5)}`)
    .join('|');

  const priceChangeRates = normalizePriceChangeRates(snapshot.priceChangeRates || snapshot.changeRates || snapshot.priceRates || {});
  const priceTrends = normalizePriceTrends(snapshot.priceTrends || snapshot.trends || {});

  return {
    ok: true,
    scriptVersion,
    syncLeaseId,
    sourceUpdatedAt: normalizePriceSyncTimestamp(snapshot.sourceUpdatedAt, now) || capturedAt,
    capturedAt,
    capturedBucket: Math.floor(capturedAt / REFRESH_INTERVAL_MS),
    source: String(snapshot.source || 'dashboard-upload').slice(0, 64),
    matchedCount,
    totalCount: SEED_IDS.length,
    prices,
    pricesJson: JSON.stringify(prices),
    priceChangeRates,
    priceChangeRatesJson: JSON.stringify(priceChangeRates),
    priceTrends,
    priceTrendsJson: JSON.stringify(priceTrends),
    priceSignature
  };
}

function normalizePriceChangeRates(input) {
  const source = input && input.shop && typeof input.shop === 'object' ? input.shop : input;
  const out = {};
  for (const id of SEED_IDS) {
    const value = Number(source && source[id]);
    if (Number.isFinite(value)) out[id] = Number(value.toFixed(6));
  }
  return out;
}

function normalizePriceTrends(input) {
  const source = input && input.shop && typeof input.shop === 'object' ? input.shop : input;
  const out = {};
  for (const id of SEED_IDS) {
    const item = source && source[id];
    if (!item || typeof item !== 'object') continue;
    const hourly = normalizeTrendSeries(item.hourly || item.hour || []);
    const daily = normalizeTrendSeries(item.daily || item.day || []);
    const unitPrice = Number(item.unitPrice);
    const lastRefreshedAt = validIsoLike(item.lastRefreshedAt) ? String(item.lastRefreshedAt) : '';
    if (!hourly.length && !daily.length && !Number.isFinite(unitPrice) && !lastRefreshedAt) continue;
    out[id] = {};
    if (hourly.length) out[id].hourly = hourly;
    if (daily.length) out[id].daily = daily;
    if (Number.isFinite(unitPrice) && unitPrice >= 0) out[id].unitPrice = Number(unitPrice.toFixed(5));
    if (lastRefreshedAt) out[id].lastRefreshedAt = lastRefreshedAt;
  }
  return out;
}

function normalizeTrendSeries(series) {
  if (!Array.isArray(series)) return [];
  return series.map((point) => {
    const bucketStartedAt = validIsoLike(point && point.bucketStartedAt) ? String(point.bucketStartedAt) : '';
    const avgUnitPrice = Number(point && point.avgUnitPrice);
    if (!bucketStartedAt || !Number.isFinite(avgUnitPrice) || avgUnitPrice < 0) return null;
    return { bucketStartedAt, avgUnitPrice: Number(avgUnitPrice.toFixed(5)) };
  }).filter(Boolean)
    .sort((a, b) => Date.parse(a.bucketStartedAt) - Date.parse(b.bucketStartedAt))
    .slice(-MAX_TREND_POINTS_PER_SERIES);
}

function validIsoLike(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function hasCompleteHourlyAnchor(hourly, lastRefreshedAt) {
  if (!Array.isArray(hourly) || !validIsoLike(lastRefreshedAt)) return false;
  const targetAt = Date.parse(lastRefreshedAt) - 24 * REFRESH_INTERVAL_MS;
  return hourly.some((point) => (
    validIsoLike(point && point.bucketStartedAt)
    && Date.parse(point.bucketStartedAt) <= targetAt
  ));
}

export function trendMapNeedsHydration(existingTrends, currentPrices) {
  for (const id of SEED_IDS) {
    if (!Object.prototype.hasOwnProperty.call(currentPrices || {}, id)) continue;
    const trend = existingTrends && existingTrends[id];
    if (
      !trend
      || !validIsoLike(trend.lastRefreshedAt)
      || !Number.isFinite(trend && trend.unitPrice)
      || !Array.isArray(trend.daily)
      || !trend.daily.length
      || !hasCompleteHourlyAnchor(trend.hourly, trend.lastRefreshedAt)
    ) return true;
  }
  return false;
}

function fallbackSeriesScale(existingUnitPrice, fallbackUnitPrice) {
  if (!Number.isFinite(existingUnitPrice) || !Number.isFinite(fallbackUnitPrice) || fallbackUnitPrice <= 0) return null;
  const scale = existingUnitPrice / fallbackUnitPrice;
  return Number.isFinite(scale) && scale > 0 ? scale : null;
}

function copyTrendSeries(series, scale = 1) {
  if (!Array.isArray(series)) return null;
  return series.map((point) => {
    if (!point || typeof point !== 'object') return point;
    const copy = { ...point };
    const scaledPrice = Number(point.avgUnitPrice) * scale;
    if (Number.isFinite(scaledPrice)) copy.avgUnitPrice = scaledPrice;
    return copy;
  });
}

function canScaleTrendSeries(series, scale) {
  return !Array.isArray(series) || series.every((point) => (
    Number.isFinite(Number(point && point.avgUnitPrice) * scale)
  ));
}

function copyPriceTrend(trend) {
  const copy = {};
  const hourly = copyTrendSeries(trend && trend.hourly);
  const daily = copyTrendSeries(trend && trend.daily);
  if (hourly) copy.hourly = hourly;
  if (daily) copy.daily = daily;
  if (Number.isFinite(trend && trend.unitPrice)) copy.unitPrice = trend.unitPrice;
  if (validIsoLike(trend && trend.lastRefreshedAt)) copy.lastRefreshedAt = trend.lastRefreshedAt;
  return copy;
}

export function mergePriceTrendMaps(fallbackTrends, existingTrends) {
  const merged = {};
  for (const id of SEED_IDS) {
    const fallback = fallbackTrends && fallbackTrends[id];
    const existing = existingTrends && existingTrends[id];
    if ((!fallback || typeof fallback !== 'object') && (!existing || typeof existing !== 'object')) continue;

    const trend = {};
    const hasExistingUnitPrice = Boolean(existing && Number.isFinite(existing.unitPrice));
    const existingHourly = existing && existing.hourly;
    const useExistingHourly = hasExistingUnitPrice
      && hasCompleteHourlyAnchor(existingHourly, existing && existing.lastRefreshedAt);
    const hourly = useExistingHourly
      ? existingHourly
      : fallback && fallback.hourly;
    const lastRefreshedAt = useExistingHourly
      ? existing && existing.lastRefreshedAt
      : fallback && fallback.lastRefreshedAt;
    const existingDaily = existing && existing.daily;
    const useExistingDaily = hasExistingUnitPrice && Array.isArray(existingDaily) && existingDaily.length;
    const daily = useExistingDaily
      ? existingDaily
      : fallback && fallback.daily;
    const usesFallbackHourly = !useExistingHourly && Array.isArray(fallback && fallback.hourly);
    const usesFallbackDaily = !useExistingDaily && Array.isArray(fallback && fallback.daily);
    const scale = hasExistingUnitPrice
      ? fallbackSeriesScale(existing.unitPrice, fallback && fallback.unitPrice)
      : 1;
    if (
      hasExistingUnitPrice
      && (usesFallbackHourly || usesFallbackDaily)
      && (
        !Number.isFinite(scale)
        || (usesFallbackHourly && !canScaleTrendSeries(fallback.hourly, scale))
        || (usesFallbackDaily && !canScaleTrendSeries(fallback.daily, scale))
      )
    ) {
      merged[id] = copyPriceTrend(fallback);
      continue;
    }
    const copiedHourly = copyTrendSeries(hourly, useExistingHourly ? 1 : scale);
    const copiedDaily = copyTrendSeries(daily, useExistingDaily ? 1 : scale);
    if (copiedHourly) trend.hourly = copiedHourly;
    if (copiedDaily) trend.daily = copiedDaily;

    const unitPrice = hasExistingUnitPrice
      ? existing.unitPrice
      : fallback && fallback.unitPrice;
    if (Number.isFinite(unitPrice)) trend.unitPrice = unitPrice;

    if (validIsoLike(lastRefreshedAt)) trend.lastRefreshedAt = lastRefreshedAt;

    merged[id] = trend;
  }
  return merged;
}

async function acceptSubmission(env, normalized, submissionId, now) {
  await env.PRICE_DB.batch([
    env.PRICE_DB.prepare(`
      UPDATE price_submissions
      SET accepted = 1, accepted_at = ?
      WHERE id = ?
    `).bind(
      now,
      submissionId
    ),
    env.PRICE_DB.prepare(`
      INSERT INTO default_prices (
        id,
        updated_at,
        captured_at,
        submission_id,
        matched_count,
        total_count,
        price_signature,
        prices_json,
        price_change_rates_json,
        price_trends_json
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        updated_at = excluded.updated_at,
        captured_at = excluded.captured_at,
        submission_id = excluded.submission_id,
        matched_count = excluded.matched_count,
        total_count = excluded.total_count,
        price_signature = excluded.price_signature,
        prices_json = excluded.prices_json,
        price_change_rates_json = excluded.price_change_rates_json,
        price_trends_json = excluded.price_trends_json
    `).bind(
      now,
      normalized.capturedAt,
      submissionId,
      normalized.matchedCount,
      normalized.totalCount,
      normalized.priceSignature,
      normalized.pricesJson,
      normalized.priceChangeRatesJson,
      normalized.priceTrendsJson
    )
  ]);
}

async function hashSubmitter(request) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown-ip';
  const ua = request.headers.get('user-agent') || 'unknown-ua';
  return sha256Hex(`${ip}\n${ua}`);
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeHistorySnapshotCount(value) {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value.historySnapshotCount ?? value.count
    : value;
  const count = Number(candidate);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : null;
}

function applyHistorySnapshotCount(snapshot, rows) {
  const count = normalizeHistorySnapshotCount(rows && rows.historySnapshotCount);
  if (count !== null && snapshot) snapshot.historySnapshotCount = count;
  return count;
}

function snapshotFromDefaultRow(row) {
  const priceChangeRates = safeJsonObject(row.price_change_rates_json);
  const priceTrends = safeJsonObject(row.price_trends_json);
  const snapshot = {
    version: 1,
    source: 'cloud-default',
    capturedAt: Number(row.captured_at),
    defaultUpdatedAt: Number(row.updated_at),
    submissionId: Number(row.submission_id) || 0,
    prices: { shop: safeJsonObject(row.prices_json) },
    matched: Number(row.matched_count) || 0,
    totalSeeds: Number(row.total_count) || SEED_IDS.length
  };
  const historySnapshotCount = normalizeHistorySnapshotCount(row && (row.history_snapshot_count ?? row.historySnapshotCount));
  if (historySnapshotCount !== null) snapshot.historySnapshotCount = historySnapshotCount;
  if (Object.keys(priceChangeRates).length) snapshot.priceChangeRates = { shop: priceChangeRates };
  if (Object.keys(priceTrends).length) snapshot.priceTrends = { shop: priceTrends };
  return snapshot;
}

async function loadLatestSnapshot(env) {
  const published = await readPublishedSnapshot(env);
  if (published) {
    await hydratePublishedSnapshotWindows(env, published);
    return published;
  }

  assertDatabase(env);
  const row = await env.PRICE_DB.prepare('SELECT * FROM default_prices WHERE id = 1').first();
  if (!row) return null;

  const snapshot = snapshotFromDefaultRow(row);
  let windowRows = null;
  try {
    windowRows = await queryPriceRowsForWindows(env, snapshot.capturedAt);
    applyHistorySnapshotCount(snapshot, windowRows);
    snapshot.priceChangeWindows = buildPriceChangeWindows(windowRows, snapshot);
  } catch (_) {
    // The current price snapshot remains usable if trend hydration is unavailable.
  }
  try {
    await hydrateSnapshotTrends(env, snapshot, windowRows);
  } catch (_) {
    // The current price snapshot remains usable if full trend hydration is unavailable.
  }
  await publishLatestSnapshot(env, snapshot);
  return snapshot;
}

async function hydratePublishedSnapshotWindows(env, snapshot) {
  const complete = hasCompletePriceTrendWindows(snapshot);
  if (complete) return false;

  try {
    const rows = await queryPriceRowsForWindows(env, snapshot.capturedAt);
    snapshot.priceChangeWindows = buildPriceChangeWindows(rows, snapshot);
    await publishLatestSnapshot(env, snapshot);
    return true;
  } catch (_) {
    // A legacy KV snapshot remains usable when D1 is temporarily unavailable.
    return false;
  }
}

async function readPublishedSnapshot(env) {
  if (!env || !env.LATEST_KV || typeof env.LATEST_KV.get !== 'function') return null;
  let versioned = null;
  try {
    versioned = await readLatestVersionedSnapshot(env);
  } catch (_) {
    // A list failure should still allow the legacy fixed key to serve data.
  }
  if (versioned) return hydratePublishedHistoryCount(env, versioned);
  try {
    const value = await env.LATEST_KV.get(LATEST_SNAPSHOT_KV_KEY, { type: 'json' });
    return hydratePublishedHistoryCount(env, normalizePublishedSnapshot(value));
  } catch (_) {
    return null;
  }
}

async function hydratePublishedHistoryCount(env, snapshot) {
  if (!snapshot) return null;
  const existingCount = normalizeHistorySnapshotCount(snapshot.historySnapshotCount);
  if (existingCount !== null) {
    snapshot.historySnapshotCount = existingCount;
    return snapshot;
  }
  if (!env || !env.LATEST_KV || typeof env.LATEST_KV.get !== 'function') return snapshot;
  try {
    const value = await env.LATEST_KV.get(HISTORY_COUNT_KV_KEY, { type: 'json' });
    const historySnapshotCount = normalizeHistorySnapshotCount(value);
    if (historySnapshotCount !== null) snapshot.historySnapshotCount = historySnapshotCount;
  } catch (_) {
    // The migration key is best effort; the legacy snapshot remains usable.
  }
  return snapshot;
}

async function readLatestVersionedSnapshot(env) {
  if (!env || !env.LATEST_KV || typeof env.LATEST_KV.list !== 'function') return null;
  const keys = await listVersionedSnapshotKeys(env);
  const latestKey = keys.slice().sort().pop() || '';
  if (!latestKey) return null;
  return normalizePublishedSnapshot(await env.LATEST_KV.get(latestKey, { type: 'json' }));
}

async function listVersionedSnapshotKeys(env) {
  if (!env || !env.LATEST_KV || typeof env.LATEST_KV.list !== 'function') return [];
  const names = new Set();
  let cursor = '';
  do {
    const options = { prefix: LATEST_SNAPSHOT_KV_PREFIX, limit: 1000 };
    if (cursor) options.cursor = cursor;
    const page = await env.LATEST_KV.list(options);
    for (const item of (page && Array.isArray(page.keys) ? page.keys : [])) {
      const name = String(item && item.name || '');
      if (name) names.add(name);
    }
    cursor = page && page.list_complete === false && page.cursor ? String(page.cursor) : '';
  } while (cursor);
  return Array.from(names);
}

function normalizePublishedSnapshot(value) {
  const snapshot = value && value.snapshot && value.snapshot.prices ? value.snapshot : value;
  return snapshot && snapshot.prices && snapshot.prices.shop ? snapshot : null;
}

export async function publishLatestSnapshot(env, snapshot) {
  if (!env || !env.LATEST_KV || typeof env.LATEST_KV.put !== 'function' || !snapshot) return false;
  try {
    const published = await readPublishedSnapshot(env);
    const mergedWindows = mergePriceChangeWindows(
      published && published.priceChangeWindows,
      snapshot.priceChangeWindows
    );
    const snapshotToPublish = Object.keys(mergedWindows).length
      ? { ...snapshot, priceChangeWindows: mergedWindows }
      : snapshot;
    if (typeof env.LATEST_KV.list === 'function') {
      await env.LATEST_KV.put(snapshotVersionKey(snapshotToPublish), JSON.stringify(snapshotToPublish));
      await pruneVersionedSnapshots(env);
      return true;
    }
    if (published && shouldKeepPublishedSnapshot(published, snapshotToPublish)) return false;
    await env.LATEST_KV.put(LATEST_SNAPSHOT_KV_KEY, JSON.stringify(snapshotToPublish));
    return true;
  } catch (_) {
    // KV is a read optimization; an unavailable KV must not reject a valid upload.
    return false;
  }
}

async function pruneVersionedSnapshots(env) {
  if (!env || !env.LATEST_KV || typeof env.LATEST_KV.delete !== 'function') return;
  const keys = (await listVersionedSnapshotKeys(env)).sort().reverse();
  await Promise.allSettled(keys.slice(MAX_PUBLISHED_SNAPSHOT_VERSIONS).map((key) => env.LATEST_KV.delete(key)));
}

function snapshotVersionKey(snapshot) {
  const capturedAt = String(Math.max(0, Number(snapshot && snapshot.capturedAt) || 0)).padStart(16, '0');
  const updatedAt = String(Math.max(0, Number(snapshot && snapshot.defaultUpdatedAt) || 0)).padStart(16, '0');
  const submissionId = String(Math.max(0, Number(snapshot && snapshot.submissionId) || 0)).padStart(16, '0');
  return `${LATEST_SNAPSHOT_KV_PREFIX}${capturedAt}:${updatedAt}:${submissionId}`;
}

function shouldKeepPublishedSnapshot(existing, incoming) {
  const existingCapturedAt = Number(existing && existing.capturedAt) || 0;
  const incomingCapturedAt = Number(incoming && incoming.capturedAt) || 0;
  if (existingCapturedAt > incomingCapturedAt) return true;
  if (existingCapturedAt < incomingCapturedAt) return false;

  const existingUpdatedAt = Number(existing && existing.defaultUpdatedAt) || 0;
  const incomingUpdatedAt = Number(incoming && incoming.defaultUpdatedAt) || 0;
  if (existingUpdatedAt > incomingUpdatedAt) return true;

  const existingComplete = hasCompletePriceTrendWindows(existing);
  const incomingComplete = hasCompletePriceTrendWindows(incoming);
  return Boolean(existingComplete && !incomingComplete);
}

async function publishAcceptedSnapshot(env, normalized, submissionId, now) {
  if (!env || !env.LATEST_KV) return false;
  const snapshot = snapshotFromNormalized(normalized, now);
  snapshot.submissionId = Number(submissionId) || 0;
  try {
    const rows = await queryPriceRowsForWindows(env, snapshot.capturedAt);
    applyHistorySnapshotCount(snapshot, rows);
    const newestAcceptedAt = Math.max(0, ...(rows || []).map((row) => Number(row && row.captured_at) || 0));
    if (newestAcceptedAt > snapshot.capturedAt) return false;
    snapshot.priceChangeWindows = buildPriceChangeWindows(rows, snapshot);
  } catch (_) {
    // Publish the accepted price even when the optional trend summary cannot be built.
  }
  return publishLatestSnapshot(env, snapshot);
}

function normalizeTrendWindow(value) {
  const normalized = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(PRICE_TREND_WINDOWS, normalized) ? normalized : '';
}

function normalizePriceSeriesSeed(value) {
  const normalized = String(value || '').trim();
  return SEED_IDS.includes(normalized) ? normalized : '';
}

function normalizePriceSeriesWindow(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === '1d') return '24h';
  return Object.prototype.hasOwnProperty.call(PRICE_SERIES_WINDOWS, normalized) ? normalized : '';
}

function priceTrendCacheControl(windowValue) {
  return PRICE_TREND_WINDOWS[windowValue] <= PRICE_TREND_WINDOWS['24h']
    ? PUBLIC_DEFAULT_CACHE_CONTROL
    : PUBLIC_HISTORY_CACHE_CONTROL;
}

function priceSeriesCacheControl(windowValue) {
  const windowMs = PRICE_SERIES_WINDOWS[windowValue];
  return windowMs > 0 && windowMs <= PRICE_SERIES_WINDOWS['24h']
    ? PUBLIC_DEFAULT_CACHE_CONTROL
    : PUBLIC_HISTORY_CACHE_CONTROL;
}

async function queryPriceRowsForWindows(env, capturedAt) {
  assertDatabase(env);
  const latestAt = Number(capturedAt) || Date.now();
  const oldestAt = latestAt - Math.max(...Object.values(PRICE_TREND_WINDOWS)) - REFRESH_INTERVAL_MS;
  const result = await env.PRICE_DB.prepare(`
    WITH history_totals AS (
      SELECT COUNT(*) AS snapshot_count
      FROM price_submissions
      WHERE accepted = 1
    )
    SELECT captured_at, prices_json
      , (SELECT snapshot_count FROM history_totals) AS history_snapshot_count
    FROM price_submissions
    WHERE accepted = 1 AND captured_at >= ?
    ORDER BY captured_at ASC, id ASC
  `).bind(oldestAt).all();
  const rows = (result && result.results) || [];
  const historySnapshotCount = normalizeHistorySnapshotCount(rows[0] && rows[0].history_snapshot_count);
  if (historySnapshotCount !== null) rows.historySnapshotCount = historySnapshotCount;
  return rows;
}

async function queryPriceSeriesRows(env, seedId, windowValue) {
  assertDatabase(env);
  const windowMs = PRICE_SERIES_WINDOWS[windowValue];
  const lookbackMs = windowMs > 0 ? windowMs + REFRESH_INTERVAL_MS : 0;
  const pricePath = `$.${seedId}`;
  const result = await env.PRICE_DB.prepare(`
    WITH latest AS (
      SELECT COALESCE(MAX(captured_at), 0) AS latest_at
      FROM price_submissions
      WHERE accepted = 1
    )
    SELECT id, submitted_at, accepted_at, captured_at, source,
      json_extract(prices_json, '${pricePath}') AS price
    FROM price_submissions
    CROSS JOIN latest
    WHERE accepted = 1
      AND (? = 0 OR captured_at >= latest.latest_at - ?)
    ORDER BY captured_at ASC, id ASC
  `).bind(windowMs, lookbackMs).all();
  return (result && result.results) || [];
}

export function buildPriceSeries(rows, seedId, threshold) {
  const sortedRows = (Array.isArray(rows) ? rows : [])
    .slice()
    .sort((a, b) => Number(a && a.captured_at) - Number(b && b.captured_at) || Number(a && a.id) - Number(b && b.id));
  const points = [];
  const events = [];
  let previous = null;
  sortedRows.forEach((row) => {
    const capturedAt = Number(row && row.captured_at);
    const price = Number(row && row.price);
    if (!Number.isFinite(capturedAt) || capturedAt <= 0 || !Number.isFinite(price) || price < 0) return;
    const point = {
      submissionId: Number(row && row.id) || 0,
      source: String(row && row.source || ''),
      capturedAt,
      price: Number(price.toFixed(5))
    };
    points.push(point);
    if (previous && previous.price > 0) {
      const changeRate = ((price - previous.price) / previous.price) * 100;
      if (Number.isFinite(changeRate) && Math.abs(changeRate) >= threshold) {
        events.push({
          submissionId: point.submissionId,
          source: point.source,
          capturedAt,
          acceptedAt: Number(row && row.accepted_at) || 0,
          previousCapturedAt: previous.capturedAt,
          previousPrice: Number(previous.price.toFixed(5)),
          currentPrice: point.price,
          changeRate: Number(changeRate.toFixed(6))
        });
      }
    }
    previous = { capturedAt, price };
  });

  return {
    totalSnapshots: points.length,
    eventCount: events.length,
    groups: events.length ? [{ seedId, events: events.slice().sort((a, b) => b.capturedAt - a.capturedAt) }] : [],
    series: points.length ? [{ seedId, points }] : []
  };
}

export function buildPriceChangeWindows(rows, snapshot) {
  const currentPrices = snapshot && snapshot.prices && snapshot.prices.shop ? snapshot.prices.shop : {};
  const latestAt = Number(snapshot && snapshot.capturedAt)
    || Math.max(0, ...(Array.isArray(rows) ? rows : []).map((row) => Number(row && row.captured_at) || 0));
  const points = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      capturedAt: Number(row && row.captured_at),
      prices: safeJsonObject(row && row.prices_json)
    }))
    .filter((row) => Number.isFinite(row.capturedAt) && row.capturedAt > 0)
    .sort((a, b) => a.capturedAt - b.capturedAt);

  const result = {};
  Object.entries(PRICE_TREND_WINDOWS).forEach(([windowValue, windowMs]) => {
    const targetAt = latestAt - windowMs;
    const trends = {};
    for (const seedId of SEED_IDS) {
      const currentPrice = Number(currentPrices[seedId]);
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) continue;
      let anchor = null;
      points.forEach((point) => {
        const price = Number(point.prices[seedId]);
        if (point.capturedAt <= targetAt && Number.isFinite(price) && price > 0) {
          anchor = { capturedAt: point.capturedAt, price };
        }
      });
      if (!anchor) continue;
      const rate = ((currentPrice - anchor.price) / anchor.price) * 100;
      if (!Number.isFinite(rate)) continue;
      trends[seedId] = {
        rate: Number(rate.toFixed(6)),
        baseAt: anchor.capturedAt,
        endAt: latestAt,
        basePrice: Number(anchor.price.toFixed(5)),
        endPrice: Number(currentPrice.toFixed(5))
      };
    }
    result[windowValue] = trends;
  });
  return result;
}

function snapshotFromNormalized(normalized, updatedAt) {
  const snapshot = {
    version: 1,
    source: 'cloud-default',
    scriptVersion: normalized.scriptVersion,
    capturedAt: normalized.capturedAt,
    sourceUpdatedAt: normalized.sourceUpdatedAt,
    defaultUpdatedAt: updatedAt,
    prices: { shop: normalized.prices },
    matched: normalized.matchedCount,
    totalSeeds: normalized.totalCount
  };
  if (Object.keys(normalized.priceChangeRates || {}).length) snapshot.priceChangeRates = { shop: normalized.priceChangeRates };
  if (Object.keys(normalized.priceTrends || {}).length) snapshot.priceTrends = { shop: normalized.priceTrends };
  return snapshot;
}

export function userscriptVersionSupported(value) {
  return compareUserscriptVersions(value, REQUIRED_USERSCRIPT_VERSION) >= 0;
}

function compareUserscriptVersions(left, right) {
  const parse = (value) => {
    const parts = String(value == null ? '' : value).trim().split('.');
    if (!parts.length || parts.some((part) => !/^\d+$/.test(part))) return null;
    return parts.map((part) => Number(part));
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return -1;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export async function hydrateSnapshotTrends(env, snapshot, providedRows) {
  if (!snapshot || !snapshot.prices || !snapshot.prices.shop) return;
  const existingTrends = snapshot.priceTrends && snapshot.priceTrends.shop ? snapshot.priceTrends.shop : {};
  if (!trendMapNeedsHydration(existingTrends, snapshot.prices.shop)) return;

  const rows = Array.isArray(providedRows)
    ? providedRows
    : ((await env.PRICE_DB.prepare(`
      SELECT captured_at, prices_json
      FROM price_submissions
      WHERE accepted = 1
      ORDER BY captured_at DESC
      LIMIT 500
    `).all()).results || []);
  const trendMap = buildTrendMapFromRows(rows, snapshot.prices.shop, Number(snapshot.capturedAt) || Date.now());
  if (Object.keys(trendMap).length) snapshot.priceTrends = { shop: mergePriceTrendMaps(trendMap, existingTrends) };
}

function buildTrendMapFromRows(rows, currentPrices, fallbackCapturedAt) {
  const sortedRows = rows.slice().sort((a, b) => Number(a.captured_at) - Number(b.captured_at));
  const buckets = {};
  for (const row of sortedRows) {
    const capturedAt = Number(row.captured_at);
    if (!Number.isFinite(capturedAt) || capturedAt <= 0) continue;
    const prices = safeJsonObject(row.prices_json);
    addTrendBucketPoints(buckets, prices, capturedAt, 'hourly', REFRESH_INTERVAL_MS);
    addTrendBucketPoints(buckets, prices, capturedAt, 'daily', 24 * REFRESH_INTERVAL_MS);
  }

  const refreshedAt = new Date(Number(fallbackCapturedAt) || Date.now()).toISOString();
  const out = {};
  for (const id of SEED_IDS) {
    const current = Number(currentPrices && currentPrices[id]);
    const hourly = bucketMapToSeries(buckets[`${id}:hourly`]);
    const daily = bucketMapToSeries(buckets[`${id}:daily`]);
    if (!hourly.length && !daily.length && !Number.isFinite(current)) continue;
    out[id] = { hourly, daily };
    if (Number.isFinite(current)) out[id].unitPrice = Number(current.toFixed(5));
    out[id].lastRefreshedAt = refreshedAt;
  }
  return out;
}

function addTrendBucketPoints(buckets, prices, capturedAt, seriesKey, bucketMs) {
  const bucketStartedAt = new Date(Math.floor(capturedAt / bucketMs) * bucketMs).toISOString();
  for (const id of SEED_IDS) {
    const price = Number(prices && prices[id]);
    if (!Number.isFinite(price) || price < 0) continue;
    const key = `${id}:${seriesKey}`;
    const series = buckets[key] || (buckets[key] = new Map());
    const aggregate = series.get(bucketStartedAt) || { sum: 0, count: 0 };
    aggregate.sum += price;
    aggregate.count += 1;
    series.set(bucketStartedAt, aggregate);
  }
}

function bucketMapToSeries(bucketMap) {
  if (!bucketMap) return [];
  return Array.from(bucketMap.entries())
    .map(([bucketStartedAt, aggregate]) => ({
      bucketStartedAt,
      avgUnitPrice: Number((aggregate.sum / Math.max(1, aggregate.count)).toFixed(5))
    }))
    .sort((a, b) => Date.parse(a.bucketStartedAt) - Date.parse(b.bucketStartedAt))
    .slice(-MAX_TREND_POINTS_PER_SERIES);
}

function normalizeChangeThreshold(value) {
  const threshold = Number(value);
  if (Number.isFinite(threshold) && threshold > 0 && threshold <= 1000) return threshold;
  return DEFAULT_PRICE_CHANGE_THRESHOLD;
}

function buildPriceChangeHistory(rows, threshold) {
  const previousBySeed = {};
  const eventsBySeed = {};
  const seriesBySeed = {};
  let totalSnapshots = 0;
  for (const row of rows) {
    const capturedAt = Number(row.captured_at);
    if (!Number.isFinite(capturedAt) || capturedAt <= 0) continue;
    const prices = safeJsonObject(row.prices_json);
    if (!Object.keys(prices).length) continue;
    totalSnapshots += 1;
    for (const seedId of SEED_IDS) {
      const currentPrice = Number(prices[seedId]);
      if (!Number.isFinite(currentPrice) || currentPrice < 0) continue;
      const points = seriesBySeed[seedId] || (seriesBySeed[seedId] = []);
      points.push({
        submissionId: Number(row.id) || 0,
        source: String(row.source || ''),
        capturedAt,
        price: Number(currentPrice.toFixed(5))
      });

      const previous = previousBySeed[seedId];
      if (previous && previous.price > 0) {
        const changeRate = ((currentPrice - previous.price) / previous.price) * 100;
        if (Number.isFinite(changeRate) && Math.abs(changeRate) >= threshold) {
          const events = eventsBySeed[seedId] || (eventsBySeed[seedId] = []);
          events.push({
            submissionId: Number(row.id) || 0,
            source: String(row.source || ''),
            capturedAt,
            acceptedAt: Number(row.accepted_at) || 0,
            previousCapturedAt: previous.capturedAt,
            previousPrice: Number(previous.price.toFixed(5)),
            currentPrice: Number(currentPrice.toFixed(5)),
            changeRate: Number(changeRate.toFixed(6))
          });
        }
      }
      previousBySeed[seedId] = { price: currentPrice, capturedAt };
    }
  }

  let eventCount = 0;
  const groups = SEED_IDS.map((seedId) => {
    const events = (eventsBySeed[seedId] || []).slice().sort((a, b) => b.capturedAt - a.capturedAt);
    eventCount += events.length;
    return { seedId, events };
  }).filter((group) => group.events.length);
  const series = SEED_IDS.map((seedId) => ({
    seedId,
    points: (seriesBySeed[seedId] || []).slice().sort((a, b) => a.capturedAt - b.capturedAt)
  })).filter((item) => item.points.length);
  return { totalSnapshots, eventCount, groups, series };
}

function safeJsonObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function assertDatabase(env) {
  if (!env.PRICE_DB) throw new Error('PRICE_DB binding is not configured');
}

function publicCacheStorage() {
  return globalThis.caches && globalThis.caches.default ? globalThis.caches.default : null;
}

function publicCacheBypassRequested(request) {
  const cacheControl = request && request.headers ? request.headers.get('cache-control') || '' : '';
  return /(?:^|,)\s*(?:no-cache|no-store)\b/i.test(cacheControl);
}

function publicCacheKey(request) {
  const url = new URL(request.url);
  url.hash = '';
  if (url.pathname === '/api/price-trends') url.searchParams.set('_cache', PRICE_TREND_CACHE_VERSION);
  return new Request(url.toString(), { method: 'GET' });
}

async function withPublicCache(request, loader) {
  const cache = publicCacheStorage();
  const bypass = publicCacheBypassRequested(request);
  const key = publicCacheKey(request);
  if (cache && !bypass) {
    try {
      const cached = await cache.match(key);
      if (cached) return cached;
    } catch (_) {
      // Cache failures must not make the API unavailable.
    }
  }

  const response = await loader();
  if (cache && !bypass && response && response.ok) {
    try {
      await cache.put(key, response.clone());
    } catch (_) {
      // Cache writes are best effort; return the fresh D1 response regardless.
    }
  }
  return response;
}

async function purgePriceResponseCaches(request) {
  const cache = publicCacheStorage();
  if (!cache) return;
  const origin = new URL(request.url).origin;
  const keys = [
    new Request(`${origin}/api/default-prices`, { method: 'GET' }),
    new Request(`${origin}/api/price-history?threshold=${DEFAULT_PRICE_CHANGE_THRESHOLD}`, { method: 'GET' }),
    ...PRICE_TREND_WINDOW_VALUES.map((windowValue) => publicCacheKey(
      new Request(`${origin}/api/price-trends?window=${windowValue}`, { method: 'GET' })
    )),
    ...SEED_IDS.flatMap((seedId) => PRICE_SERIES_WINDOW_VALUES.map((windowValue) => (
      new Request(`${origin}/api/price-series?seedId=${encodeURIComponent(seedId)}&window=${encodeURIComponent(windowValue)}`, { method: 'GET' })
    )))
  ];
  await Promise.allSettled(keys.map((key) => cache.delete(key)));
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders
    }
  });
}
