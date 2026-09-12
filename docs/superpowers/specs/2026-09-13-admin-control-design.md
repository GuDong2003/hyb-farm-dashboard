# HYB Farm Dashboard 管理员控制台设计

## 目标

为设置页增加单管理员入口，用受保护的管理员会话管理全站功能开关，并在 Worker 端强制执行抓取与上传开关；默认继续保持当前同步功能关闭。

## 范围与约束

- 只支持一个管理员密码，不实现多账号、角色和邀请流程。
- 管理员密码只作为 Cloudflare Worker Secret 使用，不写入仓库、前端、测试、日志、KV 或 D1。
- 不把鉴权状态放入 `localStorage`；浏览器只保存 HttpOnly 会话 Cookie，CSRF 值只保存在当前页面内存。
- 不使用 D1 存储认证、限流或站点配置。
- 已有价格快照、历史曲线和边缘缓存继续可读；关闭抓取/上传不得清空已有数据。
- 公开接口不得返回管理员密码、会话令牌、失败次数、IP 或内部 KV 内容。

## 威胁模型

需要防护：前端绕过、旧脚本直接调用 Worker、密码在线爆破、跨站请求伪造、会话长期有效和管理员配置误暴露。

不把“隐藏设置入口”视为安全边界；所有开关和权限都必须由 Worker 校验。Cloudflare WAF/访问策略可以作为额外防线，但不作为本功能唯一防护。

## 推荐架构

### 管理员认证 Durable Object

新增 `AdminAuth` Durable Object，使用固定名称 `global`，负责串行处理：

- 登录密码校验；密码从 `ADMIN_PASSWORD` Worker Secret 读取。
- 以请求来源 IP 的 SHA-256 哈希作为限流标识，不保存明文 IP。
- 单个标识在 10 分钟窗口内最多允许 5 次失败；达到阈值后依次进入 1 分钟、5 分钟、30 分钟等待，最长锁定 24 小时。
- 成功登录清除该标识的失败计数。
- 会话令牌只保存令牌哈希、创建时间、过期时间和 CSRF 哈希；会话有效期 30 分钟，管理员操作时最多顺延到 2 小时绝对上限。
- 过期会话和旧限流记录在每次认证请求时清理。

Worker 对外提供：

```text
POST /api/admin/login
  body: { password }
  success: Set-Cookie: __Host-hyb-admin=<opaque>; HttpOnly; Secure; SameSite=Strict; Path=/
           { ok: true, csrfToken }

GET /api/admin/session
  success: { ok: true, csrfToken, config, expiresAt }
  unauthenticated: 401 { ok: false, error: "admin_auth_required" }

POST /api/admin/config
  headers: Origin, X-HYB-Admin-CSRF
  body: { siteEnabled, priceCaptureEnabled, cloudUploadEnabled, maintenanceMessage }

POST /api/admin/logout
  headers: Origin, X-HYB-Admin-CSRF
  success: expire the __Host-hyb-admin cookie
```

所有管理员接口使用 `Cache-Control: no-store`。登录失败统一返回，不区分密码错误、账号状态或限流原因；限流时只额外提供合法的 `Retry-After` 秒数。

### 配置存储

复用现有 `LATEST_KV` 绑定中的独立键 `admin:site-config:v1`，不新增 D1 表或 KV 绑定。Worker 只允许读写固定白名单字段：

```json
{
  "siteEnabled": true,
  "priceCaptureEnabled": false,
  "cloudUploadEnabled": false,
  "maintenanceMessage": "",
  "updatedAt": 0
}
```

缺失、损坏或 KV 读取失败时使用安全默认值：`siteEnabled=true`、`priceCaptureEnabled=false`、`cloudUploadEnabled=false`。配置接口只返回上述公开状态字段。

新增 `GET /api/site-config`，返回公开配置并使用 `no-store`，避免管理员刚关闭功能时被边缘缓存延迟。Worker 的价格闸门、价格提交和站点公开配置读取都以 KV 为准；前端显示只是辅助。

### 开关语义

- `siteEnabled=false`：页面进入只读维护状态，保留已有 KV/本地数据展示；禁止新的抓取和云端上传。
- `priceCaptureEnabled=false`：`/api/price-sync-gate` 返回 `sync_disabled`，用户脚本在联系 CDK 前结束，不发起 CDK 价格请求。
- `cloudUploadEnabled=false`：`/api/price-submissions` 返回 `cloud_upload_disabled`，不访问 D1；已有快照仍可读取。
- 三个开关都由 Worker 强制执行，前端同步控件、用户脚本按钮和旧脚本请求只是用户体验层拦截。

现有代码中的硬编码同步禁用值迁移为“安全默认关闭 + 运行时配置”。首次部署配置缺失时，行为与当前站点一致：同步和上传均关闭。

## 设置页交互

在设置页数据管理区下方增加“管理员控制”卡片：

1. 未登录时显示“管理员入口”按钮和密码对话框。
2. 登录失败显示通用错误；收到 `Retry-After` 时显示下一次可尝试时间，不显示剩余次数。
3. 登录成功后显示四项：站点访问、价格抓取、云端上传、维护提示，并提供“保存配置”和“退出管理员模式”。
4. 保存成功后立即刷新公开配置和页面状态；退出后清除内存中的 CSRF 值并刷新管理员卡片。
5. 页面不得把密码、会话 Cookie 或 CSRF 值写入状态导出、JSON 备份、URL 或日志。

## 请求与错误处理

- 登录和管理员变更只允许 HTTPS；校验 `Origin` 必须等于当前站点 origin。
- `SameSite=Strict` Cookie 配合 `Origin`/CSRF 双重校验，阻止跨站表单提交。
- Worker 先校验公开开关，再进入 D1 或 CDK 相关流程；关闭路径不得产生 D1 读取。
- 配置写入失败保留旧配置并返回 503；前端不乐观更新开关。
- 管理员会话失效时前端回到未登录状态，不自动重试密码。

## 测试要求

- `AdminAuth`：正确密码登录、错误密码统一错误、5 次失败后的递增锁定、成功清除失败计数、会话过期、登出、CSRF 不匹配拒绝。
- Worker 路由：未登录/无 CSRF 拒绝；配置只允许白名单字段；公开配置不泄露认证数据。
- 抓取链路：`priceCaptureEnabled=false` 时闸门拒绝且不触碰 CDK；`cloudUploadEnabled=false` 时提交请求不触碰 D1；开启时保留现有租约和版本门禁。
- 前端：设置页入口、登录状态、开关保存、维护状态和会话失效提示；密码不出现在导出和 DOM 文本。
- 保持现有完整测试、`node --check` 和 Wrangler dry-run 通过。

## 部署前置

部署前通过 Wrangler Secret 配置管理员密码：

```bash
npx wrangler secret put ADMIN_PASSWORD
```

命令使用交互式输入，不把密码放到 shell 历史、CI 日志或命令参数中。新增 `AdminAuth` 后使用 Durable Object migration `v3`。
