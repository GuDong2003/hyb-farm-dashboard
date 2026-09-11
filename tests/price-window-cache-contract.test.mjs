import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');

test('homepage keeps compact trend results per selected window', () => {
  assert.match(app, /priceWindowCache/);
  assert.match(app, /priceWindowChangeForSeed\(seed\.id, trendWindowLabel\(\)\)/);
  assert.match(app, /loadCloudPriceTrend\(trendWindowLabel\(\), false\)/);
  assert.match(app, /PRICE_TREND_ENDPOINT/);
  assert.match(app, /cache: force \? 'reload' : 'default'/);
});

test('trend-window changes load only the selected compact cache entry', () => {
  assert.match(app, /loadCloudPriceTrend\(trendWindow\.value, false\)/);
  assert.match(app, /\/api\/price-trends\?window=/);
  assert.match(app, /state\.priceWindowCache\[windowValue\]/);
});

test('trend loading preserves valid data and retries a temporary unavailable response', () => {
  assert.match(app, /const PRICE_TREND_RETRY_MS = 60 \* 1000;/);
  assert.match(app, /function schedulePriceTrendRetry\(windowValue\)/);
  assert.match(app, /const incomingTrends = data\.trends && typeof data\.trends === 'object'\s*\? data\.trends\s*:\s*\{\};/);
  assert.match(app, /!Object\.keys\(incomingTrends\)\.length\s*&&\s*Object\.keys\(previousTrends \|\| \{\}\)\.length/);
});

test('homepage history navigation prefers the cloud snapshot count from the default KV snapshot', () => {
  assert.match(app, /cloudHistoryCount:\s*null,/);
  assert.match(app, /const cloudHistoryCount = Number\(snapshot && snapshot\.historySnapshotCount\)/);
  assert.match(app, /const normalizedCloudHistoryCount = Math\.floor\(cloudHistoryCount\)[\s\S]*?state\.cloudHistoryCount = normalizedCloudHistoryCount/);
  assert.match(app, /function historyNavigationCount\(\)\s*\{[\s\S]*?if \(Number\.isFinite\(state\.cloudHistoryCount\)\) return state\.cloudHistoryCount;/);
});
