# 作物资料自动同步设计

状态：待用户评审

## 背景

当前作物资料在三个运行位置重复维护：

- `web/app.js` 的收益计算与展示列表；
- `web/userscripts/hyb-farm-dashboard-capture.user.js` 的价格筛选列表；
- `worker/index.js` 的价格提交、历史和趋势处理列表。

因此，CDK 新增作物或修改生长时间、产量、经验、VIP 状态时，必须同时修改代码、资源并重新部署。用户脚本虽然已经支持自身版本更新，但不能更新业务资料。

CDK 已提供需要登录的 `/api/farm/codex/seeds` 接口，返回作物名称、图片路径、种子价格、生长时间、产量、收获价值、经验、VIP 状态和排序，并通过 `pagination` 分页。用户脚本具备登录态，可以读取这个接口；Worker 不应直接依赖用户 Cookie。

## 目标

1. 以 CDK codex 返回的作物资料为自动同步来源。
2. 通过一个版本化目录供 Dashboard、用户脚本和 Worker 共用。
3. 新作物或资料变化后，用户打开/恢复 Dashboard 并完成一次脚本桥接，就能自动发现并应用更新。
4. 旧目录、无脚本、CDK 暂时不可用时，页面仍可使用最后一次有效缓存和内置回退目录。
5. 价格抓取、价格提交、历史趋势和收益计算都能识别动态作物 ID，不再依赖三份硬编码列表。
6. 目录更新不执行任意代码，不因一份格式错误的资料破坏现有计算。

## 非目标

- 不自动替换 Dashboard 的程序逻辑；计算规则或页面代码改变仍需要部署新版本。
- 第一阶段不把 CDK 二进制图片自动写入 Worker 静态资源。已存在的本地图片继续优先使用；新作物没有本地图片时显示通用占位图，并保留资源同步作为后续独立工作。
- 不把用户的农场布局、账号信息、Cookie 或库存上传到 Worker；目录只包含公开的作物资料。

## 方案概览

```text
CDK /api/farm/codex/seeds?page=N
        │ 用户脚本（登录态、分页、规范化）
        ▼
HYB Farm Dashboard bridge response
        │ 校验、计算目录版本、按版本去重上传
        ├── 本地缓存（localStorage/IndexedDB）
        └── Worker POST /api/crop-catalog
                    │ D1 保存最后一次有效目录
                    ▼
             GET /api/crop-catalog + ETag
                    │
             所有 Dashboard 启动时读取
```

## 目录数据模型

目录响应统一为：

```json
{
  "ok": true,
  "catalogVersion": "sha256-hex",
  "updatedAt": 1788972891221,
  "source": "cdk-codex",
  "crops": [
    {
      "id": "potato",
      "name": "土豆",
      "description": "…",
      "image": "/farm/crops/potato",
      "price": "4698148",
      "growthTime": 28800,
      "harvestQuantity": 40,
      "harvestValue": "574294",
      "experienceValue": 8,
      "isVipOnly": false,
      "isEnabled": true,
      "sortOrder": 55
    }
  ]
}
```

- 数值字段保留 CDK 的原始精度和单位；Dashboard 在 `normalizeSeed` 阶段转换为 USD/小时等显示单位。
- 只应用 `isEnabled !== false` 且字段完整的作物；无效或重复 ID 会使整份候选目录被拒绝，而不是部分覆盖。
- ID 使用小写字母、数字、下划线和短横线，长度限制为 64；名称、描述和图片路径按纯文本处理，不能注入 HTML 或脚本。
- `catalogVersion` 是规范化、排序后的 `crops` JSON 的 SHA-256 摘要。同一目录重复上报不会触发写入或页面重绘。

## 用户脚本流程

1. 请求 `/api/farm/codex/seeds?page=1`，读取分页信息，再请求其余页面；不假设固定 31 种或固定页大小。
2. 规范化并排序目录，得到当前 `cropCatalog` 和 `catalogVersion`。
3. 价格请求使用目录中的全部启用 `id` 过滤；CDK 新增作物后无需更新用户脚本常量。
4. bridge 成功和失败响应都携带 `scriptVersion`；成功响应额外携带 `cropCatalog` 与 `catalogVersion`。
5. CDK 目录接口失败时，使用内置回退 ID 集继续抓价格，并在响应中标记 `catalogStale: true`，不能因为目录接口暂时失败而阻断旧版本用户。
6. 手动跳转 `#snapshot` 和自动 bridge 使用同一份目录字段，避免两条导入路径行为不一致。

