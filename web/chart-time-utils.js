(function (root) {
  'use strict';

  const HOUR_MS = 60 * 60 * 1000;
  const DAY_MS = 24 * HOUR_MS;
  const BEIJING_OFFSET_MS = 8 * HOUR_MS;
  const DAY_WIDTH = 120;
  const WINDOWS = ['1h', '6h', '12h', '24h', '7d', '30d', 'all'];

  function normalizeWindow(value, fallback) {
    if (WINDOWS.includes(value)) return value;
    return WINDOWS.includes(fallback) ? fallback : '24h';
  }

  function windowMilliseconds(value, fallback) {
    const normalized = normalizeWindow(value, fallback);
    if (normalized === 'all') return 0;
    if (normalized === '7d') return 7 * DAY_MS;
    if (normalized === '30d') return 30 * DAY_MS;
    return Number(normalized.replace('h', '')) * HOUR_MS;
  }

  function isScrollableWindow(value) {
    return ['7d', '30d', 'all'].includes(value);
  }

  function formatBeijingDay(dayStartedAt) {
    const shifted = new Date(dayStartedAt + BEIJING_OFFSET_MS);
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const day = String(shifted.getUTCDate()).padStart(2, '0');
    return `${month}-${day}`;
  }

  function beijingDaySlots(minValue, maxValue) {
    const minTime = Number(minValue);
    const maxTime = Number(maxValue);
    if (!Number.isFinite(minTime) || !Number.isFinite(maxTime) || maxTime <= minTime) return [];
    const firstDayStartedAt = Math.floor((minTime + BEIJING_OFFSET_MS) / DAY_MS) * DAY_MS - BEIJING_OFFSET_MS;
    const slots = [];
    for (let dayStartedAt = firstDayStartedAt; dayStartedAt < maxTime; dayStartedAt += DAY_MS) {
      const visibleStartedAt = Math.max(minTime, dayStartedAt);
      const visibleEndedAt = Math.min(maxTime, dayStartedAt + DAY_MS);
      if (visibleEndedAt <= visibleStartedAt) continue;
      slots.push({
        dayStartedAt,
        boundaryAt: dayStartedAt > minTime ? dayStartedAt : null,
        labelAt: visibleStartedAt + (visibleEndedAt - visibleStartedAt) / 2,
        label: formatBeijingDay(dayStartedAt)
      });
    }
    return slots;
  }

  function plotWidth(value, minTime, maxTime, minimumWidth) {
    const baseWidth = Math.max(1, Number(minimumWidth) || 420);
    if (!isScrollableWindow(value)) return baseWidth;
    return Math.max(baseWidth, beijingDaySlots(minTime, maxTime).length * DAY_WIDTH);
  }

  root.HYBChartTime = Object.freeze({
    HOUR_MS,
    DAY_MS,
    DAY_WIDTH,
    normalizeWindow,
    windowMilliseconds,
    isScrollableWindow,
    beijingDaySlots,
    plotWidth
  });
})(typeof globalThis === 'object' ? globalThis : this);
