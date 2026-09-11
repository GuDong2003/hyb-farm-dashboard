import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');

test('crop trend modal requests a targeted crop/window series instead of full history', () => {
  const openSource = app.slice(
    app.indexOf('function openCropTrendModal'),
    app.indexOf('function renderFarmExperienceResult')
  );

  assert.match(app, /const CLOUD_PRICE_SERIES_ENDPOINT = '\/api\/price-series';/);
  assert.match(app, /async function loadCropTrendHistory\(/);
  assert.match(app, /CLOUD_PRICE_SERIES_ENDPOINT.*seedId=/s);
  assert.match(openSource, /loadCropTrendHistory\(seedId, initialTrendHistoryWindow\(\), false\)/);
  assert.doesNotMatch(openSource, /loadHistoryAlerts\(/);
});

test('trend scale changes load only the selected crop/window when it is not cached', () => {
  assert.match(app, /function trendHistoryWindowForScale\(value\)/);
  assert.match(app, /loadCropTrendHistory\(state\.trendModalSeedId, trendHistoryWindowForScale\(/);
  assert.match(app, /trendHistoryCache/);
});

test('a scale request reapplies its viewport after the wider targeted series arrives', () => {
  assert.match(app, /trendHistoryPromise[\s\S]*?activeTrendChartBounds\(\)[\s\S]*?state\.trendModalVisibleWindowMs/);
  assert.match(app, /button\.dataset\.trendScale === 'all'/);
});
