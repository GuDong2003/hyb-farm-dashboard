import test from 'node:test';
import assert from 'node:assert/strict';

await import('../web/chart-time-utils.js');

const chartTime = globalThis.HYBChartTime;

test('30d maps to a thirty-day window', () => {
  assert.equal(chartTime.normalizeWindow('30d', '24h'), '30d');
  assert.equal(chartTime.windowMilliseconds('30d', '24h'), 30 * 24 * 60 * 60 * 1000);
});

test('Beijing day slots include every intersecting calendar date', () => {
  const minTime = Date.parse('2026-08-01T20:00:00.000Z'); // 08-02 04:00 in Beijing
  const maxTime = Date.parse('2026-08-03T04:00:00.000Z'); // 08-03 12:00 in Beijing
  const slots = chartTime.beijingDaySlots(minTime, maxTime);

  assert.deepEqual(slots.map((slot) => slot.label), ['08-02', '08-03']);
  assert.equal(slots[0].boundaryAt, null);
  assert.equal(slots[1].boundaryAt, Date.parse('2026-08-02T16:00:00.000Z'));
  assert.ok(slots[0].labelAt < slots[1].labelAt);
});

test('finite windows default to the latest exact range', () => {
  const minTime = Date.parse('2026-07-01T00:00:00.000Z');
  const maxTime = minTime + 35 * chartTime.DAY_MS;
  assert.deepEqual(
    chartTime.visibleRange(minTime, maxTime, 7 * chartTime.DAY_MS, null),
    { start: maxTime - 7 * chartTime.DAY_MS, end: maxTime }
  );
});

test('visible end is clamped to the earliest complete window and latest point', () => {
  const minTime = Date.parse('2026-07-01T00:00:00.000Z');
  const maxTime = minTime + 35 * chartTime.DAY_MS;
  const windowMs = 7 * chartTime.DAY_MS;
  assert.equal(chartTime.clampVisibleEnd(minTime, maxTime, windowMs, minTime), minTime + windowMs);
  assert.equal(chartTime.clampVisibleEnd(minTime, maxTime, windowMs, maxTime + windowMs), maxTime);
});

test('drag pixel delta shifts the visible end continuously', () => {
  const minTime = Date.parse('2026-07-01T00:00:00.000Z');
  const maxTime = minTime + 35 * chartTime.DAY_MS;
  const windowMs = 7 * chartTime.DAY_MS;
  assert.equal(
    chartTime.shiftVisibleEnd(maxTime, -350, 700, windowMs, minTime, maxTime),
    maxTime - windowMs / 2
  );
  assert.equal(chartTime.shiftVisibleEnd(maxTime, 350, 700, windowMs, minTime, maxTime), maxTime);
});

test('all history and short history return one fixed range', () => {
  const minTime = Date.parse('2026-08-01T00:00:00.000Z');
  const maxTime = minTime + 3 * chartTime.DAY_MS;
  assert.deepEqual(chartTime.visibleRange(minTime, maxTime, 0, null), { start: minTime, end: maxTime });
  assert.deepEqual(chartTime.visibleRange(minTime, maxTime, 7 * chartTime.DAY_MS, null), { start: minTime, end: maxTime });
});
