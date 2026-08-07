import test from 'node:test';
import assert from 'node:assert/strict';

import {
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

  const merged = mergePriceTrendMaps(fallbackTrends, existingTrends);

  assert.deepEqual(merged.carrot, {
    hourly: fallbackHourly,
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
