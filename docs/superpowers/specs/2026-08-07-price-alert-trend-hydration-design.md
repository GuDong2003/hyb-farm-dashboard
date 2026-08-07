# Price Alert Trend Hydration and Asset Freshness Design

## Context

The deployed dashboard can show large 24-hour changes in the price table while rendering no top announcement. The two surfaces currently consume different inputs:

- The table calculates its selected-window change from `/api/price-history` plus local IndexedDB snapshots.
- The announcement evaluates `priceAlertRate`, which requires a complete 24-hour anchor inside the latest snapshot's `priceTrends.shop[seedId].hourly` series.

The latest accepted `farm-automation-upload` snapshot contains nineteen trend objects with `unitPrice` only and no hourly points. `hydrateSnapshotTrends()` treats the number of object keys as proof that trends are complete, returns early, and never backfills the missing series from accepted submissions. Every live alert rate therefore becomes unavailable even though the history endpoint has enough data.

The user's Chrome session also continued loading the pre-alert `index.html` and `app.js` after deployment because the asset URLs were unchanged. A freshly created browser tab and a hard reload still showed the old one-hour notification settings, while direct HTTP verification showed the new deployment.

## Goals

- Produce a usable complete rolling 24-hour alert rate when the latest submission contains only current prices or partial trend objects.
- Preserve a complete uploaded hourly series with its own refresh timestamp, preserve other valid uploaded fields, and fill incomplete series or missing metadata from accepted cloud history.
- Keep the existing ordinary/anomaly thresholds, announcement behavior, popup behavior, and table calculation unchanged.
- Make a newly deployed frontend version use distinct critical asset URLs so browser and edge caches cannot silently reuse the previous application bundle.
- Cover both regressions with automated tests before implementation.

## Non-goals

- Do not change the ordinary `8%` or anomaly `20%` defaults.
- Do not treat a partial period as a complete 24-hour window.
- Do not redesign the alert UI, price table, chart, upload consensus rules, or existing D1 tables and columns; the only schema addition is a non-destructive history-query index.
- Do not require every uploader to supply trend arrays before its prices can be accepted.

## Considered Approaches

### 1. Worker-side per-field hydration plus versioned asset URLs — selected

Always build a fallback trend map from recent accepted submissions when the snapshot does not already contain usable series for every crop. Merge per crop and per field: retain uploaded `hourly` only when it contains a complete 24-hour anchor relative to its uploaded `lastRefreshedAt`; otherwise use synthesized `hourly`. Treat the selected hourly series and its `lastRefreshedAt` as one source pair. Continue to prefer non-empty uploaded `daily` and finite uploaded `unitPrice`. Reference the critical CSS and JavaScript assets with the `20260807-alert2` deployment version token in `index.html`.

This keeps the latest snapshot self-contained for every dashboard client, reuses the existing history-to-bucket implementation, and fixes automated uploads without coupling the browser alert calculation to a second API response.

### 2. Frontend fallback to `/api/price-history`

The browser could calculate announcement rates from the same history series as the table when `priceTrends` is incomplete. This would make the UI resilient, but it duplicates alert calculation paths, delays the announcement until history finishes loading, and leaves `/api/default-prices` semantically incomplete for other clients.

### 3. Reject or ignore uploads without full trends

Uploaders could be required to send 25 valid hourly buckets. This is stricter but would make otherwise valid current prices unusable and would not repair existing automation clients. It is unsuitable for the current compatibility requirements.

## Worker Data Flow

