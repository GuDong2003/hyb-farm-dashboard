(function (root) {
  'use strict';

  const WINDOW = '24h';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
  const DEFAULT_NORMAL_THRESHOLD = 8;
  const DEFAULT_ANOMALY_THRESHOLD = 20;

  function numberValue(value) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string' || value.trim() === '') return Number.NaN;
    return Number(value);
  }

  function validateThresholds(normalValue, anomalyValue) {
    const normalThreshold = numberValue(normalValue);
    const anomalyThreshold = numberValue(anomalyValue);
    if (!Number.isFinite(normalThreshold) || normalThreshold < 0) {
      return { ok: false, message: '普通预警阈值必须是不小于 0 的数字。' };
    }
    if (!Number.isFinite(anomalyThreshold) || anomalyThreshold < 0) {
      return { ok: false, message: '异常预警阈值必须是不小于 0 的数字。' };
    }
    if (anomalyThreshold <= normalThreshold) {
      return { ok: false, message: '异常预警阈值必须严格大于普通预警阈值。' };
    }
    return { ok: true, normalThreshold, anomalyThreshold, message: '' };
  }

  function evaluate(rows, normalValue, anomalyValue) {
    const validation = validateThresholds(normalValue, anomalyValue);
    const normalThreshold = validation.ok ? validation.normalThreshold : DEFAULT_NORMAL_THRESHOLD;
    const anomalyThreshold = validation.ok ? validation.anomalyThreshold : DEFAULT_ANOMALY_THRESHOLD;
    const items = (Array.isArray(rows) ? rows : []).reduce((result, row) => {
      const rate = numberValue(row && row.priceAlertRate);
      if (!Number.isFinite(rate) || rate < normalThreshold) return result;
      const seed = row && row.seed ? row.seed : {};
      const seedId = seed.id == null ? '' : String(seed.id);
      if (seedId.trim() === '') return result;
      const name = seed.name == null ? '' : String(seed.name);
      result.push({
        row,
        seedId,
        name,
        rate,
        price: numberValue(row && row.price),
        severity: rate >= anomalyThreshold ? 'anomaly' : 'normal'
      });
      return result;
    }, []);

    items.sort((left, right) => right.rate - left.rate || left.name.localeCompare(right.name, 'zh-CN'));
    const anomalyCount = items.filter((item) => item.severity === 'anomaly').length;
    return {
      items,
      total: items.length,
      anomalyCount,
      normalCount: items.length - anomalyCount,
      highest: items[0] || null,
      normalThreshold,
      anomalyThreshold
    };
  }

  function beijingDateKey(value) {
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (!Number.isFinite(time)) return '';
    const shifted = new Date(time + BEIJING_OFFSET_MS);
    const year = shifted.getUTCFullYear();
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const day = String(shifted.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function normalizedIds(seedIds) {
    return [...new Set((Array.isArray(seedIds) ? seedIds : [])
      .filter((seedId) => seedId !== null && seedId !== undefined && String(seedId) !== '')
      .map((seedId) => String(seedId)))];
  }

  function normalizeSuppression(value, now) {
    const date = beijingDateKey(now);
    const source = value && typeof value === 'object' ? value : {};
    return {
      date,
      seedIds: source.date === date ? normalizedIds(source.seedIds) : []
    };
  }

  function addSuppressedCrops(value, seedIds, now) {
    const suppression = normalizeSuppression(value, now);
    return {
      date: suppression.date,
      seedIds: normalizedIds([...suppression.seedIds, ...normalizedIds(seedIds)])
    };
  }

  function unsuppressedItems(items, value, now) {
    const suppressedIds = new Set(normalizeSuppression(value, now).seedIds);
    return (Array.isArray(items) ? items : []).filter((item) => !suppressedIds.has(String(item && item.seedId)));
  }

  function batchKey(capturedAt, items) {
    const entries = (Array.isArray(items) ? items : []).map((item) => [
      item && item.seedId == null ? '' : String(item && item.seedId),
      item && item.rate,
      item && item.price
    ]).sort((left, right) => {
      const leftKey = JSON.stringify(left);
      const rightKey = JSON.stringify(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
    return JSON.stringify([capturedAt, entries]);
  }

  function hasCompleteTrendMap(trends, seedIds) {
    const ids = normalizedIds(seedIds);
    if (!ids.length) return false;
    const source = trends && typeof trends === 'object' ? trends : {};
    return ids.every((seedId) => {
      const trend = source[seedId];
      const referenceAt = Date.parse(trend && trend.lastRefreshedAt);
      const unitPrice = numberValue(trend && trend.unitPrice);
      if (!trend || !Number.isFinite(referenceAt) || !Number.isFinite(unitPrice) || !Array.isArray(trend.hourly)) return false;
      const targetAt = referenceAt - DAY_MS;
      return trend.hourly.some((point) => {
        const bucketAt = Date.parse(point && point.bucketStartedAt);
        const avgUnitPrice = numberValue(point && point.avgUnitPrice);
        return Number.isFinite(bucketAt) && bucketAt <= targetAt && Number.isFinite(avgUnitPrice) && avgUnitPrice > 0;
      });
    });
  }

  function shouldUseCloudTrendMap(localTrends, cloudTrends, seedIds) {
    return hasCompleteTrendMap(cloudTrends, seedIds) && !hasCompleteTrendMap(localTrends, seedIds);
  }

  root.HYBPriceAlert = Object.freeze({
    WINDOW,
    DAY_MS,
    DEFAULT_NORMAL_THRESHOLD,
    DEFAULT_ANOMALY_THRESHOLD,
    validateThresholds,
    evaluate,
    beijingDateKey,
    normalizeSuppression,
    addSuppressedCrops,
    unsuppressedItems,
    batchKey,
    shouldUseCloudTrendMap
  });
})(typeof globalThis === 'object' ? globalThis : this);
