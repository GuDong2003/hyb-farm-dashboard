# Fixed Viewport Drag Price Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the original fixed-width price chart, add Beijing-date ticks, and let mouse, trackpad, and touch gestures continuously move the visible time window without a native scrollbar.

**Architecture:** Keep complete history in memory but render only the range derived from `trendModalVisibleEnd` and the selected duration. Replace scroll-width math with pure visible-range and pixel-to-time helpers, then attach Pointer Events and horizontal-wheel handlers to the fixed chart wrapper; every gesture updates the anchor and redraws the same fixed SVG.

**Tech Stack:** Vanilla JavaScript, Pointer Events, SVG, CSS, Node `node:test`, Cloudflare Workers/Wrangler.

---

### Task 1: Replace scroll geometry with visible-window math

**Files:**
- Modify: `web/chart-time-utils.js:22-94`
- Modify: `tests/chart-time-utils.test.mjs:13-83`

- [ ] **Step 1: Replace the old scrolling tests with failing fixed-window tests**

Keep the existing `30d` and Beijing-day tests. Remove tests for `isScrollableWindow`, `plotWidth`, and `visibleTimeRange`, then add:

```js
test('finite windows default to the latest exact range', () => {
  const minTime = Date.parse('2026-07-01T00:00:00.000Z');
  const maxTime = minTime + 35 * chartTime.DAY_MS;
  assert.deepEqual(
    chartTime.visibleRange(minTime, maxTime, 7 * chartTime.DAY_MS, null),
    { start: maxTime - 7 * chartTime.DAY_MS, end: maxTime }
  );
});

test('visible end is clamped to the earliest complete window and latest point', () => {
  const minTime = Date.parse('2026-07-01T00:00:00.000Z');
  const maxTime = minTime + 35 * chartTime.DAY_MS;
  const windowMs = 7 * chartTime.DAY_MS;
  assert.equal(chartTime.clampVisibleEnd(minTime, maxTime, windowMs, minTime), minTime + windowMs);
  assert.equal(chartTime.clampVisibleEnd(minTime, maxTime, windowMs, maxTime + windowMs), maxTime);
});

test('drag pixel delta shifts the visible end continuously', () => {
  const minTime = Date.parse('2026-07-01T00:00:00.000Z');
  const maxTime = minTime + 35 * chartTime.DAY_MS;
  const windowMs = 7 * chartTime.DAY_MS;
  assert.equal(
    chartTime.shiftVisibleEnd(maxTime, -350, 700, windowMs, minTime, maxTime),
    maxTime - windowMs / 2
  );
  assert.equal(chartTime.shiftVisibleEnd(maxTime, 350, 700, windowMs, minTime, maxTime), maxTime);
});

test('all history and short history return one fixed range', () => {
  const minTime = Date.parse('2026-08-01T00:00:00.000Z');
  const maxTime = minTime + 3 * chartTime.DAY_MS;
  assert.deepEqual(chartTime.visibleRange(minTime, maxTime, 0, null), { start: minTime, end: maxTime });
  assert.deepEqual(chartTime.visibleRange(minTime, maxTime, 7 * chartTime.DAY_MS, null), { start: minTime, end: maxTime });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `node --test tests/chart-time-utils.test.mjs`

Expected: FAIL because `visibleRange`, `clampVisibleEnd`, and `shiftVisibleEnd` do not exist.

- [ ] **Step 3: Implement the fixed-window helpers and remove scroll helpers**

Replace `isScrollableWindow`, `plotWidth`, and `visibleTimeRange` with:

```js
function clampVisibleEnd(minValue, maxValue, windowValue, visibleEndValue) {
  const minTime = Number(minValue);
  const maxTime = Number(maxValue);
  const windowMs = Number(windowValue);
  if (!Number.isFinite(minTime) || !Number.isFinite(maxTime) || maxTime <= minTime) return maxTime;
  if (!Number.isFinite(windowMs) || windowMs <= 0 || maxTime - minTime <= windowMs) return maxTime;
  const earliestEnd = minTime + windowMs;
  const hintedEnd = visibleEndValue == null ? maxTime : Number(visibleEndValue);
  const visibleEnd = Number.isFinite(hintedEnd) ? hintedEnd : maxTime;
  return Math.min(maxTime, Math.max(earliestEnd, visibleEnd));
}

function visibleRange(minValue, maxValue, windowValue, visibleEndValue) {
  const minTime = Number(minValue);
  const maxTime = Number(maxValue);
  const windowMs = Number(windowValue);
  if (!Number.isFinite(minTime) || !Number.isFinite(maxTime) || maxTime <= minTime) {
    return { start: minTime, end: maxTime };
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0 || maxTime - minTime <= windowMs) {
    return { start: minTime, end: maxTime };
  }
  const end = clampVisibleEnd(minTime, maxTime, windowMs, visibleEndValue);
  return { start: end - windowMs, end };
}

