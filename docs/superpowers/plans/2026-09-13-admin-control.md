# HYB Farm Dashboard 管理员控制台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为设置页加入单管理员控制台，并让 Worker 在服务端强制执行全站、当前价格抓取和云端上传开关，同时以抗爆破会话保护管理接口。

**Architecture:** 使用固定名称 `global` 的 `AdminAuth` Durable Object 串行处理密码失败计数、递增锁定和短期会话；密码只从 Worker Secret `ADMIN_PASSWORD` 读取，站点开关存入现有 `LATEST_KV` 的 `admin:site-config:v1`。Worker 在价格闸门和价格提交进入任何 CDK/D1 流程前读取安全配置并拒绝关闭路径，前端只负责展示和操作体验，不能作为权限边界。

**Tech Stack:** Cloudflare Worker、Durable Objects SQLite storage、Cloudflare KV、原生浏览器 JavaScript/CSS、Node `node:test`、Wrangler 4。

**Spec:** `docs/superpowers/specs/2026-09-13-admin-control-design.md`

## Global Constraints

- 管理员密码只作为 Cloudflare Worker Secret `ADMIN_PASSWORD`，不写入仓库、前端、测试、日志、KV 或 D1。
- 认证、限流和站点配置不使用 D1；配置键固定为 `admin:site-config:v1`。
- 配置缺失、损坏或 KV 读取失败时使用 `siteEnabled=true`、`priceCaptureEnabled=false`、`cloudUploadEnabled=false` 的安全默认值。
- 管理接口和公开配置接口使用 `Cache-Control: no-store`；管理员 Cookie 必须是 `__Host-hyb-admin`、`HttpOnly`、`Secure`、`SameSite=Strict`、`Path=/`。
- 配置变更必须同时通过 HTTPS、匹配当前站点 origin 的 `Origin`、`X-HYB-Admin-CSRF`；错误响应不得泄露密码、失败次数、IP 或内部 KV 内容。
- 价格抓取关闭时不访问 CDK；云端上传关闭时不访问 D1；已有快照、历史和边缘缓存继续可读。
- 不修改 `.codex/`，不自动推送或部署；部署前只提供交互式 `npx wrangler secret put ADMIN_PASSWORD`。

---

### Task 1: Add the AdminAuth Durable Object and authentication primitives

**Files:**
- Modify: `worker/index.js:1-130` to add the admin route dispatch, constants, and exported `AdminAuth` class.
- Modify: `wrangler.toml:20-36` to add the `ADMIN_AUTH` binding and migration `v3`.
- Test: `tests/admin-auth.test.mjs` (create).

**Interfaces:**
- Consumes: `env.ADMIN_PASSWORD`, request headers `Origin`/`cf-connecting-ip`, and Durable Object storage.
- Produces: `POST /api/admin/login`, `GET /api/admin/session`, `POST /api/admin/logout`, helpers `adminAuthStub(env)`, `readAdminSession(request, env)`, and the `AdminAuth` class used by later config routes.

