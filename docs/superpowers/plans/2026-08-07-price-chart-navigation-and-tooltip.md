# Price Chart Navigation and Tooltip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplicate-looking anomaly lines, make tooltips fixed-size, navigate fixed chart windows in hour/day units, and simplify full-history date labels while keeping `all` non-interactive.

**Architecture:** Keep all deterministic time math in `web/chart-time-utils.js` so it can be tested directly with Node. Keep the fixed SVG plot for data geometry, but render one reusable HTML tooltip over it in `web/app.js`; restrict anomaly rendering to bands and endpoint markers. Gesture handlers translate drag and wheel input into time-unit shifts, while `all` retains one immutable complete-history range.

**Tech Stack:** Browser JavaScript, SVG, HTML/CSS, Node.js built-in test runner, Cloudflare Wrangler.

---

### Task 1: Add deterministic stepped navigation and tick sampling

**Files:**
- Modify: `web/chart-time-utils.js`
- Modify: `tests/chart-time-utils.test.mjs`

- [ ] **Step 1: Write failing tests for window step sizes**

```js
test('hour windows step by one hour while long windows step by one day', () => {
  for (const value of ['1h', '6h', '12h', '24h']) {
    assert.equal(chartTime.navigationStepMilliseconds(value, '24h'), chartTime.HOUR_MS);
  }
  assert.equal(chartTime.navigationStepMilliseconds('7d', '24h'), chartTime.DAY_MS);
  assert.equal(chartTime.navigationStepMilliseconds('30d', '24h'), chartTime.DAY_MS);
  assert.equal(chartTime.navigationStepMilliseconds('all', '24h'), 0);
});
```

- [ ] **Step 2: Run the utility tests and verify RED**

Run: `node --test tests/chart-time-utils.test.mjs`

Expected: FAIL because `navigationStepMilliseconds` does not exist.

- [ ] **Step 3: Implement step selection**

```js
function navigationStepMilliseconds(value, fallback) {
  const normalized = normalizeWindow(value, fallback);
  if (normalized === 'all') return 0;
  return normalized === '7d' || normalized === '30d' ? DAY_MS : HOUR_MS;
}
```

Export it through `HYBChartTime`.

- [ ] **Step 4: Run the utility tests and verify GREEN**

Run: `node --test tests/chart-time-utils.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Write failing tests for step shifting, wheel direction, drag snapping, and tick sampling**

```js
test('visible ends shift by whole time steps and clamp to history bounds', () => {
  const minTime = Date.parse('2026-07-01T00:00:00.000Z');
  const maxTime = minTime + 35 * chartTime.DAY_MS;
  const windowMs = 7 * chartTime.DAY_MS;
  assert.equal(chartTime.shiftVisibleEndBySteps(maxTime, -1, chartTime.DAY_MS, windowMs, minTime, maxTime), maxTime - chartTime.DAY_MS);
  assert.equal(chartTime.shiftVisibleEndBySteps(maxTime, 1, chartTime.DAY_MS, windowMs, minTime, maxTime), maxTime);
});

test('wheel direction maps down to older and up to newer history', () => {
  assert.equal(chartTime.wheelNavigationDelta(0, 100), -100);
  assert.equal(chartTime.wheelNavigationDelta(0, -100), 100);
  assert.equal(chartTime.wheelNavigationDelta(70, 10), 70);
  assert.equal(chartTime.wheelNavigationDelta(-70, 10), -70);
});

test('drag results snap to steps measured back from the latest sample', () => {
  const minTime = 0;
  const maxTime = 100 * chartTime.HOUR_MS + 1234;
  const windowMs = 6 * chartTime.HOUR_MS;
  assert.equal(chartTime.snapVisibleEnd(maxTime - 1.6 * chartTime.HOUR_MS, chartTime.HOUR_MS, windowMs, minTime, maxTime), maxTime - 2 * chartTime.HOUR_MS);
});

test('slot sampling preserves the first and last date', () => {
  const slots = Array.from({ length: 40 }, (_, index) => ({ label: String(index) }));
  const sampled = chartTime.sampleSlots(slots, 8);
  assert.equal(sampled.length, 8);
  assert.equal(sampled[0], slots[0]);
  assert.equal(sampled.at(-1), slots.at(-1));
  assert.deepEqual(chartTime.sampleSlots(slots.slice(0, 3), 8), slots.slice(0, 3));
});
```

- [ ] **Step 6: Run the utility tests and verify RED**

Run: `node --test tests/chart-time-utils.test.mjs`

Expected: FAIL because the four helpers do not exist.

- [ ] **Step 7: Implement the minimal utility helpers**

```js
function shiftVisibleEndBySteps(currentEnd, stepCount, stepMs, windowMs, minTime, maxTime) {
  return clampVisibleEnd(minTime, maxTime, windowMs, Number(currentEnd) + Number(stepCount) * Number(stepMs));
}

