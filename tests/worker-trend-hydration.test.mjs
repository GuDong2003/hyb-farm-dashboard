import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hydrateSnapshotTrends,
  mergePriceTrendMaps,
  trendMapNeedsHydration
} from '../worker/index.js';

const SEED_IDS = [
  'carrot',
  'tomato',
  'corn',
  'pumpkin',
  'blueberry',
  'strawberry',
  'watermelon',
  'mango',
  'golden_wheat',
  'emerald_cabbage',
  'dragon_fruit',
  'starfruit',
  'durian',
  'golden_apple',
  'blue_rose',
  'crystal_grape',
  'rainbow_pineapple',
  'moonflower',
  'weekly_lotus'
];

const REFRESHED_AT = '2026-08-07T12:00:00.000Z';
const OLD_HOURLY_POINT = {
  bucketStartedAt: '2026-08-06T12:00:00.000Z',
  avgUnitPrice: 1
};
const RECENT_HOURLY_POINT = {
  bucketStartedAt: '2026-08-07T11:00:00.000Z',
  avgUnitPrice: 2
};
const DAILY_POINT = {
  bucketStartedAt: '2026-08-07T00:00:00.000Z',
  avgUnitPrice: 3
};

function completeTrend(unitPrice = 4) {
  return {
    hourly: [OLD_HOURLY_POINT],
    daily: [DAILY_POINT],
    unitPrice,
    lastRefreshedAt: REFRESHED_AT
  };
}

function priceChangeRate(currentPrice, historicalPrice) {
  return ((currentPrice - historicalPrice) / historicalPrice) * 100;
}

test('unit-price-only trends for all current crops need hydration', () => {
  const currentPrices = Object.fromEntries(SEED_IDS.map((id, index) => [id, index + 1]));
  const existingTrends = Object.fromEntries(SEED_IDS.map((id, index) => [id, { unitPrice: index + 1 }]));

  assert.equal(trendMapNeedsHydration(existingTrends, currentPrices), true);
});

test('complete trends for every current crop do not need hydration', () => {
  const currentPrices = Object.fromEntries(SEED_IDS.map((id, index) => [id, index + 1]));
  const existingTrends = Object.fromEntries(SEED_IDS.map((id, index) => [id, completeTrend(index + 1)]));

  assert.equal(trendMapNeedsHydration(existingTrends, currentPrices), false);
});

test('hourly history containing only a recent point needs hydration', () => {
  const currentPrices = { carrot: 4 };
  const existingTrends = {
    carrot: {
      ...completeTrend(),
      hourly: [RECENT_HOURLY_POINT]
    }
  };

  assert.equal(trendMapNeedsHydration(existingTrends, currentPrices), true);
});

test('merge preserves usable existing fields and fills missing fields from fallback', () => {
  const fallbackHourly = [OLD_HOURLY_POINT];
  const fallbackDaily = [DAILY_POINT];
  const existingDaily = [{ bucketStartedAt: '2026-08-06T00:00:00.000Z', avgUnitPrice: 9 }];
  const fallbackTrends = {
    carrot: {
      hourly: fallbackHourly,
      daily: fallbackDaily,
      unitPrice: 4,
      lastRefreshedAt: REFRESHED_AT
    }
  };
  const existingTrends = {
    carrot: {
      daily: existingDaily,
      unitPrice: 7
    }
  };
  const expectedHourly = [{ ...OLD_HOURLY_POINT, avgUnitPrice: 1.75 }];

  const merged = mergePriceTrendMaps(fallbackTrends, existingTrends);

  assert.deepEqual(merged.carrot, {
    hourly: expectedHourly,
    daily: existingDaily,
    unitPrice: 7,
    lastRefreshedAt: REFRESHED_AT
  });
  assert.notEqual(merged, fallbackTrends);
  assert.notEqual(merged.carrot, fallbackTrends.carrot);
  assert.notEqual(merged.carrot.hourly, fallbackHourly);
  assert.notEqual(merged.carrot.daily, existingDaily);
  assert.deepEqual(fallbackTrends.carrot.hourly, fallbackHourly);
  assert.deepEqual(existingTrends.carrot.daily, existingDaily);
});

test('merge scales fallback series to the existing unit-price scale without mutating fallback input', () => {
  const fallbackTrends = {
    carrot: {
      hourly: [
        { bucketStartedAt: '2026-08-06T12:00:00.000Z', avgUnitPrice: 3 },
        { bucketStartedAt: '2026-08-07T12:00:00.000Z', avgUnitPrice: 7 }
      ],
      daily: [
        { bucketStartedAt: '2026-08-06T00:00:00.000Z', avgUnitPrice: 3 }
      ],
      unitPrice: 7,
      lastRefreshedAt: REFRESHED_AT
    }
  };
  const originalFallback = structuredClone(fallbackTrends);
  const scenarios = [
    { name: 'USD existing price', existingUnitPrice: 7, expectedHistoricalPrice: 3 },
    { name: 'raw existing price', existingUnitPrice: 3_500_000, expectedHistoricalPrice: 1_500_000 }
  ];

  for (const scenario of scenarios) {
    const merged = mergePriceTrendMaps(fallbackTrends, {
      carrot: { unitPrice: scenario.existingUnitPrice }
    });

    assert.equal(merged.carrot.unitPrice, scenario.existingUnitPrice, `${scenario.name} is preserved`);
    assert.equal(merged.carrot.hourly[0].avgUnitPrice, scenario.expectedHistoricalPrice);
    assert.equal(merged.carrot.daily[0].avgUnitPrice, scenario.expectedHistoricalPrice);
    assert.ok(
      Math.abs(priceChangeRate(merged.carrot.unitPrice, merged.carrot.hourly[0].avgUnitPrice) - 133.33333333333334) < 1e-9,
      `${scenario.name} retains the $3 to $7 relative change`
    );
    assert.deepEqual(fallbackTrends, originalFallback, `${scenario.name} does not mutate fallback input`);
  }
});

