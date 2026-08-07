import test from 'node:test';
import assert from 'node:assert/strict';

await import('../web/chart-time-utils.js');

const chartTime = globalThis.HYBChartTime;

test('30d maps to a thirty-day window', () => {
  assert.equal(chartTime.normalizeWindow('30d', '24h'), '30d');
  assert.equal(chartTime.windowMilliseconds('30d', '24h'), 30 * 24 * 60 * 60 * 1000);
});

test('finite chart windows use horizontal scrolling while all history fits one screen', () => {
  assert.equal(chartTime.isScrollableWindow('1h'), true);
  assert.equal(chartTime.isScrollableWindow('24h'), true);
  assert.equal(chartTime.isScrollableWindow('7d'), true);
  assert.equal(chartTime.isScrollableWindow('30d'), true);
  assert.equal(chartTime.isScrollableWindow('all'), false);
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

test('selected duration fills one viewport across the complete history', () => {
  const minTime = Date.parse('2026-07-01T00:00:00.000Z');
  const maxTime = minTime + 35 * chartTime.DAY_MS;

  assert.equal(chartTime.plotWidth('7d', minTime, maxTime, 700), 3500);
  assert.equal(chartTime.plotWidth('30d', minTime, maxTime, 700), 700 * 35 / 30);
  assert.equal(chartTime.plotWidth('all', minTime, maxTime, 700), 700);
});

test('plot width does not create empty scrolling when history is shorter than the window', () => {
  const minTime = Date.parse('2026-08-01T00:00:00.000Z');
  const maxTime = minTime + 3 * chartTime.DAY_MS;

  assert.equal(chartTime.plotWidth('7d', minTime, maxTime, 700), 700);
});

test('scroll position maps to the visible part of complete history', () => {
  const minTime = Date.parse('2026-07-01T00:00:00.000Z');
  const maxTime = minTime + 35 * chartTime.DAY_MS;
  const scrollWidth = 3500;
  const clientWidth = 700;

  assert.deepEqual(
    chartTime.visibleTimeRange(0, scrollWidth, clientWidth, minTime, maxTime),
    { start: minTime, end: minTime + 7 * chartTime.DAY_MS }
  );
  assert.deepEqual(
    chartTime.visibleTimeRange(scrollWidth - clientWidth, scrollWidth, clientWidth, minTime, maxTime),
    { start: maxTime - 7 * chartTime.DAY_MS, end: maxTime }
  );
});

test('all-history viewport maps to the complete range', () => {
  const minTime = Date.parse('2026-07-01T00:00:00.000Z');
  const maxTime = minTime + 35 * chartTime.DAY_MS;

  assert.deepEqual(
    chartTime.visibleTimeRange(0, 700, 700, minTime, maxTime),
    { start: minTime, end: maxTime }
  );
});

test('explicit window duration stays exact when browser width is rounded', () => {
  const minTime = Date.parse('2026-06-24T00:00:00.000Z');
  const maxTime = minTime + 44 * chartTime.DAY_MS;
  const windowMs = 7 * chartTime.DAY_MS;

  assert.deepEqual(
    chartTime.visibleTimeRange(3806, 4526, 720, minTime, maxTime, windowMs),
    { start: maxTime - windowMs, end: maxTime }
  );
});
