# Cloudflare Worker Deployment

This project is configured for Cloudflare Workers Static Assets.

## Local Deployment

```bash
npm install
npx wrangler login
npm run deploy
```

If `wrangler login` times out, run it again in an interactive terminal and finish the browser authorization flow.

## GitHub Actions Deployment

The workflow is located at:

```text
.github/workflows/deploy.yml
```

It runs on every push to `main` and can also be started manually from the GitHub Actions tab.

### Required GitHub Secrets

Add these repository secrets in GitHub:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Path:

```text
GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret
```

### Cloudflare Account ID

Find it in the Cloudflare dashboard:

```text
Cloudflare Dashboard -> Workers & Pages -> Overview
```

or after logging in locally:

```bash
npx wrangler whoami
```

### Cloudflare API Token

Create a token in Cloudflare:

```text
Cloudflare Dashboard -> My Profile -> API Tokens -> Create Token
```

Use the built-in `Edit Cloudflare Workers` template when available.

For a custom token, use permissions equivalent to:

```text
Account / Workers Scripts / Edit
Account / Account Settings / Read
User / User Details / Read
```

If you later add a custom domain or routes, add the relevant Zone permissions for that zone.

## Validate Without Deploying

```bash
npx wrangler deploy --dry-run
```

A successful dry run should read the files from `web/` and exit without uploading.
