import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');

test('price chart renders one fixed SVG viewport without native scrolling geometry', () => {
  assert.match(appSource, /const width = 420;/);
  assert.match(appSource, /viewBox="0 0 420 250"/);
  assert.match(appSource, /CHART_TIME\.visibleRange\(/);
  assert.doesNotMatch(appSource, /CHART_TIME\.(?:plotWidth|visibleTimeRange)\(/);
  assert.doesNotMatch(appSource, /data-history-chart-scroll|\.scrollLeft/);
});

test('current range is selected before anomaly filtering and chart statistics', () => {
  assert.match(appSource, /const visibleTimelinePoints = historyPointsInRange\(model\.timelinePoints, range\);/);
  assert.match(appSource, /visibleTimelinePoints\.filter\(\(point\) => !model\.anomalyTimes\.has\(point\.capturedAt\)\)/);
  assert.match(appSource, /const points = filteredPoints\.length >= 2 \? filteredPoints : visibleTimelinePoints;/);
  assert.match(appSource, /const x = \(time\) => pad\.left\s*\+ \(\(time - range\.start\) \/ Math\.max\(1, range\.end - range\.start\)\)/);
});
