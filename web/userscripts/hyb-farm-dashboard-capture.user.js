// ==UserScript==
// @name         HYB Farm Dashboard 价格同步
// @namespace    https://hyb.gudong226.com/
// @version      0.6.0
// @description  为 HYB Farm Dashboard 协作同步当前交易所价格。
// @updateURL    https://hyb.gudong226.com/userscripts/hyb-farm-dashboard-capture.user.js
// @downloadURL  https://hyb.gudong226.com/userscripts/hyb-farm-dashboard-capture.user.js
// @match        https://hyb.gudong.ccwu.cc/*
// @match        https://hyb.gudong226.com/*
// @match        https://cdk.hybgzs.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      cdk.hybgzs.com
// @connect      hyb.gudong226.com
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_VERSION = '0.6.0';
  const DASHBOARD_URL = 'https://hyb.gudong226.com/';
  const DASHBOARD_ORIGINS = new Set([
    'https://hyb.gudong.ccwu.cc',
    'https://hyb.gudong226.com'
  ]);
  const CDK_ORIGIN = 'https://cdk.hybgzs.com';
  const UNIT_PER_USD = 500000;
  const CURRENT_PRICE_URL = '/api/farm/recycle/prices';
  const PRICE_SYNC_GATE_URL = new URL('/api/price-sync-gate', DASHBOARD_URL).href;
  const BRIDGE_READY = 'HYB_FARM_DASHBOARD_PRICE_BRIDGE_READY';
  const BRIDGE_REQUEST = 'HYB_FARM_DASHBOARD_PRICE_REQUEST';
  const BRIDGE_RESPONSE = 'HYB_FARM_DASHBOARD_PRICE_RESPONSE';
  const SEED_IDS = new Set([
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
  ]);

  let toast = null;

  function showToast(message, isError) {
    if (!toast) {
      toast = document.createElement('div');
      toast.style.cssText = [
        'position:fixed',
        'right:16px',
        'bottom:72px',
        'z-index:2147483647',
        'max-width:360px',
        'padding:10px 12px',
        'border-radius:8px',
        'background:#111827',
        'color:#fff',
        'font:13px/1.5 system-ui,-apple-system,Segoe UI,sans-serif',
        'box-shadow:0 8px 24px rgba(0,0,0,.32)',
        'white-space:pre-wrap'
      ].join(';');
      document.body.appendChild(toast);
    }
    toast.style.background = isError ? '#b91c1c' : '#111827';
    toast.textContent = `[HYB Farm Dashboard] ${message}`;
  }

  function gmRequest() {
    if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest;
    return null;
  }

  async function fetchJson(path, timeoutMs) {
    const url = new URL(path, CDK_ORIGIN).href;
    return requestJson(url, { timeoutMs });
  }

  async function postGateJson(payload, timeoutMs) {
    return requestJson(PRICE_SYNC_GATE_URL, {
      method: 'POST',
      body: JSON.stringify({ scriptVersion: SCRIPT_VERSION, ...payload }),
      timeoutMs
    });
  }

  async function requestJson(url, options = {}) {
    const sameOrigin = new URL(url).origin === location.origin;
    if (sameOrigin || !gmRequest()) return fetchJsonWithFetch(url, options);
    return fetchJsonWithGm(url, options);
  }

  async function fetchJsonWithFetch(url, options = {}) {
    const timeoutMs = Number(options.timeoutMs) || 15000;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        credentials: new URL(url).origin === location.origin ? 'same-origin' : 'include',
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          ...(options.body ? { 'content-type': 'application/json' } : {})
        },
        body: options.body,
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      window.clearTimeout(timer);
    }
  }

  function fetchJsonWithGm(url, options = {}) {
    const request = gmRequest();
    if (!request) return fetchJsonWithFetch(url, options);
    const timeoutMs = Number(options.timeoutMs) || 15000;
    return new Promise((resolve, reject) => {
      let settled = false;
      let handle = null;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const done = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const timer = window.setTimeout(() => {
        if (handle && typeof handle.abort === 'function') handle.abort();
        const error = new Error('请求超时');
        error.name = 'AbortError';
        fail(error);
      }, timeoutMs);
      handle = request({
        method: options.method || 'GET',
        url,
        headers: {
          accept: 'application/json',
          ...(options.body ? { 'content-type': 'application/json' } : {})
        },
        data: options.body,
        responseType: 'json',
        anonymous: false,
        withCredentials: true,
        timeout: timeoutMs,
        onload: (response) => {
          window.clearTimeout(timer);
          if (response.status < 200 || response.status >= 300) {
            fail(new Error(`HTTP ${response.status}`));
            return;
          }
          try {
            done(response.response || JSON.parse(response.responseText));
          } catch (error) {
            fail(error);
          }
        },
        onerror: () => {
          window.clearTimeout(timer);
          fail(new Error('网络请求失败'));
        },
        ontimeout: () => {
          window.clearTimeout(timer);
          const error = new Error('请求超时');
          error.name = 'AbortError';
          fail(error);
        }
      });
    });
  }

  function encodeSnapshot(data) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(data))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function mergeCurrentPriceResponse(json, shop) {
    if (json && json.success === false) throw new Error('价格接口返回失败');
    const list = Array.isArray(json && json.data) ? json.data : [];
    const items = Array.isArray(json && json.market && json.market.items) ? json.market.items : [];
    [...list, ...items].forEach((item) => {
      if (!item || !SEED_IDS.has(item.seedId)) return;
      const raw = Number(item.unitPrice ?? item.recyclePrice);
      if (Number.isFinite(raw) && raw >= 0) shop[item.seedId] = raw / UNIT_PER_USD;
    });
  }

  async function captureShopSnapshot(syncLeaseId) {
    const json = await fetchJson(CURRENT_PRICE_URL, 15000);
    const capturedAt = Date.now();
    const shop = {};
    mergeCurrentPriceResponse(json, shop);

    const matched = Object.keys(shop).length;
    if (!matched) throw new Error('没有匹配到作物价格');

    const payload = {
      version: 1,
      source: 'userscript',
      scriptVersion: SCRIPT_VERSION,
      syncLeaseId,
      sourceUpdatedAt: Number(json && json.exchangeRecomputedAt) || capturedAt,
      capturedAt,
      prices: { shop },
      matched,
      totalSeeds: SEED_IDS.size
    };
    return payload;
  }

  async function acquirePriceSyncLease(observedCapturedAt) {
    return postGateJson({
      action: 'acquire',
      observedCapturedAt: Number(observedCapturedAt) || 0
    }, 10000);
  }

  async function releasePriceSyncLease(leaseId) {
    if (!leaseId) return;
    try {
      await postGateJson({ action: 'release', leaseId }, 10000);
    } catch (_) {
      // The three-minute lease expires automatically if this best-effort release fails.
    }
  }

  async function captureSharedShopSnapshot(observedCapturedAt) {
    const lease = await acquirePriceSyncLease(observedCapturedAt);
    if (!lease || !lease.granted) {
      return {
        skipped: true,
        reason: String(lease && lease.reason || 'fresh_snapshot'),
        nextAllowedAt: Number(lease && lease.nextAllowedAt) || 0,
        capturedAt: Number(lease && lease.capturedAt) || 0
      };
    }
    try {
      return { snapshot: await captureShopSnapshot(lease.leaseId) };
    } catch (error) {
      await releasePriceSyncLease(lease.leaseId);
      throw error;
    }
  }

  async function syncShopPrices() {
    try {
      showToast('正在获取实时价格...');
      const result = await captureSharedShopSnapshot(0);
      if (result.skipped) {
        showToast(`共享价格仍在有效期内，下次可刷新：${new Date(result.nextAllowedAt).toLocaleString('zh-CN', { hour12: false })}`);
        return;
      }
      const payload = result.snapshot;
      showToast(`已抓取 ${payload.matched}/${payload.totalSeeds} 个作物，正在打开 Dashboard...`);
      window.setTimeout(() => {
        location.href = `${DASHBOARD_URL}#snapshot=${encodeSnapshot(payload)}`;
      }, 500);
    } catch (error) {
      const message = friendlyError(error);
      showToast(`导入失败：${message}`, true);
      alert(`[HYB Farm Dashboard] 导入失败：${message}`);
    }
  }

  function friendlyError(error) {
    const message = error && error.name === 'AbortError' ? '请求超时' : String(error && error.message || error);
    if (/HTTP 401/.test(message)) return '请先登录 cdk.hybgzs.com 后再获取价格';
    return message;
  }

  function installButton() {
    if (document.getElementById('hyb-dashboard-sync-button')) return;
    const button = document.createElement('button');
    button.id = 'hyb-dashboard-sync-button';
    button.type = 'button';
    button.textContent = '导入实时价格';
    button.title = '获取当前交易所价格并导入 HYB Farm Dashboard';
    button.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:18px',
      'z-index:2147483647',
      'height:38px',
      'padding:0 14px',
      'border:1px solid #1d4ed8',
      'border-radius:8px',
      'background:#2563eb',
      'color:#fff',
      'font:600 14px/1 system-ui,-apple-system,Segoe UI,sans-serif',
      'box-shadow:0 8px 22px rgba(37,99,235,.35)',
      'cursor:pointer'
    ].join(';');
    button.addEventListener('click', syncShopPrices);
    document.body.appendChild(button);
  }

  function installDashboardBridge() {
    if (!DASHBOARD_ORIGINS.has(location.origin)) return;
    window.addEventListener('message', async (event) => {
      const data = event && event.data;
      if (event.origin !== location.origin || !data || data.type !== BRIDGE_REQUEST || !data.requestId) return;
      try {
        const result = await captureSharedShopSnapshot(data.observedCapturedAt);
        if (result.skipped) {
          window.postMessage({
            type: BRIDGE_RESPONSE,
            requestId: data.requestId,
            ok: true,
            skipped: true,
            scriptVersion: SCRIPT_VERSION,
            reason: result.reason,
            nextAllowedAt: result.nextAllowedAt,
            capturedAt: result.capturedAt
          }, location.origin);
          return;
        }
        window.postMessage({ type: BRIDGE_RESPONSE, requestId: data.requestId, ok: true, scriptVersion: SCRIPT_VERSION, snapshot: result.snapshot }, location.origin);
      } catch (error) {
        window.postMessage({ type: BRIDGE_RESPONSE, requestId: data.requestId, ok: false, scriptVersion: SCRIPT_VERSION, error: friendlyError(error) }, location.origin);
      }
    });
    window.postMessage({ type: BRIDGE_READY, scriptVersion: SCRIPT_VERSION }, location.origin);
  }

  function boot() {
    installDashboardBridge();
    if (location.origin === CDK_ORIGIN) installButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
