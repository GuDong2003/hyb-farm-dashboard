# Smooth Trend Panning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make price trend dragging visually stable without changing raw prices or price-alert calculations.

**Architecture:** Keep raw history points for alerts and anomaly detection. Add a chart-only time-bucket aggregation layer, remove the drag-release hour snap, and preserve an expanding y-axis domain while a viewport is being dragged so entering or leaving extrema cannot rescale the chart abruptly.

**Tech Stack:** Browser JavaScript, shared chart-time utility, Node.js built-in test runner.

---

### Task 1: Define chart smoothing and drag contracts

**Files:**
- Modify: `tests/chart-time-utils.test.mjs`
- Modify: `tests/chart-fixed-viewport.test.mjs`
- Modify: `web/chart-time-utils.js`

- [ ] **Step 1: Write failing tests** for median time-bucket aggregation, expanding-only price domains, and drag release preserving the continuous viewport end.
- [ ] **Step 2: Run the focused tests** and confirm they fail for the missing helpers and existing release snap.
- [ ] **Step 3: Implement the smallest shared utility helpers** and remove the forced release snap contract.
- [ ] **Step 4: Run the focused tests** and confirm they pass.

### Task 2: Apply smoothing only to the trend chart

**Files:**
- Modify: `web/app.js`
- Modify: `tests/price-alert-ui-contract.test.mjs`

- [ ] **Step 1: Add a chart-only display-point path** that aggregates 24-hour data hourly and 7-day/30-day/all data daily while preserving raw points for alert and anomaly calculations.
- [ ] **Step 2: Add expanding-only y-axis state during drag** and reset it when opening, closing, or changing chart options.
- [ ] **Step 3: Render aggregated points and keep raw anomaly markers/tooltips available without changing alert rates.**
- [ ] **Step 4: Add source contracts** proving alerts still use raw trend data and the drag path does not force a snap.
- [ ] **Step 5: Run targeted tests** and fix only implementation failures.

### Task 3: Full verification and browser QA

**Files:**
- No additional production files.

- [ ] **Step 1: Run `npm test`, production syntax checks, `git diff --check`, and `npx wrangler deploy --dry-run`.
- [ ] **Step 2: Open the deployed/local page and verify a 24-hour chart remains visually stable while dragging across a price extremum.
- [ ] **Step 3: Confirm the announcement thresholds still read 8%/20% and no alert behavior changed.
