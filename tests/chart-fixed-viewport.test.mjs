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
  assert.match(appSource, /const visibleTimelineContext = historyPointsWithContext\(model\.timelinePoints, range\);/);
  assert.match(appSource, /const visibleTimelinePoints = visibleTimelineContext\.visiblePoints;/);
  assert.match(appSource, /const filteredTimelineContext = model\.hideAnomalies/);
  assert.match(appSource, /const filteredTimelinePoints = filteredTimelineContext\.visiblePoints;/);
  assert.match(appSource, /historyPointsWithContext\(model\.timelinePointsWithoutAnomalies, range\)/);
  assert.match(appSource, /const points = filteredPoints\.length >= 2 \? filteredPoints : visibleTimelineContext\.points;/);
  assert.match(appSource, /function historyPointsWithContext\(points, range\)/);
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

test('wheel gestures zoom the unified timeline around the cursor', () => {
  assert.match(appSource, /CHART_TIME\.wheelNavigationDelta\(event\.deltaX, event\.deltaY\)/);
  assert.match(appSource, /const maxWindowMs = historySpan;/);
  assert.match(appSource, /const minWindowMs = Math\.min\(CHART_TIME\.HOUR_MS, maxWindowMs\);/);
  assert.match(appSource, /let pointerRatio =/);
  assert.match(appSource, /if \(atLeftEdge && !atRightEdge\) pointerRatio = 0;/);
  assert.match(appSource, /if \(atRightEdge && !atLeftEdge\) pointerRatio = 1;/);
  assert.match(appSource, /const nextWindowMs =/);
  assert.match(appSource, /const anchorPoint = activePoint \|\| pointerPoint;/);
  assert.match(appSource, /const anchorTime = Number\(anchorPoint && anchorPoint\.dataset\.historyPointAt\);/);
  assert.match(appSource, /pointerRatio = \(anchorTime - range\.start\) \/ Math\.max\(1, currentWindowMs\);/);
  assert.match(appSource, /startTrendChartViewportTransition\(model, nextWindowMs, nextVisibleEnd\);/);
  assert.match(appSource, /function startTrendChartViewportTransition\(model, visibleWindowMs, visibleEnd\)/);
  assert.match(appSource, /function sampleTrendChartViewportTransition\(nowValue\)/);
  assert.match(appSource, /TREND_CHART_VIEWPORT_TRANSITION_MS = 180;/);
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

test('trend popup exposes the requested fixed time scales', () => {
  assert.match(appSource, /const TREND_SCALE_OPTIONS = \[/);
  for (const value of ['6h', '12h', '1d', '3d', '7d', '30d', '90d', 'all']) {
    assert.match(appSource, new RegExp(`value: '${value}'`));
  }
  assert.match(appSource, /function renderChartScalePicker\(model\)/);
  assert.match(appSource, /data-trend-scale/);
  assert.match(appSource, /trendScaleMilliseconds\(button\.dataset\.trendScale\)/);
  assert.doesNotMatch(appSource, /data-trend-date/);
  assert.doesNotMatch(appSource, /function beijingDateValue\(/);
  assert.doesNotMatch(appSource, /function beijingDateStart\(/);
  assert.doesNotMatch(appSource, /data-trend-window/);
  assert.doesNotMatch(appSource, /function renderChartWindowSelect\(/);
  assert.doesNotMatch(appSource, /preserveTrendChartCenterForWindow/);
  assert.match(appSource, /trendModalCenterAt: null/);
  assert.match(appSource, /state\.trendModalCenterAt = \(range\.start \+ range\.end\) \/ 2;/);
  assert.match(appSource, /state\.trendModalVisibleEnd = CHART_TIME\.clampVisibleEnd\(/);
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
  assert.match(appSource, /const visibleTimelineContext = historyPointsWithContext\(model\.timelinePoints, range\);/);
  assert.match(appSource, /rawTimelinePoints/);
  assert.match(appSource, /CHART_TIME\.aggregatePricePoints\(/);
});

test('all history enables wheel interaction and gains dragging after zoom', () => {
  assert.match(appSource, /const draggable = Boolean\(model\.visibleWindowMs && model\.maxTime - model\.minTime > model\.visibleWindowMs\);/);
  assert.match(appSource, /const interactive = Boolean\(model\.maxTime > model\.minTime && \(draggable \|\| isAdaptiveTrendWindow\(model\.chartWindow\)\)\);/);
  assert.match(appSource, /chartWrap\.classList\.toggle\('draggable', draggable\);/);
});

test('anomaly details and crosshair are gated by the zoom level', () => {
  assert.match(appSource, /showAnomalyDetails: visibleWindowMs <= CHART_TIME\.DAY_MS/);
  assert.match(appSource, /const visibleEvents = model\.showAnomalyDetails && !model\.hideAnomalies/);
  assert.match(appSource, /data-history-crosshair/);
  assert.match(appSource, /function showTrendCrosshair\(chartWrap, point, pointer\)/);
  assert.match(appSource, /function nearestTrendPoint\(chartWrap, clientX\)/);
  assert.match(styleSource, /\.history-line-crosshair\.visible\s*\{[^}]*opacity: 1;/s);
});

test('crosshair vertical snaps to the point while horizontal follows the pointer', () => {
  assert.match(appSource, /function trendCrosshairYFromPointer\(chartWrap, pointer, fallbackY\)/);
  assert.match(appSource, /const crosshairY = trendCrosshairYFromPointer\(chartWrap, pointer, pointY\);/);
  assert.match(appSource, /horizontal\.setAttribute\('y1', String\(crosshairY\)\);/);
  assert.match(appSource, /showTrendPointTooltip\(chartWrap, point, pointer\);/);
  assert.match(appSource, /const pointerX = Number\.isFinite\(Number\(pointer && pointer\.clientX\)\)/);
  assert.match(appSource, /const pointerY = Number\.isFinite\(Number\(pointer && pointer\.clientY\)\)/);
  assert.match(appSource, /data-history-point-at=/);
});

test('adaptive trend gaps use dashed connectors without changing the short-window path', () => {
  assert.match(appSource, /const gapThreshold = model\.displayBucketMs > 0 \? model\.displayBucketMs \* 1\.5 : 0;/);
  assert.match(appSource, /history-line-gap-path/);
  assert.match(styleSource, /\.history-line-gap-path\s*\{[^}]*stroke-dasharray: 5 4;/s);
});

test('zoomed chart includes one adjacent point on either side of the visible range', () => {
  assert.match(appSource, /if \(firstVisibleIndex > 0\) contextPoints\.push\(sortedPoints\[firstVisibleIndex - 1\]\);/);
  assert.match(appSource, /if \(lastVisibleIndex < sortedPoints\.length - 1\) contextPoints\.push\(sortedPoints\[lastVisibleIndex \+ 1\]\);/);
  assert.match(appSource, /const statsPoints = filteredTimelinePoints\.length >= 2/);
  assert.match(appSource, /const pointMarkers = statsPoints\.map/);
});

test('bucketed boundary samples align with exact range edges', () => {
  assert.match(appSource, /const hasSourceAtRangeStart = sourceTimes\.some/);
  assert.match(appSource, /const hasSourceAtRangeEnd = sourceTimes\.some/);
  assert.match(appSource, /const boundaryCapturedAt = hasSourceAtRangeEnd && !hasSourceAtRangeStart/);
  assert.match(appSource, /boundaryCapturedAt != null/);
});

test('point tooltip is one fixed-size HTML overlay outside the SVG', () => {
  assert.match(appSource, /<div class="history-line-point-tooltip" data-history-point-tooltip/);
  assert.match(appSource, /data-history-point-time=/);
  assert.match(appSource, /data-history-point-price=/);
  assert.doesNotMatch(appSource, /<g class="history-line-point-tooltip"/);
  assert.match(styleSource, /\.history-line-point-tooltip\s*\{[^}]*position:\s*absolute;[^}]*width:\s*154px;[^}]*height:\s*42px;/s);
});

test('tooltip is populated and positioned from the active SVG point', () => {
  assert.match(appSource, /function showTrendPointTooltip\(chartWrap, point, pointer\)/);
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