function wheelNavigationDelta(deltaXValue, deltaYValue) {
  const deltaX = Number(deltaXValue) || 0;
  const deltaY = Number(deltaYValue) || 0;
  return Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : -deltaY;
}

function snapVisibleEnd(value, stepMsValue, windowMs, minTime, maxTime) {
  const stepMs = Number(stepMsValue);
  if (!Number.isFinite(stepMs) || stepMs <= 0) return clampVisibleEnd(minTime, maxTime, windowMs, value);
  const stepsFromLatest = Math.round((Number(maxTime) - Number(value)) / stepMs);
  return clampVisibleEnd(minTime, maxTime, windowMs, Number(maxTime) - stepsFromLatest * stepMs);
}

function sampleSlots(slotsValue, maxCountValue) {
  const slots = Array.isArray(slotsValue) ? slotsValue : [];
  const maxCount = Math.max(2, Math.floor(Number(maxCountValue) || 2));
  if (slots.length <= maxCount) return slots.slice();
  return Array.from({ length: maxCount }, (_, index) => slots[Math.round(index * (slots.length - 1) / (maxCount - 1))]);
}
```

Export the helpers through `HYBChartTime`.

- [ ] **Step 8: Run the utility tests and verify GREEN**

Run: `node --test tests/chart-time-utils.test.mjs`

Expected: all utility tests pass.

- [ ] **Step 9: Commit the utility behavior**

```bash
git add web/chart-time-utils.js tests/chart-time-utils.test.mjs
git commit -m "feat: add stepped chart time navigation"
```

### Task 2: Remove the redundant anomaly line and simplify `all` ticks

**Files:**
- Modify: `web/app.js`
- Modify: `web/style.css`
- Modify: `tests/chart-fixed-viewport.test.mjs`

- [ ] **Step 1: Write failing renderer tests**

Replace the old wheel-only source assertion where necessary, and add:

```js
test('anomalies do not draw a second connection over the real trend path', () => {
  assert.doesNotMatch(appSource, /history-line-anomaly-segment/);
  assert.doesNotMatch(styleSource, /history-line-anomaly-segment/);
  assert.match(appSource, /history-line-anomaly-band/);
  assert.match(appSource, /history-line-marker/);
});

test('full history samples date ticks without sampling trend data', () => {
  assert.match(appSource, /model\.chartWindow === 'all'\s*\? CHART_TIME\.sampleSlots\(dailySlots, 8\)/);
  assert.match(appSource, /const visibleTimelinePoints = historyPointsInRange\(model\.timelinePoints, range\);/);
});

test('all history never advertises drag navigation', () => {
  assert.match(appSource, /const draggable = Boolean\(windowMs && model\.maxTime - model\.minTime > windowMs\);/);
});
```

- [ ] **Step 2: Run the renderer tests and verify RED**

Run: `node --test tests/chart-fixed-viewport.test.mjs`

Expected: FAIL because the redundant segment is still present and full-history slots are not sampled.

- [ ] **Step 3: Render only anomaly bands and endpoint markers**

Change the anomaly group template to:

```js
return `<g class="history-line-anomaly ${direction}"><title>${escapeHtml(title)}</title><rect class="history-line-anomaly-band" x="${formatNumber(Math.min(startX, endX), 2)}" y="${pad.top}" width="${formatNumber(Math.max(2, Math.abs(endX - startX)), 2)}" height="${plotHeight}"></rect><circle class="history-line-marker ${direction}" cx="${formatNumber(endX, 2)}" cy="${formatNumber(y(currentPrice), 2)}" r="4"></circle></g>`;
```

Remove the unused `.history-line-anomaly-segment` and `.history-line-anomaly-start` CSS rules.

- [ ] **Step 4: Sample only full-history tick slots**

After creating `dailySlots`, derive:

```js
const visibleDailySlots = model.chartWindow === 'all'
  ? CHART_TIME.sampleSlots(dailySlots, 8)
  : dailySlots;
```

Use `visibleDailySlots` for x-axis labels and vertical grid lines. Calculate label density from the visible tick count:

```js
const dailySlotWidth = visibleDailySlots.length > 1
  ? width / (visibleDailySlots.length - 1)
  : width;
