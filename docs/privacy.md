# Privacy Architecture

HYB Farm Dashboard is designed to avoid uploading private farm/account data.

## Local Browser Flow

```text
cdk.hybgzs.com page
  -> userscript fetches same-origin price APIs in the user's browser
  -> userscript builds a compact price snapshot
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
  -> dashboard can use the accepted cloud default when it is newer than local data
```

Cloud upload is limited to crop price data and timing metadata:

```text
crop id -> price
capturedAt timestamp
submission status metadata
hashed submitter fingerprint for abuse resistance
```

It does not intentionally upload farm layout, account identity, inventory, cookies, or private profile data.

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

Real Cloudflare resource names and IDs are kept out of the public repository. Use `wrangler.example.toml` as the template, keep local `wrangler.toml` ignored, and store production D1 identifiers in GitHub Actions secrets.