- [ ] **Step 1: Write failing authentication tests**

  Create an in-memory Durable Object storage and namespace stub that instantiate `AdminAuth` with `ADMIN_PASSWORD: 'test-secret'`. Add tests with these exact behaviors:

  ```js
  test('correct password creates a cookie session and csrf token', async () => {
    const response = await worker.fetch(adminRequest('/api/admin/login', { password: 'test-secret' }), env);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /__Host-hyb-admin=/);
    assert.equal((await response.json()).ok, true);
  });

  test('five failed attempts enter a temporary lock without revealing the reason', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await worker.fetch(adminRequest('/api/admin/login', { password: 'wrong' }), env);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { ok: false, error: 'admin_login_failed' });
    }
    const locked = await worker.fetch(adminRequest('/api/admin/login', { password: 'test-secret' }), env);
    assert.equal(locked.status, 429);
    assert.ok(Number(locked.headers.get('retry-after')) >= 60);
    assert.deepEqual(await locked.json(), { ok: false, error: 'admin_login_failed' });
  });

  test('session endpoint rejects expired or missing cookies', async () => {
    const response = await worker.fetch(new Request('https://farm.test/api/admin/session'), env);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: 'admin_auth_required' });
  });

  test('logout clears a valid session only after origin and csrf checks', async () => {
    const login = await worker.fetch(adminRequest('/api/admin/login', { password: 'test-secret' }), env);
    const csrf = (await login.json()).csrfToken;
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    const rejected = await worker.fetch(adminRequest('/api/admin/logout', null, { cookie, origin: 'https://evil.test', csrf }), env);
    assert.equal(rejected.status, 403);
    const loggedOut = await worker.fetch(adminRequest('/api/admin/logout', null, { cookie, origin: 'https://farm.test', csrf }), env);
    assert.equal(loggedOut.status, 200);
    assert.match(loggedOut.headers.get('set-cookie'), /Max-Age=0/);
  });
  ```

  The test helper must use a controllable clock passed to `AdminAuth` rather than the real password or real deployment state, and must assert that session state stores only token/CSRF hashes and timestamps.

- [ ] **Step 2: Run the focused test and verify it fails for missing routes/class**

  Run `node --test tests/admin-auth.test.mjs`.

  Expected result: FAIL because `AdminAuth` and the `/api/admin/*` routes do not exist yet; no production implementation should be added before observing this failure.

- [ ] **Step 3: Implement minimal authentication and rate limiting**

  Add constants for the 10-minute failure window, five-failure threshold, lock durations `[60_000, 300_000, 1_800_000]` with a 24-hour cap, 30-minute idle session TTL, and 2-hour absolute session cap. Hash the normalized client IP with SHA-256 before using it as a storage key; never store the raw IP. Hash opaque session and CSRF values before storage. On successful login delete the IP failure record, create a random session token and CSRF token, and return the token in the `__Host-hyb-admin` cookie plus the CSRF token in JSON. Return the same `{ ok:false, error:'admin_login_failed' }` body for wrong password and locked login, adding only a valid `Retry-After` header for a lock.

  Route handling must reject non-HTTPS admin requests, require the exact current request origin for logout and future mutations, and use `Cache-Control: no-store` on every admin response. `GET /api/admin/session` must return the current CSRF token, `expiresAt`, and sanitized public config once Task 2 provides the config loader; until then it returns the session metadata only.

- [ ] **Step 4: Run focused tests and syntax checks**

  Run `node --test tests/admin-auth.test.mjs` and `node --check worker/index.js`.

  Expected result: all focused authentication tests pass and the Worker parses without warnings.

- [ ] **Step 5: Commit the isolated authentication change**

  ```bash
  git add worker/index.js wrangler.toml tests/admin-auth.test.mjs
  git commit -m "feat: add protected admin authentication"
  ```

### Task 2: Persist public site configuration and enforce server-side gates

**Files:**
- Modify: `worker/index.js:88-130,388-470,704-804,1120-1290` to add config loading/saving, public config route, and early gate checks.
- Modify: `tests/price-sync-gate.test.mjs` and `tests/worker-userscript-version.test.mjs` for disabled/open paths.
- Test: `tests/admin-config.test.mjs` (create).

**Interfaces:**
- Consumes: `readAdminSession()` from Task 1 and `env.LATEST_KV`.
- Produces: `GET /api/site-config`, `POST /api/admin/config`, `loadSiteConfig(env)`, `normalizeSiteConfig(value)`, and `siteConfigAllows(env, field)`; price gate returns `sync_disabled`, submission returns `cloud_upload_disabled` before CDK/D1 access.

