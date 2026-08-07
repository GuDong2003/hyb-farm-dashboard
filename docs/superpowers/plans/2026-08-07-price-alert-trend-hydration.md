# Price Alert Trend Hydration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore top price announcements for complete 24-hour rises when accepted uploads contain only current prices, and prevent newly deployed browsers from reusing obsolete critical frontend assets.

**Architecture:** Keep the frontend alert calculation unchanged and repair the default snapshot at the Worker boundary. A pure per-field trend merge fills incomplete uploaded data from accepted submission history while preserving complete uploaded hourly series and other valid fields; one shared version token on critical HTML asset references provides deterministic cache invalidation.

**Tech Stack:** Cloudflare Workers, D1, static HTML/CSS/JavaScript, Node.js built-in test runner, Wrangler.

---

## File Map

- Modify `worker/index.js`: decide whether hydration is needed and merge synthesized/uploaded trend fields.
- Create `tests/worker-trend-hydration.test.mjs`: exercise hydration completeness and merge behavior through named Worker exports.
- Modify `web/index.html`: append one shared version query token to critical CSS and JavaScript URLs.
- Modify `tests/price-alert-ui-contract.test.mjs`: enforce shared critical-asset versioning and script order.
- Preserve `web/app.js`, `web/price-alert-utils.js`, alert thresholds, modal behavior, and D1 schema.

### Task 0: Integrate the latest remote chart update in isolation

**Files:**
- Potential conflict resolution: `web/app.js`
- Potential conflict resolution: `web/style.css`
- Potential conflict resolution: `web/index.html`
- Potential conflict resolution: `tests/chart-fixed-viewport.test.mjs`
- Preserve: `web/price-alert-utils.js`
- Preserve: `tests/price-alert-ui-contract.test.mjs`
- Preserve: `tests/price-alert-utils.test.mjs`

- [ ] **Step 1: Create an owned feature worktree**

Create branch `codex/fix-price-alert-trend-hydration` under `.worktrees/fix-price-alert-trend-hydration` from the current local `main`, following the `superpowers:using-git-worktrees` workflow.

- [ ] **Step 2: Merge `origin/main` into the feature branch**

Run:

```bash
GIT_MERGE_AUTOEDIT=no git merge origin/main
```

Expected: either a clean merge or conflicts limited to overlapping recent chart/frontend work.

- [ ] **Step 3: Resolve conflicts by responsibility**

Retain the local configurable 24-hour alert files and settings. Integrate the remote placement change that puts the trend control before the displayed price change. Do not restore the obsolete one-hour alert switch or remove `price-alert-utils.js`.

- [ ] **Step 4: Verify the integrated baseline**

Run:

```bash
npm test
node --check web/app.js
node --check web/chart-time-utils.js
node --check web/price-alert-utils.js
node --check web/userscripts/hyb-farm-dashboard-capture.user.js
git diff --check
```

Expected: all existing tests pass and no syntax/conflict-marker errors remain.

- [ ] **Step 5: Commit the remote integration if Git has not already created a merge commit**

```bash
git add README.md docs tests web .gitignore package.json
git commit
```

Do not add the unrelated root `.codex/` directory.

### Task 1: Hydrate partial default-snapshot trends

**Files:**
- Create: `tests/worker-trend-hydration.test.mjs`
- Modify: `worker/index.js:353-367`

- [ ] **Step 1: Write failing completeness and merge tests**

Create tests that import `mergePriceTrendMaps` and `trendMapNeedsHydration` from `worker/index.js` and assert:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePriceTrendMaps, trendMapNeedsHydration } from '../worker/index.js';

test('unit-price-only trend objects still require hydration', () => {
  const prices = { carrot: 1, tomato: 2 };
  const existing = {
    carrot: { unitPrice: 1 },
    tomato: { unitPrice: 2 }
  };
  assert.equal(trendMapNeedsHydration(existing, prices), true);
});

test('complete trend objects can skip hydration', () => {
  const complete = {
    carrot: {
      hourly: [{ bucketStartedAt: '2026-08-06T12:00:00.000Z', avgUnitPrice: 1 }],
      daily: [{ bucketStartedAt: '2026-08-06T00:00:00.000Z', avgUnitPrice: 1 }],
      unitPrice: 2,
      lastRefreshedAt: '2026-08-07T12:00:00.000Z'
    }
  };
  assert.equal(trendMapNeedsHydration(complete, { carrot: 2 }), false);
});

