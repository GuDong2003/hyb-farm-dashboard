(function () {
  'use strict';

  const UNIT_PER_USD = 500000;
  const MAX_LANDS = 18;
  const DEFAULT_ACTIVE_HOURS = 16;
  const STORE_KEY = 'hybFarmDashboard.v1';
  const DB_NAME = 'hybFarmDashboardDB';
  const DB_VERSION = 1;
  const SNAPSHOT_STORE = 'snapshots';
  const PRICE_REFRESH_MS = 60 * 60 * 1000;
  const BRIDGE_READY = 'HYB_FARM_DASHBOARD_PRICE_BRIDGE_READY';
  const BRIDGE_REQUEST = 'HYB_FARM_DASHBOARD_PRICE_REQUEST';
  const BRIDGE_RESPONSE = 'HYB_FARM_DASHBOARD_PRICE_RESPONSE';

  const SEEDS = [
    { id: 'carrot', name: '胡萝卜', price: '500000', growthTime: 1800, harvestQuantity: 2, harvestValue: '500000', experienceValue: 5, isVipOnly: false, sortOrder: 10 },
    { id: 'tomato', name: '番茄', price: '1000000', growthTime: 3600, harvestQuantity: 5, harvestValue: '500000', experienceValue: 8, isVipOnly: false, sortOrder: 20 },
    { id: 'corn', name: '玉米', price: '250000', growthTime: 5400, harvestQuantity: 25, harvestValue: '40000', experienceValue: 18, isVipOnly: false, sortOrder: 25 },
    { id: 'pumpkin', name: '南瓜', price: '2000000', growthTime: 7200, harvestQuantity: 6, harvestValue: '1000000', experienceValue: 15, isVipOnly: false, sortOrder: 30 },
    { id: 'blueberry', name: '蓝莓', price: '750000', growthTime: 10800, harvestQuantity: 30, harvestValue: '100000', experienceValue: 24, isVipOnly: false, sortOrder: 35 },
    { id: 'strawberry', name: '草莓', price: '4000000', growthTime: 14400, harvestQuantity: 6, harvestValue: '2000000', experienceValue: 22, isVipOnly: false, sortOrder: 40 },
    { id: 'watermelon', name: '西瓜', price: '6000000', growthTime: 21600, harvestQuantity: 8, harvestValue: '3000000', experienceValue: 30, isVipOnly: false, sortOrder: 50 },
    { id: 'mango', name: '芒果', price: '2500000', growthTime: 25200, harvestQuantity: 35, harvestValue: '200000', experienceValue: 33, isVipOnly: false, sortOrder: 50 },
    { id: 'golden_wheat', name: '黄金麦穗', price: '12000000', growthTime: 72000, harvestQuantity: 30, harvestValue: '800000', experienceValue: 50, isVipOnly: false, sortOrder: 55 },
    { id: 'emerald_cabbage', name: '翡翠卷心菜', price: '16000000', growthTime: 86400, harvestQuantity: 25, harvestValue: '1200000', experienceValue: 60, isVipOnly: false, sortOrder: 60 },
    { id: 'dragon_fruit', name: '火龙果', price: '10000000', growthTime: 28800, harvestQuantity: 4, harvestValue: '5000000', experienceValue: 40, isVipOnly: true, sortOrder: 100 },
    { id: 'starfruit', name: '杨桃', price: '15000000', growthTime: 36000, harvestQuantity: 10, harvestValue: '7500000', experienceValue: 55, isVipOnly: true, sortOrder: 110 },
    { id: 'durian', name: '榴莲', price: '5000000', growthTime: 43200, harvestQuantity: 25, harvestValue: '750000', experienceValue: 45, isVipOnly: true, sortOrder: 115 },
    { id: 'golden_apple', name: '金苹果', price: '30000000', growthTime: 43200, harvestQuantity: 6, harvestValue: '10000000', experienceValue: 75, isVipOnly: true, sortOrder: 120 },
    { id: 'blue_rose', name: '玉露蓝玫瑰', price: '25000000', growthTime: 86400, harvestQuantity: 8, harvestValue: '4500000', experienceValue: 65, isVipOnly: true, sortOrder: 125 },
    { id: 'crystal_grape', name: '水晶葡萄', price: '8000000', growthTime: 108000, harvestQuantity: 10, harvestValue: '1350000', experienceValue: 50, isVipOnly: true, sortOrder: 130 },
    { id: 'rainbow_pineapple', name: '彩虹凤梨', price: '50000000', growthTime: 259200, harvestQuantity: 12, harvestValue: '12500000', experienceValue: 100, isVipOnly: true, sortOrder: 135 },
    { id: 'moonflower', name: '月光花', price: '15000000', growthTime: 172800, harvestQuantity: 10, harvestValue: '2400000', experienceValue: 60, isVipOnly: true, sortOrder: 140 },
    { id: 'weekly_lotus', name: '七日彩莲', price: '100000000', growthTime: 604800, harvestQuantity: 20, harvestValue: '30000000', experienceValue: 200, isVipOnly: true, sortOrder: 145 }
  ].map(normalizeSeed);

  const state = loadState();
  let dbPromise = null;
  let appReady = false;
  let priceBridgeRequest = null;

  function normalizeSeed(seed) {
    return {
      id: seed.id,
      name: seed.name,
      growthHours: Number(seed.growthTime) / 3600,
      harvestQuantity: Number(seed.harvestQuantity) || 0,
      harvestValueUsd: toUsd(seed.harvestValue),
      seedPriceUsd: toUsd(seed.price),
      experienceValue: Number(seed.experienceValue) || 0,
      isVipOnly: Boolean(seed.isVipOnly),
      sortOrder: Number(seed.sortOrder) || 999
    };
  }

  function defaultPrices() {
    return {};
  }

  function loadState() {
    const base = {
      view: 'table',
      status: '等待价格数据；点击导入可设置实时价格自动获取。',
      config: {
        source: 'shop',
        viewLevel: 1,
        cycleMode: 'active',
        activeHours: DEFAULT_ACTIVE_HOURS,
        autoRefreshPrices: true,
        landCounts: [13, 0, 0, 0, 0, 0, 0],
        sortKey: 'totalDaily',
        sortDir: 'desc'
      },
      prices: { shop: defaultPrices() },
      previousPrices: { shop: {} },
      lastImportedAt: 0,
      historyCount: 0,
      error: ''
    };

    try {
      const stored = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
      const merged = Object.assign({}, base, stored);
      merged.config = Object.assign({}, base.config, stored.config || {});
      merged.config.landCounts = normalizeLandCounts(merged.config.landCounts);
      merged.config.source = 'shop';
      delete merged.config.seedMode;
      merged.prices = { shop: cleanPriceMap((stored.prices && stored.prices.shop) || {}) };
      merged.previousPrices = { shop: cleanPriceMap((stored.previousPrices && stored.previousPrices.shop) || {}) };
      return merged;
    } catch (_) {
      return base;
    }
  }

  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      config: state.config,
      prices: state.prices,
      previousPrices: state.previousPrices,
      lastImportedAt: state.lastImportedAt
    }));
  }

  function normalizeLandCounts(value) {
    const input = Array.isArray(value) ? value : [13, 0, 0, 0, 0, 0, 0];
    let remaining = MAX_LANDS;
    return Array.from({ length: 7 }, (_, index) => {
      const count = Math.max(0, Math.floor(Number(input[index]) || 0));
      const limited = Math.min(count, remaining);
      remaining -= limited;
      return limited;
    });
  }

  function toUsd(raw) {
    const value = Number(raw);
    return Number.isFinite(value) ? value / UNIT_PER_USD : 0;
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          const store = db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
          store.createIndex('capturedAt', 'capturedAt', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB 打开失败'));
    });
    return dbPromise;
  }

  async function putSnapshot(snapshot) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
      tx.objectStore(SNAPSHOT_STORE).put(snapshot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('历史保存失败'));
    });
    await refreshHistoryCount();
  }

  async function allSnapshots() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
      const request = tx.objectStore(SNAPSHOT_STORE).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error('历史读取失败'));
    });
  }

  async function refreshHistoryCount() {
    try {
      const db = await openDb();
      state.historyCount = await new Promise((resolve, reject) => {
        const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
        const request = tx.objectStore(SNAPSHOT_STORE).count();
        request.onsuccess = () => resolve(Number(request.result) || 0);
        request.onerror = () => reject(request.error || new Error('历史数量读取失败'));
      });
    } catch (error) {
      state.error = String(error && error.message || error);
    }
  }

  async function clearHistory() {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
      tx.objectStore(SNAPSHOT_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('历史清空失败'));
    });
    state.historyCount = 0;
  }

  async function importSnapshotFromHash() {
    if (!location.hash.startsWith('#snapshot=')) return;
    try {
      const encoded = location.hash.slice('#snapshot='.length);
      const snapshot = JSON.parse(decodeBase64Url(encoded));
      await applySnapshot(snapshot);
      history.replaceState(null, '', location.pathname + location.search);
      state.status = `已导入 ${formatTime(state.lastImportedAt)} 的抓取快照。`;
    } catch (error) {
      state.error = `导入失败：${String(error && error.message || error)}`;
    }
  }

  async function applySnapshot(snapshot) {
    const capturedAt = Number(snapshot.capturedAt) || Date.now();
    const prices = snapshot.prices || {};
    if (prices.shop) {
      state.previousPrices.shop = Object.assign({}, state.prices.shop || {});
      state.prices.shop = cleanPriceMap(prices.shop);
    }
    state.lastImportedAt = capturedAt;
    state.config.source = 'shop';
    snapshot.id = snapshot.id || `snapshot:${capturedAt}`;
    snapshot.capturedAt = capturedAt;
    await putSnapshot(snapshot);
    saveState();
  }

  function hasShopPrices() {
    return Object.keys(state.prices.shop || {}).length > 0;
  }

  function shouldAutoRequestPrices(force) {
    if (force) return true;
    if (!state.config.autoRefreshPrices) return false;
    if (!hasShopPrices()) return true;
    const importedAt = Number(state.lastImportedAt) || 0;
    return !importedAt || Date.now() - importedAt >= PRICE_REFRESH_MS;
  }

  function installPriceBridgeListener() {
    window.addEventListener('message', (event) => {
      const data = event && event.data;
      if (event.source !== window || !data || data.type !== BRIDGE_READY) return;
      if (appReady) requestScriptPrices(false);
    });
  }

  function requestScriptPrices(force) {
    if (!shouldAutoRequestPrices(force) || priceBridgeRequest) return false;

    const requestId = `price:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    state.error = '';
    state.status = '正在通过脚本获取实时价格...';
    render();

    function cleanup() {
      if (!priceBridgeRequest || priceBridgeRequest.id !== requestId) return;
      window.clearTimeout(priceBridgeRequest.timer);
      window.removeEventListener('message', priceBridgeRequest.onMessage);
      priceBridgeRequest = null;
    }

    const onMessage = (event) => {
      const data = event && event.data;
      if (event.source !== window || !data || data.type !== BRIDGE_RESPONSE || data.requestId !== requestId) return;
      cleanup();
      if (!data.ok || !data.snapshot) {
        state.status = `自动获取失败：${String(data.error || '脚本未返回价格')}`;
        render();
        return;
      }
      applySnapshot(data.snapshot).then(() => {
        state.status = `已自动导入 ${formatTime(state.lastImportedAt)} 的实时价格。`;
        render();
      }).catch((error) => {
        state.status = `自动导入失败：${String(error && error.message || error)}`;
        render();
      });
    };

    const timer = window.setTimeout(() => {
      cleanup();
      state.status = hasShopPrices()
        ? `已使用 ${formatTime(state.lastImportedAt)} 的价格；未检测到脚本自动响应。`
        : '未检测到自动导入脚本；安装脚本后会在打开页面时自动获取实时价格。';
      render();
    }, 18000);

    priceBridgeRequest = { id: requestId, timer, onMessage };
    window.addEventListener('message', onMessage);
    window.postMessage({ type: BRIDGE_REQUEST, requestId, force: Boolean(force) }, location.origin);
    return true;
  }

  function cleanPriceMap(map) {
    const out = {};
    Object.keys(map || {}).forEach((key) => {
      const value = Number(map[key]);
      if (Number.isFinite(value) && value >= 0) out[key] = value;
    });
    return out;
  }

  function decodeBase64Url(value) {
    const padded = String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    return decodeURIComponent(escape(atob(padded)));
  }

  function encodeBase64Url(value) {
    return btoa(unescape(encodeURIComponent(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function priceMap() {
    return state.prices.shop || {};
  }

  function levelStats(seed, level) {
    const lv = clampInt(level, 1, 7, 1);
    const grossYield = Math.max(0, Math.round(seed.harvestQuantity * (1 + (lv - 1) / 3)));
    const netYield = Math.max(0, grossYield - 1);
    const growthHours = Math.max(0.01, seed.growthHours * Math.max(0.05, 1 - (lv - 1) / 15));
    const dailyCycles = dailyCycleCount(growthHours);
    const saleYield = netYield;
    return { grossYield, netYield, saleYield, growthHours, dailyCycles };
  }

  function dailyCycleCount(growthHours) {
    if (state.config.cycleMode === 'full24') return 24 / growthHours;
    if (growthHours <= 24) return Math.max(1, Math.ceil(state.config.activeHours / growthHours));
    return 24 / growthHours;
  }

  function computeRows() {
    const prices = priceMap();
    const rows = SEEDS.map((seed) => {
      const price = Number(prices[seed.id]);
      const previousPrice = Number((state.previousPrices.shop || {})[seed.id]);
      const hasPrice = Number.isFinite(price);
      const hasPreviousPrice = Number.isFinite(previousPrice);
      const priceDelta = hasPrice && hasPreviousPrice ? price - previousPrice : null;
      const stats = levelStats(seed, state.config.viewLevel);
      const singleNet = hasPrice ? stats.saleYield * price : null;
      const hourly = hasPrice ? singleNet / stats.growthHours : null;
      const singleDaily = hasPrice ? singleNet * stats.dailyCycles : null;
      const totalDaily = hasPrice ? totalDailyForSeed(seed, price) : null;
      const expPerCrop = seed.experienceValue;
      const expPerHarvest = expPerCrop * stats.grossYield;
      const expSingleDaily = expPerHarvest * stats.dailyCycles;
      const expTotalDaily = totalDailyExpForSeed(seed);
      const expHourly = expTotalDaily / dailyHourBasis();
      return { seed, price: hasPrice ? price : null, previousPrice: hasPreviousPrice ? previousPrice : null, priceDelta, stats, singleNet, hourly, singleDaily, totalDaily, expPerCrop, expPerHarvest, expHourly, expSingleDaily, expTotalDaily };
    });
    const dir = state.config.sortDir === 'asc' ? 1 : -1;
    return rows.sort((a, b) => compareRows(a, b, state.config.sortKey) * dir || a.seed.sortOrder - b.seed.sortOrder);
  }

  function totalDailyForSeed(seed, price) {
    return state.config.landCounts.reduce((sum, count, index) => {
      if (!count) return sum;
      const stats = levelStats(seed, index + 1);
      return sum + count * stats.saleYield * price * stats.dailyCycles;
    }, 0);
  }

  function totalDailyExpForSeed(seed) {
    return state.config.landCounts.reduce((sum, count, index) => {
      if (!count) return sum;
      const stats = levelStats(seed, index + 1);
      return sum + count * seed.experienceValue * stats.grossYield * stats.dailyCycles;
    }, 0);
  }

  function dailyHourBasis() {
    return state.config.cycleMode === 'full24' ? 24 : Math.max(1, state.config.activeHours);
  }

  function compareRows(a, b, key) {
    if (key === 'name') return a.seed.name.localeCompare(b.seed.name, 'zh-CN');
    if (key === 'price') return nullableCompare(a.price, b.price);
    if (key === 'priceDelta') return nullableCompare(a.priceDelta, b.priceDelta);
    if (key === 'growth') return nullableCompare(a.stats.growthHours, b.stats.growthHours);
    if (key === 'singleNet') return nullableCompare(a.singleNet, b.singleNet);
    if (key === 'hourly') return nullableCompare(a.hourly, b.hourly);
    if (key === 'singleDaily') return nullableCompare(a.singleDaily, b.singleDaily);
    if (key === 'expPerCrop') return nullableCompare(a.expPerCrop, b.expPerCrop);
    if (key === 'expPerHarvest') return nullableCompare(a.expPerHarvest, b.expPerHarvest);
    if (key === 'expHourly') return nullableCompare(a.expHourly, b.expHourly);
    if (key === 'expTotalDaily') return nullableCompare(a.expTotalDaily, b.expTotalDaily);
    return nullableCompare(a.totalDaily, b.totalDaily);
  }

  function nullableCompare(a, b) {
    const av = Number(a);
    const bv = Number(b);
    const aOk = Number.isFinite(av);
    const bOk = Number.isFinite(bv);
    if (aOk && bOk) return av - bv;
    if (aOk) return 1;
    if (bOk) return -1;
    return 0;
  }

  function bestBy(rows, key) {
    return rows.reduce((best, row) => {
      const value = Number(row[key]);
      if (!Number.isFinite(value)) return best;
      if (!best || value > best.value) return { row, value };
      return best;
    }, null);
  }

  function totalLands() {
    return state.config.landCounts.reduce((sum, count) => sum + count, 0);
  }

  function render() {
    const app = document.getElementById('app');
    const rows = computeRows();
    const bestRevenue = bestBy(rows, 'totalDaily');
    const bestExpDay = bestBy(rows, 'expTotalDaily');
    const bestExpHour = bestBy(rows, 'expHourly');
    app.innerHTML = `
      <div class="app">
        <header class="topbar">
          <div class="brand">HYB Farm Dashboard</div>
          <nav class="nav">
            <button data-view="table" class="${state.view === 'table' ? 'active' : ''}">收益表</button>
            <button data-view="settings" class="${state.view === 'settings' ? 'active' : ''}">设置</button>
          </nav>
          <div class="status">历史 ${state.historyCount} 条</div>
        </header>
        <main class="main">
          ${state.view === 'settings' ? renderSettings() : renderTableView(rows, bestRevenue, bestExpDay, bestExpHour)}
        </main>
      </div>
    `;
    bindEvents();
  }

  function renderTableView(rows, bestRevenue, bestExpDay, bestExpHour) {
    return `
      <section class="toolbar">
        <button class="btn primary" data-action="settings">导入</button>
        <button class="btn" data-action="export">导出历史</button>
        <label class="file-label">导入 JSON<input id="importFile" class="hidden-file" type="file" accept="application/json" /></label>
        <button class="btn warn" data-action="clear-current">清空实时价</button>
        <span class="field" style="display:inline-flex;align-items:center;border:0;background:transparent;padding:0;color:#475569;">价格来源：交易所售价</span>
        <select class="field" id="cycleMode">
          <option value="active" ${state.config.cycleMode === 'active' ? 'selected' : ''}>${state.config.activeHours}h 活跃估算</option>
          <option value="full24" ${state.config.cycleMode === 'full24' ? 'selected' : ''}>24h 理论轮转</option>
        </select>
      </section>
      <section class="landbar">
        <div class="land-title">我的农场：</div>
        ${state.config.landCounts.map((count, index) => `<label class="land-field">Lv${index + 1}<input class="mini-input land-input" data-level="${index + 1}" type="number" min="0" max="${MAX_LANDS}" value="${count}" /></label>`).join('')}
        <div class="land-title">共 ${totalLands()}/${MAX_LANDS} 块</div>
        <div class="spacer"></div>
        <label class="land-field">查看等级<select id="viewLevel" class="field">${Array.from({ length: 7 }, (_, index) => `<option value="${index + 1}" ${state.config.viewLevel === index + 1 ? 'selected' : ''}>Lv${index + 1}</option>`).join('')}</select></label>
      </section>
      <section class="notice">
        <span><strong>状态</strong> ${escapeHtml(state.status)}</span>
        <span>来源：${sourceLabel()}</span>
        <span>最后导入：${state.lastImportedAt ? formatTime(state.lastImportedAt) : '暂无'}</span>
        ${state.error ? `<span class="bad">${escapeHtml(state.error)}</span>` : ''}
      </section>
      <section class="formula-bar">
        <span class="formula-title">公式</span>
        <span>收益：Σ(地块数 × (毛产量 - 1) × 售价 × 每天次数)</span>
        <span>每天经验：Σ(地块数 × 单块收获经验 × 每天次数)</span>
        <span>每小时经验：每天经验 ÷ ${state.config.cycleMode === 'full24' ? '24h' : `${state.config.activeHours}h`}</span>
        <span>等级：毛产量=round(基础产量 × (1 + (Lv - 1) / 3))；时间=基础时间 × (1 - (Lv - 1) / 15)</span>
      </section>
      <section class="summary">
        <div>收益最优：<span>${bestRevenue ? `${escapeHtml(bestRevenue.row.seed.name)} ${formatUsd(bestRevenue.value)}/天` : '暂无'}</span></div>
        <div>经验/天最优：<span>${bestExpDay ? `${escapeHtml(bestExpDay.row.seed.name)} ${formatNumber(bestExpDay.value, 2)}` : '暂无'}</span></div>
        <div>经验/小时最优：<span>${bestExpHour ? `${escapeHtml(bestExpHour.row.seed.name)} ${formatNumber(bestExpHour.value, 2)}` : '暂无'}</span></div>
      </section>
      <section class="table-wrap">
        ${renderTable(rows, bestRevenue && bestRevenue.row)}
      </section>
    `;
  }

  function renderTable(rows, bestRow) {
    const bestId = bestRow && bestRow.seed.id;
    return `
      <table>
        <thead>
          <tr>
            <th>类型</th>
            <th><button data-sort="name">作物${sortMark('name')}</button></th>
            <th>产量 毛/计</th>
            <th><button data-sort="growth">生长(h)${sortMark('growth')}</button></th>
            <th>每天次数</th>
            <th><button data-sort="price">当前售价($)${sortMark('price')}</button></th>
            <th><button data-sort="priceDelta">价格差${sortMark('priceDelta')}</button></th>
            <th><button data-sort="singleNet">单次收益${sortMark('singleNet')}</button></th>
            <th><button data-sort="hourly">每小时收益${sortMark('hourly')}</button></th>
            <th><button data-sort="singleDaily">每天收益(单地)${sortMark('singleDaily')}</button></th>
            <th><button data-sort="totalDaily">每天收益(全地)${sortMark('totalDaily')}</button></th>
            <th><button data-sort="expPerCrop">单个作物经验${sortMark('expPerCrop')}</button></th>
            <th><button data-sort="expPerHarvest">单块收获经验${sortMark('expPerHarvest')}</button></th>
            <th><button data-sort="expHourly">每小时经验(全地)${sortMark('expHourly')}</button></th>
            <th><button data-sort="expTotalDaily">每天经验(全地)${sortMark('expTotalDaily')}</button></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => renderRow(row, bestId === row.seed.id)).join('')}
        </tbody>
      </table>
    `;
  }

  function renderPriceDelta(delta) {
    const value = Number(delta);
    if (!Number.isFinite(value)) return '<span class="price-delta flat"><span class="price-delta-value">-</span><span class="price-delta-arrow"></span></span>';
    if (Math.abs(value) < 0.000005) return '<span class="price-delta flat"><span class="price-delta-value">$0</span><span class="price-delta-arrow">→</span></span>';
    const direction = value > 0 ? 'up' : 'down';
    const arrow = value > 0 ? '↑' : '↓';
    return `<span class="price-delta ${direction}"><span class="price-delta-value">${formatUsd(Math.abs(value))}</span><span class="price-delta-arrow">${arrow}</span></span>`;
  }

  function renderRow(row, best) {
    return `
      <tr class="${row.seed.isVipOnly ? 'vip' : ''} ${best ? 'best' : ''}">
        <td><span class="seed-vip-badge ${row.seed.isVipOnly ? 'vip' : 'normal'}">${row.seed.isVipOnly ? 'VIP' : '普通'}</span></td>
        <td title="${escapeHtml(row.seed.id)}"><div class="crop-cell"><img class="crop-icon" src="./assets/crops/${escapeHtml(row.seed.id)}.png" alt="" loading="lazy" onerror="this.style.display='none'"/><strong class="crop-name">${escapeHtml(row.seed.name)}</strong></div></td>
        <td title="毛产量 / 当前收益口径计入产量">${formatNumber(row.stats.grossYield, 0)}/${formatNumber(row.stats.saleYield, 0)}</td>
        <td>${formatNumber(row.stats.growthHours, 2)}</td>
        <td>${formatNumber(row.stats.dailyCycles, 2)}</td>
        <td><input class="price-input" data-price="${escapeHtml(row.seed.id)}" type="number" min="0" step="0.00001" value="${row.price == null ? '' : formatNumber(row.price, 5)}" /></td>
        <td>${renderPriceDelta(row.priceDelta)}</td>
        <td>${formatUsd(row.singleNet)}</td>
        <td>${formatUsd(row.hourly)}</td>
        <td>${formatUsd(row.singleDaily)}</td>
        <td class="blue">${formatUsd(row.totalDaily)}</td>
        <td>${formatNumber(row.expPerCrop, 0)}</td>
        <td>${formatNumber(row.expPerHarvest, 0)}</td>
        <td class="green">${formatNumber(row.expHourly, 2)}</td>
        <td class="green">${formatNumber(row.expTotalDaily, 2)}</td>
      </tr>
    `;
  }

  function renderSettings() {
    return `
      <div class="settings">
        <section class="settings-section">
          <h2>安装脚本</h2>
          <div class="settings-body">
            <div class="settings-row">
              <div class="settings-label">用户脚本管理器</div>
              <div>
                <a class="bookmarklet primary" href="./userscripts/hyb-farm-dashboard-capture.user.js">点击安装脚本</a>
                <p class="settings-copy">安装后打开本 Dashboard 会自动获取实时价格；打开 <a href="https://cdk.hybgzs.com/" target="_blank" rel="noopener noreferrer">cdk.hybgzs.com</a> 时，页面右下角也会出现“导入实时价格”按钮。</p>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-label">自动刷新</div>
              <label class="settings-copy"><input id="autoRefreshPrices" type="checkbox" ${state.config.autoRefreshPrices ? 'checked' : ''} /> 每小时自动获取实时价格</label>
            </div>
            <div class="settings-row">
              <div class="settings-label">隐私</div>
              <div class="settings-copy">价格数据通过脚本消息或 <span class="code">#snapshot</span> 带回本页，fragment 不会发送给 Cloudflare。导入后会保存到你当前浏览器的 IndexedDB。</div>
            </div>
          </div>
        </section>
        <section class="settings-section">
          <h2>数据管理</h2>
          <div class="settings-body">
            <div class="settings-row"><div class="settings-label">历史记录</div><div>${state.historyCount} 条</div></div>
            <div class="settings-row"><div class="settings-label">操作</div><div><button class="btn" data-action="export">导出历史</button> <button class="btn warn" data-action="clear-history">清空历史</button></div></div>
          </div>
        </section>
      </div>
    `;
  }

  function bindEvents() {
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => {
        state.view = button.dataset.view;
        render();
      });
    });
    document.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', handleAction);
    });
    const cycle = document.getElementById('cycleMode');
    if (cycle) cycle.addEventListener('change', () => { state.config.cycleMode = cycle.value; saveState(); render(); });
    const viewLevel = document.getElementById('viewLevel');
    if (viewLevel) viewLevel.addEventListener('change', () => { state.config.viewLevel = clampInt(viewLevel.value, 1, 7, 1); saveState(); render(); });
    document.querySelectorAll('.land-input').forEach((input) => {
      input.addEventListener('change', () => {
        const index = clampInt(input.dataset.level, 1, 7, 1) - 1;
        const desired = Math.max(0, Math.floor(Number(input.value) || 0));
        const other = state.config.landCounts.reduce((sum, count, countIndex) => countIndex === index ? sum : sum + count, 0);
        const allowed = Math.max(0, MAX_LANDS - other);
        state.config.landCounts[index] = Math.min(desired, allowed);
        if (desired > allowed) state.status = `地块总数上限 ${MAX_LANDS}，Lv${index + 1} 已限制为 ${allowed}`;
        saveState();
        render();
      });
    });
    document.querySelectorAll('[data-sort]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.sort;
        if (state.config.sortKey === key) state.config.sortDir = state.config.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.config.sortKey = key; state.config.sortDir = key === 'name' || key === 'growth' ? 'asc' : 'desc'; }
        saveState();
        render();
      });
    });
    document.querySelectorAll('[data-price]').forEach((input) => {
      input.addEventListener('change', () => {
        const map = state.prices.shop || (state.prices.shop = {});
        const value = Number(input.value);
        if (Number.isFinite(value) && value >= 0) map[input.dataset.price] = value;
        else delete map[input.dataset.price];
        state.status = '已手动更新当前价格。';
        saveState();
        render();
      });
    });
    const autoRefreshPrices = document.getElementById('autoRefreshPrices');
    if (autoRefreshPrices) autoRefreshPrices.addEventListener('change', () => {
      state.config.autoRefreshPrices = autoRefreshPrices.checked;
      state.status = state.config.autoRefreshPrices ? '已开启每小时自动获取实时价格。' : '已关闭每小时自动获取实时价格。';
      saveState();
      render();
      if (state.config.autoRefreshPrices) window.setTimeout(() => requestScriptPrices(false), 0);
    });
    const importFile = document.getElementById('importFile');
    if (importFile) importFile.addEventListener('change', importJsonFile);
  }

  async function handleAction(event) {
    const action = event.currentTarget.dataset.action;
    if (action === 'settings') { state.view = 'settings'; render(); return; }
    if (action === 'clear-current') {
      state.prices.shop = {};
      state.status = '已清空交易所价格。';
      saveState(); render(); return;
    }
    if (action === 'clear-history') {
      if (!confirm(`确认清空 ${state.historyCount} 条历史记录？`)) return;
      await clearHistory();
      state.status = '历史记录已清空。';
      render(); return;
    }
    if (action === 'export') await exportJson();
  }

  async function exportJson() {
    const snapshots = await allSnapshots();
    const payload = { app: 'HYB Farm Dashboard', exportedAt: new Date().toISOString(), state: { config: state.config, prices: state.prices, lastImportedAt: state.lastImportedAt }, snapshots };
    const blob = new Blob([JSON.stringify(payload, null, 2) + '\n'], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hyb-farm-dashboard-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importJsonFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (Array.isArray(json.snapshots)) {
        for (const snapshot of json.snapshots) await putSnapshot(snapshot);
      }
      if (json.state) {
        state.config = Object.assign(state.config, json.state.config || {});
        state.prices = Object.assign(state.prices, json.state.prices || {});
        state.lastImportedAt = Number(json.state.lastImportedAt) || state.lastImportedAt;
      } else if (json.prices) {
        await applySnapshot(json);
      }
      state.status = 'JSON 导入完成。';
      saveState(); render();
    } catch (error) {
      state.error = `JSON 导入失败：${String(error && error.message || error)}`;
      render();
    } finally {
      event.target.value = '';
    }
  }

  function sortMark(key) {
    if (state.config.sortKey !== key) return '';
    return state.config.sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  function sourceLabel() {
    return '交易所售价';
  }

  function clampInt(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  function formatUsd(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '-';
    return `$${formatNumber(number, 2)}`;
  }

  function formatNumber(value, digits) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '-';
    return number.toFixed(digits == null ? 2 : digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  function formatTime(value) {
    const date = new Date(Number(value));
    if (!Number.isFinite(date.getTime())) return '暂无';
    return date.toLocaleString('zh-CN', { hour12: false });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  async function init() {
    installPriceBridgeListener();
    await importSnapshotFromHash();
    await refreshHistoryCount();
    render();
    appReady = true;
    window.setTimeout(() => requestScriptPrices(false), 600);
  }

  init().catch((error) => {
    state.error = String(error && error.message || error);
    render();
  });
})();
