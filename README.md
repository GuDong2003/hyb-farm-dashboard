# HYB Farm Dashboard

HYB Farm Dashboard：自动同步价格，快速比较作物收益与经验效率。

## 社区

感谢 [LINUX DO](https://linux.do) 社区提供的交流与启发。

## 项目简介

本项目计划作为一个基于 Cloudflare Workers Static Assets 的静态 Web 应用，并提供少量 `/api/*` 接口用于共享默认价格。它可以帮助用户分析作物市场价格、收益、经验效率与农场排行，同时不会把用户的私有农场数据上传到服务器。

## 隐私模型

默认情况下，私有农场数据只保存在本地：

1. 公共 Cloudflare Worker 提供静态 HTML、CSS、JavaScript 文件以及 `/api/*` 接口。
2. 用户登录 `cdk.hybgzs.com` 后，用户脚本会在该站点中运行。
3. 用户脚本在用户浏览器内读取同源农场 API。
4. 用户脚本通过 `#snapshot=...` URL 片段跳转回本仪表盘，或通过页面内桥接向仪表盘返回数据。
5. 仪表盘把快照导入用户本地的 IndexedDB。
6. 当用户点击上传，或在导入后启用自动上传时，仪表盘可以把作物价格快照提交到 Cloudflare Worker，用于公共默认价格校验。

D1 数据库只存储作物价格、采集时间、提交元数据以及被接受的默认价格快照。一次有效上传会在以下情况下成为默认价格：当前没有默认价格；上传的采集时间属于比当前默认价格更新的刷新区间；或上传价格与当前默认价格不同。没有安装用户脚本的用户仍然可以获取云端默认价格更新。仪表盘会比较本地与云端的采集时间，并使用更新的价格快照。

本项目不会在服务端存储私有农场布局或账号数据。URL 片段不会随 HTTP 请求发送，因此 `#snapshot=...` 仍然只会保留在用户浏览器中，除非仪表盘明确提交作物价格用于校验。

## 计划功能

- 采集作物市场价格
- 采集商店回收价格
- 按土地等级分布计算收益排行
- 作物经验排行
- 每小时经验效率分析
- 农场排行榜分析
- 本地 IndexedDB 历史记录
- JSON 导出 / 导入备份
- 用户脚本安装页
- 云端校验的默认作物价格快照

## 仓库结构

```text
web/           Cloudflare Pages 静态应用
bookmarklet/   用于采集游戏数据的书签脚本源码
docs/          架构与隐私说明
```

## 部署目标

部署目标为 Cloudflare Workers Static Assets，默认仅提供静态资源。

```bash
npm install
npm run deploy
```

如需使用 GitHub Actions 自动部署，请添加以下仓库 Secrets：

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

部署工作流位于 `.github/workflows/deploy.yml`，会在每次推送到 `main` 分支时运行。Cloudflare Token 配置方式见 `docs/deployment.md`。

`wrangler.toml` 会将 `web/` 目录发布为 Worker 静态资源：

```toml
name = "hyb-farm-dashboard"
compatibility_date = "2026-05-31"

[assets]
directory = "./web"
not_found_handling = "single-page-application"
```

服务端不会存储任何私有农场数据。Cloudflare D1 只存储公开的作物价格提交记录以及被接受的默认价格快照。
