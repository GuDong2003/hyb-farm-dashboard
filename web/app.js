(function () {
  'use strict';

  const UNIT_PER_USD = 500000;
  const MAX_LANDS = 18;
  const DEFAULT_ACTIVE_HOURS = 16;
  const STORE_KEY = 'hybFarmDashboard.v1';
  const DB_NAME = 'hybFarmDashboardDB';
  const DB_VERSION = 1;
  const SNAPSHOT_STORE = 'snapshots';

  const SEEDS = [
    { id: 'carrot', name: '胡萝卜', price: '500000', growthTime: 1800, harvestQuantity: 2, harvestValue: '500000', experienceValue: 5, isVipOnly: false, sortOrder: 10 },
    { id: 'tomato', name: '番茄', price: '1000000', growthTime: 3600, harvestQuantity: 5, harvestValue: '500000', experienceValue: 8, isVipOnly: false, sortOrder: 20 },
    { id: 'corn', name: '玉米', price: '250000', growthTime: 5400, harvestQuantity: 25, harvestValue: '40000', experienceValue: 18, isVipOnly: false, sortOrder: 25 },
    { id: 'pumpkin', name: '南瓜', price: '2000000', growthTime: 7200, harvestQuantity: 6, harvestValue: '1000000', experienceValue: 15, isVipOnly: false, sortOrder: 30 },
    { id: 'blueberry', name: '蓝莓', price: '750000', growthTime: 10800, harvestQuantity: 30, harvestValue: '100000', experienceValue: 24, isVipOnly: false, sortOrder: 35 },
    { id: 'strawberry', name: '草莓', price: '4000000', growthTime: 14400, harvestQuantity: 6, harvestValue: '2000000', experienceValue: 22, isVipOnly: false, sortOrder: 40 },
    { id: 'watermelon', name: '西瓜', price: '6000000', growthTime: 21600, harvestQuantity: 8, harvestValue: '3000000', experienceValue: 35, isVipOnly: false, sortOrder: 50 },
    { id: 'mango', name: '芒果', price: '2500000', growthTime: 25200, harvestQuantity: 35, harvestValue: '200000', experienceValue: 32, isVipOnly: false, sortOrder: 50 },
    { id: 'golden_wheat', name: '黄金麦穗', price: '12000000', growthTime: 72000, harvestQuantity: 30, harvestValue: '800000', experienceValue: 70, isVipOnly: false, sortOrder: 55 },
    { id: 'emerald_cabbage', name: '翡翠卷心菜', price: '16000000', growthTime: 86400, harvestQuantity: 25, harvestValue: '1200000', experienceValue: 90, isVipOnly: false, sortOrder: 60 },
    { id: 'dragon_fruit', name: '火龙果', price: '10000000', growthTime: 28800, harvestQuantity: 4, harvestValue: '5000000', experienceValue: 60, isVipOnly: true, sortOrder: 100 },
    { id: 'starfruit', name: '杨桃', price: '15000000', growthTime: 36000, harvestQuantity: 10, harvestValue: '7500000', experienceValue: 80, isVipOnly: true, sortOrder: 110 },
    { id: 'durian', name: '榴莲', price: '5000000', growthTime: 43200, harvestQuantity: 25, harvestValue: '750000', experienceValue: 50, isVipOnly: true, sortOrder: 115 },
    { id: 'golden_apple', name: '金苹果', price: '30000000', growthTime: 43200, harvestQuantity: 6, harvestValue: '10000000', experienceValue: 100, isVipOnly: true, sortOrder: 120 },
    { id: 'blue_rose', name: '玉露蓝玫瑰', price: '25000000', growthTime: 86400, harvestQuantity: 8, harvestValue: '4500000', experienceValue: 120, isVipOnly: true, sortOrder: 125 },
    { id: 'crystal_grape', name: '水晶葡萄', price: '8000000', growthTime: 108000, harvestQuantity: 10, harvestValue: '1350000', experienceValue: 110, isVipOnly: true, sortOrder: 130 },
    { id: 'rainbow_pineapple', name: '彩虹凤梨', price: '50000000', growthTime: 259200, harvestQuantity: 12, harvestValue: '12500000', experienceValue: 180, isVipOnly: true, sortOrder: 135 },
    { id: 'moonflower', name: '月光花', price: '15000000', growthTime: 172800, harvestQuantity: 10, harvestValue: '2400000', experienceValue: 150, isVipOnly: true, sortOrder: 140 },
    { id: 'weekly_lotus', name: '七日彩莲', price: '100000000', growthTime: 604800, harvestQuantity: 20, harvestValue: '30000000', experienceValue: 260, isVipOnly: true, sortOrder: 145 }
  ].map(normalizeSeed);

  const state = loadState();
  let dbPromise = null;

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
    const prices = {};
    SEEDS.forEach((seed) => {
      prices[seed.id] = seed.harvestValueUsd;
    });
    return prices;
  }

  function loadState() {
    const base = {
      view: 'table',
      status: '当前使用图鉴基准价；安装 bookmarklet 后可抓实时价格。',
      config: {
        source: 'baseline',
        marketMetric: 'min',
        viewLevel: 1,
        cycleMode: 'active',
        activeHours: DEFAULT_ACTIVE_HOURS,
        landCounts: [13, 0, 0, 0, 0, 0, 0],
        sortKey: 'totalDaily',
        sortDir: 'desc'
      },
      prices: { baseline: defaultPrices(), shop: {}, market: {} },
      previousPrices: { shop: {}, market: {} },
      marketStats: {},
      lastImportedAt: 0,
      historyCount: 0,
      error: ''
    };

    try {
      const stored = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
      const merged = Object.assign({}, base, stored);
      merged.config = Object.assign({}, base.config, stored.config || {});
      merged.config.landCounts = normalizeLandCounts(merged.config.landCounts);
      merged.prices = Object.assign({}, base.prices, stored.prices || {});
      merged.prices.baseline = defaultPrices();
      merged.previousPrices = Object.assign({}, base.previousPrices, stored.previousPrices || {});
      merged.marketStats = stored.marketStats || {};
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
      marketStats: state.marketStats,
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
    if (prices.market) {
      state.previousPrices.market = Object.assign({}, state.prices.market || {});
      state.prices.market = cleanPriceMap(prices.market);
      state.marketStats = snapshot.marketStats || state.marketStats || {};
    }
    state.lastImportedAt = capturedAt;
    if (prices.market) state.config.source = 'market';
    else if (prices.shop) state.config.source = 'shop';
    snapshot.id = snapshot.id || `snapshot:${capturedAt}`;
    snapshot.capturedAt = capturedAt;
    await putSnapshot(snapshot);
    saveState();
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
    if (state.config.source === 'market' && Object.keys(state.marketStats || {}).length) {
      const metric = state.config.marketMetric;
      const prices = {};
      Object.keys(state.marketStats).forEach((seedId) => {
        const stat = state.marketStats[seedId] || {};
        const value = Number(stat[metric] != null ? stat[metric] : stat.min);
        if (Number.isFinite(value)) prices[seedId] = value;
      });
      if (Object.keys(prices).length) return prices;
    }
    return state.prices[state.config.source] || {};
  }

  function levelStats(seed, level) {
    const lv = clampInt(level, 1, 7, 1);
    const grossYield = Math.max(0, Math.round(seed.harvestQuantity * (1 + (lv - 1) / 3)));
    const netYield = Math.max(0, grossYield - 1);
    const growthHours = Math.max(0.01, seed.growthHours * Math.max(0.05, 1 - (lv - 1) / 15));
    const dailyCycles = dailyCycleCount(growthHours);
    return { grossYield, netYield, growthHours, dailyCycles, roi: grossYield ? netYield / grossYield * 100 : 0 };
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
      const hasPrice = Number.isFinite(price);
      const stats = levelStats(seed, state.config.viewLevel);
      const singleNet = hasPrice ? stats.netYield * price : null;
      const hourly = hasPrice ? singleNet / stats.growthHours : null;
      const singleDaily = hasPrice ? singleNet * stats.dailyCycles : null;
      const totalDaily = hasPrice ? totalDailyForSeed(seed, price) : null;
      const expPerHarvest = seed.experienceValue;
      const expHourly = expPerHarvest / stats.growthHours;
      const expSingleDaily = expPerHarvest * stats.dailyCycles;
      const expTotalDaily = totalDailyExpForSeed(seed);
      return { seed, price: hasPrice ? price : null, stats, singleNet, hourly, singleDaily, totalDaily, expPerHarvest, expHourly, expSingleDaily, expTotalDaily };
    });
    const dir = state.config.sortDir === 'asc' ? 1 : -1;
    return rows.sort((a, b) => compareRows(a, b, state.config.sortKey) * dir || a.seed.sortOrder - b.seed.sortOrder);
  }

  function totalDailyForSeed(seed, price) {
    return state.config.landCounts.reduce((sum, count, index) => {
      if (!count) return sum;
      const stats = levelStats(seed, index + 1);
      return sum + count * stats.netYield * price * stats.dailyCycles;
    }, 0);
  }

  function totalDailyExpForSeed(seed) {
    return state.config.landCounts.reduce((sum, count, index) => {
      if (!count) return sum;
      const stats = levelStats(seed, index + 1);
      return sum + count * seed.experienceValue * stats.dailyCycles;
    }, 0);
  }

  function compareRows(a, b, key) {
    if (key === 'name') return a.seed.name.localeCompare(b.seed.name, 'zh-CN');
    if (key === 'price') return nullableCompare(a.price, b.price);
    if (key === 'growth') return nullableCompare(a.stats.growthHours, b.stats.growthHours);
    if (key === 'singleNet') return nullableCompare(a.singleNet, b.singleNet);
    if (key === 'hourly') return nullableCompare(a.hourly, b.hourly);
    if (key === 'singleDaily') return nullableCompare(a.singleDaily, b.singleDaily);
    if (key === 'expPerHarvest') return nullableCompare(a.expPerHarvest, b.expPerHarvest);
    if (key === 'expHourly') return nullableCompare(a.expHourly, b.expHourly);
    if (key === 'expTotalDaily') return nullableCompare(a.expTotalDaily, b.expTotalDaily);
    if (key === 'roi') return nullableCompare(a.stats.roi, b.stats.roi);
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
        <button class="btn primary" data-action="settings">安装一键抓取</button>
        <button class="btn" data-action="export">导出历史</button>
        <label class="file-label">导入 JSON<input id="importFile" class="hidden-file" type="file" accept="application/json" /></label>
        <button class="btn warn" data-action="clear-current">清空实时价</button>
        <select class="field" id="source">
          <option value="baseline" ${state.config.source === 'baseline' ? 'selected' : ''}>图鉴基准价</option>
          <option value="shop" ${state.config.source === 'shop' ? 'selected' : ''}>商店收购价</option>
          <option value="market" ${state.config.source === 'market' ? 'selected' : ''}>市场最低价</option>
        </select>
        <select class="field" id="marketMetric" ${state.config.source === 'market' ? '' : 'disabled'}>
          <option value="min" ${state.config.marketMetric === 'min' ? 'selected' : ''}>最低价</option>
          <option value="low3Avg" ${state.config.marketMetric === 'low3Avg' ? 'selected' : ''}>低 3 均价</option>
          <option value="low5Avg" ${state.config.marketMetric === 'low5Avg' ? 'selected' : ''}>低 5 均价</option>
        </select>
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
      <section class="table-wrap">
        ${renderTable(rows, bestRevenue && bestRevenue.row)}
      </section>
      <section class="summary">
        <div>收益最优：<span>${bestRevenue ? `${escapeHtml(bestRevenue.row.seed.name)} ${formatUsd(bestRevenue.value)}/天` : '暂无'}</span></div>
        <div>经验/天最优：<span>${bestExpDay ? `${escapeHtml(bestExpDay.row.seed.name)} ${formatNumber(bestExpDay.value, 2)}` : '暂无'}</span></div>
        <div>经验/小时最优：<span>${bestExpHour ? `${escapeHtml(bestExpHour.row.seed.name)} ${formatNumber(bestExpHour.value, 2)}` : '暂无'}</span></div>
      </section>
    `;
  }

  function renderTable(rows, bestRow) {
    const bestId = bestRow && bestRow.seed.id;
    return `
      <table>
        <thead>
          <tr>
            <th>VIP</th>
            <th><button data-sort="name">作物${sortMark('name')}</button></th>
            <th>产量 毛/净</th>
            <th><button data-sort="growth">生长(h)${sortMark('growth')}</button></th>
            <th>每天次数</th>
            <th><button data-sort="price">当前售价($)${sortMark('price')}</button></th>
            <th><button data-sort="singleNet">单次净收益${sortMark('singleNet')}</button></th>
            <th><button data-sort="hourly">每小时收益${sortMark('hourly')}</button></th>
            <th><button data-sort="singleDaily">每天收益(单地)${sortMark('singleDaily')}</button></th>
            <th><button data-sort="totalDaily">每天收益(全地)${sortMark('totalDaily')}</button></th>
            <th><button data-sort="expPerHarvest">单次经验${sortMark('expPerHarvest')}</button></th>
            <th><button data-sort="expHourly">每小时经验${sortMark('expHourly')}</button></th>
            <th><button data-sort="expTotalDaily">每天经验(全地)${sortMark('expTotalDaily')}</button></th>
            <th><button data-sort="roi">ROI${sortMark('roi')}</button></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => renderRow(row, bestId === row.seed.id)).join('')}
        </tbody>
      </table>
    `;
  }

  function renderRow(row, best) {
    return `
      <tr class="${row.seed.isVipOnly ? 'vip' : ''} ${best ? 'best' : ''}">
        <td>${row.seed.isVipOnly ? '<span class="vip-badge">VIP</span>' : ''}</td>
        <td><strong>${escapeHtml(row.seed.name)}</strong><div class="crop-id">${escapeHtml(row.seed.id)}</div></td>
        <td>${formatNumber(row.stats.grossYield, 0)}/${formatNumber(row.stats.netYield, 0)}</td>
        <td>${formatNumber(row.stats.growthHours, 2)}</td>
        <td>${formatNumber(row.stats.dailyCycles, 2)}</td>
        <td><input class="price-input" data-price="${escapeHtml(row.seed.id)}" type="number" min="0" step="0.00001" value="${row.price == null ? '' : formatNumber(row.price, 5)}" /></td>
        <td>${formatUsd(row.singleNet)}</td>
        <td>${formatUsd(row.hourly)}</td>
        <td>${formatUsd(row.singleDaily)}</td>
        <td class="blue">${formatUsd(row.totalDaily)}</td>
        <td>${formatNumber(row.expPerHarvest, 0)}</td>
        <td class="green">${formatNumber(row.expHourly, 2)}</td>
        <td class="green">${formatNumber(row.expTotalDaily, 2)}</td>
        <td>${formatPercent(row.stats.roi)}</td>
      </tr>
    `;
  }

  function renderSettings() {
    const bookmarklet = buildBookmarklet();
    return `
      <div class="settings">
        <section class="settings-section">
          <h2>安装一键抓取</h2>
          <div class="settings-body">
            <div class="settings-row">
              <div class="settings-label">Bookmarklet</div>
              <div>
                <a class="bookmarklet primary" href="${escapeHtml(bookmarklet)}">一键抓取商店+市场</a>
                <p class="settings-copy">把这个按钮拖到浏览器收藏夹。之后先登录 cdk.hybgzs.com，再点收藏夹里的“一键抓取商店+市场”。</p>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-label">隐私</div>
              <div class="settings-copy">抓取数据通过 <span class="code">#snapshot</span> 带回本页，fragment 不会发送给 Cloudflare。导入后会保存到你当前浏览器的 IndexedDB。</div>
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

  function buildBookmarklet() {
    const appUrl = new URL('.', location.href).href;
    const crops = SEEDS.map((seed) => ({ id: seed.id, name: seed.name }));
    const code = `(async function(){var DEPLOY=${JSON.stringify(appUrl)};var CROPS=${JSON.stringify(crops)};var FACTOR=${UNIT_PER_USD};var box;function say(msg,err){try{if(!box){box=document.createElement('div');box.style.cssText='position:fixed;right:16px;top:16px;z-index:2147483647;max-width:420px;padding:12px 16px;border-radius:8px;background:#111827;color:#fff;font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35);white-space:pre-wrap';document.body.appendChild(box)}box.style.background=err?'#b91c1c':'#111827';box.textContent='[HYB Farm Dashboard] '+msg}catch(_){}}async function fetchJson(url,timeout){var ctrl=new AbortController();var timer=setTimeout(function(){ctrl.abort()},timeout||20000);try{var r=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'},signal:ctrl.signal});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(timer)}}function b64(json){return btoa(unescape(encodeURIComponent(json))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'')}function avg(list){return list.length?list.reduce(function(a,b){return a+b},0)/list.length:null}try{if(!/hybgzs\\.com$/.test(location.hostname)){say('请在 cdk.hybgzs.com 已登录页面运行',true);alert('请在 cdk.hybgzs.com 已登录页面运行');return}var bySeed={};CROPS.forEach(function(c){bySeed[c.id]=true});say('开始抓取商店价...');var shopJson=await fetchJson('/api/farm/recycle/prices',15000);var shop={};(shopJson.data||[]).forEach(function(item){if(!item||!item.seedId||!bySeed[item.seedId])return;var p=Number(item.recyclePrice);if(Number.isFinite(p))shop[item.seedId]=p/FACTOR});say('商店完成，开始扫描市场...');async function page(n){return fetchJson('/api/farm/market?page='+n+'&limit=20',20000)}var first=await page(1);var total=Number(first.pagination&&first.pagination.totalPages)||1;var max=Math.min(total,300);var listings=(first.data||[]).slice();var next=2,done=1;async function worker(){while(next<=max){var pg=next++;var j=await page(pg);if(j.data)listings.push.apply(listings,j.data);done++;say('市场 '+done+'/'+total+' 页，'+listings.length+' 条挂单...')}}var workers=[];for(var i=0;i<Math.min(4,Math.max(0,max-1));i++)workers.push(worker());await Promise.all(workers);var grouped={};listings.forEach(function(item){if(!item||!item.seedId||!bySeed[item.seedId])return;var p=Number(item.pricePerUnit);if(!Number.isFinite(p))return;var v=p/FACTOR;(grouped[item.seedId]||(grouped[item.seedId]=[])).push(v)});var market={},stats={};Object.keys(grouped).forEach(function(seedId){var prices=grouped[seedId].sort(function(a,b){return a-b});stats[seedId]={min:prices[0],low3Avg:avg(prices.slice(0,3)),low5Avg:avg(prices.slice(0,5)),count:prices.length};market[seedId]=prices[0]});var payload={version:1,capturedAt:Date.now(),prices:{shop:shop,market:market},marketStats:stats};say('完成，正在打开 Dashboard...');setTimeout(function(){location.href=DEPLOY+'#snapshot='+b64(JSON.stringify(payload))},600)}catch(e){var msg=e&&e.name==='AbortError'?'请求超时':(e&&e.message||e);say('异常：'+msg,true);alert('抓取失败：'+msg)}})();`;
    return 'javascript:' + code;
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
    const source = document.getElementById('source');
    if (source) source.addEventListener('change', () => { state.config.source = source.value; saveState(); render(); });
    const metric = document.getElementById('marketMetric');
    if (metric) metric.addEventListener('change', () => { state.config.marketMetric = metric.value; saveState(); render(); });
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
        const map = state.prices[state.config.source] || (state.prices[state.config.source] = {});
        const value = Number(input.value);
        if (Number.isFinite(value) && value >= 0) map[input.dataset.price] = value;
        else delete map[input.dataset.price];
        state.status = '已手动更新当前价格。';
        saveState();
        render();
      });
    });
    const importFile = document.getElementById('importFile');
    if (importFile) importFile.addEventListener('change', importJsonFile);
  }

  async function handleAction(event) {
    const action = event.currentTarget.dataset.action;
    if (action === 'settings') { state.view = 'settings'; render(); return; }
    if (action === 'clear-current') {
      if (state.config.source !== 'baseline') state.prices[state.config.source] = {};
      state.status = '已清空当前实时价格。';
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
    const payload = { app: 'HYB Farm Dashboard', exportedAt: new Date().toISOString(), state: { config: state.config, prices: state.prices, marketStats: state.marketStats, lastImportedAt: state.lastImportedAt }, snapshots };
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
        state.marketStats = json.state.marketStats || state.marketStats;
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
    if (state.config.source === 'shop') return '商店收购价';
    if (state.config.source === 'market') return `市场${state.config.marketMetric === 'low3Avg' ? '低 3 均价' : state.config.marketMetric === 'low5Avg' ? '低 5 均价' : '最低价'}`;
    return '图鉴基准价';
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

  function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '-';
    return `${formatNumber(number, 1)}%`;
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
    await importSnapshotFromHash();
    await refreshHistoryCount();
    render();
  }

  init().catch((error) => {
    state.error = String(error && error.message || error);
    render();
  });
})();
