import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');

test('auto refresh delay follows the last successful import and retries overdue work', () => {
  const helperSource = app.match(/function autoRefreshDue\(now\)[\s\S]*?(?=\n  function shouldAutoRequestPrices)/)?.[0] || '';
  assert.match(helperSource, /function autoRefreshDue\(now\)/);
  assert.match(helperSource, /function autoRefreshDelay\(now\)/);

  const createHelpers = new Function(
    'PRICE_SYNC_DISABLED',
    'state',
    'PRICE_REFRESH_MS',
    'PRICE_REFRESH_RETRY_MS',
    'PRICE_REFRESH_MIN_TIMER_MS',
    `${helperSource}; return { autoRefreshDue, autoRefreshDelay };`
  );
  const state = { config: { autoRefreshPrices: true }, lastImportedAt: 0 };
  const helpers = createHelpers(false, state, 60 * 60 * 1000, 5 * 60 * 1000, 1000);

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

test('temporary refresh kill switch blocks manual and automatic price refresh', () => {
  assert.match(app, /const PRICE_SYNC_DISABLED\s*=\s*true;/);
  const requestSource = app.match(/function requestScriptPrices\(force\)[\s\S]*?(?=\n  function runAutoRefresh)/)?.[0] || '';
  const autoSource = app.match(/function runAutoRefresh\(\)[\s\S]*?(?=\n  function handleAutoRefreshWake)/)?.[0] || '';
  const scheduleSource = app.match(/function scheduleAutoRefresh\(\)[\s\S]*?(?=\n  function cleanPriceMap)/)?.[0] || '';
  assert.match(requestSource, /if \(PRICE_SYNC_DISABLED\)/);
  assert.match(autoSource, /if \(PRICE_SYNC_DISABLED\)/);
  assert.match(scheduleSource, /if \(PRICE_SYNC_DISABLED\)/);
  assert.match(app, /function syncStatusView\(\)[\s\S]*?if \(PRICE_SYNC_DISABLED\)/);
  assert.match(app, /data-action="refresh-prices"[\s\S]*?disabled/);
  assert.match(app, /id="autoRefreshPrices"[\s\S]*?disabled/);
});

test('auto refresh catches up after page lifecycle and network wake events', () => {
  assert.match(app, /document\.addEventListener\('visibilitychange'/);
  assert.match(app, /window\.addEventListener\('focus', handleAutoRefreshWake\)/);
  assert.match(app, /window\.addEventListener\('pageshow', handleAutoRefreshWake\)/);
  assert.match(app, /window\.addEventListener\('online', handleAutoRefreshWake\)/);
  assert.match(app, /const delay = autoRefreshDelay\(Date\.now\(\)\);/);
  assert.match(app, /autoRefreshTimer = window\.setTimeout\(\(\) => \{[\s\S]*?runAutoRefresh\(\);[\s\S]*?scheduleAutoRefresh\(\);[\s\S]*?\}, delay\);/);
  assert.match(app, /state\.status = `已自动导入 \$\{formatTime\(state\.lastImportedAt\)\} 的实时价格\$\{farmProfileStatusSuffix\(data\.snapshot\.farmProfile\)\}。`;[\s\S]*?scheduleAutoRefresh\(\);/);
});