function shiftVisibleEnd(currentEndValue, pixelDeltaValue, viewportWidthValue, windowValue, minValue, maxValue) {
  const currentEnd = Number(currentEndValue);
  const pixelDelta = Number(pixelDeltaValue);
  const viewportWidth = Math.max(1, Number(viewportWidthValue) || 1);
  const windowMs = Number(windowValue);
  const nextEnd = currentEnd + ((Number.isFinite(pixelDelta) ? pixelDelta : 0) / viewportWidth) * windowMs;
  return clampVisibleEnd(minValue, maxValue, windowMs, nextEnd);
}
```

Export the three new functions from `HYBChartTime` and leave the date helpers unchanged.

- [ ] **Step 4: Run the focused tests**

Run: `node --test tests/chart-time-utils.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit the math change**

```bash
git add web/chart-time-utils.js tests/chart-time-utils.test.mjs
git commit -m "test: define fixed chart window movement"
```

### Task 2: Restore fixed-width current-window rendering

**Files:**
- Modify: `web/app.js:1246-1540`

- [ ] **Step 1: Derive the current range from the anchor**

Replace `historyChartInitialRange()` with:

```js
function historyChartRange(model, visibleEndHint) {
  return CHART_TIME.visibleRange(
    model.minTime,
    model.maxTime,
    chartWindowMilliseconds(model.chartWindow),
    visibleEndHint
  );
}
```

Keep `historyLineChartModel()` responsible only for complete history, anomaly timestamps, range metadata, and selected window value.

Remove the model-level `filteredPoints`, `points`, and `hiddenAnomalyCount`. Store the requested hide state without filtering complete history:

```js
return {
  chartWindow,
  events,
  timelinePoints: allPoints,
  anomalyTimes,
  hideAnomalies,
  minTime: allPoints.length ? Number(allPoints[0].capturedAt) : 0,
  maxTime: allPoints.length ? Number(allPoints[allPoints.length - 1].capturedAt) : 0
};
```

- [ ] **Step 2: Make the frame render only current-window points**

At the start of `renderHistoryLineChartFrame()`, derive points in this order:

```js
const visibleTimelinePoints = historyPointsInRange(model.timelinePoints, range);
const filteredPoints = model.hideAnomalies
  ? visibleTimelinePoints.filter((point) => !model.anomalyTimes.has(point.capturedAt))
  : visibleTimelinePoints;
const points = filteredPoints.length >= 2 ? filteredPoints : visibleTimelinePoints;
const hiddenVisibleCount = visibleTimelinePoints.length - points.length;
```

Use `points` for prices, trend direction, trend path, point markers, first/last values, and visible statistics. Set the X mapping to the exact selected range rather than complete history:

```js
const x = (time) => pad.left
  + ((time - range.start) / Math.max(1, range.end - range.start))
  * (width - pad.left - pad.right);
```

Do not draw points from `model.points` or use complete-history times in the path.

When `points.length < 2`, keep the wrapper draggable but return `hasEnoughPoints: false`, a centered SVG label `当前区间数据不足`, `-` for the percentage, and no trend path. This lets the user drag away from a sparse interval instead of replacing the whole chart with a non-interactive empty panel.

- [ ] **Step 3: Generate X-axis labels from the current range**

Use daily slots only for multi-day choices and the complete-history choice when it spans at least one day:

```js
const showDailySlots = ['7d', '30d', 'all'].includes(model.chartWindow)
  && range.end - range.start >= CHART_TIME.DAY_MS;
const dailySlots = showDailySlots ? CHART_TIME.beijingDaySlots(range.start, range.end) : [];
```

Map every `boundaryAt` and `labelAt` with the range-based `x()` function. Retain dense label rotation when the current-view day width is under 42 pixels. For `1h / 6h / 12h / 24h`, render the first and last visible point with `formatChartDate()`.

- [ ] **Step 4: Remove wide SVG markup**

Inside `renderHistoryLineChart()` use the fixed SVG coordinate width:

```js
const width = 420;
const height = 250;
const range = historyChartRange(model, chartOptions.visibleEnd);
const frame = renderHistoryLineChartFrame(model, chartOptions, range, width, height);
const draggable = Boolean(chartWindowMilliseconds(model.chartWindow)
  && model.maxTime - model.minTime > chartWindowMilliseconds(model.chartWindow));
```

Render one fixed wrapper and fixed SVG:

```html
<div class="history-line-chart-wrap ${draggable ? 'draggable' : ''}"
  data-history-chart-wrap ${draggable ? 'data-history-chart-drag' : ''}>
  <svg class="history-line-chart" data-history-plot viewBox="0 0 420 250"
    preserveAspectRatio="none">…</svg>
</div>
```

