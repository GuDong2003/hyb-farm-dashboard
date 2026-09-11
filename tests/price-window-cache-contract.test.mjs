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