1. `getDefaultPrices()` reads the accepted default snapshot.
2. `hydrateSnapshotTrends()` evaluates actual trend usability rather than counting crop keys. A usable hourly series must contain a valid bucket at or before `lastRefreshedAt - 24 hours`; a merely non-empty recent series is still incomplete for this alert.
3. When any crop lacks that complete hourly anchor, a daily series, current unit price, or refresh timestamp, the Worker reads the latest 500 accepted submissions and builds fallback hourly and daily buckets with the existing `buildTrendMapFromRows()` path.
4. A pure merge helper combines the uploaded and synthesized trend maps per crop and per field:
   - uploaded `hourly` wins only when it contains a point at or before its own `lastRefreshedAt - 24 hours`;
   - a complete uploaded `hourly` keeps the uploaded `lastRefreshedAt`; an incomplete or recent-only uploaded series uses both synthesized `hourly` and synthesized `lastRefreshedAt`;
   - a non-empty uploaded `daily` array wins, while a missing or empty array uses synthesized `daily`;
   - a finite uploaded `unitPrice` wins, otherwise the synthesized current price is used;
5. The response returns hydrated `priceTrends`. The database row is not rewritten.
6. The existing frontend `trendAnchor(..., requireFullWindow=true)` still refuses to emit an alert until it finds a point at or before the exact 24-hour target.

The 500-row limit remains unchanged. Migration `0003_price_submissions_accepted_captured_at.sql` adds `idx_price_submissions_accepted_captured_at` on `(accepted, captured_at DESC)` so D1 can satisfy the accepted-history filter and descending limit efficiently. The existing bucket builder still limits each returned series to the configured maximum point count.

## Asset Freshness

`web/index.html` references `style.css`, `chart-time-utils.js`, `price-alert-utils.js`, and `app.js` with the exact shared query token `?v=20260807-alert2`. The contract test requires all four exact URLs and keeps `price-alert-utils.js` before `app.js`. Once the updated HTML is fetched, browser caches see new subordinate resource URLs instead of reusing the previous scripts and stylesheet. An already open document still requires a reload to fetch the updated HTML.

The underlying files remain normal static assets; no build pipeline or service worker is introduced.

## Error Handling

- If D1 history cannot be queried, the existing Worker error behavior remains visible instead of silently fabricating an alert rate.
- Invalid uploaded trend fields continue to be removed by `normalizePriceTrends()`.
- Missing history produces empty synthesized series, so the frontend continues to omit the announcement rather than calculating from an incomplete window.
- Complete uploaded hourly series remain paired with their uploaded refresh timestamp; incomplete hourly series are replaced as a pair so a fallback series is never evaluated against an unrelated uploaded timestamp.

## Testing

### Worker regression tests

- A snapshot with nineteen `unitPrice`-only trend objects must not be considered fully hydrated.
- A recent-only hourly series without a point at or before the 24-hour target must still require hydration.
- Per-field merging must fill missing hourly/daily series and refresh time while preserving valid uploaded values.
- A complete uploaded hourly series and its timestamp must not be overwritten by synthesized history.
- A recent-only uploaded hourly series must use the synthesized hourly series and synthesized timestamp together, even when the uploaded timestamp is valid but different.
- A truly complete existing trend map may skip the history query.
- Mock D1 tests must prove complete trends perform zero history queries, while `unitPrice`-only and recent-only trends perform exactly one query and become complete 24-hour snapshots.

### Migration contract test

- `0003_price_submissions_accepted_captured_at.sql` must exist after `0002` and create `idx_price_submissions_accepted_captured_at` on `(accepted, captured_at DESC)`.

### Asset contract test

- The four critical asset references in `web/index.html` must exactly use `?v=20260807-alert2`.
- `price-alert-utils.js` must remain before `app.js`.

### Verification

- Run the Worker hydration and migration contract tests, the asset contract test, the full Node test suite, and syntax checks.
- Run `wrangler deploy --dry-run`.
- After deployment, confirm the active Worker version, verify the custom-domain asset bodies, and load a cache-busted browser page.
- Confirm the refreshed default snapshot contains hourly points and that qualifying positive 24-hour changes render the top announcement.

## Deployment and Rollback

Apply the D1 migration before deploying the Worker:

```bash
npx wrangler d1 migrations apply hyb-farm-dashboard-db --remote
npx wrangler deploy
```

If the hydration response causes an unexpected regression, roll back to the previous Worker version. The hydration path does not mutate stored submissions or the default row. The new index is non-destructive and may remain in place after a Worker rollback.
