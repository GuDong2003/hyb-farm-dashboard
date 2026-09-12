# Current Price Sync Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Make the dashboard userscript request only one current-price response per shared one-hour interval, while the site derives all historical and daily trends from accepted snapshots.

**Architecture:** A shared Durable Object atomically grants one capture slot per hour to all users. The userscript asks the Dashboard for a slot before contacting CDK; denied clients do not contact CDK and report the next shared refresh time. Accepted snapshots remain the source for server-side history and trend calculations.

**Tech Stack:** Cloudflare Worker, Durable Objects, Cloudflare D1/KV, browser userscript, Node test runner.

**Spec:** User-confirmed behavior: only current prices are captured; hourly/daily trend, experience, and plot-level requests are removed; all users share the refresh interval; invalid attempts must not issue source requests.

## Global Constraints

- Keep `PRICE_SYNC_DISABLED = true` and `SCRIPT_DISABLED = true` until the user explicitly asks to re-enable synchronization.
- Do not modify the market-monitor or farm-harvest userscripts.
- Do not add experience or plot-level data to uploads.
- Do not use D1 for the shared gate.
- Do not push or deploy in this task.

### Task 0: Enforce the userscript minimum version

**Files:**
- Modify: `tests/userscript-version-contract.test.mjs`
- Create: `tests/worker-userscript-version.test.mjs`
- Modify: `web/app.js`
- Modify: `web/userscripts/hyb-farm-dashboard-capture.user.js`
- Modify: `worker/index.js`

**Interfaces:**
- The minimum accepted userscript version is `0.6.0`.
- Snapshots carry `scriptVersion`; the page rejects URL snapshots without a supported version.
- `/api/price-submissions` rejects missing or older versions with `script_update_required` before any D1 query.

- [x] **Step 1: Write failing version-gate tests.
- [x] **Step 2: Run the focused tests and confirm they fail against v0.5.1.
- [x] **Step 3: Add the v0.6.0 metadata, URL/bridge checks, snapshot field, and Worker validation.
- [x] **Step 4: Run the focused tests and confirm they pass.

### Task 1: Define the shared gate contract

**Files:**
- Modify: `tests/price-sync-gate.test.mjs`
- Modify: `worker/index.js`
- Modify: `wrangler.toml`

**Interfaces:**
- `POST /api/price-sync-gate` accepts `{ observedCapturedAt }` and returns `{ ok: true, granted, nextAllowedAt, capturedAt }`.
- `PriceSyncGate` serializes requests and stores `nextAllowedAt` plus the latest observed capture timestamp.

- [x] **Step 1: Write failing tests** for one grant, same-window denial, stale observed timestamps, and missing binding.
- [x] **Step 2: Run `node --test tests/price-sync-gate.test.mjs` and confirm the new tests fail because the route/class do not exist.
- [x] **Step 3: Implement the Worker route, Durable Object class, binding, and migration.
- [x] **Step 4: Run the focused gate tests and confirm they pass.

### Task 2: Reduce the userscript to current prices

**Files:**
- Modify: `tests/userscript-capture-contract.test.mjs`
- Modify: `web/userscripts/hyb-farm-dashboard-capture.user.js`

**Interfaces:**
- `captureShopSnapshot()` performs one `GET /api/farm/recycle/prices` request without `includeTrend`, `granularity`, or `trendRange`.
- Before that request it calls the shared gate; a denied grant returns a non-error skipped result and does not call CDK.

- [x] **Step 1: Write failing source-contract tests for one current-price request and zero profile/trend requests.
- [x] **Step 2: Run the focused userscript tests and confirm failure.
- [x] **Step 3: Remove trend/profile URLs and parsing from the capture path; add the gate request and skipped result handling.
- [x] **Step 4: Run the focused userscript tests and syntax-check the script.

### Task 3: Handle skipped bridge refreshes without retry storms

**Files:**
- Modify: `tests/auto-refresh-contract.test.mjs`
- Modify: `web/app.js`

**Interfaces:**
- Bridge responses with `skipped: true` update status and schedule the next attempt at `nextAllowedAt`; they do not create a local upload snapshot.

- [x] **Step 1: Add a failing test for skipped responses and exact next-attempt scheduling.
- [x] **Step 2: Run the focused app contract test and confirm failure.
- [x] **Step 3: Implement skipped-response handling and bounded timer scheduling.
- [x] **Step 4: Run the focused app test.

### Task 4: Full verification

**Files:**
- Test: `tests/*.test.mjs`

- [x] **Step 1: Run `npm test`.
- [x] **Step 2: Run the Wrangler dry-run check used by this repository.
- [x] **Step 3: Inspect `git diff` and confirm `.codex/` remains untracked.
