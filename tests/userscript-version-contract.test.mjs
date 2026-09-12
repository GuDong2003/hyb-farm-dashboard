import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, userscript, style] = await Promise.all([
  readFile(new URL('../web/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../web/userscripts/hyb-farm-dashboard-capture.user.js', import.meta.url), 'utf8'),
  readFile(new URL('../web/style.css', import.meta.url), 'utf8')
]);

test('farm userscript publishes a version and Tampermonkey update URLs', () => {
  assert.match(userscript, /@version\s+0\.6\.1/);
  assert.match(userscript, /@updateURL\s+https:\/\/hyb\.gudong226\.com\/userscripts\/hyb-farm-dashboard-capture\.user\.js/);
  assert.match(userscript, /@downloadURL\s+https:\/\/hyb\.gudong226\.com\/userscripts\/hyb-farm-dashboard-capture\.user\.js/);
  assert.match(userscript, /const SCRIPT_VERSION\s*=\s*'0\.6\.1'/);
  assert.match(userscript, /scriptVersion:\s*SCRIPT_VERSION/);
  assert.match(userscript, /type:\s*BRIDGE_READY,\s*scriptVersion:\s*SCRIPT_VERSION/);
  assert.match(userscript, /scriptVersion:\s*SCRIPT_VERSION,[\s\S]*?prices:/);
});

test('farm userscript starts normally and the server gate controls capture', () => {
  assert.doesNotMatch(userscript, /SCRIPT_DISABLED/);
  assert.match(userscript, /PRICE_SYNC_GATE_URL/);
  assert.match(userscript, /captureSharedShopSnapshot/);
  assert.match(app, /function priceCaptureIsEnabled\(\)/);
  assert.match(app, /实时抓取功能当前暂未开放/);
  assert.match(app, /userscriptInstallLink/);
});

test('farm dashboard compares bridge versions and marks the update link', () => {
  const helperSource = app.match(/function compareVersions\([\s\S]*?(?=\n  function renderUserscriptLink)/)?.[0] || '';
  assert.match(helperSource, /function compareVersions\(left, right\)/);
  assert.match(helperSource, /function userscriptVersionSupported\(version\)/);
  assert.match(helperSource, /REQUIRED_USERSCRIPT_VERSION/);

  const createHelpers = new Function(
    'REQUIRED_USERSCRIPT_VERSION',
    `${helperSource}; return { compareVersions, userscriptVersionSupported };`
  );
  const helpers = createHelpers('0.6.0');
  assert.equal(helpers.compareVersions('0.6.0', '0.6.0'), 0);
  assert.equal(helpers.compareVersions('0.5.1', '0.6.0'), -1);
  assert.equal(helpers.compareVersions('0.6.1', '0.6.0'), 1);
  assert.equal(helpers.userscriptVersionSupported('0.5.1'), false);
  assert.equal(helpers.userscriptVersionSupported('0.6.0'), true);
  assert.equal(helpers.userscriptVersionSupported('0.6.1'), true);
  assert.equal(helpers.userscriptVersionSupported('0.4.0'), false);
  assert.equal(helpers.userscriptVersionSupported(''), false);

  assert.match(app, /const REQUIRED_USERSCRIPT_VERSION\s*=\s*'0\.6\.0'/);
  assert.match(app, /markUserscriptVersion\(data\.scriptVersion\)/);
  assert.match(app, /link\.textContent\s*=\s*state\.scriptUpdateRequired \? '更新用户脚本' : '安装用户脚本'/);
  assert.match(app, /link\.classList\.toggle\('is-update-required', state\.scriptUpdateRequired \|\| state\.scriptMissing\)/);
  assert.match(style, /\.bookmarklet\.is-update-required/);
});

test('URL snapshots require a supported userscript version before applying data', () => {
  const importSource = app.match(/async function importSnapshotFromHash\(\)[\s\S]*?(?=\n  async function applySnapshot)/)?.[0] || '';
  assert.match(importSource, /userscriptVersionSupported\(snapshot\.scriptVersion\)/);
  assert.ok(importSource.indexOf('userscriptVersionSupported(snapshot.scriptVersion)') < importSource.indexOf('applySnapshot(snapshot)'));
});

test('farm bridge refuses an outdated response before applying its snapshot', () => {
  const requestSource = app.match(/function requestScriptPrices\(force\)[\s\S]*?(?=\n  function runAutoRefresh)/)?.[0] || '';
  assert.match(requestSource, /markUserscriptVersion\(data\.scriptVersion\)/);
  assert.match(requestSource, /state\.scriptUpdateRequired/);
  assert.match(requestSource, /userscriptUpdateMessage\(data\.scriptVersion\)/);
  assert.match(requestSource, /applySnapshot\(data\.snapshot\)/);
  assert.ok(requestSource.indexOf('state.scriptUpdateRequired') < requestSource.indexOf('applySnapshot(data.snapshot)'));
});

test('dashboard uses distinct messages for missing, outdated, and unresponsive scripts', () => {
  const helperSource = app.match(/function userscriptMissingMessage\([^)]*\)[\s\S]*?(?=\n  function renderUserscriptLink)/)?.[0] || '';
  assert.match(helperSource, /function userscriptMissingMessage\([^)]*\)/);
  assert.match(helperSource, /未检测到可用的同步脚本，请安装并启用 v\$\{REQUIRED_USERSCRIPT_VERSION\} 后重试/);
  assert.match(helperSource, /同步脚本未响应，请刷新 CDK 页面后重试/);
  assert.match(helperSource, /function userscriptUpdateMessage\(version = ''\)/);

  const createHelpers = new Function(
    'REQUIRED_USERSCRIPT_VERSION',
    `${helperSource}; return { userscriptMissingMessage, userscriptUpdateMessage };`
  );
  const helpers = createHelpers('0.6.0');
  assert.equal(helpers.userscriptMissingMessage(false), '未检测到可用的同步脚本，请安装并启用 v0.6.0 后重试');
  assert.equal(helpers.userscriptMissingMessage(true), '同步脚本未响应，请刷新 CDK 页面后重试');
  assert.equal(helpers.userscriptUpdateMessage('0.5.1'), '检测到旧版同步脚本 v0.5.1，请更新到 v0.6.0');
  assert.equal(helpers.userscriptUpdateMessage(''), '同步脚本需要更新到 v0.6.0');
});