```

This keeps all eight sampled full-history labels horizontal while retaining dense rotated labels for the unsampled `30d` view. Leave `visibleTimelinePoints` untouched.

- [ ] **Step 5: Run the renderer and utility tests and verify GREEN**

Run: `node --test tests/chart-fixed-viewport.test.mjs tests/chart-time-utils.test.mjs`

Expected: all selected tests pass.

- [ ] **Step 6: Commit the renderer fix**

```bash
git add web/app.js web/style.css tests/chart-fixed-viewport.test.mjs
git commit -m "fix: avoid duplicate anomaly chart lines"
```

### Task 3: Replace the SVG tooltip with a fixed HTML overlay

**Files:**
- Modify: `web/app.js`
- Modify: `web/style.css`
- Modify: `tests/chart-fixed-viewport.test.mjs`

- [ ] **Step 1: Write failing tooltip structure and sizing tests**

```js
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
```

- [ ] **Step 2: Run the renderer tests and verify RED**

Run: `node --test tests/chart-fixed-viewport.test.mjs`

Expected: FAIL because tooltips are still SVG groups measured in viewBox units.

- [ ] **Step 3: Emit point data instead of per-point SVG tooltips**

Each point group should contain only its hit target and visible marker:

```js
<circle class="history-line-point-hit" data-history-point data-history-point-time="${escapeHtml(timeText)}" data-history-point-price="${escapeHtml(priceText)}" cx="${formatNumber(pointX, 2)}" cy="${formatNumber(pointY, 2)}" r="8" tabindex="0" role="img" aria-label="${escapeHtml(pointLabel)}"></circle>
```

Place one overlay after the SVG inside `.history-line-chart-wrap`:

```html
<div class="history-line-point-tooltip" data-history-point-tooltip role="tooltip" aria-hidden="true">
  <strong data-history-point-tooltip-time></strong>
  <span data-history-point-tooltip-price></span>
