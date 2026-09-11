# Cloudflare Worker Deployment

This project is configured for Cloudflare Workers Static Assets.

公开价格快照使用 `LATEST_KV` 保存最近一次成功同步的数据；默认首页和六个涨跌幅区间会优先从 KV/边缘缓存读取，只有 KV 尚未初始化或旧快照需要回填时才读取 D1。部署配置中的 KV 命名空间已经固定为本项目专用空间。

## Local Deployment

```bash
npm install
npx wrangler login
npx wrangler d1 migrations apply hyb-farm-dashboard-db --remote
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
Account / Workers KV Storage / Edit
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