Remove `scrollable`, `data-history-chart-scroll`, pixel width/min-width styles, and every call to `CHART_TIME.plotWidth()` or `CHART_TIME.visibleTimeRange()`.

- [ ] **Step 5: Convert the viewport updater to anchor-only redraws**

Rename `updateTrendChartViewport(scrollContainer, repositionFromVisibleEnd)` to `updateTrendChartViewport(chartWrap)`. Query the same axis, layout, stats, meta, and plot elements, then compute:

```js
const range = historyChartRange(model, state.trendModalVisibleEnd);
const frame = renderHistoryLineChartFrame(model, chartOptions, range, 420, 250);
state.trendModalVisibleEnd = range.end;
```

Update the existing DOM fragments without changing element widths or `scrollLeft`. Change `scheduleTrendChartViewportRefresh()` to query `[data-history-chart-wrap]` and call the new updater.

- [ ] **Step 6: Run syntax and unit checks**

Run: `npm test && node --check web/app.js && node --check web/chart-time-utils.js`

Expected: all tests PASS and both syntax checks exit 0.

- [ ] **Step 7: Commit fixed rendering**

```bash
git add web/app.js
git commit -m "fix: restore fixed price chart viewport"
```

### Task 3: Add pointer drag, trackpad swipe, and touch movement

**Files:**
- Modify: `web/app.js:53-57, 2065-2110, 2350-2360`
- Modify: `web/style.css:432-468`

- [ ] **Step 1: Add transient gesture state**

Next to `trendChartUpdateFrame`, add:

```js
let trendChartDrag = null;
let suppressTrendPointClick = false;
```

Reset both values when rendering, closing the modal, opening another crop, or changing the chart range.

- [ ] **Step 2: Add one helper for current chart bounds**

Add:

```js
function activeTrendChartBounds() {
  const trend = cropTrendData(state.trendModalSeedId);
  const model = historyLineChartModel(trend.group, trend.result, activeTrendChartOptions());
  return { model, minTime: model.minTime, maxTime: model.maxTime };
}
```

The gesture handlers use this helper so pointer and wheel logic share the same limits.

- [ ] **Step 3: Bind Pointer Events for mouse and touch dragging**

Create `bindTrendChartGestures(chartWrap)` with these handlers:

```js
chartWrap.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !chartWrap.hasAttribute('data-history-chart-drag')) return;
  const { model } = activeTrendChartBounds();
  const range = historyChartRange(model, state.trendModalVisibleEnd);
  trendChartDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startVisibleEnd: range.end,
    dragged: false
  };
  chartWrap.setPointerCapture(event.pointerId);
});

chartWrap.addEventListener('pointermove', (event) => {
  if (!trendChartDrag || trendChartDrag.pointerId !== event.pointerId) return;
  const deltaX = event.clientX - trendChartDrag.startX;
  if (!trendChartDrag.dragged && Math.abs(deltaX) < 4) return;
  trendChartDrag.dragged = true;
  const { model } = activeTrendChartBounds();
  state.trendModalVisibleEnd = CHART_TIME.shiftVisibleEnd(
    trendChartDrag.startVisibleEnd,
    -deltaX,
    chartWrap.clientWidth,
    chartWindowMilliseconds(model.chartWindow),
    model.minTime,
    model.maxTime
  );
  chartWrap.classList.add('dragging');
  if (event.cancelable) event.preventDefault();
  scheduleTrendChartViewportRefresh();
});
```

Finish the pointer sequence with:

```js
const finishTrendChartDrag = (event) => {
  if (!trendChartDrag || trendChartDrag.pointerId !== event.pointerId) return;
  suppressTrendPointClick = trendChartDrag.dragged;
  if (chartWrap.hasPointerCapture(event.pointerId)) chartWrap.releasePointerCapture(event.pointerId);
  chartWrap.classList.remove('dragging');
  trendChartDrag = null;
};
chartWrap.addEventListener('pointerup', finishTrendChartDrag);
chartWrap.addEventListener('pointercancel', finishTrendChartDrag);
```

- [ ] **Step 4: Bind horizontal wheel gestures**

Add a non-passive wheel listener:

```js
chartWrap.addEventListener('wheel', (event) => {
  const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ? event.deltaX
    : event.shiftKey ? event.deltaY : 0;
  if (!horizontalDelta || !chartWrap.hasAttribute('data-history-chart-drag')) return;
  const { model } = activeTrendChartBounds();
  const range = historyChartRange(model, state.trendModalVisibleEnd);
  state.trendModalVisibleEnd = CHART_TIME.shiftVisibleEnd(
    range.end,
    horizontalDelta,
    chartWrap.clientWidth,
    chartWindowMilliseconds(model.chartWindow),
    model.minTime,
    model.maxTime
  );
  event.preventDefault();
  scheduleTrendChartViewportRefresh();
}, { passive: false });
```

