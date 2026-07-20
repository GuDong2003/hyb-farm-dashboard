(function () {
  'use strict';

  const UNIT_PER_USD = 500000;
  const MAX_LANDS = 20;
  const MAX_FARM_LEVEL = 100;
  const FIRST_LEVEL_EXP = 100;
  const LEVEL_EXP_GROWTH = 1.5;
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
  const CLOUD_HISTORY_ENDPOINT = '/api/price-history';
  const PRICE_CHANGE_ALERT_THRESHOLD = 20;
  const PRICE_CHANGE_ALERT_WINDOW = '1h';

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

  const SEED_BY_ID = Object.fromEntries(SEEDS.map((seed) => [seed.id, seed]));

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
        browserPriceAlerts: false,
        notifiedPriceAlertKey: '',
        theme: 'system',
        landCounts: [13, 0, 0, 0, 0, 0, 0],
        currentTotalExp: 0,
        trendWindow: '24h',
        sortKey: 'totalDaily',
        sortDir: 'desc'
      },
      prices: { shop: defaultPrices() },
      previousPrices: { shop: {} },
      priceChangeRates: { shop: {} },
      priceTrends: { shop: {} },
      lastImportedAt: 0,
      cloudDefaultAt: 0,
      priceOrigin: '',
      historyCount: 0,
      historyAlerts: null,
      historyLoading: false,
      historyLoadedAt: 0,
      historyError: '',
      error: ''
    };

    try {
      const stored = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
      const merged = Object.assign({}, base, stored);
      merged.config = Object.assign({}, base.config, stored.config || {});
      merged.config.landCounts = normalizeLandCounts(merged.config.landCounts);
      merged.config.currentTotalExp = normalizeTotalExperience(merged.config.currentTotalExp);
      merged.config.source = 'shop';
      if (!['1h', '6h', '12h', '24h', '7d'].includes(merged.config.trendWindow)) merged.config.trendWindow = base.config.trendWindow;
      delete merged.config.seedMode;
      if (merged.config.sortKey === 'expPerCrop') merged.config.sortKey = 'expPerHarvest';
      if (merged.config.sortKey === 'priceDelta') merged.config.sortKey = 'priceChangeRate';
      merged.prices = { shop: cleanPriceMap((stored.prices && stored.prices.shop) || {}) };
      merged.previousPrices = { shop: cleanPriceMap((stored.previousPrices && stored.previousPrices.shop) || {}) };
      merged.priceChangeRates = { shop: cleanSignedNumberMap((stored.priceChangeRates && stored.priceChangeRates.shop) || {}) };
      merged.priceTrends = { shop: cleanTrendMap((stored.priceTrends && stored.priceTrends.shop) || {}) };
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
      priceChangeRates: state.priceChangeRates,
      priceTrends: state.priceTrends,
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

  function normalizeTotalExperience(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
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

  async function loadHistoryAlerts(force) {
    if (state.historyLoading) return;
    if (!force && state.historyAlerts && Date.now() - state.historyLoadedAt < 60 * 1000) return;
    state.historyLoading = true;
    state.historyError = '';
    try {
      const [cloudResult, localSnapshots] = await Promise.allSettled([
        fetchCloudHistoryAlerts(force),
        allSnapshots()
      ]);
      const cloud = cloudResult.status === 'fulfilled'
        ? cloudResult.value
        : emptyHistoryResult();
      const local = buildSnapshotChangeHistory(localSnapshots.status === 'fulfilled' ? localSnapshots.value : [], PRICE_CHANGE_ALERT_THRESHOLD);
      state.historyAlerts = { cloud, local };
      state.historyLoadedAt = Date.now();
      const errors = [];
      if (cloudResult.status === 'rejected') errors.push(`云端历史：${String(cloudResult.reason && cloudResult.reason.message || cloudResult.reason)}`);
      if (localSnapshots.status === 'rejected') errors.push(`本地历史：${String(localSnapshots.reason && localSnapshots.reason.message || localSnapshots.reason)}`);
      state.historyError = errors.join('；');
    } finally {
      state.historyLoading = false;
    }
  }

  async function fetchCloudHistoryAlerts(force) {
    const endpoint = `${CLOUD_HISTORY_ENDPOINT}?threshold=${encodeURIComponent(PRICE_CHANGE_ALERT_THRESHOLD)}`;
    const response = await fetch(endpoint, {
      headers: { accept: 'application/json' },
      cache: force ? 'reload' : 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data || data.ok === false) throw new Error(data.error || data.reason || `HTTP ${response.status}`);
    return normalizeHistoryResult(data);
  }

  function buildSnapshotChangeHistory(snapshots, threshold) {
    const rows = (Array.isArray(snapshots) ? snapshots : [])
      .map(snapshotHistoryRow)
      .filter(Boolean)
      .sort((a, b) => a.capturedAt - b.capturedAt);
    const previousBySeed = {};
    const groupsBySeed = {};
    const seriesBySeed = {};
    rows.forEach((row) => {
      Object.keys(row.prices).forEach((seedId) => {
        const currentPrice = Number(row.prices[seedId]);
        if (!Number.isFinite(currentPrice) || currentPrice < 0) return;
        const points = seriesBySeed[seedId] || (seriesBySeed[seedId] = []);
        points.push({ capturedAt: row.capturedAt, price: currentPrice, source: row.source, submissionId: 0 });
        const previous = previousBySeed[seedId];
        if (previous && previous.price > 0) {
          const changeRate = ((currentPrice - previous.price) / previous.price) * 100;
          if (Number.isFinite(changeRate) && Math.abs(changeRate) >= threshold) {
            const events = groupsBySeed[seedId] || (groupsBySeed[seedId] = []);
            events.push({
              capturedAt: row.capturedAt,
              previousCapturedAt: previous.capturedAt,
              previousPrice: previous.price,
              currentPrice,
              changeRate,
              source: row.source,
              submissionId: 0
            });
          }
        }
        previousBySeed[seedId] = { price: currentPrice, capturedAt: row.capturedAt };
      });
    });
    return normalizeHistoryResult({
      threshold,
      totalSnapshots: rows.length,
      groups: Object.keys(groupsBySeed).map((seedId) => ({ seedId, events: groupsBySeed[seedId] })),
      series: Object.keys(seriesBySeed).map((seedId) => ({ seedId, points: seriesBySeed[seedId] }))
    });
  }

  function snapshotHistoryRow(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    const capturedAt = Number(snapshot.capturedAt);
    const prices = snapshot.prices && snapshot.prices.shop ? snapshot.prices.shop : snapshot.prices;
    if (!Number.isFinite(capturedAt) || capturedAt <= 0 || !prices || typeof prices !== 'object') return null;
    return {
      capturedAt,
      source: String(snapshot.source || 'local'),
      prices: cleanPriceMap(prices)
    };
  }

  function normalizeHistoryResult(data) {
    const threshold = Number(data && data.threshold) || PRICE_CHANGE_ALERT_THRESHOLD;
    const totalSnapshots = Number(data && data.totalSnapshots) || 0;
    const groups = Array.isArray(data && data.groups) ? data.groups : [];
    let eventCount = 0;
    const normalizedGroups = groups.map((group) => {
      const seedId = String(group && group.seedId || '');
      const events = (Array.isArray(group && group.events) ? group.events : [])
        .map(normalizeHistoryEvent)
        .filter(Boolean)
        .sort((a, b) => b.capturedAt - a.capturedAt);
      eventCount += events.length;
      return { seedId, events };
    }).filter((group) => group.seedId && group.events.length)
      .sort((a, b) => seedSortOrder(a.seedId) - seedSortOrder(b.seedId));
    const series = normalizeHistorySeries(data && data.series);
    return { threshold, totalSnapshots, eventCount, groups: normalizedGroups, series };
  }

  function normalizeHistorySeries(series) {
    return (Array.isArray(series) ? series : []).map((item) => {
      const seedId = String(item && item.seedId || '');
      const points = (Array.isArray(item && item.points) ? item.points : [])
        .map(normalizeHistoryPoint)
        .filter(Boolean)
        .sort((a, b) => a.capturedAt - b.capturedAt);
      return { seedId, points };
    }).filter((item) => item.seedId && item.points.length)
      .sort((a, b) => seedSortOrder(a.seedId) - seedSortOrder(b.seedId));
  }

  function normalizeHistoryPoint(point) {
    const capturedAt = Number(point && point.capturedAt);
    const price = Number(point && point.price);
    if (!Number.isFinite(capturedAt) || !Number.isFinite(price)) return null;
    return {
      capturedAt,
      price,
      source: String(point && point.source || ''),
      submissionId: Number(point && point.submissionId) || 0
    };
  }

  function emptyHistoryResult() {
    return { threshold: PRICE_CHANGE_ALERT_THRESHOLD, totalSnapshots: 0, eventCount: 0, groups: [], series: [] };
  }

  function normalizeHistoryEvent(event) {
    const capturedAt = Number(event && event.capturedAt);
    const previousCapturedAt = Number(event && event.previousCapturedAt);
    const previousPrice = Number(event && event.previousPrice);
    const currentPrice = Number(event && event.currentPrice);
    const changeRate = Number(event && event.changeRate);
    if (!Number.isFinite(capturedAt) || !Number.isFinite(previousPrice) || !Number.isFinite(currentPrice) || !Number.isFinite(changeRate)) return null;
    return {
      capturedAt,
      acceptedAt: Number(event && event.acceptedAt) || 0,
      previousCapturedAt: Number.isFinite(previousCapturedAt) ? previousCapturedAt : 0,
      previousPrice,
      currentPrice,
      changeRate,
      source: String(event && event.source || ''),
      submissionId: Number(event && event.submissionId) || 0
    };
  }

  function seedSortOrder(seedId) {
    const seed = SEED_BY_ID[seedId];
    return seed ? seed.sortOrder : 9999;
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
    const priceChangeRates = snapshot.priceChangeRates || snapshot.changeRates || snapshot.priceRates || {};
    const priceTrends = snapshot.priceTrends || snapshot.trends || {};
    if (prices.shop) {
      state.previousPrices.shop = Object.assign({}, state.prices.shop || {});
      state.prices.shop = cleanPriceMap(prices.shop);
      state.priceChangeRates.shop = cleanSignedNumberMap(priceChangeRates.shop || {});
      state.priceTrends.shop = cleanTrendMap(priceTrends.shop || {});
    }
    state.lastImportedAt = capturedAt;
    state.priceOrigin = 'local';
    state.config.source = 'shop';
    snapshot.id = snapshot.id || `snapshot:${capturedAt}`;
    snapshot.capturedAt = capturedAt;
    await putSnapshot(snapshot);
    saveState();
    maybeNotifyPriceRise();
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
      const priceChangeRates = snapshot && (snapshot.priceChangeRates || snapshot.changeRates || snapshot.priceRates);
      const priceTrends = snapshot && (snapshot.priceTrends || snapshot.trends);
      const cloudCapturedAt = Number(snapshot && snapshot.capturedAt) || 0;
      if (cloudCapturedAt && state.cloudDefaultAt !== cloudCapturedAt) {
        state.cloudDefaultAt = cloudCapturedAt;
        changed = true;
      }
      const isNewerCloud = cloudCapturedAt && cloudCapturedAt > (Number(state.lastImportedAt) || 0);
      if (prices && (!hasShopPrices() || isNewerCloud)) {
        state.previousPrices.shop = Object.assign({}, state.prices.shop || {});
        state.prices.shop = cleanPriceMap(prices);
        state.priceChangeRates.shop = cleanSignedNumberMap((priceChangeRates && priceChangeRates.shop) || {});
        state.priceTrends.shop = cleanTrendMap((priceTrends && priceTrends.shop) || {});
        state.lastImportedAt = cloudCapturedAt;
        state.priceOrigin = 'cloud';
        state.config.source = 'shop';
        state.status = `使用云端默认价格：${formatTime(state.lastImportedAt)}。`;
        saveState();
        maybeNotifyPriceRise();
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
    const priceChangeRates = cleanSignedNumberMap((state.priceChangeRates && state.priceChangeRates.shop) || {});
    const priceTrends = cleanTrendMap((state.priceTrends && state.priceTrends.shop) || {});
    const matched = Object.keys(prices).length;
    if (!matched) return null;
    const capturedAt = Number(state.lastImportedAt) || Date.now();
    const snapshot = {
      version: 1,
      source: 'dashboard-upload',
      capturedAt,
      prices: { shop: prices },
      matched,
      totalSeeds: SEEDS.length
    };
    if (Object.keys(priceChangeRates).length) snapshot.priceChangeRates = { shop: priceChangeRates };
    if (Object.keys(priceTrends).length) snapshot.priceTrends = { shop: priceTrends };
    return snapshot;
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
      body: JSON.stringify({ snapshot: snapshotForCloud(snapshot) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.reason || data.error || `HTTP ${response.status}`);
    return data;
  }

  function snapshotForCloud(snapshot) {
    const out = Object.assign({}, snapshot || {});
    // 云端默认价格需要同时携带涨跌幅/趋势数据；否则新用户首次打开只能看到价格，涨跌幅会退化成 0/-。
    return out;
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

  function cleanSignedNumberMap(map) {
    const out = {};
    Object.keys(map || {}).forEach((key) => {
      const value = Number(map[key]);
      if (Number.isFinite(value)) out[key] = value;
    });
    return out;
  }

  function cleanTrendMap(map) {
    const out = {};
    Object.keys(map || {}).forEach((key) => {
      const item = map[key] || {};
      const hourly = cleanTrendSeries(item.hourly || item.hour || []);
      const daily = cleanTrendSeries(item.daily || item.day || []);
      const unitPrice = Number(item.unitPrice);
      const lastRefreshedAt = typeof item.lastRefreshedAt === 'string' ? item.lastRefreshedAt : '';
      if (hourly.length || daily.length || Number.isFinite(unitPrice) || lastRefreshedAt) {
        out[key] = { hourly, daily };
        if (Number.isFinite(unitPrice)) out[key].unitPrice = unitPrice;
        if (lastRefreshedAt) out[key].lastRefreshedAt = lastRefreshedAt;
      }
    });
    return out;
  }

  function cleanTrendSeries(series) {
    if (!Array.isArray(series)) return [];
    return series.map((point) => {
      const avgUnitPrice = Number(point && point.avgUnitPrice);
      const bucketStartedAt = typeof (point && point.bucketStartedAt) === 'string' ? point.bucketStartedAt : '';
      if (!bucketStartedAt || !Number.isFinite(avgUnitPrice)) return null;
      return { bucketStartedAt, avgUnitPrice };
    }).filter(Boolean).sort((a, b) => Date.parse(a.bucketStartedAt) - Date.parse(b.bucketStartedAt));
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
    const changeRates = (state.priceChangeRates && state.priceChangeRates.shop) || {};
    const rows = SEEDS.map((seed) => {
      const price = Number(prices[seed.id]);
      const previousPrice = Number((state.previousPrices.shop || {})[seed.id]);
      const capturedRate = Number(changeRates[seed.id]);
      const trendChange = trendChangeForSeed(seed.id);
      const alertTrendChange = trendChangeForSeed(seed.id, PRICE_CHANGE_ALERT_WINDOW, true);
      const hasPrice = Number.isFinite(price);
      const hasPreviousPrice = Number.isFinite(previousPrice);
      const priceDelta = hasPrice && hasPreviousPrice ? price - previousPrice : null;
      const computedRate = priceDelta != null && previousPrice > 0 ? (priceDelta / previousPrice) * 100 : null;
      const hasTrendRate = Number.isFinite(Number(trendChange.rate));
      const hasCapturedRate = Number.isFinite(capturedRate);
      const hasComputedRate = Number.isFinite(computedRate);
      const priceChangeRate = hasTrendRate ? trendChange.rate : (hasCapturedRate ? capturedRate : (hasComputedRate ? computedRate : null));
      const priceChangeSource = hasTrendRate ? trendChange.source : (hasCapturedRate ? 'exchange' : (hasComputedRate ? 'computed' : 'none'));
      const stats = levelStats(seed, state.config.viewLevel);
      const singleNet = hasPrice ? stats.saleYield * price : null;
      const hourly = hasPrice ? singleNet / stats.growthHours : null;
      const singleDaily = hasPrice ? singleNet * stats.dailyCycles : null;
      const totalDaily = hasPrice ? totalDailyForSeed(seed, price) : null;
      const expPerCrop = seed.experienceValue;
      const expPerHarvest = expPerCrop * stats.grossYield;
      const expHourly = expPerHarvest / stats.growthHours;
      const expSingleDaily = expPerHarvest * stats.dailyCycles;
      const expTotalDaily = totalDailyExpForSeed(seed);
      const priceAlertRate = Number.isFinite(Number(alertTrendChange.rate)) ? alertTrendChange.rate : null;
      return { seed, price: hasPrice ? price : null, previousPrice: hasPreviousPrice ? previousPrice : null, priceDelta, priceChangeRate, priceChangeSource, priceChangeBaseAt: trendChange.baseAt || '', priceTrendUpdatedAt: trendChange.updatedAt || '', priceAlertRate, priceAlertBaseAt: alertTrendChange.baseAt || '', priceAlertUpdatedAt: alertTrendChange.updatedAt || '', stats, singleNet, hourly, singleDaily, totalDaily, expPerHarvest, expHourly, expSingleDaily, expTotalDaily };
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

  function theoreticalDailyExpForSeed(seed) {
    return state.config.landCounts.reduce((sum, count, index) => {
      if (!count) return sum;
      const stats = levelStats(seed, index + 1);
      return sum + count * seed.experienceValue * stats.grossYield * (24 / stats.growthHours);
    }, 0);
  }

  function bestTheoreticalDailyExperience() {
    if (!totalLands()) return null;
    return SEEDS.reduce((best, seed) => {
      const value = theoreticalDailyExpForSeed(seed);
      if (!best || value > best.value) return { seed, value };
      return best;
    }, null);
  }

  function farmLevelRequirement(level) {
    const currentLevel = clampInt(level, 1, MAX_FARM_LEVEL, 1);
    if (currentLevel >= MAX_FARM_LEVEL) return 0;
    return FIRST_LEVEL_EXP * Math.pow(LEVEL_EXP_GROWTH, currentLevel - 1);
  }

  function farmLevelProgress(totalExperience) {
    const totalExp = normalizeTotalExperience(totalExperience);
    let level = 1;
    let levelStartExp = 0;

    while (level < MAX_FARM_LEVEL) {
      const required = farmLevelRequirement(level);
      if (totalExp < levelStartExp + required) {
        return {
          level,
          nextLevel: level + 1,
          remainingExp: levelStartExp + required - totalExp,
          isMaxLevel: false
        };
      }
      levelStartExp += required;
      level += 1;
    }

    return { level: MAX_FARM_LEVEL, nextLevel: null, remainingExp: 0, isMaxLevel: true };
  }

  function formatUpgradeDuration(days) {
    const value = Number(days);
    if (!Number.isFinite(value) || value < 0) return '暂无';
    const totalMinutes = Math.ceil(value * 24 * 60);
    if (totalMinutes <= 1) return '< 1 分钟';
    if (totalMinutes < 60) return `${totalMinutes} 分钟`;
    const totalHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (totalHours < 24) return `${totalHours} 小时${minutes ? ` ${minutes} 分钟` : ''}`;
    const daysPart = Math.floor(totalHours / 24);
    const hoursPart = totalHours % 24;
    return `${daysPart} 天${hoursPart ? ` ${hoursPart} 小时` : ''}`;
  }

  function dailyCycleLabel() {
    return state.config.cycleMode === 'full24' ? '24h' : `${state.config.activeHours}h`;
  }

  function trendWindowLabel() {
    return ['1h', '6h', '12h', '24h', '7d'].includes(state.config.trendWindow) ? state.config.trendWindow : '24h';
  }

  function trendWindowConfig(value) {
    const normalized = ['1h', '6h', '12h', '24h', '7d'].includes(value) ? value : trendWindowLabel();
    if (normalized === '7d') return { value: normalized, source: 'daily', ms: 7 * 24 * 60 * 60 * 1000 };
    return { value: normalized, source: 'hourly', ms: Number(normalized.replace('h', '')) * 60 * 60 * 1000 };
  }

  function trendChangeForSeed(seedId, windowValue, requireFullWindow) {
    const trend = state.priceTrends && state.priceTrends.shop && state.priceTrends.shop[seedId];
    if (!trend) return {};
    const config = trendWindowConfig(windowValue);
    const series = Array.isArray(trend[config.source]) ? trend[config.source] : [];
    const anchor = trendAnchor(series, config.ms, trend.lastRefreshedAt, requireFullWindow);
    const current = Number(trend.unitPrice);
    const base = Number(anchor && anchor.avgUnitPrice);
    if (!Number.isFinite(current) || !Number.isFinite(base) || base <= 0) return {};
    return {
      rate: ((current - base) / base) * 100,
      source: `trend-${config.source}`,
      baseAt: anchor.bucketStartedAt,
      updatedAt: trend.lastRefreshedAt || ''
    };
  }

  function trendAnchor(series, windowMs, referenceAt, requireFullWindow) {
    const points = Array.isArray(series) ? series.filter((point) => Number.isFinite(Date.parse(point.bucketStartedAt)) && Number.isFinite(Number(point.avgUnitPrice))) : [];
    if (!points.length) return null;
    const reference = Date.parse(referenceAt) || Date.now();
    const target = reference - windowMs;
    let anchor = null;
    for (const point of points) {
      const time = Date.parse(point.bucketStartedAt);
      if (time <= target) anchor = point;
      else break;
    }
    return anchor || (requireFullWindow ? null : points[0]);
  }

  function compareRows(a, b, key) {
    if (key === 'name') return a.seed.name.localeCompare(b.seed.name, 'zh-CN');
    if (key === 'price') return nullableCompare(a.price, b.price);
    if (key === 'priceChangeRate') return nullableCompare(a.priceChangeRate, b.priceChangeRate);
    if (key === 'growth') return nullableCompare(a.stats.growthHours, b.stats.growthHours);
    if (key === 'dailyCycles') return nullableCompare(a.stats.dailyCycles, b.stats.dailyCycles);
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

  function bestPriceRiseRow(rows) {
    return rows.reduce((current, row) => {
      const rate = Number(row.priceAlertRate);
      if (!Number.isFinite(rate) || rate < PRICE_CHANGE_ALERT_THRESHOLD) return current;
      if (!current || rate > Number(current.priceAlertRate)) return row;
      return current;
    }, null);
  }

  function topPriceRiseAlert(rows) {
    const best = bestPriceRiseRow(rows);
    if (!best) return '';
    return `<div class="top-alert" title="${escapeHtml(priceAlertRateTitle(best))}"><span class="top-alert-label">1h 涨幅异常</span><strong>${escapeHtml(best.seed.name)}</strong><span>${formatSignedPercent(best.priceAlertRate)}</span><span>${formatUsd(best.price)}</span></div>`;
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
          ${topPriceRiseAlert(rows)}
          <button class="topbar-link history-link ${state.view === 'history' ? 'active' : ''}" data-view="history" title="查看历史记录和涨跌异常">历史 ${state.historyCount} 条</button>
          <button class="theme-toggle" data-action="theme" aria-label="${themeLabel()}" title="${themeLabel()}">${themeIcon()}</button>
          <a class="github-link" href="https://github.com/GuDong2003/hyb-farm-dashboard" target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub">
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.59 7.59 0 0 1 8 3.86c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
        </header>
        <main class="main">
          ${state.view === 'settings' ? renderSettings() : state.view === 'history' ? renderHistoryView() : renderTableView(rows, bestRevenue, bestExpDay, bestExpHour)}
        </main>
      </div>
    `;
    bindEvents();
  }

  function renderHistoryView() {
    const alerts = state.historyAlerts || {};
    const cloud = alerts.cloud || emptyHistoryResult();
    const local = alerts.local || Object.assign(emptyHistoryResult(), { totalSnapshots: state.historyCount });
    return `
      <div class="history-view">
        <section class="history-head">
          <div class="history-title">
            <h2>历史记录</h2>
            <p>按作物显示相邻历史价格中涨跌幅超过 ${formatNumber(PRICE_CHANGE_ALERT_THRESHOLD, 0)}% 的异常记录。</p>
          </div>
          <div class="history-stats">
            <span class="history-stat-chip"><span>本地历史</span><strong>${state.historyCount}</strong><span>条</span></span>
            <span class="history-stat-chip"><span>云端快照</span><strong>${cloud.totalSnapshots}</strong><span>条</span></span>
            <span class="history-stat-chip"><span>异常</span><strong>${cloud.eventCount + local.eventCount}</strong><span>条</span></span>
            <button class="btn" data-action="refresh-history">刷新历史</button>
          </div>
        </section>
        ${state.historyError ? `<div class="history-error">历史读取失败：${escapeHtml(state.historyError)}</div>` : ''}
        ${state.historyLoading ? '<div class="history-empty">正在读取历史记录...</div>' : ''}
        ${renderHistorySection('云端已上传历史', '来自 D1 中已被接受的上传快照，可回看你已经上传过的历史价格。', cloud)}
        ${renderHistorySection('本地浏览器历史', '来自当前浏览器 IndexedDB 中保存的导入快照，未上传云端的历史也会在这里参与计算。', local)}
      </div>
    `;
  }

  function renderHistoryLineChart(group, result) {
    const events = (Array.isArray(group && group.events) ? group.events : [])
      .slice()
      .sort((a, b) => Number(a.previousCapturedAt || a.capturedAt) - Number(b.previousCapturedAt || b.capturedAt));
    const seriesItem = (Array.isArray(result && result.series) ? result.series : [])
      .find((item) => item.seedId === group.seedId);
    const seriesPoints = seriesItem && Array.isArray(seriesItem.points)
      ? seriesItem.points.filter((point) => Number.isFinite(Number(point.capturedAt)) && Number.isFinite(Number(point.price)))
        .map((point) => ({ capturedAt: Number(point.capturedAt), price: Number(point.price) }))
        .sort((a, b) => a.capturedAt - b.capturedAt)
      : [];
    const points = seriesPoints.length >= 2 ? seriesPoints : anomalyChartPoints(events);
    if (points.length < 2) {
      return `
        <aside class="history-line-panel">
          <div class="history-line-head"><strong>完整价格趋势</strong><span>暂无</span></div>
          <div class="history-line-empty">趋势数据不足</div>
        </aside>
      `;
    }

    const width = 420;
    const height = 250;
    const pad = { left: 48, right: 14, top: 14, bottom: 30 };
    const minTime = points[0].capturedAt;
    const maxTime = points[points.length - 1].capturedAt;
    const prices = points.map((point) => point.price);
    let minPrice = Math.min(...prices);
    let maxPrice = Math.max(...prices);
    if (minPrice === maxPrice) {
      minPrice = Math.max(0, minPrice * 0.9);
      maxPrice = maxPrice * 1.1 + 1;
    }
    const pricePad = (maxPrice - minPrice) * 0.12;
    minPrice = Math.max(0, minPrice - pricePad);
    maxPrice += pricePad;
    const plotHeight = height - pad.top - pad.bottom;
    const x = (time) => pad.left + ((time - minTime) / Math.max(1, maxTime - minTime)) * (width - pad.left - pad.right);
    const y = (price) => pad.top + (1 - ((price - minPrice) / Math.max(1, maxPrice - minPrice))) * plotHeight;
    const path = points.map((point, index) => `${index ? 'L' : 'M'} ${formatNumber(x(point.capturedAt), 2)} ${formatNumber(y(point.price), 2)}`).join(' ');
    const highlights = events.map((event) => {
      const previousCapturedAt = Number(event.previousCapturedAt);
      const capturedAt = Number(event.capturedAt);
      const previousPrice = Number(event.previousPrice);
      const currentPrice = Number(event.currentPrice);
      if (![previousCapturedAt, capturedAt, previousPrice, currentPrice].every(Number.isFinite)) return '';
      if (capturedAt < minTime || previousCapturedAt > maxTime) return '';
      const direction = Number(event.changeRate) > 0 ? 'up' : 'down';
      const startX = x(previousCapturedAt);
      const endX = x(capturedAt);
      const title = `${formatTime(previousCapturedAt)} → ${formatTime(capturedAt)}，${formatUsd(previousPrice)} → ${formatUsd(currentPrice)}（${formatSignedPercent(event.changeRate)}）`;
      return `<g class="history-line-anomaly ${direction}"><title>${escapeHtml(title)}</title><rect class="history-line-anomaly-band" x="${formatNumber(Math.min(startX, endX), 2)}" y="${pad.top}" width="${formatNumber(Math.max(2, Math.abs(endX - startX)), 2)}" height="${plotHeight}"></rect><line class="history-line-anomaly-segment" x1="${formatNumber(startX, 2)}" y1="${formatNumber(y(previousPrice), 2)}" x2="${formatNumber(endX, 2)}" y2="${formatNumber(y(currentPrice), 2)}"></line><circle class="history-line-anomaly-start" cx="${formatNumber(startX, 2)}" cy="${formatNumber(y(previousPrice), 2)}" r="3"></circle><circle class="history-line-marker ${direction}" cx="${formatNumber(endX, 2)}" cy="${formatNumber(y(currentPrice), 2)}" r="4"></circle></g>`;
    }).join('');
    const yTicks = [0, 0.5, 1].map((ratio) => {
      const tickY = pad.top + ratio * plotHeight;
      const value = maxPrice - (maxPrice - minPrice) * ratio;
      return `<g><line class="history-line-grid" x1="${pad.left}" y1="${formatNumber(tickY, 2)}" x2="${width - pad.right}" y2="${formatNumber(tickY, 2)}"></line><text class="history-line-label" x="${pad.left - 8}" y="${formatNumber(tickY + 4, 2)}" text-anchor="end">${escapeHtml(formatUsd(value))}</text></g>`;
    }).join('');
    const pointMarkers = points.length <= 120
      ? points.map((point) => `<circle class="history-line-point" cx="${formatNumber(x(point.capturedAt), 2)}" cy="${formatNumber(y(point.price), 2)}" r="2"><title>${escapeHtml(`${formatTime(point.capturedAt)} ${formatUsd(point.price)}`)}</title></circle>`).join('')
      : '';
    const first = points[0];
    const last = points[points.length - 1];
    const totalChange = first.price > 0 ? ((last.price - first.price) / first.price) * 100 : null;
    const rangeMs = maxTime - minTime;
    return `
      <aside class="history-line-panel">
        <div class="history-line-head"><strong>完整价格趋势</strong><span>${points.length} 点 · ${events.length} 处异常</span></div>
        <div class="history-line-chart-wrap">
          <svg class="history-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(group.seedId)} 完整价格趋势及异常区间" preserveAspectRatio="xMidYMid meet">
            <rect class="history-line-bg" x="0" y="0" width="${width}" height="${height}"></rect>
            ${yTicks}
            <path class="history-line-path" d="${path}"></path>
            ${pointMarkers}
            ${highlights}
            <text class="history-line-label" x="${pad.left}" y="${height - 8}" text-anchor="start">${escapeHtml(formatChartDate(first.capturedAt, rangeMs))}</text>
            <text class="history-line-label" x="${width - pad.right}" y="${height - 8}" text-anchor="end">${escapeHtml(formatChartDate(last.capturedAt, rangeMs))}</text>
          </svg>
        </div>
        <div class="history-line-meta"><span>${formatUsd(first.price)}</span><span class="${Number(totalChange) > 0 ? 'up' : Number(totalChange) < 0 ? 'down' : ''}">${formatSignedPercent(totalChange)}</span><span>${formatUsd(last.price)}</span></div>
      </aside>
    `;
  }

  function anomalyChartPoints(events) {
    const out = [];
    const seen = new Set();
    events.forEach((event) => {
      const previousCapturedAt = Number(event.previousCapturedAt);
      const capturedAt = Number(event.capturedAt);
      const previousPrice = Number(event.previousPrice);
      const currentPrice = Number(event.currentPrice);
      if (Number.isFinite(previousCapturedAt) && Number.isFinite(previousPrice)) {
        const key = `${previousCapturedAt}:prev:${previousPrice}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ capturedAt: previousCapturedAt, price: previousPrice, kind: 'previous' });
        }
      }
      if (Number.isFinite(capturedAt) && Number.isFinite(currentPrice)) {
        const key = `${capturedAt}:current:${currentPrice}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ capturedAt, price: currentPrice, kind: 'current' });
        }
      }
    });
    return out.sort((a, b) => a.capturedAt - b.capturedAt);
  }

  function renderHistorySection(title, note, result) {
    const data = result || { threshold: PRICE_CHANGE_ALERT_THRESHOLD, totalSnapshots: 0, eventCount: 0, groups: [] };
    return `
      <section class="history-section">
        <div class="history-section-head">
          <div class="history-section-title">
            <h2>${escapeHtml(title)}</h2>
            <p class="history-section-note">${escapeHtml(note)}</p>
          </div>
          <div class="history-stats">
            <span class="history-stat-chip"><span>快照</span><strong>${data.totalSnapshots}</strong></span>
            <span class="history-stat-chip"><span>异常</span><strong>${data.eventCount}</strong></span>
          </div>
        </div>
        ${data.eventCount ? `<div class="history-groups">${data.groups.map((group) => renderHistoryGroup(group, data)).join('')}</div>` : '<div class="history-empty">暂无超过阈值的涨跌异常。</div>'}
      </section>
    `;
  }

  function renderHistoryGroup(group, result) {
    const seed = SEED_BY_ID[group.seedId] || { id: group.seedId, name: group.seedId, isVipOnly: false };
    return `
      <div class="history-group">
        <div class="history-group-head">
          <img class="history-crop-icon" src="./assets/crops/${escapeHtml(seed.id)}.png" alt="" loading="lazy" onerror="this.style.display='none'" />
          <strong>${escapeHtml(seed.name)}</strong>
          <span>${escapeHtml(seed.id)} · ${group.events.length} 条</span>
        </div>
        <div class="history-group-body">
          <div class="history-rows">
            <div class="history-row history-row-head">
              <div>记录时间</div>
              <div>上一条时间</div>
              <div class="history-price">上一价格</div>
              <div class="history-price">当前价格</div>
              <div class="history-price">涨跌幅</div>
            </div>
            ${group.events.map(renderHistoryEvent).join('')}
          </div>
          ${renderHistoryLineChart(group, result)}
        </div>
      </div>
    `;
  }

  function renderHistoryEvent(event) {
    const direction = Number(event.changeRate) > 0 ? 'up' : 'down';
    return `
      <div class="history-row">
        <div>${formatTime(event.capturedAt)}</div>
        <div>${event.previousCapturedAt ? formatTime(event.previousCapturedAt) : '-'}</div>
        <div class="history-price">${formatUsd(event.previousPrice)}</div>
        <div class="history-price">${formatUsd(event.currentPrice)}</div>
        <div class="history-rate ${direction}">${formatSignedPercent(event.changeRate)}</div>
      </div>
    `;
  }

  function renderFarmExperienceResult() {
    const progress = farmLevelProgress(state.config.currentTotalExp);
    const bestDailyExp = bestTheoreticalDailyExperience();

    if (progress.isMaxLevel) {
      return `
        <span>当前 <strong>Lv${MAX_FARM_LEVEL}</strong></span>
        <span><strong>已满级</strong></span>
        ${bestDailyExp ? `<span>理论 <strong>${escapeHtml(bestDailyExp.seed.name)} ${formatNumber(bestDailyExp.value, 2)}/天</strong></span>` : '<span>理论 <strong>请先设置地块</strong></span>'}
      `;
    }

    const upgradeDays = bestDailyExp && bestDailyExp.value > 0 ? progress.remainingExp / bestDailyExp.value : null;
    return `
      <span>当前 <strong>Lv${progress.level}</strong></span>
      <span>距 Lv${progress.nextLevel} <strong>${formatNumber(progress.remainingExp, 2)} 经验</strong></span>
      ${bestDailyExp ? `<span>理论 <strong>${escapeHtml(bestDailyExp.seed.name)} ${formatNumber(bestDailyExp.value, 2)}/天</strong></span>` : '<span>理论 <strong>请先设置地块</strong></span>'}
      <span>升级约 <strong>${upgradeDays == null ? '暂无' : formatUpgradeDuration(upgradeDays)}</strong></span>
    `;
  }

  function renderFarmExperienceCalculator() {
    return `
      <div class="experience-calculator">
        <label class="experience-input-field">当前总经验
          <input id="currentTotalExp" class="field experience-total-input" type="number" min="0" step="1" inputmode="numeric" value="${state.config.currentTotalExp}" />
        </label>
        <div id="farmExperienceResult" class="experience-result" aria-live="polite">
          ${renderFarmExperienceResult()}
        </div>
      </div>
    `;
  }

  function updateFarmExperienceCalculator() {
    const result = document.getElementById('farmExperienceResult');
    if (result) result.innerHTML = renderFarmExperienceResult();
  }

  function renderTableView(rows, bestRevenue, bestExpDay, bestExpHour) {
    return `
      <section class="toolbar">
        <button class="btn primary" data-action="settings">导入</button>
        <button class="btn" data-action="refresh-prices" title="通过用户脚本立即获取交易所价格">↻ 立即刷新</button>
        <button class="btn" data-action="upload-cloud" title="上传当前价格到云端校验池">上传云端</button>
        <span class="field" style="display:inline-flex;align-items:center;border:0;background:transparent;padding:0;color:#475569;">价格来源：交易所售价</span>
        <select class="field" id="trendWindow" title="涨跌幅区间">
          <option value="1h" ${trendWindowLabel() === '1h' ? 'selected' : ''}>涨跌幅 1h</option>
          <option value="6h" ${trendWindowLabel() === '6h' ? 'selected' : ''}>涨跌幅 6h</option>
          <option value="12h" ${trendWindowLabel() === '12h' ? 'selected' : ''}>涨跌幅 12h</option>
          <option value="24h" ${trendWindowLabel() === '24h' ? 'selected' : ''}>涨跌幅 24h</option>
          <option value="7d" ${trendWindowLabel() === '7d' ? 'selected' : ''}>涨跌幅 7d</option>
        </select>
        <select class="field" id="cycleMode">
          <option value="active" ${state.config.cycleMode === 'active' ? 'selected' : ''}>${state.config.activeHours}h 活跃估算</option>
          <option value="full24" ${state.config.cycleMode === 'full24' ? 'selected' : ''}>24h 理论轮转</option>
        </select>
      </section>
      <section class="landbar">
        <div class="land-title" title="各等级分别按对应产量和生长时间参与全地汇总">全地等级分布：</div>
        ${state.config.landCounts.map((count, index) => `<label class="land-field">Lv${index + 1}<input class="mini-input land-input" data-level="${index + 1}" type="number" min="0" max="${MAX_LANDS}" value="${count}" /></label>`).join('')}
        <div class="land-title">共 ${totalLands()}/${MAX_LANDS} 块</div>
        ${renderFarmExperienceCalculator()}
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
        <span>全地指标：按左侧 Lv1～Lv7 地块数分别计算后求和；「单地指标等级」只切换表格中的单地指标</span>
        <span>收益：Σ(地块数 × (毛产量 - 1) × 售价 × 每天次数（${dailyCycleLabel()}）)</span>
        <span>单块收获经验：单作物经验 × 当前等级毛产量</span>
        <span>每天经验：Σ(地块数 × 单作物经验 × 当前等级毛产量 × 每天次数（${dailyCycleLabel()}）)</span>
        <span>单地每小时经验：单块收获经验 ÷ 当前等级生长时间（已包含地块缩时）</span>
        <span>升级时间：距下一级经验 ÷ 当前全地最高的 24h 理论经验/天</span>
        <span>涨跌幅：当前价 vs 选定区间基准价（${trendWindowLabel()}）</span>
        <span>地块等级：收益与经验产量每级 +1/3；生长时间每级 -1/15</span>
        <span>农场等级：1→2 需 100 经验，之后每级需求 ×1.5</span>
      </section>
      <section class="summary">
        <div>全地收益最优：<span>${bestRevenue ? `${escapeHtml(bestRevenue.row.seed.name)} ${formatUsd(bestRevenue.value)}/天` : '暂无'}</span></div>
        <div>全地经验/天最优：<span>${bestExpDay ? `${escapeHtml(bestExpDay.row.seed.name)} ${formatNumber(bestExpDay.value, 2)}` : '暂无'}</span></div>
        <div>单地经验/小时最优 Lv${state.config.viewLevel}：<span>${bestExpHour ? `${escapeHtml(bestExpHour.row.seed.name)} ${formatNumber(bestExpHour.value, 2)}` : '暂无'}</span></div>
        <label class="summary-level-field" title="只切换表格中的单地指标，不会改变全地混合收益和经验">单地指标等级<select id="viewLevel" class="field" aria-label="单地指标等级">${Array.from({ length: 7 }, (_, index) => `<option value="${index + 1}" ${state.config.viewLevel === index + 1 ? 'selected' : ''}>Lv${index + 1}</option>`).join('')}</select></label>
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
            <th><button data-sort="dailyCycles">每天次数 ${dailyCycleLabel()}${sortMark('dailyCycles')}</button></th>
            <th><button data-sort="price">当前售价($)${sortMark('price')}</button></th>
            <th><button data-sort="priceChangeRate">涨跌幅度${sortMark('priceChangeRate')}</button></th>
            <th><button data-sort="singleNet">单次收益${sortMark('singleNet')}</button></th>
            <th><button data-sort="hourly">小时收益(单地 Lv${state.config.viewLevel})${sortMark('hourly')}</button></th>
            <th><button data-sort="singleDaily">每天收益(单地 Lv${state.config.viewLevel})${sortMark('singleDaily')}</button></th>
            <th><button data-sort="totalDaily">每天收益(全地混合)${sortMark('totalDaily')}</button></th>
            <th><button data-sort="expPerHarvest">经验(单地 Lv${state.config.viewLevel})${sortMark('expPerHarvest')}</button></th>
            <th><button data-sort="expHourly">经验/小时(单地 Lv${state.config.viewLevel})${sortMark('expHourly')}</button></th>
            <th><button data-sort="expTotalDaily">每天经验(全地)${sortMark('expTotalDaily')}</button></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => renderRow(row, bestId === row.seed.id)).join('')}
        </tbody>
      </table>
    `;
  }

  function renderPriceChangeRate(rate) {
    const value = Number(rate);
    if (!Number.isFinite(value)) return '<span class="price-delta flat"><span class="price-delta-arrow"></span><span class="price-delta-percent">-</span></span>';
    if (Math.abs(value) < 0.000005) return '<span class="price-delta flat"><span class="price-delta-arrow">→</span><span class="price-delta-percent">0%</span></span>';
    const direction = value > 0 ? 'up' : 'down';
    const arrow = value > 0 ? '↑' : '↓';
    return `<span class="price-delta ${direction}"><span class="price-delta-arrow">${arrow}</span><span class="price-delta-percent">${formatNumber(Math.abs(value), 2)}%</span></span>`;
  }

  function priceChangeRateTitle(row) {
    if (!Number.isFinite(Number(row.priceChangeRate))) return '没有涨跌幅数据';
    const sourceText = row.priceChangeSource === 'trend-hourly'
      ? `按 ${trendWindowLabel()} 小时趋势计算`
      : row.priceChangeSource === 'trend-daily'
        ? `按 ${trendWindowLabel()} 日线趋势计算`
        : row.priceChangeSource === 'exchange'
          ? '交易所涨跌幅度'
          : '按上次价格计算的涨跌幅度';
    const baseText = row.priceChangeBaseAt ? `，基准时间：${formatTime(row.priceChangeBaseAt)}` : '';
    const updatedText = row.priceTrendUpdatedAt ? `，刷新：${formatTime(row.priceTrendUpdatedAt)}` : '';
    const deltaText = Number.isFinite(Number(row.priceDelta)) ? `，价差：${formatSignedUsd(row.priceDelta)}` : '';
    const previousText = Number.isFinite(Number(row.previousPrice)) ? `，上次价格：${formatUsd(row.previousPrice)}` : '';
    return `${sourceText}：${formatSignedPercent(row.priceChangeRate)}，当前价格：${formatUsd(row.price)}${baseText}${updatedText}${previousText}${deltaText}`;
  }

  function priceAlertRateTitle(row) {
    if (!Number.isFinite(Number(row.priceAlertRate))) return '没有完整的一小时涨幅数据';
    const baseText = row.priceAlertBaseAt ? `，基准时间：${formatTime(row.priceAlertBaseAt)}` : '';
    const updatedText = row.priceAlertUpdatedAt ? `，刷新：${formatTime(row.priceAlertUpdatedAt)}` : '';
    return `前后 1 小时涨幅：${formatSignedPercent(row.priceAlertRate)}，当前价格：${formatUsd(row.price)}${baseText}${updatedText}`;
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
        <td title="${escapeHtml(priceChangeRateTitle(row))}">${renderPriceChangeRate(row.priceChangeRate)}</td>
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
            <label class="toggle-row">
              <span class="toggle-text"><strong>涨幅异常通知</strong><small>仅当前后 1 小时涨幅达到 ${formatNumber(PRICE_CHANGE_ALERT_THRESHOLD, 0)}% 时使用浏览器通知提醒</small></span>
              <span class="toggle-control"><input id="browserPriceAlerts" type="checkbox" ${state.config.browserPriceAlerts ? 'checked' : ''} /><span class="toggle-track"></span></span>
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
            <label class="file-label">导入 JSON<input id="importFile" class="hidden-file" type="file" accept="application/json" /></label>
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
        if (state.view === 'history') {
          loadHistoryAlerts(false).then(() => render()).catch(() => render());
        }
        render();
      });
    });
    document.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', handleAction);
    });
    const cycle = document.getElementById('cycleMode');
    if (cycle) cycle.addEventListener('change', () => { state.config.cycleMode = cycle.value; saveState(); render(); });
    const trendWindow = document.getElementById('trendWindow');
    if (trendWindow) trendWindow.addEventListener('change', () => { state.config.trendWindow = trendWindow.value; saveState(); render(); });
    const viewLevel = document.getElementById('viewLevel');
    if (viewLevel) viewLevel.addEventListener('change', () => { state.config.viewLevel = clampInt(viewLevel.value, 1, 7, 1); saveState(); render(); });
    const currentTotalExp = document.getElementById('currentTotalExp');
    if (currentTotalExp) {
      currentTotalExp.addEventListener('input', () => {
        state.config.currentTotalExp = normalizeTotalExperience(currentTotalExp.value);
        saveState();
        updateFarmExperienceCalculator();
      });
    }
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
        const rateMap = state.priceChangeRates.shop || (state.priceChangeRates.shop = {});
        const trendMap = state.priceTrends.shop || (state.priceTrends.shop = {});
        const value = Number(input.value);
        if (Number.isFinite(value) && value >= 0) map[input.dataset.price] = value;
        else delete map[input.dataset.price];
        delete rateMap[input.dataset.price];
        delete trendMap[input.dataset.price];
        state.lastImportedAt = Date.now();
        state.priceOrigin = 'manual';
        state.status = '已手动更新当前价格。';
        saveState();
        maybeNotifyPriceRise();
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
    const browserPriceAlerts = document.getElementById('browserPriceAlerts');
    if (browserPriceAlerts) browserPriceAlerts.addEventListener('change', () => {
      setBrowserPriceAlerts(browserPriceAlerts.checked).then(() => render()).catch((error) => {
        state.status = `通知设置失败：${String(error && error.message || error)}`;
        render();
      });
    });
    const importFile = document.getElementById('importFile');
    if (importFile) importFile.addEventListener('change', importJsonFile);
  }

  async function handleAction(event) {
    const action = event.currentTarget.dataset.action;
    if (action === 'settings') { state.view = 'settings'; render(); return; }
    if (action === 'refresh-history') {
      await loadHistoryAlerts(true);
      render();
      return;
    }
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
    const payload = { app: 'HYB Farm Dashboard', exportedAt: new Date().toISOString(), state: { config: state.config, prices: state.prices, priceChangeRates: state.priceChangeRates, priceTrends: state.priceTrends, lastImportedAt: state.lastImportedAt }, snapshots };
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
        state.priceChangeRates = Object.assign(state.priceChangeRates || { shop: {} }, json.state.priceChangeRates || {});
        state.priceChangeRates.shop = cleanSignedNumberMap((state.priceChangeRates && state.priceChangeRates.shop) || {});
        state.priceTrends = Object.assign(state.priceTrends || { shop: {} }, json.state.priceTrends || {});
        state.priceTrends.shop = cleanTrendMap((state.priceTrends && state.priceTrends.shop) || {});
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

  async function setBrowserPriceAlerts(enabled) {
    if (!enabled) {
      state.config.browserPriceAlerts = false;
      state.status = '已关闭涨幅异常通知。';
      saveState();
      return;
    }
    if (!('Notification' in window)) {
      state.config.browserPriceAlerts = false;
      state.status = '当前浏览器不支持系统通知。';
      saveState();
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      state.config.browserPriceAlerts = false;
      state.status = '浏览器未授予通知权限，已关闭涨幅异常通知。';
      saveState();
      return;
    }
    state.config.browserPriceAlerts = true;
    state.status = '已开启涨幅异常通知。';
    saveState();
    maybeNotifyPriceRise(true);
  }

  function maybeNotifyPriceRise(force) {
    if (!state.config.browserPriceAlerts) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const row = bestPriceRiseRow(computeRows());
    if (!row) return;
    const rate = Number(row.priceAlertRate);
    const capturedAt = Number(state.lastImportedAt) || 0;
    const alertKey = `${row.seed.id}:${capturedAt}:${formatNumber(rate, 2)}:${formatNumber(row.price, 5)}`;
    if (!force && state.config.notifiedPriceAlertKey === alertKey) return;
    state.config.notifiedPriceAlertKey = alertKey;
    saveState();
    const notification = new Notification('HYB Farm 1h 涨幅异常', {
      body: `${row.seed.name} 前后 1 小时涨幅 ${formatSignedPercent(rate)}，价格 ${formatUsd(row.price)}`,
      tag: `hyb-price-rise-${row.seed.id}`,
      renotify: true
    });
    notification.onclick = () => {
      window.focus();
      state.view = 'table';
      render();
    };
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
    const numeric = Number(value);
    const raw = Number.isFinite(numeric) && String(value).trim() !== '' ? numeric : Date.parse(value);
    const date = new Date(raw);
    if (!Number.isFinite(date.getTime())) return '暂无';
    return date.toLocaleString('zh-CN', { hour12: false });
  }

  function formatChartDate(value, rangeMs) {
    const date = new Date(Number(value));
    if (!Number.isFinite(date.getTime())) return '暂无';
    if (Number(rangeMs) <= 48 * 60 * 60 * 1000) {
      return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
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
