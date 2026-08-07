import test from 'node:test';
import assert from 'node:assert/strict';

await import('../web/chart-time-utils.js');

const chartTime = globalThis.HYBChartTime;

test('30d maps to a thirty-day window', () => {
  assert.equal(chartTime.normalizeWindow('30d', '24h'), '30d');
  assert.equal(chartTime.windowMilliseconds('30d', '24h'), 30 * 24 * 60 * 60 * 1000);
});

test('only multi-day chart windows use horizontal scrolling', () => {
  assert.equal(chartTime.isScrollableWindow('24h'), false);
  assert.equal(chartTime.isScrollableWindow('7d'), true);
  assert.equal(chartTime.isScrollableWindow('30d'), true);
  assert.equal(chartTime.isScrollableWindow('all'), true);
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

test('scrollable plot width reserves readable space for every day', () => {
  const minTime = Date.parse('2026-08-01T16:00:00.000Z');
  const maxTime = Date.parse('2026-08-08T15:59:59.000Z');
  assert.equal(chartTime.plotWidth('24h', minTime, maxTime, 420), 420);
  assert.equal(chartTime.beijingDaySlots(minTime, maxTime).length, 7);
  assert.equal(chartTime.plotWidth('7d', minTime, maxTime, 420), 840);
});
