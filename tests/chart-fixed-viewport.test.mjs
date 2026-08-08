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
  assert.match(appSource, /const filteredTimelinePoints = model\.hideAnomalies/);
  assert.match(appSource, /historyPointsInRange\(model\.timelinePointsWithoutAnomalies, range\)/);
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

test('wheel gestures navigate finite windows in time units', () => {
  assert.match(appSource, /CHART_TIME\.wheelNavigationDelta\(event\.deltaX, event\.deltaY\)/);
  assert.match(appSource, /CHART_TIME\.navigationStepMilliseconds\(model\.chartWindow/);
  assert.match(appSource, /CHART_TIME\.shiftVisibleEndBySteps\(/);
  assert.match(appSource, /if \(!chartWrap\.hasAttribute\('data-history-chart-drag'\)\) return;/);
  assert.match(appSource, /addEventListener\('wheel',[\s\S]*?\{ passive: false \}\)/);
});

test('drag release keeps the continuously selected visible end', () => {
  const finishSource = appSource.slice(
    appSource.indexOf('const finishTrendChartDrag'),
    appSource.indexOf("chartWrap.addEventListener('pointerup'")
  );
  assert.match(finishSource, /finishTrendChartDrag/);
  assert.doesNotMatch(finishSource, /CHART_TIME\.snapVisibleEnd\(/);
});

test('chart animates natural y-axis domains without rebuilding alert data', () => {
  assert.match(appSource, /function transitionTrendChartAxis\(targetValue\)/);
  assert.match(appSource, /function renderAnimatedHistoryLineChartFrame\(/);
  assert.match(appSource, /CHART_TIME\.interpolatePriceDomain\(/);
  assert.doesNotMatch(appSource, /trendChartDragAxis/);
  assert.doesNotMatch(appSource, /CHART_TIME\.expandPriceDomain\(/);
  assert.match(appSource, /rawTimelinePoints/);
  assert.match(appSource, /CHART_TIME\.aggregatePricePoints\(/);
});

test('trend chart keeps a fixed axis column while the y-axis animates', () => {
  assert.match(appSource, /const TREND_CHART_FIXED_AXIS_WIDTH = 86;/);
  assert.match(appSource, /const axisWidth = TREND_CHART_FIXED_AXIS_WIDTH;/);
  assert.doesNotMatch(appSource, /axisWidth = Math\.min\(86, Math\.max\(48, 14 \+ widestYTick \* 6\.5\)\)/);
  assert.match(styleSource, /\.history-line-chart-layout\s*\{[^}]*grid-template-columns:\s*86px\s+minmax\(0, 1fr\);/s);
});

test('chart keeps visible raw anomaly markers inside the y-axis domain', () => {
  assert.match(appSource, /const visibleEventPrices =/);
  assert.match(appSource, /visibleEvents\.forEach[\s\S]*?visibleEventPrices\.push/);
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

test('anomalies do not draw a second connection over the real trend path', () => {
  assert.doesNotMatch(appSource, /history-line-anomaly-segment/);
  assert.doesNotMatch(styleSource, /history-line-anomaly-segment/);
  assert.match(appSource, /history-line-anomaly-band/);
  assert.match(appSource, /history-line-marker/);
});

test('full history samples date ticks and aggregates only chart display data', () => {
  assert.match(appSource, /model\.chartWindow === 'all'\s*\? CHART_TIME\.sampleSlots\(dailySlots, 8\)/);
  assert.match(appSource, /const visibleTimelinePoints = historyPointsInRange\(model\.timelinePoints, range\);/);
  assert.match(appSource, /rawTimelinePoints/);
  assert.match(appSource, /CHART_TIME\.aggregatePricePoints\(/);
});

test('all history never advertises drag navigation', () => {
  assert.match(appSource, /const draggable = Boolean\(windowMs && model\.maxTime - model\.minTime > windowMs\);/);
});

test('point tooltip is one fixed-size HTML overlay outside the SVG', () => {
  assert.match(appSource, /<div class="history-line-point-tooltip" data-history-point-tooltip/);
  assert.match(appSource, /data-history-point-time=/);
  assert.match(appSource, /data-history-point-price=/);
  assert.doesNotMatch(appSource, /<g class="history-line-point-tooltip"/);
  assert.match(styleSource, /\.history-line-point-tooltip\s*\{[^}]*position:\s*absolute;[^}]*width:\s*154px;[^}]*height:\s*42px;/s);
});

test('tooltip is populated and positioned from the active SVG point', () => {
  assert.match(appSource, /function showTrendPointTooltip\(chartWrap, point\)/);
  assert.match(appSource, /point\.getBoundingClientRect\(\)/);
  assert.match(appSource, /tooltip\.style\.left/);
  assert.match(appSource, /tooltip\.style\.top/);
  assert.match(appSource, /function hideTrendPointTooltip\(chartWrap\)/);
});

test('price input hides native steppers and gives the value its full width', () => {
  assert.match(styleSource, /\.price-input\s*\{[^}]*padding:\s*0 7px;[^}]*appearance:\s*textfield;/s);
  assert.match(
    styleSource,
    /\.price-input::-webkit-outer-spin-button,\s*\.price-input::-webkit-inner-spin-button\s*\{[^}]*-webkit-appearance:\s*none;[^}]*margin:\s*0;/s,
  );
});

test('trend trigger replaces the direction glyph on the percentage left', () => {
  const renderRowSource = appSource.slice(
    appSource.indexOf('function renderRow'),
    appSource.indexOf('function renderSettings'),
  );

  assert.doesNotMatch(appSource, /price-delta-arrow/);
  assert.doesNotMatch(styleSource, /\.price-delta-arrow/);
  assert.doesNotMatch(appSource, /const arrow = value > 0/);
  assert.match(
    renderRowSource,
    /<div class="price-change-cell">\$\{renderCropTrendTrigger\(row\)\}\$\{renderPriceChangeRate\(row\.priceChangeRate\)\}<\/div>/,
  );
  assert.equal((renderRowSource.match(/renderCropTrendTrigger\(row\)/g) ?? []).length, 1);
});
