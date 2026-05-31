// ==UserScript==
// @name         HYB Farm Dashboard 价格同步
// @namespace    https://hyb.gudong.ccwu.cc/
// @version      0.1.0
// @description  在黑与白农场页面导入实时价格到 HYB Farm Dashboard。
// @match        https://cdk.hybgzs.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const DASHBOARD_URL = 'https://hyb.gudong.ccwu.cc/';
  const UNIT_PER_USD = 500000;
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

  async function fetchJson(path, timeoutMs) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs || 15000);
    try {
      const response = await fetch(path, {
        credentials: 'same-origin',
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

  function encodeSnapshot(data) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(data))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  async function syncShopPrices() {
    try {
      showToast('正在获取实时价格...');
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

      const payload = {
        version: 1,
        source: 'userscript',
        capturedAt: Date.now(),
        prices: { shop }
      };

      showToast(`已抓取 ${matched}/${SEED_IDS.size} 个作物，正在打开 Dashboard...`);
      window.setTimeout(() => {
        location.href = `${DASHBOARD_URL}#snapshot=${encodeSnapshot(payload)}`;
      }, 500);
    } catch (error) {
      const message = error && error.name === 'AbortError' ? '请求超时' : String(error && error.message || error);
      showToast(`同步失败：${message}`, true);
      alert(`[HYB Farm Dashboard] 同步失败：${message}`);
    }
  }

  function installButton() {
    if (document.getElementById('hyb-dashboard-sync-button')) return;
    const button = document.createElement('button');
    button.id = 'hyb-dashboard-sync-button';
    button.type = 'button';
    button.textContent = '导入实时价格';
    button.title = '获取当前商店价格并导入 HYB Farm Dashboard';
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installButton, { once: true });
  } else {
    installButton();
  }
})();