- [ ] **Step 1: Write failing config and gate tests**

  Add tests for these concrete cases:

  ```js
  test('missing or malformed KV config uses safe capture/upload defaults', async () => {
    const response = await worker.fetch(new Request('https://farm.test/api/site-config'), { LATEST_KV: { async get() { return '{bad'; } } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      config: { siteEnabled: true, priceCaptureEnabled: false, cloudUploadEnabled: false, maintenanceMessage: '', updatedAt: 0 }
    });
  });

  test('admin config accepts only the four public fields after authenticated csrf validation', async () => {
    const { cookie, csrf } = await loginFixture();
    const response = await worker.fetch(adminRequest('/api/admin/config', {
      siteEnabled: false,
      priceCaptureEnabled: true,
      cloudUploadEnabled: true,
      maintenanceMessage: '维护中'
    }, { cookie, csrf, origin: 'https://farm.test' }), env);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).config, {
      siteEnabled: false, priceCaptureEnabled: true, cloudUploadEnabled: true,
      maintenanceMessage: '维护中', updatedAt: assert.any(Number)
    });
  });

  test('disabled capture gate rejects before requesting the Durable Object', async () => {
    let gateCalls = 0;
    const response = await worker.fetch(gateRequest({ action: 'acquire' }), {
      LATEST_KV: { async get() { return { siteEnabled: true, priceCaptureEnabled: false, cloudUploadEnabled: true }; } },
      PRICE_SYNC_GATE: { idFromName() { gateCalls++; return 'never'; }, get() { gateCalls++; return null; } }
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'sync_disabled');
    assert.equal(gateCalls, 0);
  });

  test('disabled upload rejects before any D1 prepare call', async () => {
    let d1Reads = 0;
    const response = await worker.fetch(submissionRequest(validSnapshot()), {
      LATEST_KV: { async get() { return { siteEnabled: true, priceCaptureEnabled: true, cloudUploadEnabled: false }; } },
      PRICE_DB: { prepare() { d1Reads++; throw new Error('must not read D1'); } }
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).reason, 'cloud_upload_disabled');
    assert.equal(d1Reads, 0);
  });
  ```

  Use a test-only `assert.any(Number)` helper or assert `Number.isFinite` after reading `updatedAt`; do not place the real administrator password in fixtures.

- [ ] **Step 2: Run config/gate tests and confirm the expected failures**

  Run `node --test tests/admin-config.test.mjs tests/price-sync-gate.test.mjs tests/worker-userscript-version.test.mjs`.

  Expected result: the new config tests fail because the KV loader and routes do not exist, while existing tests continue to identify the current hard-coded gate behavior.

- [ ] **Step 3: Implement normalized KV configuration and authenticated mutation route**

  Define `DEFAULT_SITE_CONFIG` with `siteEnabled: true`, `priceCaptureEnabled: false`, `cloudUploadEnabled: false`, `maintenanceMessage: ''`, and `updatedAt: 0`. `loadSiteConfig(env)` reads only `admin:site-config:v1`, catches KV errors, validates booleans/string length, and returns the safe default for invalid capture/upload values. `GET /api/site-config` returns only those five fields with `no-store`. `POST /api/admin/config` calls the Task 1 session/Origin/CSRF verifier, accepts only the four input fields, trims maintenance text to 240 characters, writes `updatedAt: Date.now()` to KV, and returns 503 without changing the old value if KV write fails.

- [ ] **Step 4: Move the existing hard-coded stop into runtime gates**

  In `postPriceSyncGate`, load the config before parsing/acquiring the `PRICE_SYNC_GATE` Durable Object; when `priceCaptureEnabled` is false return `{ ok:false, error:'sync_disabled' }` with 403 and `no-store`. In `submitPrices`, load the config before `assertDatabase(env)` and before parsing/normalizing or releasing a lease; when `cloudUploadEnabled` is false return `{ ok:false, status:'rejected', reason:'cloud_upload_disabled' }` with 403 and never touch D1. Keep userscript-version and lease checks unchanged when the corresponding feature is enabled. Preserve all existing snapshot/history reads even when `siteEnabled` is false; only new capture/upload operations are blocked.

