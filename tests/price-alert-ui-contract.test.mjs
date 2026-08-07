import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, html, userscript, style] = await Promise.all([
  readFile(new URL('../web/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../web/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../web/userscripts/hyb-farm-dashboard-capture.user.js', import.meta.url), 'utf8'),
  readFile(new URL('../web/style.css', import.meta.url), 'utf8')
]);

test('page loads price-alert utilities before the application', () => {
  const priceAlertIndex = html.indexOf('./price-alert-utils.js');
  const appIndex = html.indexOf('./app.js');

  assert.ok(priceAlertIndex >= 0, 'index.html loads price-alert-utils.js');
  assert.ok(appIndex >= 0, 'index.html loads app.js');
  assert.ok(priceAlertIndex < appIndex, 'price-alert-utils.js loads before app.js');
});

test('application keeps history anomalies fixed while live alerts use shared utilities', () => {
  assert.match(app, /const HISTORY_ANOMALY_THRESHOLD = 20;/);
  assert.match(app, /const PRICE_ALERT = window\.HYBPriceAlert;/);
  assert.match(app, /const PRICE_CHANGE_ALERT_WINDOW = PRICE_ALERT\.WINDOW;/);
  assert.match(app, /function priceAlertSummary\(rows\)\s*\{[\s\S]*?PRICE_ALERT\.evaluate\(\s*rows \|\| computeRows\(\),\s*state\.config\.priceAlertNormalThreshold,\s*state\.config\.priceAlertAnomalyThreshold\s*\)/);
});

test('application persists alert configuration and transient modal state', () => {
  assert.match(app, /priceAlertNormalThreshold: PRICE_ALERT\.DEFAULT_NORMAL_THRESHOLD,/);
  assert.match(app, /priceAlertAnomalyThreshold: PRICE_ALERT\.DEFAULT_ANOMALY_THRESHOLD,/);
  assert.match(app, /browserPriceAlerts: false,/);
  assert.match(app, /inAppPriceAlerts: false,/);
  assert.match(app, /notifiedPriceAlertKey: '',/);
  assert.match(app, /inAppPriceAlertKey: '',/);
  assert.match(app, /suppressedPriceAlerts: \{ date: '', seedIds: \[\] \},/);
  assert.match(app, /priceAlertModalSeedIds: \[\],/);
  assert.match(app, /priceAlertModalManual: false,/);
  assert.match(app, /priceAlertMuteOnClose: false,/);
  assert.match(app, /function normalizePriceAlertConfig\(config\)/);
  assert.match(app, /PRICE_ALERT\.validateThresholds/);
  assert.match(app, /PRICE_ALERT\.normalizeSuppression\([^)]*Date\.now\(\)/);
});

test('settings render configurable price alert controls', () => {
  assert.match(app, /id="priceAlertNormalThreshold"/);
  assert.match(app, /id="priceAlertAnomalyThreshold"/);
  assert.match(app, /id="browserPriceAlerts"/);
  assert.match(app, /id="inAppPriceAlerts"/);
  assert.match(app, /普通暴涨阈值/);
  assert.match(app, /异常暴涨阈值/);
  assert.match(app, /站内弹窗提醒/);
});

test('settings expose escaped live status feedback and keep in-app alerts passive', () => {
  assert.match(app, /class="settings-status" role="status" aria-live="polite">\$\{escapeHtml\(state\.status\)\}/);
  assert.match(app, /function savePriceAlertThresholds\(normalValue, anomalyValue\)\s*\{[\s\S]*?PRICE_ALERT\.validateThresholds\(normalValue, anomalyValue\)/);
  const inAppHandler = app.match(/const inAppPriceAlerts = document\.getElementById\('inAppPriceAlerts'\);[\s\S]*?(?=\n    const importFile)/)?.[0] || '';
  assert.match(inAppHandler, /state\.config\.inAppPriceAlerts = inAppPriceAlerts\.checked;/);
  assert.match(inAppHandler, /saveState\(\);\s*render\(\);/);
  assert.doesNotMatch(inAppHandler, /(maybeNotifyPriceRise|showPriceAlert|openPriceAlert|dispatch)/);
});

test('application renders a shared clickable announcement and price-specific alert dialog', () => {
  assert.match(app, /data-price-alert-open/);
  assert.match(app, /共 \$\{summary\.total\} 种达标/);
  assert.match(app, /data-price-alert-backdrop/);
  assert.match(app, /class="price-alert-modal" role="dialog" aria-modal="true" aria-labelledby="priceAlertTitle"/);
  assert.match(app, /id="priceAlertTitle">24h 价格上涨提醒<\/h2>/);
  assert.match(app, /今日不再提醒上述作物/);
  assert.match(app, /item\.severity === 'anomaly'/);
});

test('application deduplicates and suppresses popup batches through shared utilities', () => {
  assert.match(app, /PRICE_ALERT\.batchKey/);
  assert.match(app, /PRICE_ALERT\.unsuppressedItems/);
  assert.match(app, /PRICE_ALERT\.addSuppressedCrops/);
  assert.match(app, /priceAlertModalSeedIds/);
});

test('hidden toggle inputs retain a visible keyboard focus indicator', () => {
  assert.match(style, /\.toggle-control input:focus-visible \+ \.toggle-track\s*\{[^}]*outline:\s*2px solid var\(--blue\);[^}]*outline-offset:\s*2px;/);
});

test('capture userscript supplies twenty-five hourly buckets for rolling 24-hour alerts', () => {
  assert.match(userscript, /@version\s+0\.3\.7/);
  assert.match(userscript, /granularity=hour&trendRange=25/);
});