Vertical wheel gestures without Shift remain untouched so the page can scroll normally.

- [ ] **Step 5: Preserve point clicks and suppress post-drag clicks**

Replace the existing chart-wrapper click listener with:

```js
chartWrap.addEventListener('click', (event) => {
  if (suppressTrendPointClick) {
    suppressTrendPointClick = false;
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const point = event.target.closest && event.target.closest('[data-history-point]');
  if (point) {
    event.stopPropagation();
    point.focus();
  }
}, true);
```

- [ ] **Step 6: Remove scrollbar CSS and add drag affordances**

Delete `.history-line-chart-wrap.scrollable`. Keep `overflow: hidden`, then add:

```css
.history-line-chart-wrap.draggable { cursor: grab; touch-action: pan-y; user-select: none; }
.history-line-chart-wrap.draggable.dragging { cursor: grabbing; }
```

- [ ] **Step 7: Run checks and commit the gesture layer**

Run: `npm test && node --check web/app.js && git diff --check`

Expected: all tests PASS with no syntax or whitespace errors.

```bash
git add web/app.js web/style.css
git commit -m "feat: drag fixed price chart through history"
```

### Task 4: Update documentation and remove obsolete scroll wording

**Files:**
- Modify: `README.md:44-52`
- Modify: `docs/superpowers/plans/2026-08-07-visible-window-price-chart.md`

- [ ] **Step 1: Rewrite the README chart interaction bullets**

Replace the finite-range and scrolling bullets with:

```markdown
- 单作物曲线支持 `1h`、`6h`、`12h`、`24h`、`7d`、`30d` 和全部历史范围，默认继承主页涨跌幅区间。
- 曲线始终保持固定宽度：有限范围表示当前显示的精确时长，默认停在最新数据；可在曲线区域使用鼠标拖拽、触控板横向滑动或移动端左右滑动查看更早和更新的数据，不显示横向滚动条。
- 横坐标按北京时间显示日期；`7d`、`30d` 和全部历史使用每日日期与竖向网格线，日期密集时自动倾斜。
- 拖动时间窗口时，纵坐标、首末价格、涨跌幅和整条曲线颜色实时按当前区间更新；红色表示上涨、绿色表示下跌、灰色表示持平。
```

- [ ] **Step 2: Mark the wide-timeline plan as superseded**

Add this note below the title:

```markdown
> 本计划记录的超宽 SVG 滚动方案已停止使用；最终交互改为固定宽度 SVG，通过鼠标、触控板和触摸手势移动时间锚点。详见 `../specs/2026-08-07-fixed-viewport-drag-price-chart-design.md`。
```

- [ ] **Step 3: Check and commit documentation**

Run: `git diff --check`

Expected: exit 0.

```bash
git add README.md docs/superpowers/plans/2026-08-07-visible-window-price-chart.md
git commit -m "docs: describe draggable fixed price chart"
```

### Task 5: Browser interaction verification and release checks

**Files:**
- Verify all modified files; no new production files.

- [ ] **Step 1: Run the complete automated verification**

Run:

```bash
npm test
node --check web/app.js
node --check web/chart-time-utils.js
git diff --check HEAD~4
```

Expected: all tests PASS, both syntax checks exit 0, and no whitespace errors are reported.

- [ ] **Step 2: Run a Worker dry-run**

Run:

```bash
dry_run_dir=$(mktemp -d /tmp/hyb-farm-fixed-chart-dry-run.XXXXXX)
npm run deploy -- --dry-run --outdir "$dry_run_dir"
```

Expected: Wrangler reads all web assets and exits with `--dry-run: exiting now.`

- [ ] **Step 3: Verify interactions with local synthetic history**

Start Wrangler locally, apply D1 migrations, and seed at least 45 daily tomato points containing an uptrend, downtrend, and recovery. In the browser verify:

- `7d` uses the full fixed chart width and shows daily Beijing dates.
- No element has `scrollWidth > clientWidth`; no horizontal scrollbar is visible.
- Dragging right changes the visible dates to earlier history and produces the expected green downtrend segment.
- Dragging left returns toward the latest red uptrend.
- Horizontal trackpad movement changes the same anchor; ordinary vertical page scrolling still works.
- A click under 4px still opens/focuses a point tooltip; a completed drag does not trigger a point click.
- `30d` uses dense angled daily labels; `all` shows all history and does not drag.
- Hiding points or anomalies preserves the current dates and first/last statistics.
- Browser console contains no errors or warnings.

- [ ] **Step 4: Report the local result before any public push**

Do not push or deploy without the user's explicit publication instruction. Report the commit list, automated checks, and browser evidence, then ask whether to push the detached `HEAD` directly to `main`.
