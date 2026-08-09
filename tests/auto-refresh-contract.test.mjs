import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');

test('auto refresh delay follows the last successful import and retries overdue work', () => {
  const helperSource = app.match(/function autoRefreshDue\(now\)[\s\S]*?(?=\n  function shouldAutoRequestPrices)/)?.[0] || '';
  assert.match(helperSource, /function autoRefreshDue\(now\)/);
  assert.match(helperSource, /function autoRefreshDelay\(now\)/);

  const createHelpers = new Function(
    'state',
    'PRICE_REFRESH_MS',
    'PRICE_REFRESH_RETRY_MS',
    'PRICE_REFRESH_MIN_TIMER_MS',
    `${helperSource}; return { autoRefreshDue, autoRefreshDelay };`
  );
  const state = { config: { autoRefreshPrices: true }, lastImportedAt: 0 };
  const helpers = createHelpers(state, 60 * 60 * 1000, 5 * 60 * 1000, 1000);

  assert.equal(helpers.autoRefreshDue(0), true);
  assert.equal(helpers.autoRefreshDelay(0), 5 * 60 * 1000);

  state.lastImportedAt = 10 * 60 * 1000;
  assert.equal(helpers.autoRefreshDue(20 * 60 * 1000), false);
  assert.equal(helpers.autoRefreshDelay(20 * 60 * 1000), 50 * 60 * 1000);

  assert.equal(helpers.autoRefreshDue(80 * 60 * 1000), true);
  assert.equal(helpers.autoRefreshDelay(80 * 60 * 1000), 5 * 60 * 1000);

  state.config.autoRefreshPrices = false;
  assert.equal(helpers.autoRefreshDue(80 * 60 * 1000), false);
});

test('auto refresh catches up after page lifecycle and network wake events', () => {
  assert.match(app, /document\.addEventListener\('visibilitychange'/);
  assert.match(app, /window\.addEventListener\('focus', handleAutoRefreshWake\)/);
  assert.match(app, /window\.addEventListener\('pageshow', handleAutoRefreshWake\)/);
  assert.match(app, /window\.addEventListener\('online', handleAutoRefreshWake\)/);
  assert.match(app, /const delay = autoRefreshDelay\(Date\.now\(\)\);/);
  assert.match(app, /autoRefreshTimer = window\.setTimeout\(\(\) => \{[\s\S]*?runAutoRefresh\(\);[\s\S]*?scheduleAutoRefresh\(\);[\s\S]*?\}, delay\);/);
  assert.match(app, /state\.status = `已自动导入 \$\{formatTime\(state\.lastImportedAt\)\} 的实时价格。`;[\s\S]*?scheduleAutoRefresh\(\);/);
});