test('recent-only hourly series still requires a complete 24-hour anchor', () => {
  const recentOnly = {
    carrot: {
      hourly: [{ bucketStartedAt: '2026-08-07T11:00:00.000Z', avgUnitPrice: 1 }],
      daily: [{ bucketStartedAt: '2026-08-07T00:00:00.000Z', avgUnitPrice: 1 }],
      unitPrice: 2,
      lastRefreshedAt: '2026-08-07T12:00:00.000Z'
    }
  };
  assert.equal(trendMapNeedsHydration(recentOnly, { carrot: 2 }), true);
});

test('merge fills missing fields without replacing valid uploaded series', () => {
  const fallback = {
    carrot: {
      hourly: [{ bucketStartedAt: '2026-08-06T12:00:00.000Z', avgUnitPrice: 1 }],
      daily: [{ bucketStartedAt: '2026-08-06T00:00:00.000Z', avgUnitPrice: 1 }],
      unitPrice: 2,
      lastRefreshedAt: '2026-08-07T12:00:00.000Z'
    }
  };
  const uploadedHourly = [{ bucketStartedAt: '2026-08-06T11:00:00.000Z', avgUnitPrice: 0.9 }];
  const merged = mergePriceTrendMaps(fallback, { carrot: { hourly: uploadedHourly, unitPrice: 2.5 } });
  assert.deepEqual(merged.carrot.hourly, uploadedHourly);
  assert.deepEqual(merged.carrot.daily, fallback.carrot.daily);
  assert.equal(merged.carrot.unitPrice, 2.5);
  assert.equal(merged.carrot.lastRefreshedAt, fallback.carrot.lastRefreshedAt);
});
```

Also include cases where a recent-only uploaded hourly array is replaced by a complete fallback, a complete uploaded hourly array is preserved, and an empty uploaded array is replaced by fallback data.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
node --test tests/worker-trend-hydration.test.mjs
```

Expected: FAIL because the named helpers do not exist.

- [ ] **Step 3: Implement minimal pure helpers**

Add named exports with the complete implementation:

```js
const PRICE_ALERT_WINDOW_MS = 24 * REFRESH_INTERVAL_MS;

function hasCompleteHourlyAnchor(hourly, lastRefreshedAt) {
  const referenceAt = Date.parse(lastRefreshedAt);
  if (!Number.isFinite(referenceAt) || !Array.isArray(hourly)) return false;
  const targetAt = referenceAt - PRICE_ALERT_WINDOW_MS;
  return hourly.some((point) => {
    const bucketAt = Date.parse(point && point.bucketStartedAt);
    return Number.isFinite(bucketAt) && bucketAt <= targetAt;
  });
}

export function trendMapNeedsHydration(existingTrends, currentPrices) {
  return Object.keys(currentPrices || {}).some((id) => {
    if (!SEED_IDS.includes(id)) return false;
    const trend = existingTrends && existingTrends[id];
    return !trend
      || !hasCompleteHourlyAnchor(trend.hourly, trend.lastRefreshedAt)
      || !Array.isArray(trend.daily) || !trend.daily.length
      || !Number.isFinite(Number(trend.unitPrice))
      || !validIsoLike(trend.lastRefreshedAt);
  });
}

export function mergePriceTrendMaps(fallbackTrends, existingTrends) {
  const merged = {};
  for (const id of SEED_IDS) {
    const fallback = fallbackTrends && fallbackTrends[id] && typeof fallbackTrends[id] === 'object'
      ? fallbackTrends[id]
      : {};
    const existing = existingTrends && existingTrends[id] && typeof existingTrends[id] === 'object'
      ? existingTrends[id]
      : {};
    const lastRefreshedAt = validIsoLike(existing.lastRefreshedAt)
      ? existing.lastRefreshedAt
      : validIsoLike(fallback.lastRefreshedAt) ? fallback.lastRefreshedAt : '';
    const hourly = hasCompleteHourlyAnchor(existing.hourly, lastRefreshedAt)
      ? existing.hourly
      : fallback.hourly;
    const daily = Array.isArray(existing.daily) && existing.daily.length ? existing.daily : fallback.daily;
    const existingUnitPrice = Number(existing.unitPrice);
    const fallbackUnitPrice = Number(fallback.unitPrice);
    const unitPrice = Number.isFinite(existingUnitPrice) ? existingUnitPrice : fallbackUnitPrice;
    if (!Array.isArray(hourly) && !Array.isArray(daily) && !Number.isFinite(unitPrice) && !lastRefreshedAt) continue;
    merged[id] = {};
    if (Array.isArray(hourly) && hourly.length) merged[id].hourly = hourly.slice();
    if (Array.isArray(daily) && daily.length) merged[id].daily = daily.slice();
    if (Number.isFinite(unitPrice)) merged[id].unitPrice = unitPrice;
    if (lastRefreshedAt) merged[id].lastRefreshedAt = lastRefreshedAt;
  }
  return merged;
}
```