## Dashboard 流程

### 启动和缓存

- 首次启动先使用本地最后有效目录；没有本地目录时使用构建时回退目录。
- 并行请求 `GET /api/crop-catalog`。携带本地 `ETag`/版本后，服务端返回 `304` 时不重绘。
- 新目录通过同一套 schema 校验后，替换内存中的 `SEEDS`/`SEED_BY_ID`，保留现有价格和历史中仍存在的 ID，并为新 ID 创建空价格状态。
- 目录变化后只重新计算和渲染，不强制整页刷新；状态栏显示“作物资料已更新：N 种”。
- CDK 目录来自 bridge 时，Dashboard 先本地应用，再以版本号去重调用 `POST /api/crop-catalog`。上传失败不影响当前页面，下一次桥接再重试。

### 代码结构调整

- 将当前 `const SEEDS`/`SEED_BY_ID` 改为可替换的运行时目录，并保留同字段回退目录。
- 所有 `SEEDS.length`、排序、价格提交和历史显示都从运行时目录读取。
- 作物图片先尝试 `./assets/crops/<id>.png`；找不到时使用安全的通用占位图，不拼接未经校验的任意 URL。
- 本地缓存只保存目录、版本和更新时间，不保存任何账户数据。

## Worker API 与存储

### `GET /api/crop-catalog`

- 无需登录，返回最后一次有效目录。
- `ETag` 使用 `catalogVersion`；支持 `If-None-Match` 返回 `304`。
- 没有 D1 目录时返回迁移内置的当前回退目录，并标记 `source: "fallback"`。
- 使用短缓存（例如 5 分钟），避免每次打开页面查询 D1。

### `POST /api/crop-catalog`

请求体为候选目录和来源信息。Worker：

1. 解析并校验全部目录项、数量、ID、数值上下界和版本摘要；
2. 记录提交者安全指纹和提交时间，限制同一提交者的频繁重复写入；
3. 版本相同返回 `unchanged`；版本不同且校验通过才替换当前目录；
4. 任何失败只返回错误，不覆盖最后一次有效目录。

新增 `0004_crop_catalog.sql`，使用单行当前目录表：

```text
crop_catalog_current(
  id, catalog_version, updated_at, source,
  crops_json, submitted_at, submitter_hash
)
```

价格提交、默认价格和历史趋势处理从当前目录动态取得启用 ID；没有目录时使用同一份回退 ID。历史快照中已经存在但后来停用的 ID 仍保留在历史数据中，不能被迁移删除。

## 更新频率与容错

- 目录云端检查随页面启动、从后台恢复和网络恢复执行，但使用 `ETag`，没有变化时不下载正文。
- 用户脚本只在价格桥接请求时读取 CDK 目录，并在本地记录最后成功目录时间；不额外制造高频轮询。
- 目录接口失败、提交失败、D1 不可用或版本校验失败时，继续使用最后一次有效目录。
- 当新目录导致现有价格没有对应项时，只显示“暂无当前价”，不把旧作物价格错配到新作物。

## 测试与验收

1. 目录规范化、分页合并、排序和 SHA-256 版本稳定性测试。
2. 无效 ID、重复 ID、越界数值、空目录和错误字段的拒绝测试。
3. 用户脚本目录接口失败时仍能用回退 ID 抓价格的测试。
4. Dashboard 收到新作物时动态替换目录、保留旧价格、渲染新行的测试。
5. Worker `GET` 的 `ETag`/`304`、`POST` 的 unchanged/reject/accept 和 D1 迁移契约测试。
6. 现有完整测试、`node --check`、`wrangler deploy --dry-run`，并用一个模拟的第 32 种作物完成端到端验证。

## 分阶段交付

### 第一阶段（本次）

- 统一目录 schema 和校验；
- 用户脚本从 CDK codex 分页读取目录；
- Dashboard 动态加载、缓存和应用目录；
- Worker D1 目录、GET/POST API 和动态价格 ID；
- 新作物无本地图片时使用占位图；
- 完整测试和部署验证。

### 后续阶段

- 如果需要跨用户自动同步新作物图片，再增加受控的资源上传/代理存储，不把图片二进制塞入目录 JSON。
- 如果需要程序逻辑自动更新，再增加 Dashboard bundle 版本检测和刷新提示；这与资料目录更新分开处理。