test('shared capture skips use a compact Beijing clock message', () => {
  const helperSource = app.match(/function formatCaptureClock\(value\)[\s\S]*?(?=\n  function nextFixedPriceCaptureAt)/)?.[0] || '';
  assert.match(helperSource, /function formatCaptureClock\(value\)/);
  assert.match(helperSource, /本轮已由其他用户处理，下次可刷新：/);
  const createHelpers = new Function('BEIJING_OFFSET_MS', `${helperSource}; return { formatCaptureClock, sharedCaptureSkippedMessage };`);
  const helpers = createHelpers(8 * 60 * 60 * 1000);
  assert.equal(helpers.sharedCaptureSkippedMessage(Date.parse('2026-09-13T04:01:00.000Z')), '本轮已由其他用户处理，下次可刷新：12:01');
});

test('bridge error responses use the same actionable status messages', () => {
  const helperSource = app.match(/function syncBridgeErrorMessage\(data\)[\s\S]*?(?=\n  function requestScriptPrices)/)?.[0] || '';
  assert.match(helperSource, /function syncBridgeErrorMessage\(data\)/);
  const createHelper = new Function(
    'syncDisabledMessage',
    'userscriptUpdateMessage',
    `${helperSource}; return syncBridgeErrorMessage;`
  );
  const helper = createHelper(() => '实时抓取功能当前暂未开放', (version) => `检测到旧版同步脚本 v${version}，请更新到 v0.6.0`);
  assert.equal(helper({ errorCode: 'sync_disabled' }), '实时抓取功能当前暂未开放');
  assert.equal(helper({ errorCode: 'script_update_required', scriptVersion: '0.5.1' }), '检测到旧版同步脚本 v0.5.1，请更新到 v0.6.0');
  assert.equal(helper({ error: '网络请求失败' }), '网络请求失败');
});

test('userscript direct CDK feedback uses the shared skip and gate wording', () => {
  assert.match(userscript, /function formatCaptureClock\(value\)/);
  assert.match(userscript, /本轮已由其他用户处理，下次可刷新：/);
  assert.match(userscript, /sync_disabled/);
  assert.match(userscript, /script_update_required/);
  assert.doesNotMatch(userscript, /共享价格仍在有效期内，下次可刷新/);
});

test('dashboard starts listening for the userscript before asynchronous startup work', () => {
  const listenerSource = app.match(/function installPriceBridgeListener\(\)[\s\S]*?(?=\n  function compareVersions)/)?.[0] || '';
  const initSource = app.match(/async function init\(\)[\s\S]*?(?=\n  init\(\))/)?.[0] || '';
  assert.doesNotMatch(listenerSource, /if \(!priceCaptureIsEnabled\(\)/);
  assert.ok(initSource.indexOf('installPriceBridgeListener();') >= 0);
  assert.ok(initSource.indexOf('installPriceBridgeListener();') < initSource.indexOf('await loadSiteConfig(false);'));
});
