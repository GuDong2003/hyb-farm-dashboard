# HYB Farm Dashboard

Privacy-first dashboard for 黑与白 farm data analysis.

This project is planned as a Cloudflare Pages static web app. It helps users analyze crop market prices, profit, experience efficiency, and farm rankings without uploading private farm data to the server.

## Privacy Model

The default architecture is local-only:

1. The public Cloudflare Pages site serves static HTML, CSS, and JavaScript.
2. A bookmarklet runs on `cdk.hybgzs.com` after the user logs in.
3. The bookmarklet reads same-origin farm APIs in the user's browser.
4. The bookmarklet redirects back to this dashboard with a `#snapshot=...` URL fragment.
5. The dashboard imports that snapshot into the user's local IndexedDB.
6. Cloudflare and GitHub do not receive the snapshot payload.

URL fragments are not sent in HTTP requests, so `#snapshot=...` stays inside the user's browser.

## Planned Features

- Crop market price capture
- Shop recycle price capture
- Profit ranking by land level distribution
- Crop experience ranking
- Experience per hour analysis
- Farm leaderboard analysis
- Local IndexedDB history
- JSON export/import backup
- Bookmarklet installation page

## Repository Layout

```text
web/          Static Cloudflare Pages app
bookmarklet/  Bookmarklet source used to capture game data
docs/         Architecture and privacy notes
```

## Deployment Target

Cloudflare Pages, static-only by default.

```text
Framework preset: None
Build command: empty
Build output directory: web
```

No server-side user data storage is planned for the default mode.
