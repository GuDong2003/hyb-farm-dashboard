(function (root) {
  'use strict';

  const HOUR_MS = 60 * 60 * 1000;
  const DAY_MS = 24 * HOUR_MS;
  const BEIJING_OFFSET_MS = 8 * HOUR_MS;
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
    return normalizeWindow(value, 'all') !== 'all';
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
    const start = Number(minTime);
    const end = Number(maxTime);
    const duration = end - start;
    const windowMs = windowMilliseconds(value, 'all');
    if (!Number.isFinite(duration) || duration <= 0 || !windowMs || duration <= windowMs) return baseWidth;
    return baseWidth * duration / windowMs;
  }

  function visibleTimeRange(scrollLeft, scrollWidth, clientWidth, minTime, maxTime, selectedWindowMs) {
    const start = Number(minTime);
    const end = Number(maxTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { start, end };

    const viewportWidth = Math.max(1, Number(clientWidth) || 1);
    const contentWidth = Math.max(viewportWidth, Number(scrollWidth) || viewportWidth);
    const maximumScroll = Math.max(0, contentWidth - viewportWidth);
    const offset = Math.min(maximumScroll, Math.max(0, Number(scrollLeft) || 0));
    const duration = end - start;
    const windowMs = Number(selectedWindowMs);
    if (Number.isFinite(windowMs) && windowMs > 0 && windowMs < duration) {
      const scrollRatio = maximumScroll > 0 ? offset / maximumScroll : 1;
      const visibleStart = start + (duration - windowMs) * scrollRatio;
      return { start: visibleStart, end: visibleStart + windowMs };
    }
    return {
      start: start + (offset / contentWidth) * duration,
      end: start + (Math.min(contentWidth, offset + viewportWidth) / contentWidth) * duration
    };
  }

  root.HYBChartTime = Object.freeze({
    HOUR_MS,
    DAY_MS,
    normalizeWindow,
    windowMilliseconds,
    isScrollableWindow,
    beijingDaySlots,
    plotWidth,
    visibleTimeRange
  });
})(typeof globalThis === 'object' ? globalThis : this);
