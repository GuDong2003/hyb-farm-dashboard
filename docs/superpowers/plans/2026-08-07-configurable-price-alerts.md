# Configurable 24-Hour Price Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed one-hour 20% alert with configurable rolling-24-hour normal/anomaly thresholds, a persistent top announcement, independent browser and in-app notification switches, and per-crop Beijing-day popup suppression.

**Architecture:** Add a small browser-global `HYBPriceAlert` utility containing pure threshold, classification, batch-key, Beijing-day, and suppression logic; cover it with Node's built-in test runner. Keep price trend lookup and DOM rendering in `web/app.js`, but make the announcement, system notification, and in-app modal consume one shared alert summary. Keep the existing 20% history-anomaly logic separate from user-configurable live-alert thresholds.

**Tech Stack:** Vanilla JavaScript, HTML, CSS, browser `Notification`, `localStorage`, Node `node:test`, Cloudflare Workers/Wrangler.

---

## File map

- Create `web/price-alert-utils.js`: pure alert thresholds, classification, batch keys, Beijing date keys, and per-crop daily suppression.
- Create `tests/price-alert-utils.test.mjs`: deterministic unit coverage for the pure alert utility.
- Create `tests/price-alert-ui-contract.test.mjs`: lightweight integration contracts for app wiring, settings controls, popup markup, copy, and userscript range.
- Modify `web/index.html`: load the alert utility before `app.js`.
- Modify `web/app.js`: persist settings, calculate the shared summary, render/bind announcement and modal, dispatch independent system/in-app notifications, and keep history anomaly thresholds isolated.
- Modify `web/style.css`: style the clickable announcement, threshold settings, alert modal, severity badges, list, and responsive layout.
- Modify `web/userscripts/hyb-farm-dashboard-capture.user.js`: request 25 hourly buckets and bump the userscript version.
- Modify `README.md`: document the rolling 24-hour thresholds and the three alert surfaces.

### Task 1: Pure price-alert rules

**Files:**
- Create: `tests/price-alert-utils.test.mjs`
- Create: `web/price-alert-utils.js`

- [ ] **Step 1: Write the failing alert-rule tests**

Create `tests/price-alert-utils.test.mjs` with the complete cases below:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

await import('../web/price-alert-utils.js');

const alerts = globalThis.HYBPriceAlert;

function row(id, rate, price = 1) {
  return { seed: { id, name: id }, priceAlertRate: rate, price };
}

test('validates configurable thresholds', () => {
  assert.deepEqual(alerts.validateThresholds('8', '20'), {
    ok: true,
    normalThreshold: 8,
    anomalyThreshold: 20,
    message: ''
  });
  assert.equal(alerts.validateThresholds('-1', '20').ok, false);
  assert.equal(alerts.validateThresholds('20', '20').ok, false);
  assert.equal(alerts.validateThresholds('21', '20').ok, false);
});

test('classifies every qualifying crop and sorts by rate', () => {
  const summary = alerts.evaluate([
    row('below', 7.99),
    row('normal-edge', 8),
    row('normal', 12),
    row('anomaly-edge', 20),
    row('anomaly', 32)
  ], 8, 20);

  assert.deepEqual(summary.items.map((item) => [item.seedId, item.severity]), [
    ['anomaly', 'anomaly'],
    ['anomaly-edge', 'anomaly'],
    ['normal', 'normal'],
    ['normal-edge', 'normal']
  ]);
  assert.equal(summary.total, 4);
  assert.equal(summary.normalCount, 2);
  assert.equal(summary.anomalyCount, 2);
  assert.equal(summary.highest.seedId, 'anomaly');
});

test('skips missing and invalid alert rates', () => {
  const summary = alerts.evaluate([
    row('null', null),
    row('empty', ''),
    row('nan', Number.NaN),
    row('valid', 9)
  ], 8, 20);
  assert.deepEqual(summary.items.map((item) => item.seedId), ['valid']);
});

test('normalizes suppression to the Beijing calendar day', () => {
  const beforeMidnight = Date.parse('2026-08-07T15:59:59.000Z');
  const afterMidnight = Date.parse('2026-08-07T16:00:00.000Z');
  assert.equal(alerts.beijingDateKey(beforeMidnight), '2026-08-07');
  assert.equal(alerts.beijingDateKey(afterMidnight), '2026-08-08');

  const stored = { date: '2026-08-07', seedIds: ['carrot', 'carrot', 'tomato'] };
  assert.deepEqual(alerts.normalizeSuppression(stored, beforeMidnight), {
    date: '2026-08-07',
    seedIds: ['carrot', 'tomato']
  });
  assert.deepEqual(alerts.normalizeSuppression(stored, afterMidnight), {
    date: '2026-08-08',
    seedIds: []
  });
});

