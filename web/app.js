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
  const CLOUD_DEFAULT_ENDPOINT = '/api/default-prices';
  const CLOUD_SUBMIT_ENDPOINT = '/api/price-submissions';

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
  applyTheme();
  let dbPromise = null;
  let appReady = false;
  let priceBridgeRequest = null;
  let autoRefreshTimer = null;

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
        cycleMode: 'full24',
        activeHours: DEFAULT_ACTIVE_HOURS,
        autoRefreshPrices: true,
        autoUploadPrices: false,
        theme: 'system',
        landCounts: [13, 0, 0, 0, 0, 0, 0],
        sortKey: 'totalDaily',
        sortDir: 'desc'
      },
      prices: { shop: defaultPrices() },
      previousPrices: { shop: {} },
      lastImportedAt: 0,
      cloudDefaultAt: 0,
      priceOrigin: '',
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
      if (merged.config.sortKey === 'expPerCrop') merged.config.sortKey = 'expPerHarvest';
      merged.prices = { shop: cleanPriceMap((stored.prices && stored.prices.shop) || {}) };
      merged.previousPrices = { shop: cleanPriceMap((stored.previousPrices && stored.previousPrices.shop) || {}) };
      merged.priceOrigin = typeof stored.priceOrigin === 'string' ? stored.priceOrigin : '';
      return merged;
    } catch (_) {
      return base;
    }
  }

  function themeMode() {
    return state.config.theme === 'dark' || state.config.theme === 'light' ? state.config.theme : 'system';
  }

  function resolvedTheme() {
    if (themeMode() === 'dark' || themeMode() === 'light') return themeMode();
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme() {
    document.documentElement.dataset.theme = resolvedTheme();
  }

  function themeIcon() {
    if (themeMode() === 'system') return '◐';
    return themeMode() === 'dark' ? '☾' : '☀';
  }

  function themeLabel() {
    if (themeMode() === 'system') return '主题：跟随系统';
    return themeMode() === 'dark' ? '主题：暗色' : '主题：亮色';
  }

  function cycleThemeMode() {
    const current = themeMode();
    if (current === 'system') return 'dark';
    if (current === 'dark') return 'light';
    return 'system';
  }

  function installThemeListener() {
    if (!window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (themeMode() !== 'system') return;
      applyTheme();
      render();
    };
    if (media.addEventListener) media.addEventListener('change', onChange);
    else if (media.addListener) media.addListener(onChange);
  }

  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      config: state.config,
      prices: state.prices,
      previousPrices: state.previousPrices,
      lastImportedAt: state.lastImportedAt,
      priceOrigin: state.priceOrigin
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
    state.priceOrigin = 'local';
    state.config.source = 'shop';
    snapshot.id = snapshot.id || `snapshot:${capturedAt}`;
    snapshot.capturedAt = capturedAt;
    await putSnapshot(snapshot);
    saveState();
    if (state.config.autoUploadPrices) queueCloudSubmission(snapshot);
  }

  async function loadCloudDefaultPrices(renderAfter) {
    let changed = false;
    try {
      const response = await fetch(CLOUD_DEFAULT_ENDPOINT, { headers: { accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) return false;
      const data = await response.json();
      const snapshot = data && data.snapshot;
      const prices = snapshot && snapshot.prices && snapshot.prices.shop;
      const cloudCapturedAt = Number(snapshot && snapshot.capturedAt) || 0;
      if (cloudCapturedAt && state.cloudDefaultAt !== cloudCapturedAt) {
        state.cloudDefaultAt = cloudCapturedAt;
        changed = true;
      }
      const isNewerCloud = cloudCapturedAt && cloudCapturedAt > (Number(state.lastImportedAt) || 0);
      if (prices && (!hasShopPrices() || isNewerCloud)) {
        state.previousPrices.shop = Object.assign({}, state.prices.shop || {});
        state.prices.shop = cleanPriceMap(prices);
        state.lastImportedAt = cloudCapturedAt;
        state.priceOrigin = 'cloud';
        state.config.source = 'shop';
        state.status = `使用云端默认价格：${formatTime(state.lastImportedAt)}。`;
        saveState();
        changed = true;
      }
    } catch (_) {
      // Cloud defaults are only a fallback; local use should keep working offline.
    }
    if (changed && renderAfter) render();
    return changed;
  }

  function hasShopPrices() {
    return Object.keys(state.prices.shop || {}).length > 0;
  }

  function snapshotFromCurrentPrices() {
    const prices = cleanPriceMap(state.prices.shop || {});
    const matched = Object.keys(prices).length;
    if (!matched) return null;
    const capturedAt = Number(state.lastImportedAt) || Date.now();
    return {
      version: 1,
      source: 'dashboard-upload',
      capturedAt,
      prices: { shop: prices },
      matched,
      totalSeeds: SEEDS.length
    };
  }

  function queueCloudSubmission(snapshot) {
    submitSnapshotToCloud(snapshot).then((result) => {
      rememberCloudDefault(result);
      const text = cloudSubmissionStatusText(result);
      if (!text) return;
      state.status = `${state.status.replace(/。$/, '')}；${text}`;
      render();
    }).catch(() => {});
  }

  async function submitSnapshotToCloud(snapshot) {
    const response = await fetch(CLOUD_SUBMIT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ snapshot })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.reason || data.error || `HTTP ${response.status}`);
    return data;
  }

  function cloudSubmissionStatusText(result) {
    if (!result || !result.ok) return '';
    if (result.status === 'accepted') {
      const capturedAt = Number(result.snapshot && result.snapshot.capturedAt) || 0;
      return capturedAt ? `云端默认价格已更新：${formatTime(capturedAt)}。` : '云端默认价格已更新。';
    }
    if (result.status === 'rejected') return `云端未采用：${cloudReasonText(result.reason)}。`;
    return '';
  }

  function rememberCloudDefault(result) {
    const capturedAt = Number(result && result.snapshot && result.snapshot.capturedAt) || 0;
    if (capturedAt) state.cloudDefaultAt = capturedAt;
  }

  function cloudReasonText(reason) {
    if (reason === 'stale_or_existing_data') return '不是更新的数据';
    if (reason === 'same_refresh_interval') return '当前刷新周期内且价格未变化';
    if (reason === 'too_few_prices') return '价格数量不足';
    if (reason === 'price_out_of_range') return '存在异常价格';
    if (reason === 'future_captured_at') return '时间异常';
    return reason || '校验未通过';
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
      if (event.origin !== location.origin || !data || data.type !== BRIDGE_READY) return;
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
      if (event.origin !== location.origin || !data || data.type !== BRIDGE_RESPONSE || data.requestId !== requestId) return;
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
        ? (state.lastImportedAt ? `使用上次导入价格：${formatTime(state.lastImportedAt)}。` : '使用当前已保存价格。')
        : '未检测到自动导入脚本；安装脚本后会在打开页面时自动获取实时价格。';
      loadCloudDefaultPrices(false).then(() => render()).catch(() => render());
    }, 18000);

    priceBridgeRequest = { id: requestId, timer, onMessage };
    window.addEventListener('message', onMessage);
    window.postMessage({ type: BRIDGE_REQUEST, requestId, force: Boolean(force) }, location.origin);
    return true;
  }

  function runAutoRefresh() {
    if (!state.config.autoRefreshPrices) return;
    if (!requestScriptPrices(false)) loadCloudDefaultPrices(true);
  }

  function scheduleAutoRefresh() {
    if (autoRefreshTimer) window.clearTimeout(autoRefreshTimer);
    autoRefreshTimer = null;
    if (!state.config.autoRefreshPrices) return;
    autoRefreshTimer = window.setTimeout(() => {
      runAutoRefresh();
      scheduleAutoRefresh();
    }, PRICE_REFRESH_MS);
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
      const priceDeltaRate = priceDelta != null && previousPrice > 0 ? (priceDelta / previousPrice) * 100 : null;
      const stats = levelStats(seed, state.config.viewLevel);
      const singleNet = hasPrice ? stats.saleYield * price : null;
      const hourly = hasPrice ? singleNet / stats.growthHours : null;
      const singleDaily = hasPrice ? singleNet * stats.dailyCycles : null;
      const totalDaily = hasPrice ? totalDailyForSeed(seed, price) : null;
      const expPerCrop = seed.experienceValue;
      const expPerHarvest = expPerCrop * seed.harvestQuantity;
      const expSingleDaily = expPerHarvest * stats.dailyCycles;
      const expTotalDaily = totalDailyExpForSeed(seed);
      const expHourly = expTotalDaily / dailyHourBasis();
      return { seed, price: hasPrice ? price : null, previousPrice: hasPreviousPrice ? previousPrice : null, priceDelta, priceDeltaRate, stats, singleNet, hourly, singleDaily, totalDaily, expPerHarvest, expHourly, expSingleDaily, expTotalDaily };
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
      return sum + count * seed.experienceValue * seed.harvestQuantity * stats.dailyCycles;
    }, 0);
  }

  function dailyHourBasis() {
    return state.config.cycleMode === 'full24' ? 24 : Math.max(1, state.config.activeHours);
  }

  function dailyCycleLabel() {
    return state.config.cycleMode === 'full24' ? '24h' : `${state.config.activeHours}h`;
  }

  function compareRows(a, b, key) {
    if (key === 'name') return a.seed.name.localeCompare(b.seed.name, 'zh-CN');
    if (key === 'price') return nullableCompare(a.price, b.price);
    if (key === 'priceDelta') return nullableCompare(a.priceDelta, b.priceDelta);
    if (key === 'growth') return nullableCompare(a.stats.growthHours, b.stats.growthHours);
    if (key === 'singleNet') return nullableCompare(a.singleNet, b.singleNet);
    if (key === 'hourly') return nullableCompare(a.hourly, b.hourly);
    if (key === 'singleDaily') return nullableCompare(a.singleDaily, b.singleDaily);
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
          <div class="brand">黑白农场助手</div>
          <nav class="nav">
            <button data-view="table" class="${state.view === 'table' ? 'active' : ''}">收益表</button>
            <button data-view="settings" class="${state.view === 'settings' ? 'active' : ''}">设置</button>
          </nav>
          <div class="status">历史 ${state.historyCount} 条</div>
          <button class="theme-toggle" data-action="theme" aria-label="${themeLabel()}" title="${themeLabel()}">${themeIcon()}</button>
          <a class="github-link" href="https://github.com/GuDong2003/hyb-farm-dashboard" target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub">
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.59 7.59 0 0 1 8 3.86c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
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
        <button class="btn" data-action="refresh-prices" title="通过用户脚本立即获取交易所价格">↻ 立即刷新</button>
        <button class="btn" data-action="upload-cloud" title="上传当前价格到云端校验池">上传云端</button>
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
        ${state.cloudDefaultAt ? `<span>云端默认：${formatTime(state.cloudDefaultAt)}</span>` : ''}
        ${state.error ? `<span class="bad">${escapeHtml(state.error)}</span>` : ''}
      </section>
      <section class="formula-bar">
        <span class="formula-title">公式</span>
        <span>收益：Σ(地块数 × (毛产量 - 1) × 售价 × 每天次数（${dailyCycleLabel()}）)</span>
        <span>单块收获经验：单作物经验 × 作物收获数量</span>
        <span>每天经验：Σ(地块数 × 单块收获经验 × 每天次数（${dailyCycleLabel()}）)</span>
        <span>每小时经验：每天经验 ÷ ${state.config.cycleMode === 'full24' ? '24h' : `${state.config.activeHours}h`}</span>
        <span>等级：收益产量每级 +1/3；生长时间每级 -1/15；经验收获数量固定</span>
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
            <th>产量 毛/卖</th>
            <th><button data-sort="growth">生长(h)${sortMark('growth')}</button></th>
            <th>每天次数（${dailyCycleLabel()}）</th>
            <th><button data-sort="price">当前售价($)${sortMark('price')}</button></th>
            <th><button data-sort="priceDelta">价格差${sortMark('priceDelta')}</button></th>
            <th><button data-sort="singleNet">单次收益${sortMark('singleNet')}</button></th>
            <th><button data-sort="hourly">每小时收益(单地)${sortMark('hourly')}</button></th>
            <th><button data-sort="singleDaily">每天收益(单地)${sortMark('singleDaily')}</button></th>
            <th><button data-sort="totalDaily">每天收益(全地混合)${sortMark('totalDaily')}</button></th>
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

  function renderPriceDelta(delta, rate) {
    const value = Number(delta);
    const percent = Number(rate);
    const percentText = Number.isFinite(percent) ? `${formatNumber(Math.abs(percent), 1)}%` : '';
    if (!Number.isFinite(value)) return '<span class="price-delta flat"><span class="price-delta-value">-</span><span class="price-delta-arrow"></span><span class="price-delta-percent"></span></span>';
    if (Math.abs(value) < 0.000005) return `<span class="price-delta flat"><span class="price-delta-value">$0</span><span class="price-delta-arrow">→</span><span class="price-delta-percent">${percentText || '0%'}</span></span>`;
    const direction = value > 0 ? 'up' : 'down';
    const arrow = value > 0 ? '↑' : '↓';
    return `<span class="price-delta ${direction}"><span class="price-delta-value">${formatUsd(Math.abs(value))}</span><span class="price-delta-arrow">${arrow}</span><span class="price-delta-percent">${percentText}</span></span>`;
  }

  function priceDeltaTitle(row) {
    if (!Number.isFinite(Number(row.priceDelta))) return '没有上次价格可比较';
    const rate = Number(row.priceDeltaRate);
    const rateText = Number.isFinite(rate) ? `，涨跌幅：${formatSignedPercent(rate)}` : '';
    return `上次价格：${formatUsd(row.previousPrice)}，当前价格：${formatUsd(row.price)}，差值：${formatSignedUsd(row.priceDelta)}${rateText}`;
  }

  function renderRow(row, best) {
    return `
      <tr class="${row.seed.isVipOnly ? 'vip' : ''} ${best ? 'best' : ''}">
        <td><span class="seed-vip-badge ${row.seed.isVipOnly ? 'vip' : 'normal'}">${row.seed.isVipOnly ? 'VIP' : '普通'}</span></td>
        <td title="${escapeHtml(row.seed.id)}"><div class="crop-cell"><img class="crop-icon" src="./assets/crops/${escapeHtml(row.seed.id)}.png" alt="" loading="lazy" onerror="this.style.display='none'"/><strong class="crop-name">${escapeHtml(row.seed.name)}</strong></div></td>
        <td title="毛产量 / 卖出产量（扣 1 留种）">${formatNumber(row.stats.grossYield, 0)}/${formatNumber(row.stats.saleYield, 0)}</td>
        <td>${formatNumber(row.stats.growthHours, 2)}</td>
        <td>${formatNumber(row.stats.dailyCycles, 2)}</td>
        <td><input class="price-input" data-price="${escapeHtml(row.seed.id)}" type="number" min="0" step="0.00001" value="${row.price == null ? '' : formatNumber(row.price, 5)}" /></td>
        <td title="${escapeHtml(priceDeltaTitle(row))}">${renderPriceDelta(row.priceDelta, row.priceDeltaRate)}</td>
        <td>${formatUsd(row.singleNet)}</td>
        <td>${formatUsd(row.hourly)}</td>
        <td>${formatUsd(row.singleDaily)}</td>
        <td class="blue">${formatUsd(row.totalDaily)}</td>
        <td>${formatNumber(row.expPerHarvest, 0)}</td>
        <td class="green">${formatNumber(row.expHourly, 2)}</td>
        <td class="green">${formatNumber(row.expTotalDaily, 2)}</td>
      </tr>
    `;
  }

  function renderSettings() {
    return `
      <div class="settings">
        <section class="settings-panel settings-wide">
          <div class="settings-head">
            <div>
              <h2>价格导入</h2>
              <p>安装用户脚本后，可从 CDK 获取交易所实时价格。</p>
            </div>
            <div class="settings-actions">
              <a class="bookmarklet primary" href="./userscripts/hyb-farm-dashboard-capture.user.js">安装脚本</a>
              <a class="bookmarklet" href="https://cdk.hybgzs.com/" target="_blank" rel="noopener noreferrer">打开 CDK</a>
            </div>
          </div>
        </section>

        <section class="settings-panel">
          <div class="settings-head compact">
            <div>
              <h2>自动化</h2>
              <p>控制刷新和云端提交。</p>
            </div>
          </div>
          <div class="toggle-list">
            <label class="toggle-row">
              <span class="toggle-text"><strong>每小时自动刷新</strong><small>对比本地与云端时间，自动采用较新的价格</small></span>
              <span class="toggle-control"><input id="autoRefreshPrices" type="checkbox" ${state.config.autoRefreshPrices ? 'checked' : ''} /><span class="toggle-track"></span></span>
            </label>
            <label class="toggle-row">
              <span class="toggle-text"><strong>导入后自动上传</strong><small>关闭时只有手动上传才进入云端校验</small></span>
              <span class="toggle-control"><input id="autoUploadPrices" type="checkbox" ${state.config.autoUploadPrices ? 'checked' : ''} /><span class="toggle-track"></span></span>
            </label>
          </div>
        </section>

        <section class="settings-panel">
          <div class="settings-head compact">
            <div>
              <h2>外观</h2>
              <p>选择亮色、暗色或跟随系统。</p>
            </div>
          </div>
          <div class="theme-segment" role="group" aria-label="主题模式">
            <button type="button" data-theme-mode="system" class="${themeMode() === 'system' ? 'active' : ''}">跟随系统</button>
            <button type="button" data-theme-mode="light" class="${themeMode() === 'light' ? 'active' : ''}">亮色</button>
            <button type="button" data-theme-mode="dark" class="${themeMode() === 'dark' ? 'active' : ''}">暗色</button>
          </div>
        </section>

        <section class="settings-panel">
          <div class="settings-head compact">
            <div>
              <h2>隐私与云端</h2>
              <p>按时间取新，云端只保存价格快照。</p>
            </div>
          </div>
          <div class="settings-copy">价格数据通过脚本消息或 <span class="code">#snapshot</span> 带回本页。只有点击“上传云端”或开启自动上传时，价格和时间才会提交到云端校验池。</div>
        </section>

        <section class="settings-panel settings-wide settings-manage">
          <div class="settings-head compact">
            <div>
              <h2>数据管理</h2>
              <p>管理本地历史与备份。</p>
            </div>
            <div class="history-stat"><span>历史</span><strong>${state.historyCount}</strong><span>条</span></div>
          </div>
          <div class="settings-actions">
            <button class="btn" data-action="export">导出历史</button>
            <button class="btn warn" data-action="clear-history">清空历史</button>
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
        state.lastImportedAt = Date.now();
        state.priceOrigin = 'manual';
        state.status = '已手动更新当前价格。';
        saveState();
        render();
      });
    });
    document.querySelectorAll('[data-theme-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        state.config.theme = button.dataset.themeMode || 'system';
        applyTheme();
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
      if (state.config.autoRefreshPrices) runAutoRefresh();
      scheduleAutoRefresh();
    });
    const autoUploadPrices = document.getElementById('autoUploadPrices');
    if (autoUploadPrices) autoUploadPrices.addEventListener('change', () => {
      state.config.autoUploadPrices = autoUploadPrices.checked;
      state.status = state.config.autoUploadPrices ? '已开启导入后自动上传云端。' : '已关闭导入后自动上传云端。';
      saveState();
      render();
    });
    const importFile = document.getElementById('importFile');
    if (importFile) importFile.addEventListener('change', importJsonFile);
  }

  async function handleAction(event) {
    const action = event.currentTarget.dataset.action;
    if (action === 'settings') { state.view = 'settings'; render(); return; }
    if (action === 'theme') {
      state.config.theme = cycleThemeMode();
      applyTheme();
      saveState();
      render();
      return;
    }
    if (action === 'refresh-prices') {
      if (!requestScriptPrices(true)) {
        state.status = priceBridgeRequest ? '正在刷新实时价格，请稍候。' : '无法刷新实时价格。';
        render();
      }
      return;
    }
    if (action === 'upload-cloud') {
      const snapshot = snapshotFromCurrentPrices();
      if (!snapshot) { state.status = '没有可上传的当前价格。'; render(); return; }
      state.status = '正在上传云端校验...';
      render();
      try {
        const result = await submitSnapshotToCloud(snapshot);
        rememberCloudDefault(result);
        state.status = cloudSubmissionStatusText(result) || '云端已收到价格数据。';
      } catch (error) {
        state.status = `云端上传失败：${String(error && error.message || error)}`;
      }
      render();
      return;
    }
    if (action === 'clear-current') {
      state.prices.shop = {};
      state.priceOrigin = '';
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
    const payload = { app: '黑白农场助手', exportedAt: new Date().toISOString(), state: { config: state.config, prices: state.prices, lastImportedAt: state.lastImportedAt }, snapshots };
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
        state.priceOrigin = typeof json.state.priceOrigin === 'string' ? json.state.priceOrigin : 'local';
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

  function formatSignedUsd(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '-';
    const sign = number > 0 ? '+' : number < 0 ? '-' : '';
    return `${sign}$${formatNumber(Math.abs(number), 2)}`;
  }

  function formatSignedPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '-';
    const sign = number > 0 ? '+' : number < 0 ? '-' : '';
    return `${sign}${formatNumber(Math.abs(number), 2)}%`;
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
    installThemeListener();
    await loadCloudDefaultPrices(false);
    await refreshHistoryCount();
    render();
    appReady = true;
    window.setTimeout(runAutoRefresh, 600);
    scheduleAutoRefresh();
  }

  init().catch((error) => {
    state.error = String(error && error.message || error);
    render();
  });
})();
