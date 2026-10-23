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
