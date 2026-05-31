# Cloudflare Worker Deployment

This project is configured for Cloudflare Workers Static Assets.

## Local Deployment

```bash
npm install
cp wrangler.example.toml wrangler.toml
# Fill in REPLACE_WITH_D1_DATABASE_NAME and REPLACE_WITH_D1_DATABASE_ID.
npx wrangler login
npx wrangler d1 migrations apply <your-d1-database-name> --remote
npm run deploy
```

Or generate local `wrangler.toml` from environment variables:

```bash
CLOUDFLARE_D1_DATABASE_NAME=<your-d1-database-name> \
CLOUDFLARE_D1_DATABASE_ID=<your-d1-database-id> \
npm run prepare:wrangler
```

`wrangler.toml` is intentionally ignored by Git so real Cloudflare resource identifiers are not committed. If `wrangler login` times out, run it again in an interactive terminal and finish the browser authorization flow.

## GitHub Actions Deployment

The workflow is located at:

```text
.github/workflows/deploy.yml
```

It runs on every push to `main` and can also be started manually from the GitHub Actions tab. The workflow generates `wrangler.toml` from `wrangler.example.toml` using repository secrets before deploying.

### Required GitHub Secrets

Add these repository secrets in GitHub:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_D1_DATABASE_NAME
CLOUDFLARE_D1_DATABASE_ID
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

### Cloudflare D1 Database

Create or inspect the D1 database with Wrangler:

```bash
npx wrangler d1 create <your-d1-database-name>
npx wrangler d1 list
```

Use the database name and ID as local `wrangler.toml` values and as the GitHub secrets `CLOUDFLARE_D1_DATABASE_NAME` and `CLOUDFLARE_D1_DATABASE_ID`.

## Cloudflare Git Integration

If Cloudflare is connected directly to this GitHub repository instead of using GitHub Actions, add these environment variables in the Cloudflare build/deploy settings:

```text
CLOUDFLARE_D1_DATABASE_NAME
CLOUDFLARE_D1_DATABASE_ID
```

Then run the config generation before deploy:

```bash
npm ci
npm run prepare:wrangler
npm run deploy
```

The important part is that the real `wrangler.toml` must be generated inside the private build environment, not committed to the public repository.

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
Account / D1 / Edit
User / User Details / Read
```

If you later add a custom domain or routes, add the relevant Zone permissions for that zone.

## Validate Without Deploying

```bash
npx wrangler deploy --dry-run
```

A successful dry run should read the files from `web/`, validate the Worker script, and exit without uploading.
