import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, userscript] = await Promise.all([
  readFile(new URL('../web/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../web/userscripts/hyb-farm-dashboard-capture.user.js', import.meta.url), 'utf8')
]);

test('userscript no longer requests or builds private farm profile data', () => {
  assert.doesNotMatch(userscript, /\/api\/farm\/level/);
  assert.doesNotMatch(userscript, /\/api\/farm\/crops/);
  assert.doesNotMatch(userscript, /normalizeFarmProfile/);
  assert.doesNotMatch(userscript, /captureFarmProfile/);
  assert.doesNotMatch(userscript, /payload\.farmProfile/);
});

test('dashboard applies farm profile data but removes it before cloud submission', () => {
  assert.match(app, /function applyFarmProfile\(profile\)/);
  assert.match(app, /applyFarmProfile\(snapshot\.farmProfile\)/);
  const cloudSource = app.match(/function snapshotForCloud\(snapshot\)[\s\S]*?(?=\n  function cloudSubmissionStatusText)/)?.[0] || '';
  assert.match(cloudSource, /delete out\.farmProfile/);

  const createCloudHelper = new Function(`${cloudSource}; return { snapshotForCloud };`);
  const { snapshotForCloud } = createCloudHelper();
  const cloudSnapshot = snapshotForCloud({
    prices: { shop: { carrot: 1 } },
    farmProfile: { currentTotalExp: 99, landCounts: [1, 0, 0, 0, 0, 0, 0] }
  });
  assert.deepEqual(cloudSnapshot.prices, { shop: { carrot: 1 } });
  assert.equal('farmProfile' in cloudSnapshot, false);
});

test('dashboard applies only the profile fields returned by the local bridge', () => {
  const helperSource = app.match(/function normalizeLandCounts[\s\S]*?(?=\n  function toUsd)/)?.[0] || '';
  assert.match(helperSource, /function normalizeFarmProfile\(profile\)/);
  assert.match(helperSource, /function applyFarmProfile\(profile\)/);

  const createHelpers = new Function('state', 'MAX_LANDS', `${helperSource}; return { applyFarmProfile };`);
  const state = { config: { currentTotalExp: 12, landCounts: [13, 0, 0, 0, 0, 0, 0] } };
  const { applyFarmProfile } = createHelpers(state, 20);
  assert.equal(applyFarmProfile({ currentTotalExp: '8484820', landCounts: [5, 0, 0, 0, 0, 1, 8] }), true);
  assert.equal(state.config.currentTotalExp, 8484820);
  assert.deepEqual(state.config.landCounts, [5, 0, 0, 0, 0, 1, 8]);

  assert.equal(applyFarmProfile({ currentTotalExp: 9000000 }), true);
  assert.equal(state.config.currentTotalExp, 9000000);
  assert.deepEqual(state.config.landCounts, [5, 0, 0, 0, 0, 1, 8]);
});
