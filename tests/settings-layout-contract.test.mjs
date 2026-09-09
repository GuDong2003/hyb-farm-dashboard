import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, style] = await Promise.all([
  readFile(new URL('../web/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../web/style.css', import.meta.url), 'utf8')
]);

const settingsSource = app.match(/function renderSettings\(\)[\s\S]*?(?=\n  function bindEvents)/)?.[0] || '';
const tableSource = app.match(/function renderTableView\([\s\S]*?(?=\n  function renderTable\()/)?.[0] || '';
const toolbarPrimarySource = app.match(/function renderToolbarSyncPrimary\(\)[\s\S]*?(?=\n  function renderToolbarSyncActions)/)?.[0] || '';
const toolbarSyncSource = app.match(/function renderToolbarSyncActions\(\)[\s\S]*?(?=\n  function renderTableView)/)?.[0] || '';
const bindSource = app.match(/function bindEvents\(\)[\s\S]*?(?=\n  async function handleAction)/)?.[0] || '';
const actionSource = app.match(/async function handleAction\(event\)[\s\S]*?(?=\n  async function exportJson)/)?.[0] || '';
const requestSource = app.match(/function requestScriptPrices\(force\)[\s\S]*?(?=\n  function runAutoRefresh)/)?.[0] || '';

test('settings groups sync participation with the other synchronization controls', () => {
  assert.match(app, /allowSyncNode:\s*false/);
  assert.match(settingsSource, /class="settings settings-page"/);
  assert.match(settingsSource, /data-settings-group="sync"/);
  assert.match(settingsSource, /id="allowSyncNode"/);
  assert.match(settingsSource, /允许本设备协助同步/);
  assert.match(settingsSource, /data-settings-group="alerts"/);
  assert.match(settingsSource, /data-settings-group="appearance"/);
  assert.match(settingsSource, /data-settings-group="privacy"/);
  assert.match(settingsSource, /data-settings-group="data"/);
});

test('sync participation switch persists locally and reports its new state', () => {
  assert.match(bindSource, /const allowSyncNode = document\.getElementById\('allowSyncNode'\)/);
  assert.match(bindSource, /state\.config\.allowSyncNode = allowSyncNode\.checked/);
  assert.match(bindSource, /已开启本设备作物资料同步协助/);
  assert.match(bindSource, /已关闭本设备作物资料同步协助/);
  assert.match(bindSource, /saveState\(\)/);
});

test('settings page has a responsive grouped layout', () => {
  assert.match(style, /\.settings-page\s*\{/);
  assert.match(style, /\.settings-group-sync\s*\{/);
  assert.match(style, /\.settings-group-wide\s*\{/);
  assert.match(style, /@media \(max-width: 820px\)[\s\S]*\.settings-page/);
});

test('settings page fills the available desktop content width', () => {
  assert.match(style, /\.settings-page\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;/s);
});

test('home page follows the card-style sync row and removes the redundant live import action', () => {
  assert.doesNotMatch(tableSource, /home-layout/);
  assert.doesNotMatch(tableSource, /renderHomeSyncPanel\(\)/);
  assert.doesNotMatch(tableSource, /data-action="settings"/);
  assert.match(tableSource, /class="toolbar toolbar-sync-setup"/);
  assert.match(tableSource, /renderToolbarSyncPrimary\(\)/);
  assert.match(tableSource, /renderToolbarSyncActions\(\)/);
  assert.match(toolbarPrimarySource, /class="toolbar-sync-primary"/);
  assert.match(toolbarPrimarySource, /id="syncStatus"/);
  assert.match(toolbarPrimarySource, /id="syncUploadStatus"/);
  assert.match(toolbarPrimarySource, /data-action="refresh-prices"/);
  assert.match(toolbarPrimarySource, /data-action="upload-cloud"/);
  assert.match(app, /尚无待上传的本地快照/);
  assert.match(toolbarSyncSource, /class="toolbar-sync-secondary"/);
  assert.match(toolbarSyncSource, /id="autoRefreshPrices"/);
  assert.match(toolbarSyncSource, /id="autoUploadPrices"/);
  assert.match(toolbarSyncSource, /id="userscriptInstallLink"/);
  assert.match(toolbarSyncSource, /https:\/\/cdk\.hybgzs\.com\//);
  assert.match(toolbarSyncSource, /每小时自动刷新/);
  assert.match(toolbarSyncSource, /导入后自动上传/);
  assert.doesNotMatch(settingsSource, /id="autoRefreshPrices"/);
  assert.doesNotMatch(settingsSource, /id="autoUploadPrices"/);
  assert.doesNotMatch(settingsSource, /id="userscriptInstallLink"/);
  assert.match(settingsSource, /id="allowSyncNode"/);
  assert.doesNotMatch(tableSource, /<section class="notice">/);
});

test('home sync row mirrors card primary and secondary alignment with responsive wrapping', () => {
  assert.match(style, /\.toolbar-sync-primary\s*\{[^}]*display:\s*flex/s);
  assert.match(style, /\.toolbar-sync-secondary\s*\{[^}]*margin-left:\s*auto/s);
  assert.match(style, /\.toolbar-sync-status\s*\{[^}]*border-radius:\s*8px/s);
  assert.match(style, /\.toolbar-sync-status\[data-state="success"\]/);
  assert.match(style, /\.toolbar-sync-status\[data-state="busy"\]/);
  assert.match(style, /\.toolbar-sync-status\[data-state="error"\]/);
  assert.match(style, /@media \(max-width: 820px\)[\s\S]*\.toolbar-sync-primary[\s\S]*width:\s*100%/);
  assert.match(style, /@media \(max-width: 820px\)[\s\S]*\.toolbar-sync-secondary[\s\S]*width:\s*100%/);
});

test('home sync row tracks local pending uploads and prompts for a missing script', () => {
  assert.match(app, /pendingUploadSnapshot:\s*null/);
  assert.match(app, /state\.pendingUploadSnapshot\s*=\s*snapshot/);
  assert.match(app, /state\.pendingUploadSnapshot\s*=\s*null/);
  assert.match(app, /未检测到同步脚本；请先安装脚本后再刷新/);
  assert.match(app, /请点击“更新脚本”安装新版本/);
  assert.match(app, /renderUserscriptLink\(\)/);
});

test('refresh and upload actions follow card-style busy and pending rules', () => {
  assert.match(requestSource, /setSyncStatus\('busy'/);
  assert.match(requestSource, /state\.scriptMissing\s*=\s*true/);
  assert.match(requestSource, /未检测到同步脚本；请先安装脚本后再刷新/);
  assert.doesNotMatch(requestSource, /loadCloudDefaultPrices\(/);
  assert.match(actionSource, /state\.pendingUploadSnapshot/);
  assert.match(actionSource, /尚无待上传的本地快照/);
  assert.doesNotMatch(actionSource, /snapshotFromCurrentPrices/);
});
