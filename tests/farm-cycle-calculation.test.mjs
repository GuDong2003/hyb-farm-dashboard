import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');
const dailyCycleSource = app.match(/function dailyCycleCount\(growthHours\) \{[\s\S]*?\n  \}/)?.[0] || '';

assert.notEqual(dailyCycleSource, '', 'dailyCycleCount must remain available for behavior tests');

function dailyCycleCount(config) {
  return Function('state', `return (${dailyCycleSource});`)({ config });
}

test('16h active cycles divide every maturity duration without rounding or a one-cycle floor', () => {
  const count = dailyCycleCount({ cycleMode: 'active', activeHours: 16 });

  assert.equal(count(8), 2);
  assert.equal(count(16), 1);
  assert.equal(count(20), 0.8);
  assert.equal(count(24), 2 / 3);
  assert.equal(count(30), 16 / 30);
  assert.equal(count(168), 16 / 168);
});

test('24h theoretical cycles divide every maturity duration by a full day', () => {
  const count = dailyCycleCount({ cycleMode: 'full24', activeHours: 16 });

  assert.equal(count(8), 3);
  assert.equal(count(16), 1.5);
  assert.equal(count(20), 1.2);
  assert.equal(count(24), 1);
  assert.equal(count(30), 0.8);
  assert.equal(count(168), 1 / 7);
});