test('merge replaces recent-only existing hourly history with a complete fallback', () => {
  const existingRefreshedAt = '2026-08-07T13:00:00.000Z';
  const existingDaily = [{ bucketStartedAt: '2026-08-06T00:00:00.000Z', avgUnitPrice: 9 }];
  const merged = mergePriceTrendMaps({
    carrot: {
      hourly: [OLD_HOURLY_POINT],
      daily: [DAILY_POINT],
      unitPrice: 4,
      lastRefreshedAt: REFRESHED_AT
    }
  }, {
    carrot: {
      hourly: [RECENT_HOURLY_POINT],
      daily: existingDaily,
      unitPrice: 7,
      lastRefreshedAt: existingRefreshedAt
    }
  });

  assert.deepEqual(merged.carrot, {
    hourly: [{ ...OLD_HOURLY_POINT, avgUnitPrice: 1.75 }],
    daily: existingDaily,
    unitPrice: 7,
    lastRefreshedAt: REFRESHED_AT
  });
  assert.equal(trendMapNeedsHydration({ carrot: merged.carrot }, { carrot: 7 }), false);
});

test('merge preserves complete existing hourly history', () => {
  const existingRefreshedAt = '2026-08-07T13:00:00.000Z';
  const existingHourly = [{
    bucketStartedAt: '2026-08-06T13:00:00.000Z',
    avgUnitPrice: 8
  }];
  const merged = mergePriceTrendMaps({
    carrot: completeTrend()
  }, {
    carrot: {
      ...completeTrend(7),
      hourly: existingHourly,
      lastRefreshedAt: existingRefreshedAt
    }
  });

  assert.deepEqual(merged.carrot.hourly, existingHourly);
  assert.notEqual(merged.carrot.hourly, existingHourly);
  assert.equal(merged.carrot.lastRefreshedAt, existingRefreshedAt);
});

test('merge replaces empty uploaded arrays with fallback series', () => {
  const fallbackHourly = [OLD_HOURLY_POINT];
  const fallbackDaily = [DAILY_POINT];
  const merged = mergePriceTrendMaps({
    carrot: {
      hourly: fallbackHourly,
      daily: fallbackDaily,
      unitPrice: 4,
      lastRefreshedAt: REFRESHED_AT
    }
  }, {
    carrot: {
      hourly: [],
      daily: [],
      unitPrice: Number.NaN,
      lastRefreshedAt: 'not-a-date'
    }
  });

  assert.deepEqual(merged.carrot.hourly, fallbackHourly);
  assert.deepEqual(merged.carrot.daily, fallbackDaily);
  assert.notEqual(merged.carrot.hourly, fallbackHourly);
  assert.notEqual(merged.carrot.daily, fallbackDaily);
  assert.equal(merged.carrot.unitPrice, 4);
  assert.equal(merged.carrot.lastRefreshedAt, REFRESHED_AT);
});

test('hydration skips the history query for a complete trend map', async () => {
  let queryCount = 0;
  const snapshot = {
    capturedAt: Date.parse(REFRESHED_AT),
    prices: { shop: { carrot: 4 } },
    priceTrends: { shop: { carrot: completeTrend() } }
  };
  const env = {
    PRICE_DB: {
      prepare() {
        queryCount += 1;
        throw new Error('complete trends must not query history');
      }
    }
  };

  await hydrateSnapshotTrends(env, snapshot);

  assert.equal(queryCount, 0);
  assert.equal(trendMapNeedsHydration(snapshot.priceTrends.shop, snapshot.prices.shop), false);
});

test('hydration queries history once and completes unit-only and recent-only trends', async () => {
  const capturedAt = Date.parse(REFRESHED_AT);
  const rows = [
    { captured_at: capturedAt - 24 * 60 * 60 * 1000, prices_json: JSON.stringify({ carrot: 3 }) },
    { captured_at: capturedAt, prices_json: JSON.stringify({ carrot: 7 }) }
  ];
  const scenarios = [
    { name: 'unit-only', trend: { unitPrice: 7 } },
    {
      name: 'recent-only',
      trend: {
        hourly: [RECENT_HOURLY_POINT],
        daily: [DAILY_POINT],
        unitPrice: 7,
        lastRefreshedAt: '2026-08-07T13:00:00.000Z'
      }
    }
  ];

  for (const scenario of scenarios) {
    let queryCount = 0;
    const snapshot = {
      capturedAt,
      prices: { shop: { carrot: 7 } },
      priceTrends: { shop: { carrot: scenario.trend } }
    };
    const env = {
      PRICE_DB: {
        prepare(sql) {
          queryCount += 1;
          assert.match(sql, /WHERE accepted = 1/);
          assert.match(sql, /ORDER BY captured_at DESC/);
          assert.match(sql, /LIMIT 500/);
          return {
            async all() {
              return { results: rows };
            }
          };
        }
      }
    };

    await hydrateSnapshotTrends(env, snapshot);

    assert.equal(queryCount, 1, `${scenario.name} queries history exactly once`);
    assert.equal(snapshot.priceTrends.shop.carrot.lastRefreshedAt, REFRESHED_AT);
    assert.equal(
      trendMapNeedsHydration(snapshot.priceTrends.shop, snapshot.prices.shop),
      false,
      `${scenario.name} is hydrated to a complete 24-hour trend`
    );
  }
});
