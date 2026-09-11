import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, style] = await Promise.all([
  readFile(new URL('../web/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../web/style.css', import.meta.url), 'utf8')
]);

test('topbar places the anonymous cumulative visitor badge immediately before history', () => {
  const topbar = app.match(/<nav class="topbar-actions"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.ok(topbar, 'topbar actions should exist');
  assert.match(topbar, /class="visitor-count"/);
  assert.match(topbar, /data-visitor-count/);
  assert.match(app, /function formatVisitorCount\(value\)[\s\S]*?累计访客：/);
  assert.ok(topbar.indexOf('visitor-count') < topbar.indexOf('history-link'));
});

test('visitor usage uses a local anonymous id and the KV-only usage endpoint', () => {
  assert.match(app, /const VISITOR_USAGE_ENDPOINT = '\/api\/visitor-usage';/);
  assert.match(app, /VISITOR_ID_STORAGE_KEY/);
  assert.match(app, /localStorage\.getItem\(VISITOR_ID_STORAGE_KEY\)/);
  assert.match(app, /method: 'POST'/);
  assert.match(app, /loadVisitorUsage\(\)/);
  assert.match(app, /visitorCount: null,/);
});

test('visitor badge has a compact responsive treatment matching the topbar controls', () => {
  assert.match(style, /\.visitor-count\s*\{[\s\S]*?height:\s*34px;[\s\S]*?font-variant-numeric:\s*tabular-nums;/);
  assert.match(style, /@media \(max-width: 820px\)[\s\S]*?\.visitor-count\s*\{[\s\S]*?font-size:\s*11px;/);
});
