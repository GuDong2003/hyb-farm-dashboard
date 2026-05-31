// ==UserScript==
// @name         HYB Farm Dashboard 价格同步
// @namespace    https://hyb.gudong.ccwu.cc/
// @version      0.3.2
// @description  为 HYB Farm Dashboard 自动导入黑与白农场实时价格。
// @match        https://hyb.gudong.ccwu.cc/*
// @match        https://cdk.hybgzs.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      cdk.hybgzs.com
// ==/UserScript==

(function () {
  'use strict';

  const DASHBOARD_URL = 'https://hyb.gudong.ccwu.cc/';
  const DASHBOARD_ORIGINS = new Set([
    'https://hyb.gudong.ccwu.cc'
  ]);
  const CDK_ORIGIN = 'https://cdk.hybgzs.com';
  const UNIT_PER_USD = 500000;
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
    'golden_wheat',
    'emerald_cabbage',
    'dragon_fruit',
    'starfruit',
    'durian',
    'golden_apple',
    'blue_rose',
    'crystal_grape',
    'rainbow_pineapple',
    'moonflower',
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
    const sameOrigin = new URL(url).origin === location.origin;
    if (sameOrigin || !gmRequest()) return fetchJsonWithFetch(url, timeoutMs);
    return fetchJsonWithGm(url, timeoutMs);
  }

  async function fetchJsonWithFetch(url, timeoutMs) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs || 15000);
    try {
      const response = await fetch(url, {
        credentials: new URL(url).origin === location.origin ? 'same-origin' : 'include',
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      window.clearTimeout(timer);
    }
  }

  function fetchJsonWithGm(url, timeoutMs) {
    const request = gmRequest();
    if (!request) return fetchJsonWithFetch(url, timeoutMs);
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
      }, timeoutMs || 15000);
      handle = request({
        method: 'GET',
        url,
        headers: { accept: 'application/json' },
        responseType: 'json',
        anonymous: false,
        withCredentials: true,
        timeout: timeoutMs || 15000,
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

  async function captureShopSnapshot() {
    const json = await fetchJson('/api/farm/recycle/prices', 15000);
    if (json && json.success === false) throw new Error('价格接口返回失败');

    const shop = {};
    const list = Array.isArray(json && json.data) ? json.data : [];
    list.forEach((item) => {
      if (!item || !SEED_IDS.has(item.seedId)) return;
      const raw = Number(item.recyclePrice);
      if (Number.isFinite(raw)) shop[item.seedId] = raw / UNIT_PER_USD;
    });

    const matched = Object.keys(shop).length;
    if (!matched) throw new Error(`没有匹配到作物价格，接口返回 ${list.length} 项`);

    return {
      version: 1,
      source: 'userscript',
      capturedAt: Date.now(),
      prices: { shop },
      matched,
      totalSeeds: SEED_IDS.size
    };
  }

  async function syncShopPrices() {
    try {
      showToast('正在获取实时价格...');
      const payload = await captureShopSnapshot();
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
        const snapshot = await captureShopSnapshot();
        window.postMessage({ type: BRIDGE_RESPONSE, requestId: data.requestId, ok: true, snapshot }, location.origin);
      } catch (error) {
        window.postMessage({ type: BRIDGE_RESPONSE, requestId: data.requestId, ok: false, error: friendlyError(error) }, location.origin);
      }
    });
    window.postMessage({ type: BRIDGE_READY }, location.origin);
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
