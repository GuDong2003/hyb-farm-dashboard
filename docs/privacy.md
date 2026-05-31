# Privacy Architecture

HYB Farm Dashboard is designed to work without uploading private farm data.

## Local-Only Flow

```text
cdk.hybgzs.com page
  -> user clicks bookmarklet
  -> bookmarklet fetches same-origin farm APIs
  -> bookmarklet builds a compact snapshot
  -> browser navigates to dashboard/#snapshot=...
  -> dashboard stores the snapshot in local IndexedDB
```

The `#snapshot` fragment is never sent to Cloudflare Pages, GitHub, or any server. It is only visible to JavaScript running in the user's browser after the dashboard page loads.

## What Cloudflare Sees

In the local-only mode, Cloudflare receives normal page requests such as:

```text
GET /
GET /app.js
GET /style.css
```

Cloudflare does not receive the farm snapshot in the URL fragment.

## When a Backend Would Be Needed

A backend would only be needed for cross-device sync or shared dashboards. If this is added later, user data should be encrypted in the browser before upload so the server only stores ciphertext.
