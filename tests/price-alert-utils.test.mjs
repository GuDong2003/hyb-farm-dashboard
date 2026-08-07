import test from 'node:test';
import assert from 'node:assert/strict';

await import('../web/price-alert-utils.js');

const priceAlert = globalThis.HYBPriceAlert;

test('threshold validation accepts increasing positive values and rejects invalid pairs', () => {
  assert.deepEqual(priceAlert.validateThresholds('8', '20'), {
    ok: true,
    normalThreshold: 8,
    anomalyThreshold: 20,
    message: ''
  });

  for (const [normal, anomaly] of [['-1', '20'], ['8', '8'], ['20', '8']]) {
    assert.equal(priceAlert.validateThresholds(normal, anomaly).ok, false);
  }
});

test('threshold validation permits zero but rejects non-finite values', () => {
  assert.deepEqual(priceAlert.validateThresholds(0, 20), {
    ok: true,
    normalThreshold: 0,
    anomalyThreshold: 20,
    message: ''
  });
  assert.equal(priceAlert.validateThresholds(Number.NaN, 20).ok, false);
  assert.equal(priceAlert.validateThresholds(8, Number.POSITIVE_INFINITY).ok, false);
});

test('evaluate includes qualifying crops sorted by rate and classifies their severity', () => {
  const result = priceAlert.evaluate([
    { seed: { id: 'seven', name: '七' }, priceAlertRate: 7.99, price: '7.99' },
    { seed: { id: 'eight', name: '八' }, priceAlertRate: 8, price: '8' },
    { seed: { id: 'twelve', name: '十二' }, priceAlertRate: 12, price: '12' },
    { seed: { id: 'twenty', name: '二十' }, priceAlertRate: 20, price: '20' },
    { seed: { id: 'thirty-two', name: '三十二' }, priceAlertRate: 32, price: '32' }
  ], 8, 20);

  assert.deepEqual(result.items.map((item) => [item.seedId, item.severity]), [
    ['thirty-two', 'anomaly'],
    ['twenty', 'anomaly'],
    ['twelve', 'normal'],
    ['eight', 'normal']
  ]);
  assert.equal(result.total, 4);
  assert.equal(result.normalCount, 2);
  assert.equal(result.anomalyCount, 2);
  assert.equal(result.highest.seedId, 'thirty-two');
  assert.equal(result.highest.rate, 32);
});

test('evaluate skips invalid rates while retaining valid rows', () => {
  const result = priceAlert.evaluate([
    { seed: { id: 'null', name: '空值' }, priceAlertRate: null, price: 1 },
    { seed: { id: 'empty', name: '空字符串' }, priceAlertRate: '', price: 2 },
    { seed: { id: 'nan', name: '非数字' }, priceAlertRate: Number.NaN, price: 3 },
    { seed: { id: 'valid', name: '有效' }, priceAlertRate: 9, price: '12.5' }
  ], 8, 20);

  assert.deepEqual(result.items.map((item) => item.seedId), ['valid']);
  assert.equal(result.items[0].rate, 9);
  assert.equal(result.items[0].price, 12.5);
});

test('Beijing date keys and suppression reset at Beijing midnight', () => {
  assert.equal(priceAlert.beijingDateKey('2026-08-07T15:59:59Z'), '2026-08-07');
  assert.equal(priceAlert.beijingDateKey('2026-08-07T16:00:00Z'), '2026-08-08');

  assert.deepEqual(
    priceAlert.normalizeSuppression({ date: '2026-08-07', seedIds: ['a', 'a', 2, '', null] }, '2026-08-07T15:59:59Z'),
    { date: '2026-08-07', seedIds: ['a', '2'] }
  );
  assert.deepEqual(
    priceAlert.normalizeSuppression({ date: '2026-08-07', seedIds: ['a'] }, '2026-08-07T16:00:00Z'),
    { date: '2026-08-08', seedIds: [] }
  );
});

test('suppression only adds selected popup crop IDs and filters those items', () => {
  const now = '2026-08-07T12:00:00Z';
  const suppression = priceAlert.addSuppressedCrops(
    { date: '2026-08-07', seedIds: ['already'] },
    ['selected-a', 'selected-b'],
    now
  );

  assert.deepEqual(suppression, { date: '2026-08-07', seedIds: ['already', 'selected-a', 'selected-b'] });
  const items = [
    { seedId: 'already' },
    { seedId: 'selected-a' },
    { seedId: 'selected-b' },
    { seedId: 'visible' }
  ];
  assert.deepEqual(priceAlert.unsuppressedItems(items, suppression, now), [{ seedId: 'visible' }]);
});

test('batch keys are order-independent but reflect capture time', () => {
  const items = [
    { seedId: 'b', rate: 20, price: 5 },
    { seedId: 'a', rate: 8, price: 2 }
  ];
  const reordered = [items[1], items[0]];

  assert.equal(
    priceAlert.batchKey('2026-08-07T12:00:00Z', items),
    priceAlert.batchKey('2026-08-07T12:00:00Z', reordered)
  );
  assert.notEqual(
    priceAlert.batchKey('2026-08-07T12:00:00Z', items),
    priceAlert.batchKey('2026-08-07T12:01:00Z', items)
  );
});

test('batch keys retain order independence for locale-equivalent seed IDs', () => {
  const items = [
    { seedId: 'é', rate: 20, price: 5 },
    { seedId: 'e\u0301', rate: 20, price: 5 }
  ];

  assert.equal(
    priceAlert.batchKey('2026-08-07T12:00:00Z', items),
    priceAlert.batchKey('2026-08-07T12:00:00Z', [...items].reverse())
  );
});