test('suppresses only crops listed by the current popup', () => {
  const now = Date.parse('2026-08-07T08:00:00.000Z');
  const summary = alerts.evaluate([row('carrot', 10), row('tomato', 22), row('corn', 9)], 8, 20);
  const suppression = alerts.addSuppressedCrops({ date: '2026-08-07', seedIds: ['carrot'] }, ['tomato'], now);

  assert.deepEqual(suppression, { date: '2026-08-07', seedIds: ['carrot', 'tomato'] });
  assert.deepEqual(
    alerts.unsuppressedItems(summary.items, suppression, now).map((item) => item.seedId),
    ['corn']
  );
});

test('builds a stable key for one imported price batch', () => {
  const summary = alerts.evaluate([row('carrot', 10, 2), row('tomato', 22, 3)], 8, 20);
  assert.equal(
    alerts.batchKey(1234, summary.items),
    alerts.batchKey(1234, summary.items.slice().reverse())
  );
  assert.notEqual(alerts.batchKey(1235, summary.items), alerts.batchKey(1234, summary.items));
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/price-alert-utils.test.mjs`

Expected: FAIL because `web/price-alert-utils.js` does not exist.

- [ ] **Step 3: Implement the pure utility**

Create `web/price-alert-utils.js`:

```js
(function (root) {
  'use strict';

  const HOUR_MS = 60 * 60 * 1000;
  const DAY_MS = 24 * HOUR_MS;
  const BEIJING_OFFSET_MS = 8 * HOUR_MS;
  const WINDOW = '24h';
  const DEFAULT_NORMAL_THRESHOLD = 8;
  const DEFAULT_ANOMALY_THRESHOLD = 20;

  function validateThresholds(normalValue, anomalyValue) {
    const normalThreshold = Number(normalValue);
    const anomalyThreshold = Number(anomalyValue);
    if (!Number.isFinite(normalThreshold) || !Number.isFinite(anomalyThreshold)) {
      return { ok: false, message: '涨幅阈值必须是有效数字。' };
    }
    if (normalThreshold < 0 || anomalyThreshold < 0) {
      return { ok: false, message: '涨幅阈值不能小于 0%。' };
    }
    if (anomalyThreshold <= normalThreshold) {
      return { ok: false, message: '异常暴涨阈值必须大于普通暴涨阈值。' };
    }
    return { ok: true, normalThreshold, anomalyThreshold, message: '' };
  }

  function evaluate(rows, normalValue, anomalyValue) {
    const validated = validateThresholds(normalValue, anomalyValue);
    const normalThreshold = validated.ok ? validated.normalThreshold : DEFAULT_NORMAL_THRESHOLD;
    const anomalyThreshold = validated.ok ? validated.anomalyThreshold : DEFAULT_ANOMALY_THRESHOLD;
    const items = (Array.isArray(rows) ? rows : []).map((row) => {
      const rateValue = row && row.priceAlertRate;
      if (rateValue === null || rateValue === undefined || rateValue === '') return null;
      const rate = Number(rateValue);
      if (!Number.isFinite(rate) || rate < normalThreshold) return null;
      return {
        row,
        seedId: String(row.seed && row.seed.id || ''),
        name: String(row.seed && row.seed.name || ''),
        rate,
        price: Number(row.price),
        severity: rate >= anomalyThreshold ? 'anomaly' : 'normal'
      };
    }).filter((item) => item && item.seedId)
      .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name, 'zh-CN'));

    const anomalyCount = items.filter((item) => item.severity === 'anomaly').length;
    return {
      items,
      total: items.length,
      anomalyCount,
      normalCount: items.length - anomalyCount,
      highest: items[0] || null,
      normalThreshold,
      anomalyThreshold
    };
  }

  function beijingDateKey(value) {
    const time = Number(value);
    const shifted = new Date((Number.isFinite(time) ? time : Date.now()) + BEIJING_OFFSET_MS);
    const year = shifted.getUTCFullYear();
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const day = String(shifted.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function normalizeSuppression(value, now) {
    const date = beijingDateKey(now);
    if (!value || value.date !== date || !Array.isArray(value.seedIds)) return { date, seedIds: [] };
    return { date, seedIds: Array.from(new Set(value.seedIds.map(String).filter(Boolean))) };
  }

  function addSuppressedCrops(value, seedIds, now) {
    const current = normalizeSuppression(value, now);
    return {
      date: current.date,
      seedIds: Array.from(new Set(current.seedIds.concat((Array.isArray(seedIds) ? seedIds : []).map(String).filter(Boolean))))
    };
  }

  function unsuppressedItems(items, value, now) {
    const blocked = new Set(normalizeSuppression(value, now).seedIds);
    return (Array.isArray(items) ? items : []).filter((item) => !blocked.has(String(item.seedId)));
  }

  function batchKey(capturedAt, items) {
    const entries = (Array.isArray(items) ? items : []).map((item) => [
      String(item.seedId),
      Number(item.rate).toFixed(6),
      Number.isFinite(Number(item.price)) ? Number(item.price).toFixed(6) : ''
    ].join(':')).sort();
    return `${Number(capturedAt) || 0}:${entries.join('|')}`;
  }

  root.HYBPriceAlert = Object.freeze({
    WINDOW,
    DAY_MS,
    DEFAULT_NORMAL_THRESHOLD,
    DEFAULT_ANOMALY_THRESHOLD,
    validateThresholds,
    evaluate,
    beijingDateKey,
    normalizeSuppression,
    addSuppressedCrops,
    unsuppressedItems,
    batchKey
  });
})(typeof globalThis === 'object' ? globalThis : this);
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/price-alert-utils.test.mjs`

Expected: 6 tests PASS.

- [ ] **Step 5: Commit the pure rules**

```bash
git add tests/price-alert-utils.test.mjs web/price-alert-utils.js
git commit -m "test: define configurable price alert rules"
```

### Task 2: App state, rolling 24-hour data, and integration contracts

**Files:**
- Create: `tests/price-alert-ui-contract.test.mjs`
- Modify: `web/index.html:13-15`
- Modify: `web/app.js:21-24,75-137,181-190,463-519,743-769,917-951`
- Modify: `web/userscripts/hyb-farm-dashboard-capture.user.js:4,24`

- [ ] **Step 1: Write failing wiring contracts**

Create `tests/price-alert-ui-contract.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
const userscript = await readFile(new URL('../web/userscripts/hyb-farm-dashboard-capture.user.js', import.meta.url), 'utf8');

test('loads the shared alert utility before the app', () => {
  assert.ok(html.indexOf('./price-alert-utils.js') < html.indexOf('./app.js'));
});

test('uses rolling 24-hour configurable alert state without changing history anomaly threshold', () => {
  assert.match(app, /const HISTORY_ANOMALY_THRESHOLD = 20;/);
  assert.match(app, /const PRICE_CHANGE_ALERT_WINDOW = PRICE_ALERT\.WINDOW;/);
  assert.match(app, /priceAlertNormalThreshold: PRICE_ALERT\.DEFAULT_NORMAL_THRESHOLD/);
  assert.match(app, /priceAlertAnomalyThreshold: PRICE_ALERT\.DEFAULT_ANOMALY_THRESHOLD/);
  assert.match(app, /inAppPriceAlerts: false/);
  assert.match(app, /suppressedPriceAlerts:/);
});

test('requests enough hourly trend buckets for a complete 24-hour baseline', () => {
  assert.match(userscript, /@version\s+0\.3\.7/);
  assert.match(userscript, /granularity=hour&trendRange=25/);
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `node --test tests/price-alert-ui-contract.test.mjs`

Expected: FAIL because the utility script, new config, 24-hour window, and 25-hour request are absent.

- [ ] **Step 3: Load the utility and split alert/history constants**

In `web/index.html`, load the new utility after `chart-time-utils.js` and before `app.js`:

```html
<script src="./chart-time-utils.js"></script>
<script src="./price-alert-utils.js"></script>
<script src="./app.js"></script>
```

In `web/app.js`, replace the old shared alert constant with dedicated live-alert and history constants:

```js
const HISTORY_ANOMALY_THRESHOLD = 20;
const PRICE_ALERT = window.HYBPriceAlert;
const PRICE_CHANGE_ALERT_WINDOW = PRICE_ALERT.WINDOW;
const CHART_TIME = window.HYBChartTime;
```

Rename every history endpoint, history event, chart anomaly, and empty-history use of `PRICE_CHANGE_ALERT_THRESHOLD` to `HISTORY_ANOMALY_THRESHOLD`. Do not use the history constant for live announcement or notification classification.

- [ ] **Step 4: Add and normalize persisted alert state**

Add these defaults inside `base.config`:

```js
priceAlertNormalThreshold: PRICE_ALERT.DEFAULT_NORMAL_THRESHOLD,
priceAlertAnomalyThreshold: PRICE_ALERT.DEFAULT_ANOMALY_THRESHOLD,
browserPriceAlerts: false,
inAppPriceAlerts: false,
notifiedPriceAlertKey: '',
inAppPriceAlertKey: '',
suppressedPriceAlerts: { date: '', seedIds: [] },
```

Add transient modal fields next to the existing trend modal state:

```js
priceAlertModalSeedIds: [],
priceAlertModalManual: false,
priceAlertMuteOnClose: false,
```

Add this normalizer and call it after merging stored config and after importing JSON config:

```js
function normalizePriceAlertConfig(config) {
  const target = config || {};
  const validated = PRICE_ALERT.validateThresholds(target.priceAlertNormalThreshold, target.priceAlertAnomalyThreshold);
  target.priceAlertNormalThreshold = validated.ok ? validated.normalThreshold : PRICE_ALERT.DEFAULT_NORMAL_THRESHOLD;
  target.priceAlertAnomalyThreshold = validated.ok ? validated.anomalyThreshold : PRICE_ALERT.DEFAULT_ANOMALY_THRESHOLD;
  target.browserPriceAlerts = Boolean(target.browserPriceAlerts);
  target.inAppPriceAlerts = Boolean(target.inAppPriceAlerts);
  target.notifiedPriceAlertKey = typeof target.notifiedPriceAlertKey === 'string' ? target.notifiedPriceAlertKey : '';
  target.inAppPriceAlertKey = typeof target.inAppPriceAlertKey === 'string' ? target.inAppPriceAlertKey : '';
  target.suppressedPriceAlerts = PRICE_ALERT.normalizeSuppression(target.suppressedPriceAlerts, Date.now());
  return target;
}
```

Keep `saveState()` unchanged structurally because it already persists all of `state.config`.

- [ ] **Step 5: Switch live alert rates to a full rolling 24-hour window**

Keep `computeRows()` calling the existing full-window trend lookup:

```js
const alertTrendChange = trendChangeForSeed(seed.id, PRICE_CHANGE_ALERT_WINDOW, true);
```

Because `PRICE_CHANGE_ALERT_WINDOW` is now `24h`, `trendWindowConfig()` continues to use hourly buckets and `trendAnchor()` continues to require a point at or before the full target time. Do not route the live alert through daily buckets.

- [ ] **Step 6: Increase userscript coverage**

In `web/userscripts/hyb-farm-dashboard-capture.user.js`, make these exact changes:

```js
// @version      0.3.7
const TREND_HOUR_URL = '/api/farm/recycle/prices?includeTrend=1&granularity=hour&trendRange=25';
```

- [ ] **Step 7: Run focused and regression tests**

Run: `node --test tests/price-alert-utils.test.mjs tests/price-alert-ui-contract.test.mjs && node --check web/app.js && node --check web/userscripts/hyb-farm-dashboard-capture.user.js`

Expected: all focused tests PASS and both scripts pass syntax checks.

- [ ] **Step 8: Commit state and data wiring**

```bash
git add tests/price-alert-ui-contract.test.mjs web/index.html web/app.js web/userscripts/hyb-farm-dashboard-capture.user.js
git commit -m "feat: use rolling 24h alert data"
```

### Task 3: Configurable settings and validation

**Files:**
- Modify: `tests/price-alert-ui-contract.test.mjs`
- Modify: `web/app.js:1787-1840,1993-2017,2128-2153`
- Modify: `web/style.css:505-539`

- [ ] **Step 1: Add failing settings contracts**

Append this test:

```js
test('renders independent threshold and notification controls', () => {
  assert.match(app, /id="priceAlertNormalThreshold"/);
  assert.match(app, /id="priceAlertAnomalyThreshold"/);
  assert.match(app, /id="browserPriceAlerts"/);
  assert.match(app, /id="inAppPriceAlerts"/);
  assert.match(app, /普通暴涨阈值/);
  assert.match(app, /异常暴涨阈值/);
  assert.match(app, /站内弹窗提醒/);
});
```

- [ ] **Step 2: Run the settings contract and verify RED**

Run: `node --test tests/price-alert-ui-contract.test.mjs`

Expected: the new settings contract FAILS because the threshold inputs and in-app toggle are absent.

- [ ] **Step 3: Render a dedicated price-alert settings panel**

Remove the existing browser-alert row from the “自动化” panel. Add this panel immediately after it:

```js
<section class="settings-panel">
  <div class="settings-head compact">
    <div>
      <h2>价格提醒</h2>
      <p>按完整 24 小时涨幅区分普通与异常暴涨。</p>
    </div>
  </div>
  <div class="price-alert-thresholds">
    <label class="price-alert-threshold-field">
      <span>普通暴涨阈值</span>
      <span class="price-alert-threshold-input"><input id="priceAlertNormalThreshold" class="field" type="number" min="0" step="0.1" value="${state.config.priceAlertNormalThreshold}" /><b>%</b></span>
    </label>
    <label class="price-alert-threshold-field">
      <span>异常暴涨阈值</span>
      <span class="price-alert-threshold-input"><input id="priceAlertAnomalyThreshold" class="field" type="number" min="0" step="0.1" value="${state.config.priceAlertAnomalyThreshold}" /><b>%</b></span>
    </label>
  </div>
  <div class="toggle-list">
    <label class="toggle-row">
      <span class="toggle-text"><strong>浏览器系统通知</strong><small>使用系统通知概括当前达标作物</small></span>
      <span class="toggle-control"><input id="browserPriceAlerts" type="checkbox" ${state.config.browserPriceAlerts ? 'checked' : ''} /><span class="toggle-track"></span></span>
    </label>
    <label class="toggle-row">
      <span class="toggle-text"><strong>站内弹窗提醒</strong><small>新价格到达时列出所有未被今日屏蔽的达标作物</small></span>
      <span class="toggle-control"><input id="inAppPriceAlerts" type="checkbox" ${state.config.inAppPriceAlerts ? 'checked' : ''} /><span class="toggle-track"></span></span>
    </label>
  </div>
</section>
```

- [ ] **Step 4: Bind validated threshold saving and the in-app switch**

Add this helper:

```js
function savePriceAlertThresholds(normalValue, anomalyValue) {
  const validated = PRICE_ALERT.validateThresholds(normalValue, anomalyValue);
  if (!validated.ok) {
    state.status = validated.message;
    return false;
  }
  state.config.priceAlertNormalThreshold = validated.normalThreshold;
  state.config.priceAlertAnomalyThreshold = validated.anomalyThreshold;
  state.status = `价格提醒阈值已更新：普通 ${formatNumber(validated.normalThreshold, 1)}%，异常 ${formatNumber(validated.anomalyThreshold, 1)}%。`;
  saveState();
  return true;
}
```

In `bindEvents()`, bind both threshold inputs together so either `change` validates the pair, then rerenders to restore the last valid pair after an error:

```js
const normalAlertThreshold = document.getElementById('priceAlertNormalThreshold');
const anomalyAlertThreshold = document.getElementById('priceAlertAnomalyThreshold');
if (normalAlertThreshold && anomalyAlertThreshold) {
  const saveThresholds = () => {
    savePriceAlertThresholds(normalAlertThreshold.value, anomalyAlertThreshold.value);
    render();
  };
  normalAlertThreshold.addEventListener('change', saveThresholds);
  anomalyAlertThreshold.addEventListener('change', saveThresholds);
}

const inAppPriceAlerts = document.getElementById('inAppPriceAlerts');
if (inAppPriceAlerts) inAppPriceAlerts.addEventListener('change', () => {
  state.config.inAppPriceAlerts = inAppPriceAlerts.checked;
  state.status = state.config.inAppPriceAlerts ? '已开启站内价格弹窗；从下一批新价格开始提醒。' : '已关闭站内价格弹窗。';
  saveState();
  render();
});
```

Do not call the auto-popup dispatcher from this toggle handler.

- [ ] **Step 5: Style the threshold controls**

Add focused styles:

```css
.price-alert-thresholds { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
.price-alert-threshold-field { display: grid; gap: 6px; color: var(--muted); font-size: 12px; }
.price-alert-threshold-input { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 7px; }
.price-alert-threshold-input .field { width: 100%; }
.price-alert-threshold-input b { color: var(--text); }
```

Under the existing mobile media query, add:

```css
.price-alert-thresholds { grid-template-columns: 1fr; }
```

- [ ] **Step 6: Run focused tests and syntax checks**

Run: `node --test tests/price-alert-utils.test.mjs tests/price-alert-ui-contract.test.mjs && node --check web/app.js && git diff --check`

Expected: all tests and checks PASS.

- [ ] **Step 7: Commit the settings UI**

```bash
git add tests/price-alert-ui-contract.test.mjs web/app.js web/style.css
git commit -m "feat: add configurable price alert settings"
```

### Task 4: Shared announcement and in-app popup

**Files:**
- Modify: `tests/price-alert-ui-contract.test.mjs`
- Modify: `web/app.js:990-1050,1528-1593,1688,1868-2018,2231-2245`
- Modify: `web/style.css:125-142,472-504,547-570`

- [ ] **Step 1: Add failing announcement and modal contracts**

Append:

```js
test('renders a clickable summary announcement and full alert dialog', () => {
  assert.match(app, /data-price-alert-open/);
  assert.match(app, /data-price-alert-backdrop/);
  assert.match(app, /role="dialog"/);
  assert.match(app, /今日不再提醒上述作物/);
  assert.match(app, /共 \$\{summary\.total\} 种达标/);
  assert.match(app, /item\.severity === 'anomaly'/);
});

test('deduplicates popup batches and stores suppression for only displayed crops', () => {
  assert.match(app, /PRICE_ALERT\.batchKey/);
  assert.match(app, /PRICE_ALERT\.unsuppressedItems/);
  assert.match(app, /PRICE_ALERT\.addSuppressedCrops/);
  assert.match(app, /priceAlertModalSeedIds/);
});
```

- [ ] **Step 2: Run the UI contracts and verify RED**

Run: `node --test tests/price-alert-ui-contract.test.mjs`

Expected: the announcement/modal contracts FAIL because the shared summary and dialog do not exist.

- [ ] **Step 3: Replace the single-row selector with a shared summary**

Remove `bestPriceRiseRow()`. Add:

```js
function priceAlertSummary(rows) {
  return PRICE_ALERT.evaluate(
    Array.isArray(rows) ? rows : computeRows(),
    state.config.priceAlertNormalThreshold,
    state.config.priceAlertAnomalyThreshold
  );
}

function topPriceRiseAlert(summary) {
  const highest = summary.highest;
  if (!highest) return '';
  const severityText = highest.severity === 'anomaly' ? '异常' : '普通';
  return `<button class="top-alert ${highest.severity}" type="button" data-price-alert-open title="查看全部 24h 涨幅提醒"><span class="top-alert-label">${severityText}</span><strong>${escapeHtml(highest.name)}</strong><span>${formatSignedPercent(highest.rate)}</span><span>共 ${summary.total} 种达标</span></button>`;
}
```

In `render()`, calculate one summary from the already-computed rows and pass it to both the announcement and popup renderer:

```js
const alertSummary = priceAlertSummary(rows);
```

Render `${topPriceRiseAlert(alertSummary)}` in the top bar and `${renderPriceAlertModal(alertSummary)}` after the main content.

- [ ] **Step 4: Add auto/manual modal state and dispatch**

Add these functions:

```js
function openPriceAlertModal(items, manual) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return false;
  state.trendModalSeedId = '';
  state.priceAlertModalSeedIds = list.map((item) => item.seedId);
  state.priceAlertModalManual = Boolean(manual);
  state.priceAlertMuteOnClose = false;
  return true;
}

function maybeOpenPriceAlertModal(summary) {
  if (!state.config.inAppPriceAlerts || !summary.total) return false;
  const key = PRICE_ALERT.batchKey(state.lastImportedAt, summary.items);
  if (!key || state.config.inAppPriceAlertKey === key) return false;
  state.config.inAppPriceAlertKey = key;
  const items = PRICE_ALERT.unsuppressedItems(summary.items, state.config.suppressedPriceAlerts, Date.now());
  saveState();
  return openPriceAlertModal(items, false);
}

function closePriceAlertModal() {
  if (!state.priceAlertModalSeedIds.length) return;
  if (state.priceAlertMuteOnClose) {
    state.config.suppressedPriceAlerts = PRICE_ALERT.addSuppressedCrops(
      state.config.suppressedPriceAlerts,
      state.priceAlertModalSeedIds,
      Date.now()
    );
    saveState();
  }
  state.priceAlertModalSeedIds = [];
  state.priceAlertModalManual = false;
  state.priceAlertMuteOnClose = false;
  render();
}
```

At each existing new-price hook (`applySnapshot`, accepted newer cloud default, and manual price edit), call one dispatcher after updating state:

```js
function handlePriceAlertsForNewData() {
  const summary = priceAlertSummary();
  maybeNotifyPriceRise(summary, false);
  maybeOpenPriceAlertModal(summary);
}
```

Replace each old `maybeNotifyPriceRise()` call with `handlePriceAlertsForNewData()`. This dispatcher is not called by normal rerenders.

- [ ] **Step 5: Render the complete alert dialog**

Add a renderer that resolves the transient IDs against the current shared summary:

```js
function renderPriceAlertModal(summary) {
  if (!state.priceAlertModalSeedIds.length) return '';
  const selected = new Set(state.priceAlertModalSeedIds);
  const items = summary.items.filter((item) => selected.has(item.seedId));
  if (!items.length) return '';
  const anomalyCount = items.filter((item) => item.severity === 'anomaly').length;
  const normalCount = items.length - anomalyCount;
  return `
    <div class="price-alert-backdrop" data-price-alert-backdrop>
      <section class="price-alert-modal" role="dialog" aria-modal="true" aria-labelledby="priceAlertTitle">
        <header class="price-alert-modal-head">
          <div>
            <h2 id="priceAlertTitle">24h 价格上涨提醒</h2>
            <p>异常 ${anomalyCount} 种 · 普通 ${normalCount} 种</p>
          </div>
          <button class="price-alert-close" type="button" data-price-alert-close aria-label="关闭价格提醒">×</button>
        </header>
        <div class="price-alert-list">
          ${items.map((item) => `
            <div class="price-alert-item ${item.severity}">
              <img src="./assets/crops/${escapeHtml(item.seedId)}.png" alt="" onerror="this.style.display='none'" />
              <strong>${escapeHtml(item.name)}</strong>
              <span class="price-alert-severity">${item.severity === 'anomaly' ? '异常' : '普通'}</span>
              <span class="price-alert-rate">${formatSignedPercent(item.rate)}</span>
              <span class="price-alert-price">${formatUsd(item.price)}</span>
            </div>
          `).join('')}
        </div>
        <footer class="price-alert-modal-foot">
          <label><input type="checkbox" data-price-alert-mute ${state.priceAlertMuteOnClose ? 'checked' : ''} /> 今日不再提醒上述作物</label>
          <button class="btn primary" type="button" data-price-alert-close>知道了</button>
        </footer>
      </section>
    </div>
  `;
}
```

- [ ] **Step 6: Bind manual open, close, checkbox, backdrop, body lock, and Escape**

In `bindEvents()`:

```js
document.querySelectorAll('[data-price-alert-open]').forEach((button) => {
  button.addEventListener('click', () => {
    if (openPriceAlertModal(priceAlertSummary().items, true)) render();
  });
});
document.querySelectorAll('[data-price-alert-close]').forEach((button) => button.addEventListener('click', closePriceAlertModal));
const priceAlertMute = document.querySelector('[data-price-alert-mute]');
if (priceAlertMute) priceAlertMute.addEventListener('change', () => {
  state.priceAlertMuteOnClose = priceAlertMute.checked;
});
const priceAlertBackdrop = document.querySelector('[data-price-alert-backdrop]');
if (priceAlertBackdrop) priceAlertBackdrop.addEventListener('click', (event) => {
  if (event.target === priceAlertBackdrop) closePriceAlertModal();
});
```

Update the body lock to include either dialog:

```js
document.body.classList.toggle('modal-open', Boolean(state.trendModalSeedId || state.priceAlertModalSeedIds.length));
```

Update Escape handling so the alert modal closes first, otherwise the crop trend modal closes:

```js
if (event.key !== 'Escape') return;
if (state.priceAlertModalSeedIds.length) closePriceAlertModal();
else if (state.trendModalSeedId) closeCropTrendModal();
```

- [ ] **Step 7: Style announcement severities and the responsive dialog**

Convert `.top-alert` to a button by adding `cursor: pointer; font: inherit;`, retain its existing dimensions, and add normal/anomaly variants. Add dialog styles using the existing modal visual language:

```css
.top-alert.normal { border-color: var(--warn-border); background: var(--warn-bg); color: var(--warn-text); }
.top-alert.anomaly { border-color: color-mix(in srgb, var(--red) 45%, var(--line)); background: color-mix(in srgb, var(--red) 10%, var(--surface)); color: var(--red); }
.price-alert-backdrop { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 24px; background: rgba(15, 23, 42, .58); backdrop-filter: blur(3px); }
.price-alert-modal { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; width: min(680px, 100%); max-height: min(720px, calc(100vh - 48px)); overflow: hidden; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); box-shadow: 0 24px 72px rgba(15, 23, 42, .32); }
.price-alert-modal-head, .price-alert-modal-foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px; }
.price-alert-modal-head { border-bottom: 1px solid var(--line); }
.price-alert-modal-head h2, .price-alert-modal-head p { margin: 0; }
.price-alert-modal-head p { margin-top: 4px; color: var(--muted); font-size: 12px; }
.price-alert-close { width: 34px; height: 34px; border: 1px solid var(--line-soft); border-radius: 7px; color: var(--muted); background: var(--formula-bg); cursor: pointer; font-size: 24px; }
.price-alert-list { display: grid; gap: 8px; min-height: 0; overflow: auto; padding: 14px; }
.price-alert-item { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto auto auto; gap: 10px; align-items: center; padding: 10px; border: 1px solid var(--line-soft); border-radius: 9px; }
.price-alert-item img { width: 36px; height: 36px; object-fit: contain; }
.price-alert-severity { padding: 3px 7px; border-radius: 999px; font-size: 12px; font-weight: 800; }
.price-alert-item.normal .price-alert-severity { color: var(--warn-text); background: var(--warn-bg); }
.price-alert-item.anomaly .price-alert-severity, .price-alert-item.anomaly .price-alert-rate { color: var(--red); }
.price-alert-rate { font-weight: 850; font-variant-numeric: tabular-nums; }
.price-alert-price { color: var(--muted); font-variant-numeric: tabular-nums; }
.price-alert-modal-foot { border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
```

In the mobile media query:

```css
.price-alert-backdrop { place-items: end stretch; padding: 16px 0 0; }
.price-alert-modal { width: 100%; max-height: calc(100dvh - 16px); border-radius: 14px 14px 0 0; border-bottom: 0; }
.price-alert-item { grid-template-columns: 34px minmax(0, 1fr) auto auto; }
.price-alert-price { grid-column: 2 / -1; }
.price-alert-modal-foot { align-items: stretch; flex-direction: column; }
```

- [ ] **Step 8: Run focused tests and syntax checks**

Run: `node --test tests/price-alert-utils.test.mjs tests/price-alert-ui-contract.test.mjs && node --check web/app.js && git diff --check`

Expected: all tests and checks PASS.

- [ ] **Step 9: Commit announcement and modal**

```bash
git add tests/price-alert-ui-contract.test.mjs web/app.js web/style.css
git commit -m "feat: add shared price alert popup"
```

### Task 5: Browser notifications, documentation, and full verification

**Files:**
- Modify: `tests/price-alert-ui-contract.test.mjs`
- Modify: `web/app.js:2128-2176`
- Modify: `README.md:12-20`

- [ ] **Step 1: Add failing browser-notification and copy contracts**

Extend the test module to load `README.md`, then append:

```js
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

test('summarizes all qualifying crops in independent browser notifications', () => {
  assert.match(app, /maybeNotifyPriceRise\(summary, force\)/);
  assert.match(app, /summary\.anomalyCount/);
  assert.match(app, /summary\.total/);
  assert.match(app, /HYB Farm 24h/);
});

test('documents configurable 24-hour announcement and popup alerts', () => {
  assert.match(readme, /完整 24 小时/);
  assert.match(readme, /普通.*8%/);
  assert.match(readme, /异常.*20%/);
  assert.match(readme, /站内弹窗/);
});
```

- [ ] **Step 2: Run the contracts and verify RED**

Run: `node --test tests/price-alert-ui-contract.test.mjs`

Expected: the system-notification and README contracts FAIL.

- [ ] **Step 3: Refactor system notification to consume the shared summary**

Replace the single-row notification function with:

```js
function maybeNotifyPriceRise(summary, force) {
  if (!state.config.browserPriceAlerts || !summary.total) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const key = PRICE_ALERT.batchKey(state.lastImportedAt, summary.items);
  if (!force && state.config.notifiedPriceAlertKey === key) return;
  state.config.notifiedPriceAlertKey = key;
  saveState();
  const highest = summary.highest;
  const title = summary.anomalyCount
    ? `HYB Farm 24h 异常暴涨 · ${summary.total} 种达标`
    : `HYB Farm 24h 普通上涨 · ${summary.total} 种达标`;
  const notification = new Notification(title, {
    body: `${highest.name} ${formatSignedPercent(highest.rate)}，点击查看全部达标作物`,
    tag: 'hyb-price-rise',
    renotify: true
  });
  notification.onclick = () => {
    window.focus();
    openPriceAlertModal(priceAlertSummary().items, true);
    render();
  };
}
```

When system notifications are enabled and permission is granted, call `maybeNotifyPriceRise(priceAlertSummary(), true)` to retain the existing immediate system-notification behavior. Do not call `maybeOpenPriceAlertModal()` from this setter.

- [ ] **Step 4: Update README feature copy**

Replace the fixed one-hour notification bullet with:

```markdown
- 按完整 24 小时涨幅提供价格提醒：普通阈值默认 8%、异常阈值默认 20%，两档均可在设置中修改。
- 顶栏公告汇总全部达标作物；浏览器系统通知与站内弹窗可分别开关，弹窗支持按当前作物设置“今日不再提醒”。
```

- [ ] **Step 5: Run the complete automated verification**

Run:

```bash
npm test
node --check web/app.js
node --check web/chart-time-utils.js
node --check web/price-alert-utils.js
node --check web/userscripts/hyb-farm-dashboard-capture.user.js
git diff --check
```

Expected: all Node tests PASS, all scripts pass syntax checks, and `git diff --check` prints no errors.

- [ ] **Step 6: Run a Worker dry-run build**

Run: `npm run deploy -- --dry-run --outdir /tmp/hyb-farm-dashboard-price-alerts-20260807`

Expected: Wrangler bundles the Worker, includes the web assets, and exits successfully without deploying.

- [ ] **Step 7: Perform browser visual and interaction QA**

Start the local app with `npm run dev -- --local --port 8791`. Use a test local-storage state with hourly trend points spanning more than 24 hours so at least one normal and one anomaly item render. Verify at desktop and mobile widths:

1. The settings panel accepts `8 / 20`, rejects equal/reversed/negative thresholds, and restores the last valid values.
2. The top announcement shows highest severity, crop, rate, and total count and opens the full list.
3. Automatic popup lists every unblocked qualifying crop once for one batch.
4. “今日不再提醒上述作物” blocks only displayed crop IDs; a different qualifying crop can still open a later popup.
5. The popup closes by button, backdrop, and Escape without stacking over the crop trend dialog.
6. Disabling the in-app switch does not hide the announcement or disable browser system notifications.

Expected: all six checks pass without overflow, clipped content, repeated same-batch popup, or console errors.

- [ ] **Step 8: Commit docs and notification integration**

```bash
git add README.md tests/price-alert-ui-contract.test.mjs web/app.js
git commit -m "feat: complete configurable price alerts"
```

- [ ] **Step 9: Review final diff**

Run: `git status --short && git log --oneline -7 && git diff HEAD~5 -- README.md web/index.html web/app.js web/style.css web/price-alert-utils.js web/userscripts/hyb-farm-dashboard-capture.user.js tests/price-alert-utils.test.mjs tests/price-alert-ui-contract.test.mjs`

Expected: only intended alert files and the approved design/plan commits are present; no `.codex/` files are staged or committed.
