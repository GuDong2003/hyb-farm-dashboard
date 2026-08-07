# Price Delta Trend Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide native steppers so the current-price input shows its full value, and replace the price-change direction glyph with the existing clickable trend button on the percentage's left.

**Architecture:** Keep price calculation and modal behavior unchanged. Adjust only the row-rendering contract and its CSS: `renderPriceChangeRate` renders percentage text, `renderRow` renders the trend trigger before it, and the number input uses cross-browser spinner suppression with normal padding.

**Tech Stack:** Vanilla JavaScript template rendering, CSS, Node.js built-in test runner, Cloudflare Wrangler for local browser verification.

---

### Task 1: Lock the corrected UI contract with failing tests

**Files:**
- Modify: `tests/chart-fixed-viewport.test.mjs:91-93`

- [ ] **Step 1: Replace the old native-stepper spacing test with the corrected contracts**

Replace the final test with:

```js
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
```

- [ ] **Step 2: Run the focused test and confirm it fails for the old UI**

Run:

```bash
node --test tests/chart-fixed-viewport.test.mjs
```

Expected: FAIL because `.price-input` still reserves `24px`, WebKit spinner suppression is absent, and `price-delta-arrow` is still rendered.

### Task 2: Implement the price input and price-change layout

**Files:**
- Modify: `web/app.js:1995-2001`
- Modify: `web/app.js:2048-2049`
- Modify: `web/style.css:340-347`
- Test: `tests/chart-fixed-viewport.test.mjs`

- [ ] **Step 1: Remove character arrows from `renderPriceChangeRate`**

Replace the function body with percentage-only markup:

```js
function renderPriceChangeRate(rate) {
  const value = Number(rate);
  if (!hasFiniteNumber(rate)) return '<span class="price-delta flat"><span class="price-delta-percent">-</span></span>';
  if (Math.abs(value) < 0.000005) return '<span class="price-delta flat"><span class="price-delta-percent">0%</span></span>';
  const direction = priceChangeDirection(value);
  return `<span class="price-delta ${direction}"><span class="price-delta-percent">${formatNumber(Math.abs(value), 2)}%</span></span>`;
}
```

- [ ] **Step 2: Render the trend button before the percentage**

Keep the current-price input separate, and change only the next table cell to:

```js
<td><input class="price-input" data-price="${escapeHtml(row.seed.id)}" type="number" min="0" step="0.00001" value="${row.price == null ? '' : formatNumber(row.price, 5)}" /></td>
<td title="${escapeHtml(priceChangeRateTitle(row))}"><div class="price-change-cell">${renderCropTrendTrigger(row)}${renderPriceChangeRate(row.priceChangeRate)}</div></td>
```

- [ ] **Step 3: Hide native number steppers and simplify percentage layout**

Replace the related CSS with:

```css
.price-input { width: 90px; height: 28px; padding: 0 7px; border: 1px solid var(--control-border); border-radius: 5px; appearance: textfield; text-align: right; background: var(--control-bg); color: var(--text); }
.price-input::-webkit-outer-spin-button,
.price-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.price-delta { display: inline-block; width: 60px; font-weight: 850; font-variant-numeric: tabular-nums; }
.price-delta-value, .price-delta-percent { display: block; text-align: right; }
.price-delta.up { color: var(--red); }
.price-delta.down { color: var(--green); }
.price-delta.flat { color: var(--muted); }
.price-change-cell { display: flex; align-items: center; justify-content: center; gap: 4px; min-width: 0; }
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run:

```bash
node --test tests/chart-fixed-viewport.test.mjs
```

Expected: all tests in the file PASS.

- [ ] **Step 5: Run the complete automated suite and syntax checks**

Run:

```bash
npm test
node --check web/app.js
node --check web/chart-time-utils.js
git diff --check
```

Expected: 0 failed tests, both syntax checks exit 0, and `git diff --check` prints no errors.

- [ ] **Step 6: Commit the implementation**

```bash
git add tests/chart-fixed-viewport.test.mjs web/app.js web/style.css
git commit -m "fix: place trend control before price change"
```

### Task 3: Verify the corrected controls in the browser

**Files:**
- Verify: `web/app.js`
- Verify: `web/style.css`

- [ ] **Step 1: Start the local dashboard**

Run:

```bash
npm run dev
```

Expected: Wrangler reports a local URL, normally `http://localhost:8787`.

- [ ] **Step 2: Check current-price input behavior**

Open the dashboard and verify:

- The input shows its five-decimal price without a native up/down control covering the right side.
- Computed `padding-left` and `padding-right` are both `7px`.
- Typing a price still updates the value.
- While the input is focused, pressing ArrowUp changes it by `0.00001`.

- [ ] **Step 3: Check price-change control order and modal behavior**

For a crop with history, verify:

- `.price-change-cell` contains exactly one `.crop-trend-trigger` followed by one `.price-delta`.
- No `↑`, `↓`, or `→` character is rendered beside the percentage.
- The trend button keeps the red, green, or gray direction state.
- Clicking it opens the correct crop's price-curve modal.

- [ ] **Step 4: Check browser logs and run final verification**

Confirm the browser console has no new errors, stop the local server, then run:

```bash
npm test
node --check web/app.js
node --check web/chart-time-utils.js
git diff --check
git status --short --branch
```

Expected: 0 failed tests, all checks exit 0, and the detached worktree is clean after the implementation commit.
