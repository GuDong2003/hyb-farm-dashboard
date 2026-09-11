# Privacy Architecture

HYB Farm Dashboard 用于在不上传私有农场/账号数据的前提下分析作物价格、收益和经验效率。

## Local Browser Flow

```text
cdk.hybgzs.com page
  -> userscript fetches same-origin price, farm-level, and farm-crops APIs in the user's browser
  -> userscript builds a compact local snapshot
  -> dashboard imports it through an in-page message or dashboard/#snapshot=...
  -> dashboard stores it in local IndexedDB
```

The `#snapshot` fragment is not sent in HTTP requests. It is only visible to JavaScript running in the user's browser after the dashboard page loads.

## Cloud Price Defaults

The dashboard also has an optional cloud price pipeline:

```text
dashboard local price snapshot
  -> user clicks Upload Cloud, or enables auto-upload after import
  -> Worker validates crop prices and capture time
  -> D1 stores price submissions and the accepted default price snapshot
  -> dashboard can use the accepted cloud default when it is newer than local data, or its same-batch trend history is more complete
```

Cloud upload is limited to crop price data and timing metadata:

```text
crop id -> price
capturedAt timestamp
submission status metadata
hashed submitter fingerprint for abuse resistance
```

It does not intentionally upload farm layout, account identity, inventory, cookies, or private profile data.
The locally captured total experience and unlocked land levels are removed before any price snapshot upload.

## Anonymous Visitor Count

The top-bar cumulative visitor badge uses a random browser-local visitor ID. On the first visit the Worker hashes that ID and stores only the hash marker plus an aggregate count in a Durable Object; the object serializes the counter operation. Visitor requests do not read or write D1 or KV, and later visits reuse the local marker and read the current count without browser or edge caching. This is an approximate anonymous browser/device count, not an account or person identifier.

## What Cloudflare Sees

For normal page use, Cloudflare receives asset/API requests such as:

```text
GET /
GET /app.js
GET /style.css
GET /api/default-prices
```

When cloud upload is used, Cloudflare D1 stores public crop price submissions and the accepted default price snapshot. The submitted IP/User-Agent fingerprint is hashed before storage.

## GitHub And Secrets

The public repository should not contain Cloudflare API tokens, account secrets, browser cookies, or user-specific farm data. Deployment credentials belong in GitHub Actions secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Cloudflare resource names and IDs in `wrangler.toml` are identifiers, not credentials, but they can be moved to a private deployment config if you prefer not to publish infrastructure identifiers.
