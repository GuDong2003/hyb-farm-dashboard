# Price Alert Trend Hydration and Asset Freshness Design

## Context

The deployed dashboard can show large 24-hour changes in the price table while rendering no top announcement. The two surfaces currently consume different inputs:

- The table calculates its selected-window change from `/api/price-history` plus local IndexedDB snapshots.
- The announcement evaluates `priceAlertRate`, which requires a complete 24-hour anchor inside the latest snapshot's `priceTrends.shop[seedId].hourly` series.

The latest accepted `farm-automation-upload` snapshot contains nineteen trend objects with `unitPrice` only and no hourly points. `hydrateSnapshotTrends()` treats the number of object keys as proof that trends are complete, returns early, and never backfills the missing series from accepted submissions. Every live alert rate therefore becomes unavailable even though the history endpoint has enough data.

The user's Chrome session also continued loading the pre-alert `index.html` and `app.js` after deployment because the asset URLs were unchanged. A freshly created browser tab and a hard reload still showed the old one-hour notification settings, while direct HTTP verification showed the new deployment.

## Goals

- Produce a usable complete rolling 24-hour alert rate when the latest submission contains only current prices or partial trend objects.
- Preserve valid trend data supplied by an uploader and fill only missing series or metadata from accepted cloud history.
- Keep the existing ordinary/anomaly thresholds, announcement behavior, popup behavior, and table calculation unchanged.
- Make a newly deployed frontend version use distinct critical asset URLs so browser and edge caches cannot silently reuse the previous application bundle.
- Cover both regressions with automated tests before implementation.

## Non-goals

- Do not change the ordinary `8%` or anomaly `20%` defaults.
- Do not treat a partial period as a complete 24-hour window.
- Do not redesign the alert UI, price table, chart, upload consensus rules, or D1 schema.
- Do not require every uploader to supply trend arrays before its prices can be accepted.

## Considered Approaches

### 1. Worker-side per-field hydration plus versioned asset URLs — selected

Always build a fallback trend map from recent accepted submissions when the snapshot does not already contain usable series for every crop. Merge per crop and per field: retain valid uploaded `hourly`, `daily`, `unitPrice`, and `lastRefreshedAt` values, while filling absent or empty fields from the synthesized map. Reference the critical CSS and JavaScript assets with one deployment version query token in `index.html`.

This keeps the latest snapshot self-contained for every dashboard client, reuses the existing history-to-bucket implementation, and fixes automated uploads without coupling the browser alert calculation to a second API response.

### 2. Frontend fallback to `/api/price-history`

The browser could calculate announcement rates from the same history series as the table when `priceTrends` is incomplete. This would make the UI resilient, but it duplicates alert calculation paths, delays the announcement until history finishes loading, and leaves `/api/default-prices` semantically incomplete for other clients.

### 3. Reject or ignore uploads without full trends

Uploaders could be required to send 25 valid hourly buckets. This is stricter but would make otherwise valid current prices unusable and would not repair existing automation clients. It is unsuitable for the current compatibility requirements.

## Worker Data Flow

1. `getDefaultPrices()` reads the accepted default snapshot.
2. `hydrateSnapshotTrends()` evaluates actual trend usability rather than counting crop keys.
3. When any crop lacks an hourly series, daily series, current unit price, or refresh timestamp, the Worker reads the latest 500 accepted submissions and builds fallback hourly and daily buckets with the existing `buildTrendMapFromRows()` path.
4. A pure merge helper combines the uploaded and synthesized trend maps per crop and per field:
   - non-empty uploaded `hourly` and `daily` arrays win;
   - missing or empty arrays use synthesized arrays;
   - a finite uploaded `unitPrice` wins, otherwise the synthesized current price is used;
   - a valid uploaded `lastRefreshedAt` wins, otherwise the synthesized snapshot time is used.
5. The response returns hydrated `priceTrends`. The database row is not rewritten.
6. The existing frontend `trendAnchor(..., requireFullWindow=true)` still refuses to emit an alert until it finds a point at or before the exact 24-hour target.

The 500-row limit remains unchanged. Current production history shows that those rows span substantially more than 24 hours, and the existing bucket builder limits each returned series to the configured maximum point count.

## Asset Freshness

`web/index.html` will reference `style.css`, `chart-time-utils.js`, `price-alert-utils.js`, and `app.js` with the same explicit version query token. The token changes in this fix and is covered by a contract test that requires all critical resources to share it. Once the updated HTML is fetched, browser caches see new subordinate resource URLs instead of reusing the previous scripts and stylesheet. An already open document still requires a reload to fetch the updated HTML.

The underlying files remain normal static assets; no build pipeline or service worker is introduced.

## Error Handling

- If D1 history cannot be queried, the existing Worker error behavior remains visible instead of silently fabricating an alert rate.
- Invalid uploaded trend fields continue to be removed by `normalizePriceTrends()`.
- Missing history produces empty synthesized series, so the frontend continues to omit the announcement rather than calculating from an incomplete window.
- Uploaded valid series are never replaced merely because synthesized data also exists.

## Testing

### Worker regression tests

- A snapshot with nineteen `unitPrice`-only trend objects must not be considered fully hydrated.
- Per-field merging must fill missing hourly/daily series and refresh time while preserving valid uploaded values.
- An uploaded non-empty hourly series must not be overwritten by synthesized history.
- A truly complete existing trend map may skip the history query.

### Asset contract test

- The four critical asset references in `web/index.html` must carry one identical non-empty version token.
- `price-alert-utils.js` must remain before `app.js`.

### Verification

- Run the full Node test suite and syntax checks.
- Run `wrangler deploy --dry-run`.
- After deployment, confirm the active Worker version, verify the custom-domain asset bodies, and load a cache-busted browser page.
- Confirm the refreshed default snapshot contains hourly points and that qualifying positive 24-hour changes render the top announcement.

## Deployment and Rollback

Deploy through the existing Wrangler configuration. No migration is required. If the hydration response causes an unexpected regression, roll back to the previous Worker version; the fix does not mutate stored submissions or the default row.