- [ ] **Step 5: Update focused tests and run them green**

  Update the current gate tests to pass a `LATEST_KV` config with `priceCaptureEnabled: true` wherever the test is exercising lease logic, and add assertions that disabled paths make zero DO/D1 calls. Run `node --test tests/admin-config.test.mjs tests/price-sync-gate.test.mjs tests/worker-userscript-version.test.mjs` and then `node --check worker/index.js`.

- [ ] **Step 6: Commit the configuration and Worker enforcement**

  ```bash
  git add worker/index.js tests/admin-config.test.mjs tests/price-sync-gate.test.mjs tests/worker-userscript-version.test.mjs
  git commit -m "feat: enforce admin site capture and upload controls"
  ```

### Task 3: Add the settings-page administrator panel and runtime public state

**Files:**
- Modify: `web/app.js:1-120,900-1370,3528-3620,3622-3900` to load public config, render the panel, and gate UI actions.
- Modify: `web/style.css` in the settings panel section to style the administrator card, dialog, lock/error states, and maintenance banner without changing existing settings layout.
- Test: `tests/admin-control-ui.test.mjs` (create).

**Interfaces:**
- Consumes: `GET /api/site-config`, `POST /api/admin/login`, `GET /api/admin/session`, `POST /api/admin/config`, and `POST /api/admin/logout` from Tasks 1–2.
- Produces: in-memory `state.siteConfig` and `state.admin` values, an “管理员入口” card under data management, four control fields, and UI guards that never send capture/upload requests when the public config disables them.

- [ ] **Step 1: Write failing UI contract tests**

  Read `web/app.js` and assert these concrete contracts:

  ```js
  test('settings markup contains the administrator entry and four controls', () => {
    assert.match(app, /管理员入口/);
    assert.match(app, /siteEnabled/);
    assert.match(app, /priceCaptureEnabled/);
    assert.match(app, /cloudUploadEnabled/);
    assert.match(app, /maintenanceMessage/);
  });

  test('admin password and csrf token are not exported or persisted in local state', () => {
    assert.doesNotMatch(app, /localStorage\.setItem\([^\n]*password/i);
    assert.doesNotMatch(app, /JSON\.stringify\([^\n]*csrf/i);
  });

  test('capture and upload controls consult runtime site config', () => {
    assert.match(app, /priceCaptureEnabled/);
    assert.match(app, /cloudUploadEnabled/);
    assert.match(app, /api\/site-config/);
  });
  ```

- [ ] **Step 2: Run the UI contract test and verify it fails**

  Run `node --test tests/admin-control-ui.test.mjs`.

  Expected result: FAIL because the settings page still has no administrator panel or runtime config loader.

- [ ] **Step 3: Add safe runtime public config loading**

  Extend the initial in-memory state with the exact safe defaults from Task 2 and a non-persistent `admin` object containing only `authenticated`, `csrfToken`, `expiresAt`, and `loading`. Add `loadSiteConfig()` to fetch `/api/site-config` with `cache: 'no-store'`, replace only the five public fields, and keep safe defaults on failure. Call it during app startup and after login/save/logout. Replace all uses of the hard-coded `PRICE_SYNC_DISABLED` checks with `priceCaptureIsEnabled()` and replace upload availability checks with `cloudUploadIsEnabled()`. Keep the userscript install link disabled when capture is off and show the server maintenance message when `siteEnabled` is false, while retaining read-only snapshot/history rendering.

- [ ] **Step 4: Render and bind the administrator panel**

  Under the existing “数据管理” section render an “管理员入口” button when unauthenticated. The login dialog posts the entered password once to `/api/admin/login`, stores only the returned CSRF token in a closure/state field, and never writes the password to localStorage, export JSON, URL, or DOM text after submission. Authenticated mode renders toggles for `siteEnabled`, `priceCaptureEnabled`, `cloudUploadEnabled`, a 240-character maintenance message field, “保存配置”, and “退出管理员模式”. Save sends the CSRF header and same-origin `Origin`; on 401/403 clear the in-memory session and show a session-expired message. Login failures show the server’s generic failure text and `Retry-After` guidance without displaying attempt counts.

