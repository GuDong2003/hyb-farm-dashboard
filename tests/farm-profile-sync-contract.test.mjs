import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, userscript] = await Promise.all([
  readFile(new URL('../web/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../web/userscripts/hyb-farm-dashboard-capture.user.js', import.meta.url), 'utf8')
]);

function farmProfileHelperSource() {
  const currentLevelsSource = userscript.match(/function normalizeCurrentPlotLevels[\s\S]*?(?=\n  function normalizeFarmProfile)/)?.[0] || '';
  const profileSource = userscript.match(/function normalizeFarmProfile\([\s\S]*?(?=\n  async function captureFarmProfile)/)?.[0] || '';
  return `${currentLevelsSource}\n${profileSource}`;
}

test('userscript normalizes total experience and current crop plot levels into a local profile', () => {
  const helperSource = farmProfileHelperSource();
  assert.match(helperSource, /function normalizeFarmProfile\(levelJson, cropsJson\)/);

  const createHelpers = new Function(`${helperSource}; return { normalizeFarmProfile };`);
  const { normalizeFarmProfile } = createHelpers();
  const profile = normalizeFarmProfile(
    { success: true, data: { totalExp: '8484820', currentExp: '909668' } },
    {
      success: true,
      plotLevels: [
        { plotIndex: 0, level: 1 },
        { plotIndex: 1, level: 1 },
        { plotIndex: 2, level: 2 },
        { plotIndex: 3, level: 3 },
        { plotIndex: 4, level: 4 },
        { plotIndex: 5, level: 6 },
        { plotIndex: 6, level: 7 }
      ]
    }
  );

  assert.deepEqual(profile, { currentTotalExp: 8484820, landCounts: [2, 1, 1, 1, 0, 1, 1] });
  assert.deepEqual(normalizeFarmProfile({ data: { currentExp: '99' } }, { data: {} }), null);
});

test('userscript does not fall back to the legacy plot endpoint shape', () => {
  const helperSource = farmProfileHelperSource();
  const createHelpers = new Function(`${helperSource}; return { normalizeFarmProfile };`);
  const { normalizeFarmProfile } = createHelpers();
  const profile = normalizeFarmProfile({ data: { totalExp: '8484820' } },
    {
      data: {
        totalSlots: 20,
        freeSlots: 6,
        unlockedPlotIndexes: Array.from({ length: 14 }, (_, offset) => offset + 6),
        unlockedPlotLevels: { 0: 1, 1: 1, 6: 7, 14: 6, 15: 1 }
      }
    }
  );

  assert.deepEqual(profile, { currentTotalExp: 8484820 });
});

test('userscript includes the local farm profile with bridge snapshots', () => {
  assert.match(userscript, /const FARM_LEVEL_URL\s*=\s*'\/api\/farm\/level'/);
  assert.match(userscript, /const FARM_CROPS_URL\s*=\s*'\/api\/farm\/crops'/);
  assert.doesNotMatch(userscript, /FARM_PLOTS_URL/);
  assert.match(userscript, /async function captureFarmProfile\(\)/);
  assert.match(userscript, /fetchJson\(FARM_CROPS_URL, 15000\)/);
  assert.match(userscript, /payload\.farmProfile\s*=\s*farmProfile/);
});

test('userscript prefers current crop plot levels over stale unlocked plot levels', () => {
  const helperSource = farmProfileHelperSource();
  const createHelpers = new Function(`${helperSource}; return { normalizeFarmProfile };`);
  const { normalizeFarmProfile } = createHelpers();
  const currentCrops = {
    success: true,
    plotLevels: [
      ...Array.from({ length: 14 }, (_, plotIndex) => ({ plotIndex, level: 7 })),
      { plotIndex: 14, level: 6 },
      ...Array.from({ length: 5 }, (_, offset) => ({ plotIndex: offset + 15, level: 1 }))
    ]
  };

  assert.deepEqual(
    normalizeFarmProfile({ data: { totalExp: '8484820' } }, currentCrops),
    { currentTotalExp: 8484820, landCounts: [5, 0, 0, 0, 0, 1, 14] }
  );
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
