import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, userscript, style] = await Promise.all([
  readFile(new URL('../web/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../web/userscripts/hyb-farm-dashboard-capture.user.js', import.meta.url), 'utf8'),
  readFile(new URL('../web/style.css', import.meta.url), 'utf8')
]);

test('farm userscript publishes a version and Tampermonkey update URLs', () => {
  assert.match(userscript, /@version\s+0\.5\.1/);
  assert.match(userscript, /@updateURL\s+https:\/\/hyb\.gudong226\.com\/userscripts\/hyb-farm-dashboard-capture\.user\.js/);
  assert.match(userscript, /@downloadURL\s+https:\/\/hyb\.gudong226\.com\/userscripts\/hyb-farm-dashboard-capture\.user\.js/);
  assert.match(userscript, /const SCRIPT_VERSION\s*=\s*'0\.5\.1'/);
  assert.match(userscript, /scriptVersion:\s*SCRIPT_VERSION/);
  assert.match(userscript, /type:\s*BRIDGE_READY,\s*scriptVersion:\s*SCRIPT_VERSION/);
});

test('farm userscript installation and capture are temporarily disabled', () => {
  assert.match(userscript, /const SCRIPT_DISABLED\s*=\s*true;/);
  assert.match(userscript, /if \(SCRIPT_DISABLED\) return;/);
  assert.match(app, /同步脚本安装暂时停用/);
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
  const helpers = createHelpers('0.5.1');
  assert.equal(helpers.compareVersions('0.5.1', '0.5.1'), 0);
  assert.equal(helpers.compareVersions('0.5.0', '0.5.1'), -1);
  assert.equal(helpers.compareVersions('0.5.2', '0.5.1'), 1);
  assert.equal(helpers.userscriptVersionSupported('0.5.1'), true);
  assert.equal(helpers.userscriptVersionSupported('0.5.0'), false);
  assert.equal(helpers.userscriptVersionSupported('0.4.0'), false);
  assert.equal(helpers.userscriptVersionSupported(''), false);

  assert.match(app, /const REQUIRED_USERSCRIPT_VERSION\s*=\s*'0\.5\.1'/);
  assert.match(app, /markUserscriptVersion\(data\.scriptVersion\)/);
  assert.match(app, /link\.textContent\s*=\s*state\.scriptUpdateRequired \? '更新用户脚本' : '安装用户脚本'/);
  assert.match(app, /link\.classList\.toggle\('is-update-required', state\.scriptUpdateRequired \|\| state\.scriptMissing\)/);
  assert.match(style, /\.bookmarklet\.is-update-required/);
});

test('farm bridge refuses an outdated response before applying its snapshot', () => {
  const requestSource = app.match(/function requestScriptPrices\(force\)[\s\S]*?(?=\n  function runAutoRefresh)/)?.[0] || '';
  assert.match(requestSource, /markUserscriptVersion\(data\.scriptVersion\)/);
  assert.match(requestSource, /state\.scriptUpdateRequired/);
  assert.match(requestSource, /请点击“更新脚本”安装新版本/);
  assert.match(requestSource, /applySnapshot\(data\.snapshot\)/);
  assert.ok(requestSource.indexOf('state.scriptUpdateRequired') < requestSource.indexOf('applySnapshot(data.snapshot)'));
});