The merge must create new objects/arrays by selection and must not mutate either input map.

- [ ] **Step 4: Wire helpers into `hydrateSnapshotTrends()`**

Replace the key-count early return with:

```js
if (!trendMapNeedsHydration(existingTrends, snapshot.prices.shop)) return;
```

After building history fallback data, assign:

```js
const mergedTrends = mergePriceTrendMaps(trendMap, existingTrends);
if (Object.keys(mergedTrends).length) snapshot.priceTrends = { shop: mergedTrends };
```

- [ ] **Step 5: Run targeted and full tests and verify GREEN**

```bash
node --test tests/worker-trend-hydration.test.mjs
npm test
node --check worker/index.js
git diff --check
```

Expected: all tests and checks pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add worker/index.js tests/worker-trend-hydration.test.mjs
git commit -m "fix: hydrate partial price alert trends"
```

### Task 2: Version critical frontend assets

**Files:**
- Modify: `tests/price-alert-ui-contract.test.mjs:12-20`
- Modify: `web/index.html:8-15`

- [ ] **Step 1: Add a failing asset-version contract**

Extend the existing page-load test to extract these four URLs:

```js
const versionedAssets = [...indexHtml.matchAll(/(?:href|src)="(\.\/(?:style\.css|chart-time-utils\.js|price-alert-utils\.js|app\.js))\?v=([^"]+)"/g)];
assert.equal(versionedAssets.length, 4, 'all critical assets have a version token');
const versionTokens = versionedAssets.map((match) => match[2]);
assert.equal(new Set(versionTokens).size, 1, 'critical assets share one deployment version');
```

Keep the existing assertion that `price-alert-utils.js` loads before `app.js`.

- [ ] **Step 2: Run the contract test and verify RED**

```bash
node --test tests/price-alert-ui-contract.test.mjs
```

Expected: FAIL because the current URLs have no `?v=` token.

- [ ] **Step 3: Add one version token to all four references**

Use `v=20260807-alert2` consistently:

```html
<link rel="stylesheet" href="./style.css?v=20260807-alert2" />
<script src="./chart-time-utils.js?v=20260807-alert2"></script>
<script src="./price-alert-utils.js?v=20260807-alert2"></script>
<script src="./app.js?v=20260807-alert2"></script>
```

- [ ] **Step 4: Run targeted and full tests and verify GREEN**

```bash
node --test tests/price-alert-ui-contract.test.mjs
npm test
git diff --check
```

Expected: all tests pass and the script-order assertion remains green.

- [ ] **Step 5: Commit Task 2**

```bash
git add web/index.html tests/price-alert-ui-contract.test.mjs
git commit -m "fix: version price alert frontend assets"
```

### Task 3: Integration verification, review, and deployment

**Files:**
- Verify: `worker/index.js`
- Verify: `web/index.html`
- Verify: `web/app.js`
- Verify: `web/price-alert-utils.js`
- Verify: `web/userscripts/hyb-farm-dashboard-capture.user.js`

- [ ] **Step 1: Run the complete local verification gate**

```bash
npm test
node --check worker/index.js
node --check web/app.js
node --check web/chart-time-utils.js
node --check web/price-alert-utils.js
node --check web/userscripts/hyb-farm-dashboard-capture.user.js
git diff --check
npx wrangler deploy --dry-run
```

Expected: zero failing tests/checks and a successful Wrangler dry-run.

- [ ] **Step 2: Request spec-compliance and code-quality review**

Review the complete branch against `docs/superpowers/specs/2026-08-07-price-alert-trend-hydration-design.md`. Resolve all Critical, Important, and Minor findings or explicitly document why an observation is pre-existing/out of scope.

- [ ] **Step 3: Merge locally into `main`**

Use the previously selected local-merge workflow. Verify the merged `main` with the full commands from Step 1 before removing the worktree and deleting the feature branch.

- [ ] **Step 4: Deploy the verified `main`**

```bash
npx wrangler deploy
npx wrangler deployments status
```

Expected: the new version receives 100% traffic.

- [ ] **Step 5: Verify production data and UI**

- Confirm `/api/default-prices` returns non-empty hourly arrays for current crops.
- Confirm custom-domain `index.html` includes the shared version token.
- Confirm key online asset bodies match the deployed local files.
- Load the custom domain in Chrome and verify the new 8%/20% settings plus a top announcement for qualifying complete 24-hour positive changes.
- Leave the user's original tab on the dashboard and close temporary diagnostic tabs.
