import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');
const styleSource = await readFile(new URL('../web/style.css', import.meta.url), 'utf8');

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

test('mouse and touch pointer dragging shift the fixed time anchor', () => {
  assert.match(appSource, /addEventListener\('pointerdown'/);
  assert.match(appSource, /addEventListener\('pointermove'/);
  assert.match(appSource, /addEventListener\('pointerup'/);
  assert.match(appSource, /addEventListener\('pointercancel'/);
  assert.match(appSource, /Math\.abs\(deltaX\) < 4/);
  assert.match(appSource, /CHART_TIME\.shiftVisibleEnd\(\s*trendChartDrag\.startVisibleEnd,\s*-deltaX,/);
  assert.match(appSource, /setPointerCapture\(event\.pointerId\)/);
});

test('horizontal wheel gestures move the anchor while vertical scrolling remains native', () => {
  assert.match(appSource, /const horizontalDelta = Math\.abs\(event\.deltaX\) > Math\.abs\(event\.deltaY\)/);
  assert.match(appSource, /event\.shiftKey \? event\.deltaY : 0/);
  assert.match(appSource, /addEventListener\('wheel',[\s\S]*?\{ passive: false \}\)/);
});

test('dragging uses grab affordances without exposing a native scrollbar', () => {
  assert.match(styleSource, /\.history-line-chart-wrap\.draggable\s*\{[^}]*cursor:\s*grab;[^}]*touch-action:\s*pan-y;[^}]*user-select:\s*none;/s);
  assert.match(styleSource, /\.history-line-chart-wrap\.draggable\.dragging\s*\{[^}]*cursor:\s*grabbing;/s);
  assert.doesNotMatch(styleSource, /\.history-line-chart-wrap\.scrollable/);
});

test('Y-axis labels use unscaled HTML positioned against the SVG grid', () => {
  assert.match(appSource, /<div class="history-line-y-axis" data-history-y-axis/);
  assert.doesNotMatch(appSource, /<svg class="history-line-y-axis"/);
  assert.match(appSource, /class="history-line-y-label" style="top:\$\{formatNumber\(tickTop, 4\)\}%"/);
  assert.match(styleSource, /\.history-line-y-label\s*\{[^}]*position:\s*absolute;[^}]*right:\s*8px;[^}]*transform:\s*translateY\(-50%\);/s);
});