</div>
```

- [ ] **Step 4: Add delegated hover and focus behavior**

Add `showTrendPointTooltip(chartWrap, point)` and `hideTrendPointTooltip(chartWrap)`. Use `getBoundingClientRect()` for the point and chart wrapper, measure the fixed overlay in CSS pixels, place it above the point when space permits and below otherwise, and clamp `left`/`top` to four pixels inside the wrapper. Bind `pointerover`, `pointerout`, `focusin`, and `focusout` on the wrapper. Hide the overlay at the beginning of `updateTrendChartViewport()`.

- [ ] **Step 5: Define stable overlay CSS**

```css
.history-line-chart-wrap { position: relative; }
.history-line-point-tooltip {
  position: absolute;
  z-index: 3;
  display: grid;
  align-content: center;
  width: 154px;
  height: 42px;
  padding: 5px 9px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  box-sizing: border-box;
  pointer-events: none;
  opacity: 0;
  background: var(--surface);
}
.history-line-point-tooltip.visible { opacity: 1; }
```

Keep text on one line with tabular numbers and a fixed line height.

- [ ] **Step 6: Run the renderer tests and verify GREEN**

Run: `node --test tests/chart-fixed-viewport.test.mjs`

Expected: all renderer tests pass.

- [ ] **Step 7: Commit the tooltip change**

```bash
git add web/app.js web/style.css tests/chart-fixed-viewport.test.mjs
git commit -m "fix: keep chart tooltips fixed size"
```

### Task 4: Add stepped wheel and drag navigation

**Files:**
- Modify: `web/app.js`
- Modify: `tests/chart-fixed-viewport.test.mjs`

- [ ] **Step 1: Write failing gesture tests**

```js
test('wheel gestures navigate finite windows in time units', () => {
  assert.match(appSource, /CHART_TIME\.wheelNavigationDelta\(event\.deltaX, event\.deltaY\)/);
  assert.match(appSource, /CHART_TIME\.navigationStepMilliseconds\(model\.chartWindow/);
  assert.match(appSource, /CHART_TIME\.shiftVisibleEndBySteps\(/);
  assert.match(appSource, /if \(!chartWrap\.hasAttribute\('data-history-chart-drag'\)\) return;/);
});

test('drag release snaps the visible end to the active time unit', () => {
  assert.match(appSource, /CHART_TIME\.snapVisibleEnd\(/);
  assert.match(appSource, /finishTrendChartDrag/);
});
```

- [ ] **Step 2: Run the renderer tests and verify RED**

Run: `node --test tests/chart-fixed-viewport.test.mjs`

Expected: FAIL because wheel movement is pixel-proportional and drag release does not snap.

- [ ] **Step 3: Implement accumulated wheel navigation**

Track one module-level wheel accumulator and reset timer. In the wheel listener:

```js
if (!chartWrap.hasAttribute('data-history-chart-drag')) return;
const navigationDelta = CHART_TIME.wheelNavigationDelta(event.deltaX, event.deltaY);
if (!navigationDelta) return;
trendChartWheelDelta = Math.sign(trendChartWheelDelta) === Math.sign(navigationDelta)
  ? trendChartWheelDelta + navigationDelta
  : navigationDelta;
event.preventDefault();
if (Math.abs(trendChartWheelDelta) < 40) return;
const stepCount = Math.sign(trendChartWheelDelta);
trendChartWheelDelta = 0;
const { model } = activeTrendChartBounds();
const range = historyChartRange(model, state.trendModalVisibleEnd);
state.trendModalVisibleEnd = CHART_TIME.shiftVisibleEndBySteps(
  range.end,
  stepCount,
  CHART_TIME.navigationStepMilliseconds(model.chartWindow, trendWindowLabel()),
  chartWindowMilliseconds(model.chartWindow),
  model.minTime,
  model.maxTime
);
scheduleTrendChartViewportRefresh();
```

Reset the accumulator after a short idle period and when the modal closes or the time window changes.

- [ ] **Step 4: Snap drag results on pointer release**

When a real drag finishes, resolve the current model and replace the current visible end with:

```js
state.trendModalVisibleEnd = CHART_TIME.snapVisibleEnd(
  state.trendModalVisibleEnd,
  CHART_TIME.navigationStepMilliseconds(model.chartWindow, trendWindowLabel()),
  chartWindowMilliseconds(model.chartWindow),
  model.minTime,
  model.maxTime
);
scheduleTrendChartViewportRefresh();
```

Do not invoke this for clicks or for `all`, which never has `data-history-chart-drag`.

- [ ] **Step 5: Run the renderer and utility tests and verify GREEN**

Run: `node --test tests/chart-fixed-viewport.test.mjs tests/chart-time-utils.test.mjs`

Expected: all selected tests pass.

- [ ] **Step 6: Commit the gesture behavior**

```bash
git add web/app.js tests/chart-fixed-viewport.test.mjs
git commit -m "feat: navigate chart by hour and day steps"
```

### Task 5: Protect number input text from spinner controls

**Files:**
- Modify: `web/style.css`
- Modify: `tests/chart-fixed-viewport.test.mjs`

- [ ] **Step 1: Write a failing CSS regression test**

```js
test('price input reserves space for native increment controls', () => {
  assert.match(styleSource, /\.price-input\s*\{[^}]*padding:\s*0 24px 0 7px;/s);
});
```

- [ ] **Step 2: Run the renderer tests and verify RED**

Run: `node --test tests/chart-fixed-viewport.test.mjs`

Expected: FAIL because `.price-input` currently has only seven pixels of right padding.

- [ ] **Step 3: Increase only the right padding**

```css
.price-input { padding: 0 24px 0 7px; }
```

- [ ] **Step 4: Run the renderer tests and verify GREEN**

Run: `node --test tests/chart-fixed-viewport.test.mjs`

Expected: all renderer tests pass.

- [ ] **Step 5: Commit the input fix**

```bash
git add web/style.css tests/chart-fixed-viewport.test.mjs
git commit -m "fix: keep price input controls clear"
```

### Task 6: Full verification, browser validation, and deployment

**Files:**
- Verify: `web/app.js`
- Verify: `web/style.css`
- Verify: `web/chart-time-utils.js`
- Verify: `tests/chart-fixed-viewport.test.mjs`
- Verify: `tests/chart-time-utils.test.mjs`

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: every test passes with zero failures.

- [ ] **Step 2: Check syntax and whitespace**

Run: `node --check web/app.js && node --check web/chart-time-utils.js && git diff --check`

Expected: exit code 0 and no output from `git diff --check`.

- [ ] **Step 3: Run local browser validation**

Run the project locally with `npm run dev`, then verify:

- Yangtao `6h` shows one real rise line plus the anomaly band/endpoint marker, without a second diagonal connection.
- Tooltip dimensions remain 154 × 42 CSS pixels before and after moving the window.
- Mouse wheel down moves one hour/day toward older history; wheel up moves toward newer history.
- Drag release lands on one-hour steps for hourly windows and one-day steps for `7d`/`30d`.
- `all` cannot be dragged or wheel-navigated and shows no more than eight evenly distributed date labels, including first and last.
- A long current-price value does not overlap the number input spinner.

- [ ] **Step 4: Review the final diff and commit any validation-only correction**

Run: `git status --short && git diff HEAD^ -- web/app.js web/style.css web/chart-time-utils.js tests`

Expected: only the planned chart, tooltip, input, and test changes are present.

- [ ] **Step 5: Push the detached worktree directly to `main`**

```bash
git push origin HEAD:main
```

Expected: the remote `main` fast-forwards to the final commit.

- [ ] **Step 6: Confirm Cloudflare deployment**

Use GitHub Actions to confirm the `Deploy Cloudflare Worker` workflow for the pushed commit completes successfully. If it fails, inspect the exact workflow logs before making any deployment correction.
