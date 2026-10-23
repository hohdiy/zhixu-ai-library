# 知序 · AI 个人情报库

一个以来源为中心的私人 AI 资料库。MIT 开源。基于 Vinext / React / Cloudflare Workers / D1。

## 功能
- HTTPS 链接收录、追踪参数清理、URL 去重、元信息和正文提取、关键词初步分类。
- B站公开 BV/av 视频、手机视频页和 b23.tv 短链接：采集公开标题、UP主、发布日期及简介，保留分P；原始短链接保留在资料记录中。视频元信息不等于音视频或字幕全文，采集成功后仍待精读。
- B站直连发生连接失败、412 或上游 5xx 时，使用匿名 Jina Reader 读取同一官方元信息 JSON；仅发送公开视频标识，不发送分享参数、Cookie 或网站凭据。严格核对返回来源 URL 和视频标识，记录读取路径；权限、删除及限流响应不会通过其他服务重试。
- 六大主题：基础模型、推理与计算、Agent、递归自我改进、具身、数字员工。
- 检索、筛选、星标、编辑、重试读取与删除；来源日期及收录日期分别保存。
- 按已确认的作者、公司和来源日期追踪进展。
- 站内资料汇编与有来源的精读简报；JSON / TXT 导出。
- /mcp 研究工具和 /api/research 研究接口，为连接后的研究助手和云任务提供持久化读写。

原站抓取与关键词分类不是 AI 精读。自动研读需要已连接的站点工具和云端任务；首次启用必须写入并回读验证。受限或 PDF 来源保留链接，等待研究助手处理。不存在的资料不以演示数据填充。

## 本地开发
Node >=22.13。`npm ci`、`npm run db:generate`、`npm run build`。在运行前按生成的 dist/server/wrangler.json 执行 drizzle/ 中每个未应用的 D1 迁移：

```
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_<generated-name>.sql
npm run dev
```

本地模拟登录由 Sites 开发适配器提供，生产认证由 Sites 管理。项目须保持 owner-private；共享数据库的读写依赖其平台访问边界，不能直接改成公共站点。

## 开源边界
不提交数据库、个人资料、研究简报、凭据、运行时环境或缓存。`.openai/hosting.json` 包含部署实例标识；复用源码创建自己的实例前删除 project_id，并注册自己的私有站点。第三方依赖与 vendored 文件遵循各自许可证。

## 自动研究
见 RESEARCH.md。站内工具支持读取资料、收藏链接、保存来源分析和发布简报。没有在浏览器中存放模型密钥。站内“生成资料简报”是确定性的资料汇编，不能代替人工或模型研读。

## 采集回归测试

```
node scripts/test-collector.mjs
node scripts/test-bilibili-collector.mjs
node scripts/test-collector-workerd.mjs
```

最后一项运行实际 workerd，而非模拟 Node fetch，覆盖短链、官方接口、公开读取容错及手动拒绝重定向。可追加 `--live <公开链接...>` 进行真实采集验证。

## B站读取服务的生产配置

若生产环境无法直连 B站且匿名读取服务出现 HTTP 429，可在 Sites 中将 `JINA_API_KEY` 配置为服务端 Secret，随后重新部署已保存的版本以应用配置。密钥仅用于固定 Jina Reader HTTPS 端点，不发送至 B站、不跟随重定向、不返回浏览器、不写入资料或源码。使用自己的读取服务额度，账户配置完成后仍需线上重试验收；未配置时保留匿名路径和明确的限流提示。

## 使用 bilibili-mcp 采集 B站

支持 [L-Chris/bilibili-mcp](https://github.com/L-Chris/bilibili-mcp) 的 Flask REST 接口。它需要独立的 Python 服务；当前 Sites 的 Cloudflare Worker 负责调用，不会在 Worker 内启动 Python。Jina 配置功能保留，无需购买或配置 Jina 才能使用此路径。

部署采集服务后，在 Sites 配置服务端环境变量并重新部署：

- `BILIBILI_MCP_API_URL`：可公开访问的 HTTPS 服务根地址，可含部署路径前缀，不能含用户名、密码、查询参数或片段。不是 `/sse` MCP 地址。
- `BILIBILI_MCP_API_TOKEN`：网关 Bearer 认证密钥，设为 Secret。原项目 Flask API 没有内置此认证，需要部署方在网关配置认证及只读路由。
- B站登录凭据 `sessdata`、`bili_jct`、`buvid3` 仅配置在 Python 采集服务，不放入网站、GitHub 或前端。

原项目使用 `FastMCP` v1 接口；安装时需添加 `mcp<2` 约束以免未锁定依赖升级导致启动失败。上线前应固定并审查上游版本与依赖版本。

网站只调用 `GET /api/video/info/<bvid>` 和 `GET /api/video/subtitle/<bvid>?format=raw`。服务应只对网站开放这两类读取路由，不必暴露评论发送或任意媒体 URL 转写接口。它并不保证绕过 B站网络、登录或访问限制，仍需在目标部署环境真实验证。

配置后 BV 链接及其 b23 短链优先走该服务，不回退到 Jina；AV 链接保持原公开接口路径。成功获取字幕时保存带秒数的字幕并标记“AI生成，待研读”；字幕缺失、服务错误、转写超时或格式异常时保留元信息与明确的字幕状态，不会把错误提示存成字幕。上游字幕接口固定读取第一分P，因此网站对其他分P仅采集对应元信息，不混用第一分P字幕。

验证：`node scripts/test-bilibili-mcp.mjs` 覆盖服务协议和失败边界，`node scripts/test-collector-workerd.mjs` 覆盖实际 Worker 运行时。模拟测试通过不能替代原始视频的线上验收；服务地址和登录凭据尚未配置时，Issue 应保持打开。
