import test from 'node:test';
import assert from 'node:assert/strict';

await import('../web/chart-time-utils.js');

const chartTime = globalThis.HYBChartTime;

test('30d maps to a thirty-day window', () => {
  assert.equal(chartTime.normalizeWindow('30d', '24h'), '30d');
  assert.equal(chartTime.windowMilliseconds('30d', '24h'), 30 * 24 * 60 * 60 * 1000);
});

test('adaptive chart buckets follow the visible time span', () => {
  assert.equal(chartTime.adaptiveBucketMilliseconds(12 * chartTime.HOUR_MS), chartTime.HOUR_MS);
  assert.equal(chartTime.adaptiveBucketMilliseconds(7 * chartTime.DAY_MS), 6 * chartTime.HOUR_MS);
  assert.equal(chartTime.adaptiveBucketMilliseconds(30 * chartTime.DAY_MS), 12 * chartTime.HOUR_MS);
  assert.equal(chartTime.adaptiveBucketMilliseconds(90 * chartTime.DAY_MS), chartTime.DAY_MS);
  assert.equal(chartTime.adaptiveBucketMilliseconds(365 * chartTime.DAY_MS), 3 * chartTime.DAY_MS);
});

test('hour windows step by one hour while long windows step by one day', () => {
  for (const value of ['1h', '6h', '12h', '24h']) {
    assert.equal(chartTime.navigationStepMilliseconds(value, '24h'), chartTime.HOUR_MS);
  }
  assert.equal(chartTime.navigationStepMilliseconds('7d', '24h'), chartTime.DAY_MS);
  assert.equal(chartTime.navigationStepMilliseconds('30d', '24h'), chartTime.DAY_MS);
  assert.equal(chartTime.navigationStepMilliseconds('all', '24h'), 0);
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

test('visible ends shift by whole time steps and clamp to history bounds', () => {
  const minTime = Date.parse('2026-07-01T00:00:00.000Z');
  const maxTime = minTime + 35 * chartTime.DAY_MS;
  const windowMs = 7 * chartTime.DAY_MS;
  assert.equal(
    chartTime.shiftVisibleEndBySteps(maxTime, -1, chartTime.DAY_MS, windowMs, minTime, maxTime),
    maxTime - chartTime.DAY_MS
  );
  assert.equal(
    chartTime.shiftVisibleEndBySteps(maxTime, 1, chartTime.DAY_MS, windowMs, minTime, maxTime),
    maxTime
  );
});

test('wheel direction maps down to older and up to newer history', () => {
  assert.equal(chartTime.wheelNavigationDelta(0, 100), -100);
  assert.equal(chartTime.wheelNavigationDelta(0, -100), 100);
  assert.equal(chartTime.wheelNavigationDelta(70, 10), 70);
  assert.equal(chartTime.wheelNavigationDelta(-70, 10), -70);
});

test('drag results snap to steps measured back from the latest sample', () => {
  const minTime = 0;
  const maxTime = 100 * chartTime.HOUR_MS + 1234;
  const windowMs = 6 * chartTime.HOUR_MS;
  assert.equal(
    chartTime.snapVisibleEnd(
      maxTime - 1.6 * chartTime.HOUR_MS,
      chartTime.HOUR_MS,
      windowMs,
      minTime,
      maxTime
    ),
    maxTime - 2 * chartTime.HOUR_MS
  );
});

test('aggregates price points by time bucket using the median and keeps source timestamps', () => {
  const base = Date.parse('2026-08-08T00:00:00.000Z');
  const points = [
    { capturedAt: base + 5 * 60 * 1000, price: 100 },
    { capturedAt: base + 20 * 60 * 1000, price: 500 },
    { capturedAt: base + 50 * 60 * 1000, price: 110 },
    { capturedAt: base + chartTime.HOUR_MS + 5 * 60 * 1000, price: 240 }
  ];

  assert.deepEqual(
    chartTime.aggregatePricePoints(points, chartTime.HOUR_MS),
    [
      {
        capturedAt: base,
        price: 110,
        sourceCapturedAt: [
          base + 5 * 60 * 1000,
          base + 20 * 60 * 1000,
          base + 50 * 60 * 1000
        ]
      },
      {
        capturedAt: base + chartTime.HOUR_MS,
        price: 240,
        sourceCapturedAt: [base + chartTime.HOUR_MS + 5 * 60 * 1000]
      }
    ]
  );
});

test('expanding price domains never shrink while the viewport moves', () => {
  assert.deepEqual(
    chartTime.expandPriceDomain({ min: 10, max: 20 }, { min: 12, max: 18 }),
    { min: 10, max: 20 }
  );
  assert.deepEqual(
    chartTime.expandPriceDomain({ min: 10, max: 20 }, { min: 5, max: 24 }),
    { min: 5, max: 24 }
  );
});

test('price-domain animation eases toward the natural range', () => {
  assert.equal(chartTime.easeOutCubic(0), 0);
  assert.equal(chartTime.easeOutCubic(0.5), 0.875);
  assert.equal(chartTime.easeOutCubic(1), 1);
  assert.deepEqual(
    chartTime.interpolatePriceDomain({ min: 10, max: 20 }, { min: 0, max: 40 }, 0.5),
    { min: 5, max: 30 }
  );
  assert.deepEqual(
    chartTime.interpolatePriceDomain({ min: 10, max: 20 }, { min: 0, max: 40 }, -1),
    { min: 10, max: 20 }
  );
  assert.deepEqual(
    chartTime.interpolatePriceDomain({ min: 10, max: 20 }, { min: 0, max: 40 }, 2),
    { min: 0, max: 40 }
  );
});

test('aggregation keeps a single bucket instead of exposing an unaggregated spike', () => {
  const base = Date.parse('2026-08-08T00:00:00.000Z');
  const points = [
    { capturedAt: base + 5 * 60 * 1000, price: 100 },
    { capturedAt: base + 20 * 60 * 1000, price: 500 }
  ];
  const aggregated = chartTime.aggregatePricePoints(points, chartTime.HOUR_MS);
  assert.equal(aggregated.length, 1);
  assert.equal(aggregated[0].price, 300);
});

test('bucketed points intersect a range when any source sample is inside it', () => {
  const base = Date.parse('2026-08-08T00:00:00.000Z');
  const point = {
    capturedAt: base,
    price: 110,
    sourceCapturedAt: [base + 50 * 60 * 1000]
  };
  assert.equal(chartTime.pointIntersectsRange(point, base + 30 * 60 * 1000, base + 90 * 60 * 1000), true);
  assert.equal(chartTime.pointIntersectsRange(point, base + chartTime.HOUR_MS, base + 2 * chartTime.HOUR_MS), false);
});

test('bucket source timestamps override the bucket start at range boundaries', () => {
  const base = Date.parse('2026-08-08T00:00:00.000Z');
  const bucket = {
    capturedAt: base + 30 * 60 * 1000,
    price: 110,
    sourceCapturedAt: [base + 2 * chartTime.HOUR_MS]
  };
  assert.equal(chartTime.pointIntersectsRange(bucket, base, base + chartTime.HOUR_MS), false);
  assert.equal(chartTime.pointIntersectsRange(bucket, base + chartTime.HOUR_MS, base + 3 * chartTime.HOUR_MS), true);
});

test('slot sampling preserves the first and last date', () => {
  const slots = Array.from({ length: 40 }, (_, index) => ({ label: String(index) }));
  const sampled = chartTime.sampleSlots(slots, 8);
  assert.equal(sampled.length, 8);
  assert.equal(sampled[0], slots[0]);
  assert.equal(sampled.at(-1), slots.at(-1));
  assert.deepEqual(chartTime.sampleSlots(slots.slice(0, 3), 8), slots.slice(0, 3));
});

test('all history and short history return one fixed range', () => {
  const minTime = Date.parse('2026-08-01T00:00:00.000Z');
  const maxTime = minTime + 3 * chartTime.DAY_MS;
  assert.deepEqual(chartTime.visibleRange(minTime, maxTime, 0, null), { start: minTime, end: maxTime });
  assert.deepEqual(chartTime.visibleRange(minTime, maxTime, 7 * chartTime.DAY_MS, null), { start: minTime, end: maxTime });
});
