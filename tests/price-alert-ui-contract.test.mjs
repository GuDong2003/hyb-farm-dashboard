import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, html, userscript, style, readme] = await Promise.all([
  readFile(new URL('../web/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../web/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../web/userscripts/hyb-farm-dashboard-capture.user.js', import.meta.url), 'utf8'),
  readFile(new URL('../web/style.css', import.meta.url), 'utf8'),
  readFile(new URL('../README.md', import.meta.url), 'utf8')
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
  assert.match(app, /class="price-alert-modal" data-price-alert-dialog role="dialog" aria-modal="true" aria-labelledby="priceAlertTitle"/);
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

test('browser notifications summarize the whole qualifying batch and open its full list', () => {
  const notificationSource = app.match(/function maybeNotifyPriceRise\(summary, force\)\s*\{[\s\S]*?(?=\n  function clampInt)/)?.[0] || '';
  const browserToggleSource = app.match(/async function setBrowserPriceAlerts\(enabled\)\s*\{[\s\S]*?(?=\n  function savePriceAlertThresholds)/)?.[0] || '';

  assert.match(notificationSource, /function maybeNotifyPriceRise\(summary, force\)/);
  assert.match(notificationSource, /if \(!summary \|\| !summary\.total \|\| !summary\.highest\) return;/);
  assert.match(notificationSource, /const batchKey = PRICE_ALERT\.batchKey\(state\.lastImportedAt, summary\.items\);/);
  assert.match(notificationSource, /if \(!force && state\.config\.notifiedPriceAlertKey === batchKey\) return;/);
  assert.match(notificationSource, /summary\.anomalyCount/);
  assert.match(notificationSource, /HYB Farm 24h 异常暴涨 · \$\{summary\.total\} 种达标/);
  assert.match(notificationSource, /HYB Farm 24h 普通上涨 · \$\{summary\.total\} 种达标/);
  assert.match(notificationSource, /tag:\s*'hyb-price-rise'/);
  assert.match(notificationSource, /window\.focus\(\);[\s\S]*?openPriceAlertModal\(priceAlertSummary\(\)\.items, true\);[\s\S]*?render\(\);/);
  assert.match(browserToggleSource, /maybeNotifyPriceRise\(priceAlertSummary\(\), true\);/);
  assert.doesNotMatch(browserToggleSource, /maybeOpenPriceAlertModal/);
});

test('README describes configurable complete 24-hour price alerts and their channels', () => {
  assert.match(readme, /按完整 24 小时涨幅提供价格提醒：普通阈值默认 8%、异常阈值默认 20%，两档均可在设置中修改。/);
  assert.match(readme, /顶栏公告汇总全部达标作物；浏览器系统通知与站内弹窗可分别开关，弹窗支持按当前作物设置“今日不再提醒”。/);
});

test('price alert dialog inerts only the background shell and manages focus end to end', () => {
  const renderSource = app.match(/function render\(\)\s*\{[\s\S]*?(?=\n  function renderHistoryView)/)?.[0] || '';
  const bindSource = app.match(/function bindEvents\(\)\s*\{[\s\S]*?(?=\n  async function handleAction)/)?.[0] || '';
  const closeSource = app.match(/function closePriceAlertModal\(\)\s*\{[\s\S]*?(?=\n  function renderPriceAlertModal)/)?.[0] || '';

  assert.match(renderSource, /<div class="app" data-app-shell \$\{priceAlertModal \? 'inert' : ''\}>/);
  assert.match(renderSource, /<\/div>\s*\$\{priceAlertModal\}\s*`;/);
  assert.match(renderSource, /classList\.toggle\('modal-open', cropTrendModalVisible \|\| Boolean\(priceAlertModal\)\)/);
  assert.match(renderSource, /if \(priceAlertModal\) schedulePriceAlertModalFocus\(\);/);
  assert.match(app, /data-price-alert-dialog[^>]*role="dialog" aria-modal="true" aria-labelledby="priceAlertTitle" aria-describedby="priceAlertDescription"/);
  assert.match(app, /function schedulePriceAlertModalFocus\(\)\s*\{[\s\S]*?requestAnimationFrame[\s\S]*?\.focus\(\)/);
  assert.match(app, /function trapPriceAlertModalFocus\(event\)\s*\{[\s\S]*?event\.key !== 'Tab'[\s\S]*?event\.shiftKey[\s\S]*?event\.preventDefault\(\)/);
  assert.match(bindSource, /priceAlertDialog\.addEventListener\('keydown', trapPriceAlertModalFocus\)/);
  assert.match(closeSource, /const restoreFocus = state\.priceAlertModalOpener === 'announcement';[\s\S]*?clearPriceAlertModalState\(\);[\s\S]*?render\(\);[\s\S]*?restorePriceAlertModalFocus\(restoreFocus\);/);
});

test('new empty or fully suppressed batches clear stale price alert modal state', () => {
  const maybeOpenSource = app.match(/function maybeOpenPriceAlertModal\(summary\)\s*\{[\s\S]*?(?=\n  function closePriceAlertModal)/)?.[0] || '';
  const clearSource = app.match(/function clearPriceAlertModalState\(\)\s*\{[\s\S]*?\n  \}/)?.[0] || '';
  const initSource = app.match(/async function init\(\)\s*\{[\s\S]*?(?=\n  init\(\))/)?.[0] || '';

  assert.match(clearSource, /state\.priceAlertModalSeedIds = \[\];/);
  assert.match(clearSource, /state\.priceAlertModalManual = false;/);
  assert.match(clearSource, /state\.priceAlertMuteOnClose = false;/);
  assert.match(clearSource, /state\.priceAlertModalOpener = '';/);
  assert.match(maybeOpenSource, /if \(!items\.length\)\s*\{[\s\S]*?if \(!state\.config\.inAppPriceAlerts\)\s*\{[\s\S]*?clearPriceAlertModalState\(\);[\s\S]*?return false;[\s\S]*?const batchKey = PRICE_ALERT\.batchKey\(state\.lastImportedAt, items\);[\s\S]*?state\.config\.inAppPriceAlertKey = batchKey;[\s\S]*?clearPriceAlertModalState\(\);[\s\S]*?saveState\(\);[\s\S]*?return false;/);
  assert.match(maybeOpenSource, /state\.config\.inAppPriceAlertKey = batchKey;[\s\S]*?PRICE_ALERT\.unsuppressedItems[\s\S]*?if \(!unsuppressedItems\.length\)\s*\{[\s\S]*?clearPriceAlertModalState\(\);[\s\S]*?saveState\(\);[\s\S]*?return false;/);
  assert.match(initSource, /const priceAlertDialog = document\.querySelector\('\[data-price-alert-dialog\]'\);[\s\S]*?if \(priceAlertDialog\) closePriceAlertModal\(\);[\s\S]*?else if \(state\.trendModalSeedId\) closeCropTrendModal\(\);/);
});

test('price and crop trend dialogs clear each other before opening', () => {
  const priceOpenSource = app.match(/function openPriceAlertModal\(items, manual\)\s*\{[\s\S]*?(?=\n  function maybeOpenPriceAlertModal)/)?.[0] || '';
  const trendOpenSource = app.match(/function openCropTrendModal\(seedId\)\s*\{[\s\S]*?(?=\n  function renderFarmExperienceResult)/)?.[0] || '';

  assert.match(priceOpenSource, /clearCropTrendModalState\(\);/);
  assert.match(trendOpenSource, /if \(!SEED_BY_ID\[seedId\]\) return;\s*clearPriceAlertModalState\(\);/);
});

test('hidden toggle inputs retain a visible keyboard focus indicator', () => {
  assert.match(style, /\.toggle-control input:focus-visible \+ \.toggle-track\s*\{[^}]*outline:\s*2px solid var\(--blue\);[^}]*outline-offset:\s*2px;/);
});

test('capture userscript supplies twenty-five hourly buckets for rolling 24-hour alerts', () => {
  assert.match(userscript, /@version\s+0\.3\.7/);
  assert.match(userscript, /granularity=hour&trendRange=25/);
});
