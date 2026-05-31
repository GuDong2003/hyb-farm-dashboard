# HYB Farm Dashboard

Privacy-first dashboard for 黑与白 farm data analysis.

This project is planned as a Cloudflare Workers static web app with small API endpoints for shared price defaults. It helps users analyze crop market prices, profit, experience efficiency, and farm rankings without uploading private farm data to the server.

## Privacy Model

Private farm data stays local by default:

1. The public Cloudflare Worker serves static HTML, CSS, JavaScript, and `/api/*` endpoints.
2. A userscript runs on `cdk.hybgzs.com` after the user logs in.
3. The userscript reads same-origin farm APIs in the user's browser.
4. The userscript redirects back to this dashboard with a `#snapshot=...` URL fragment or responds through the in-page bridge.
5. The dashboard imports that snapshot into the user's local IndexedDB.
6. The dashboard can submit crop price snapshots to the Cloudflare Worker for public default-price validation when the user clicks upload or enables auto-upload after import.

The D1 database stores crop prices, capture timestamps, submission metadata, and accepted default snapshots. A valid upload becomes the default when there is no current default, when its capture time belongs to a newer refresh interval than the current default, or when the prices differ from the current default. Users without the userscript can still receive cloud default price refreshes. The dashboard compares local and cloud capture times and uses the newer price snapshot. It does not store private farm layout or account data. URL fragments are not sent in HTTP requests, so `#snapshot=...` still stays inside the user's browser unless the dashboard explicitly submits the crop prices for validation.

## Planned Features

- Crop market price capture
- Shop recycle price capture
- Profit ranking by land level distribution
- Crop experience ranking
- Experience per hour analysis
- Farm leaderboard analysis
- Local IndexedDB history
- JSON export/import backup
- Userscript installation page
- Cloud-validated default crop price snapshots

## Repository Layout

```text
web/          Static Cloudflare Pages app
bookmarklet/  Bookmarklet source used to capture game data
docs/         Architecture and privacy notes
```

## Deployment Target

Cloudflare Workers Static Assets, static-only by default.

```bash
npm install
npm run deploy
```

For GitHub Actions auto-deploy, add these repository secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

The workflow lives at `.github/workflows/deploy.yml` and runs on every push to `main`. See `docs/deployment.md` for Cloudflare token setup.

`wrangler.toml` publishes the `web/` directory as Worker static assets.

```toml
name = "hyb-farm-dashboard"
compatibility_date = "2026-05-31"

[assets]
directory = "./web"
not_found_handling = "single-page-application"
```

No private farm data is stored server-side. Cloudflare D1 stores public crop price submissions and the accepted default price snapshot.
