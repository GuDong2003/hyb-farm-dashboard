import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, userscript] = await Promise.all([
  readFile(new URL('../web/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../web/userscripts/hyb-farm-dashboard-capture.user.js', import.meta.url), 'utf8')
]);

test('userscript normalizes total experience and unlocked land levels into a local profile', () => {
  const helperSource = userscript.match(/function normalizeFarmProfile\([\s\S]*?(?=\n  async function captureFarmProfile)/)?.[0] || '';
  assert.match(helperSource, /function normalizeFarmProfile\(levelJson, plotsJson\)/);

  const createHelpers = new Function(`${helperSource}; return { normalizeFarmProfile };`);
  const { normalizeFarmProfile } = createHelpers();
  const profile = normalizeFarmProfile(
    { success: true, data: { totalExp: '8484820', currentExp: '909668' } },
    {
      success: true,
      data: {
        unlockedPlotIndexes: [0, 1, 2, 3, 4, 5, 6, 7],
        unlockedPlotLevels: { 0: 1, 1: 1, 2: 2, 3: 3, 4: 4, 5: 6, 6: 7, 7: 8 }
      }
    }
  );

  assert.deepEqual(profile, { currentTotalExp: 8484820, landCounts: [2, 1, 1, 1, 0, 1, 1] });
  assert.equal(normalizeFarmProfile({ data: { currentExp: '99' } }, { data: {} }), null);
});

test('userscript includes free slots alongside paid and VIP-unlocked plot indexes', () => {
  const helperSource = userscript.match(/function normalizeFarmProfile\([\s\S]*?(?=\n  async function captureFarmProfile)/)?.[0] || '';
  const createHelpers = new Function(`${helperSource}; return { normalizeFarmProfile };`);
  const { normalizeFarmProfile } = createHelpers();
  const levels = Object.fromEntries([
    ...Array.from({ length: 6 }, (_, index) => [index, 1]),
    ...Array.from({ length: 8 }, (_, offset) => [offset + 6, 7]),
    [14, 6],
    [15, 1],
    [16, 1],
    [17, 1],
    [18, 1],
    [19, 1]
  ]);
  const profile = normalizeFarmProfile(
    { data: { totalExp: '8484820' } },
    {
      data: {
        totalSlots: 20,
        freeSlots: 6,
        unlockedPlotIndexes: Array.from({ length: 14 }, (_, offset) => offset + 6),
        unlockedPlotLevels: levels
      }
    }
  );

  assert.deepEqual(profile, { currentTotalExp: 8484820, landCounts: [11, 0, 0, 0, 0, 1, 8] });
});

test('userscript includes the local farm profile with bridge snapshots', () => {
  assert.match(userscript, /const FARM_LEVEL_URL\s*=\s*'\/api\/farm\/level'/);
  assert.match(userscript, /const FARM_PLOTS_URL\s*=\s*'\/api\/farm\/plots'/);
  assert.match(userscript, /async function captureFarmProfile\(\)/);
  assert.match(userscript, /payload\.farmProfile\s*=\s*farmProfile/);
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
