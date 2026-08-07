import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, html, userscript] = await Promise.all([
  readFile(new URL('../web/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../web/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../web/userscripts/hyb-farm-dashboard-capture.user.js', import.meta.url), 'utf8')
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
  assert.match(app, /PRICE_ALERT\.evaluate\(\s*rows,\s*state\.config\.priceAlertNormalThreshold,\s*state\.config\.priceAlertAnomalyThreshold\s*\)\.highest/);
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

test('capture userscript supplies twenty-five hourly buckets for rolling 24-hour alerts', () => {
  assert.match(userscript, /@version\s+0\.3\.7/);
  assert.match(userscript, /granularity=hour&trendRange=25/);
});
