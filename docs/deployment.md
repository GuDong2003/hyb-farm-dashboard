# Cloudflare Worker Deployment

This project is configured for Cloudflare Workers Static Assets.

公开价格快照使用 `LATEST_KV` 保存最近一次成功同步的数据；默认首页和六个涨跌幅区间会优先从 KV/边缘缓存读取，只有 KV 尚未初始化或旧快照需要回填时才读取 D1。匿名访客计数只使用 `VISITOR_COUNTER` Durable Object 串行处理，不读取 D1 或 `LATEST_KV`；访客接口使用 `no-store`，不会污染边缘缓存。管理员配置使用同一 KV 的独立键 `admin:site-config:v1`，认证和限流使用 `ADMIN_AUTH` Durable Object，不读取 D1。部署配置中的 KV 命名空间已经固定为本项目专用空间。

## Local Deployment

```bash
npm install
npx wrangler login
npx wrangler d1 migrations apply hyb-farm-dashboard-db --remote
npx wrangler secret put ADMIN_PASSWORD
npm run deploy
```

`npx wrangler secret put ADMIN_PASSWORD` 会交互式提示输入管理员密码；不要把密码放在命令参数、Shell 历史、CI 日志或仓库中。`wrangler.toml` 的 migration `v3` 会创建 `AdminAuth` Durable Object。由于管理员密码曾经在非部署渠道共享，正式启用前请先设置一个新的密码。

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
