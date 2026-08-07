# Unscaled Price Chart Y-Axis Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep price-chart Y-axis labels visually normal at every responsive chart height while preserving exact alignment with the SVG grid lines.

**Architecture:** Keep the scalable SVG plot unchanged, but render Y-axis values as absolutely positioned HTML spans inside the existing grid column. Convert each existing SVG tick Y coordinate to a percentage so the labels follow the responsive plot height without applying a transform to their glyphs.

**Tech Stack:** Vanilla JavaScript, HTML, CSS, SVG, Node `node:test`, Cloudflare Workers/Wrangler.

---

### Task 1: Replace scaled SVG axis text with HTML labels

**Files:**
- Modify: `tests/chart-fixed-viewport.test.mjs`
- Modify: `web/app.js:1330-1420,1460-1470,1585-1598`
- Modify: `web/style.css:432-438`

- [ ] **Step 1: Write a failing structural regression test**

Append this test to `tests/chart-fixed-viewport.test.mjs`:

```js
test('Y-axis labels use unscaled HTML positioned against the SVG grid', () => {
  assert.match(appSource, /<div class="history-line-y-axis" data-history-y-axis/);
  assert.doesNotMatch(appSource, /<svg class="history-line-y-axis"/);
  assert.match(appSource, /class="history-line-y-label" style="top:\$\{formatNumber\(tickTop, 4\)\}%"/);
  assert.match(styleSource, /\.history-line-y-label\s*\{[^}]*position:\s*absolute;[^}]*right:\s*8px;[^}]*transform:\s*translateY\(-50%\);/s);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/chart-fixed-viewport.test.mjs`

Expected: the new test fails because the axis is still an SVG and `.history-line-y-label` does not exist.

- [ ] **Step 3: Generate percentage-positioned HTML tick labels**

Replace the SVG text construction in `renderHistoryLineChartFrame()` with:

```js
const yAxisTicks = yTickRatios.map((ratio, index) => {
  const tickY = pad.top + ratio * plotHeight;
  const tickTop = (tickY / height) * 100;
  return `<span class="history-line-y-label" style="top:${formatNumber(tickTop, 4)}%">${escapeHtml(yTickLabels[index])}</span>`;
}).join('');
```

Return `axisContent: yAxisTicks`; the axis no longer needs its SVG background rectangle.

- [ ] **Step 4: Change the axis wrapper and updater**

Render the wrapper as ordinary HTML:

```html
<div class="history-line-y-axis" data-history-y-axis aria-hidden="true">
  ${frame.axisContent}
</div>
```

In `updateTrendChartViewport()`, keep `axis.innerHTML = frame.axisContent` and remove the call that changes the axis `viewBox`.

- [ ] **Step 5: Add non-scaling label styles**

Use:

```css
.history-line-y-axis { position: relative; z-index: 2; overflow: hidden; background: var(--formula-bg); }
.history-line-y-label { position: absolute; right: 8px; transform: translateY(-50%); color: var(--muted); font-size: 11px; line-height: 1; white-space: nowrap; }
```

- [ ] **Step 6: Run GREEN checks**

Run:

```bash
npm test
node --check web/app.js
git diff --check
```

Expected: all tests pass and both checks exit 0.

- [ ] **Step 7: Commit the fix**

```bash
git add tests/chart-fixed-viewport.test.mjs web/app.js web/style.css
git commit -m "fix: keep chart axis labels unscaled"
```

### Task 2: Verify visually and deploy

**Files:**
- Verify all modified files; no additional production files.

- [ ] **Step 1: Run the complete release verification**

Run:

```bash
npm test
node --check web/app.js
node --check web/chart-time-utils.js
git diff --check origin/main..HEAD
dry_run_dir=$(mktemp -d /tmp/hyb-farm-axis-dry-run.XXXXXX)
npm run deploy -- --dry-run --outdir "$dry_run_dir"
```

Expected: all tests pass, both syntax checks exit 0, and Wrangler exits after a successful dry-run.

- [ ] **Step 2: Verify a stretched chart in the local browser**

Use the existing 45-day local D1 test data and confirm:

- the axis container is taller than 320px;
- every `.history-line-y-label` is a `SPAN`, has an 11px computed font size, and is not inside an SVG;
- each label's vertical center differs from the matching horizontal grid line by at most 1px;
- changing to `7d` and dragging updates values while labels remain aligned;
- the browser console contains no errors or warnings.

- [ ] **Step 3: Push directly to main and monitor deployment**

After confirming `origin/main` is an ancestor of `HEAD`, run:

```bash
git push origin HEAD:main
```

Watch the `Deploy Cloudflare Worker` workflow to completion, then request the live `app.js` with a commit cache-buster and confirm it contains `.history-line-y-label` and no SVG Y-axis wrapper.