- [ ] **Step 5: Add focused styles and run UI tests**

  Add scoped classes for the panel, modal, disabled state, maintenance notice, and responsive control grid. Do not alter the existing toolbar/button sizing. Run `node --test tests/admin-control-ui.test.mjs tests/settings-layout-contract.test.mjs` and verify the old settings layout contracts remain green.

- [ ] **Step 6: Commit the settings UI change**

  ```bash
  git add web/app.js web/style.css tests/admin-control-ui.test.mjs
  git commit -m "feat: add administrator controls to settings"
  ```

### Task 4: Complete regression coverage, documentation, and deployment preflight

**Files:**
- Modify: `tests/auto-refresh-contract.test.mjs`, `tests/userscript-capture-contract.test.mjs`, and any focused tests whose expectations still reference the removed hard-coded flags.
- Modify: `README.md` and `docs/deployment.md` to document the secret setup, v3 Durable Object migration, safe defaults, and the fact that enabling capture/upload is controlled only by the admin panel.
- Verify: `worker/index.js`, `web/app.js`, `web/userscripts/hyb-farm-dashboard-capture.user.js`, `wrangler.toml`.

**Interfaces:**
- Consumes: all routes and UI behavior from Tasks 1–3.
- Produces: a regression-tested branch ready for a later user-approved secret setup and deployment; no secret value is committed or printed.

- [ ] **Step 1: Update contracts for runtime flags without weakening security assertions**

  Replace assertions that require `const PRICE_SYNC_DISABLED = true` with assertions that the initial public config is capture/upload-off and that request handlers consult `/api/site-config`/runtime helpers. Keep the userscript version gate and the no-CDK-before-disabled-gate assertions. Add a contract that the old userscript still fails `script_update_required` and that disabled capture prevents it from reaching CDK even if it bypasses the page.

- [ ] **Step 2: Run the complete verification suite**

  Run:

  ```bash
  npm test
  node --check worker/index.js
  node --check web/app.js
  node --check web/userscripts/hyb-farm-dashboard-capture.user.js
  git diff --check
  npx wrangler deploy --dry-run
  ```

  Expected result: all tests pass, all JavaScript files parse, the diff has no whitespace errors, and Wrangler reports a valid `ADMIN_AUTH` binding with migration `v3` without contacting production.

- [ ] **Step 3: Update deployment docs and inspect the final diff**

  Document the interactive command `npx wrangler secret put ADMIN_PASSWORD`, applying the Durable Object migration through the normal deployment workflow, and the recommendation to rotate the previously shared password before enabling the panel. Confirm `rg -n 'GuDong226|ADMIN_PASSWORD\s*=|password.*test-secret' . -g '!node_modules' -g '!.codex/**'` returns no real password or secret assignment in tracked files; the test-only fixture may use a clearly synthetic value.

- [ ] **Step 4: Commit the verified implementation**

  ```bash
  git add README.md docs/deployment.md tests web worker/index.js wrangler.toml
  git commit -m "feat: add secure admin site controls"
  ```

  Do not push or deploy in this plan. After this commit, report the test and dry-run evidence and wait for explicit instructions before `wrangler secret put`, push, migration, or deployment.

## Self-review checklist

- Spec coverage: Task 1 covers cookie sessions, IP-hash rate limiting, lock escalation, CSRF/origin checks, and v3 binding; Task 2 covers KV defaults, public config, capture/upload early gates, and no-D1/no-DO disabled paths; Task 3 covers settings entry, controls, maintenance state, session expiry, and non-persistence; Task 4 covers old-script compatibility, docs, syntax, full tests, and dry-run.
- Placeholder scan: no unresolved marker, deferred implementation step, or vague error-handling instruction appears in this plan.
- Type/field consistency: all tasks use `siteEnabled`, `priceCaptureEnabled`, `cloudUploadEnabled`, `maintenanceMessage`, `updatedAt`, `csrfToken`, and `expiresAt` exactly as defined in the spec; all API paths and error names match the Worker routes.
