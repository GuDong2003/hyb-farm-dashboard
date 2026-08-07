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

  function navigationStepMilliseconds(value, fallback) {
    const normalized = normalizeWindow(value, fallback);
    if (normalized === 'all') return 0;
    return normalized === '7d' || normalized === '30d' ? DAY_MS : HOUR_MS;
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

  function sampleSlots(slotsValue, maxCountValue) {
    const slots = Array.isArray(slotsValue) ? slotsValue : [];
    const maxCount = Math.max(2, Math.floor(Number(maxCountValue) || 2));
    if (slots.length <= maxCount) return slots.slice();
    return Array.from(
      { length: maxCount },
      (_, index) => slots[Math.round(index * (slots.length - 1) / (maxCount - 1))]
    );
  }

  function clampVisibleEnd(minValue, maxValue, windowValue, visibleEndValue) {
    const minTime = Number(minValue);
    const maxTime = Number(maxValue);
    const windowMs = Number(windowValue);
    if (!Number.isFinite(minTime) || !Number.isFinite(maxTime) || maxTime <= minTime) return maxTime;
    if (!Number.isFinite(windowMs) || windowMs <= 0 || maxTime - minTime <= windowMs) return maxTime;
    const earliestEnd = minTime + windowMs;
    const hintedEnd = visibleEndValue == null ? maxTime : Number(visibleEndValue);
    const visibleEnd = Number.isFinite(hintedEnd) ? hintedEnd : maxTime;
    return Math.min(maxTime, Math.max(earliestEnd, visibleEnd));
  }

  function visibleRange(minValue, maxValue, windowValue, visibleEndValue) {
    const minTime = Number(minValue);
    const maxTime = Number(maxValue);
    const windowMs = Number(windowValue);
    if (!Number.isFinite(minTime) || !Number.isFinite(maxTime) || maxTime <= minTime) {
      return { start: minTime, end: maxTime };
    }
    if (!Number.isFinite(windowMs) || windowMs <= 0 || maxTime - minTime <= windowMs) {
      return { start: minTime, end: maxTime };
    }
    const end = clampVisibleEnd(minTime, maxTime, windowMs, visibleEndValue);
    return { start: end - windowMs, end };
  }

  function shiftVisibleEnd(currentEndValue, pixelDeltaValue, viewportWidthValue, windowValue, minValue, maxValue) {
    const currentEnd = Number(currentEndValue);
    const pixelDelta = Number(pixelDeltaValue);
    const viewportWidth = Math.max(1, Number(viewportWidthValue) || 1);
    const windowMs = Number(windowValue);
    const nextEnd = currentEnd + ((Number.isFinite(pixelDelta) ? pixelDelta : 0) / viewportWidth) * windowMs;
    return clampVisibleEnd(minValue, maxValue, windowMs, nextEnd);
  }

  function shiftVisibleEndBySteps(currentEnd, stepCount, stepMs, windowMs, minTime, maxTime) {
    return clampVisibleEnd(
      minTime,
      maxTime,
      windowMs,
      Number(currentEnd) + Number(stepCount) * Number(stepMs)
    );
  }

  function wheelNavigationDelta(deltaXValue, deltaYValue) {
    const deltaX = Number(deltaXValue) || 0;
    const deltaY = Number(deltaYValue) || 0;
    return Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : -deltaY;
  }

  function snapVisibleEnd(value, stepMsValue, windowMs, minTime, maxTime) {
    const stepMs = Number(stepMsValue);
    if (!Number.isFinite(stepMs) || stepMs <= 0) {
      return clampVisibleEnd(minTime, maxTime, windowMs, value);
    }
    const stepsFromLatest = Math.round((Number(maxTime) - Number(value)) / stepMs);
    return clampVisibleEnd(minTime, maxTime, windowMs, Number(maxTime) - stepsFromLatest * stepMs);
  }

  root.HYBChartTime = Object.freeze({
    HOUR_MS,
    DAY_MS,
    normalizeWindow,
    windowMilliseconds,
    navigationStepMilliseconds,
    beijingDaySlots,
    sampleSlots,
    clampVisibleEnd,
    visibleRange,
    shiftVisibleEnd,
    shiftVisibleEndBySteps,
    wheelNavigationDelta,
    snapVisibleEnd
  });
})(typeof globalThis === 'object' ? globalThis : this);
