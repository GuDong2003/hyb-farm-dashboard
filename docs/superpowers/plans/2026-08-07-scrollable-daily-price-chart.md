# Scrollable Daily Price Chart Implementation Plan

> 本计划记录的是第一版“每日固定宽度”实现；该宽度逻辑已由 `2026-08-07-visible-window-price-chart.md` 的“一屏等于所选时长、完整历史可滚动”方案取代。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 30-day price range and make multi-day crop-price charts horizontally scrollable with one labeled Beijing-calendar-day slot per day.

**Architecture:** Extract deterministic chart-window and Beijing-day calculations into a small browser global utility so Node's built-in test runner can cover them. Keep chart rendering in `web/app.js`, but split the fixed Y axis from a horizontally scrollable plot SVG; generate date labels from calendar days rather than snapshot timestamps. Preserve the current first/last price-change calculation and anomaly filtering.

**Tech Stack:** Vanilla JavaScript, SVG, CSS Grid, Node `node:test`, Cloudflare Workers/Wrangler.

---

### Task 1: Time-axis behavior tests

**Files:**
- Create: `tests/chart-time-utils.test.mjs`
- Create: `web/chart-time-utils.js`

- [ ] **Step 1: Write failing tests for 30d and Beijing-day slots**

  Test that `30d` maps to 30 days, that `7d`/`30d`/`all` are scrollable, and that a range crossing Beijing midnights returns every intersecting calendar date with increasing label positions.

- [ ] **Step 2: Run the focused test and confirm failure**

  Run: `node --test tests/chart-time-utils.test.mjs`

  Expected: FAIL because `HYBChartTime` functions are not implemented.

- [ ] **Step 3: Implement the minimal pure utility**

  Expose `normalizeWindow`, `windowMilliseconds`, `isScrollableWindow`, `beijingDaySlots`, and `plotWidth` on `globalThis.HYBChartTime`. Use a fixed UTC+8 offset so dates do not depend on the viewer's device time zone.

- [ ] **Step 4: Run the focused test and confirm success**

  Run: `node --test tests/chart-time-utils.test.mjs`

  Expected: all tests PASS.

### Task 2: Add the 30-day range

**Files:**
- Modify: `web/index.html`
- Modify: `web/app.js`

- [ ] **Step 1: Load `chart-time-utils.js` before `app.js`**

  Add a classic script tag so the existing IIFE can read `window.HYBChartTime`.

- [ ] **Step 2: Accept and render `30d` everywhere**

  Add `30d` to saved configuration validation, chart normalization, millisecond filtering, the homepage selector, and the modal selector. Use daily trend buckets for `30d` where the legacy trend helper is called.

- [ ] **Step 3: Run tests and JavaScript syntax checks**

  Run: `node --test tests/chart-time-utils.test.mjs && node --check web/app.js && node --check web/chart-time-utils.js`

  Expected: PASS.

### Task 3: Render a fixed Y axis and scrollable daily plot

**Files:**
- Modify: `web/app.js`
- Modify: `web/style.css`

- [ ] **Step 1: Split chart layout into fixed axis and scroll area**

  Render Y-axis labels in a separate SVG column. Render horizontal grid lines, curve, anomalies, points, and X labels inside the plot SVG.

- [ ] **Step 2: Size multi-day plots by calendar-day count**

  Keep `1h`/`6h`/`12h`/`24h` responsive and compact. For `7d`/`30d`/`all`, use at least 96 CSS pixels per Beijing calendar day and allow horizontal overflow.

- [ ] **Step 3: Draw every date**

  Add one `MM-DD` label centered in every intersecting Beijing calendar-day slot and a vertical grid line at each midnight boundary. Keep compact ranges on endpoint time labels.

- [ ] **Step 4: Preserve existing chart interactions**

  Confirm point tooltips, anomaly hiding, point hiding, trend color, and first/last percentage continue using the same filtered points.

### Task 4: Scroll state and documentation

**Files:**
- Modify: `web/app.js`
- Modify: `README.md`

- [ ] **Step 1: Default new ranges to the latest data**

  On modal open or range change, set the scroll container to its maximum horizontal offset after rendering.

- [ ] **Step 2: Preserve position across chart toggles**

  Store scrollLeft in transient state while the modal is open and restore it after point/anomaly toggle rerenders. Reset it when the modal closes or the time range changes.

- [ ] **Step 3: Document 30d and daily scrolling**

  Update the price-chart feature list in `README.md`.

### Task 5: Verification and deployment

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run verification**

  Run: `node --test tests/chart-time-utils.test.mjs && node --check web/app.js && node --check web/chart-time-utils.js && git diff --check`

  Expected: PASS with no syntax or whitespace errors.

- [ ] **Step 2: Run a Worker dry-run build**

  Run: `npm run deploy -- --dry-run --outdir /tmp/hyb-farm-dashboard-dry-run-20260807`

  Expected: Wrangler reads all web assets and exits successfully without deployment.

- [ ] **Step 3: Commit and push main**

  Stage only the plan, source, tests, styles, and README. Commit with a focused Chinese message, push `main`, monitor the GitHub Actions deployment, and verify the deployed JavaScript/CSS contains the new 30d and scrollable-axis implementation.
