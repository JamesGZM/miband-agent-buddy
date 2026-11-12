# 独立更新服务

[English](../../en/development/updates.md) · **简体中文** · [繁體中文](../../zh-TW/development/updates.md)

桌面先检查 `https://buddy-updates.ailaogong.men/buddy/releases/latest`，超时、HTTP 失败或元数据无效时直连 GitHub 官方 API。有效缓存允许延迟十分钟。服务是新增的可信元数据中间层，并非发布签名机构；它同时提供元数据与摘要，服务被入侵属于信任边界内的风险。

更新器从准确的官方版本和架构资产推导 Worker 下载地址，流式写入私有临时归档，大小和 SHA-256 全部匹配才解压。Worker 下载失败、不完整或损坏时，从零开始直连固定 GitHub URL 下载。存储失败立即停止。两条路径均保留归档、包标识与版本、架构和签名检查；替换及回滚不变。

独立 Worker 位于 `services/update-worker`，自定义域名在 `wrangler.toml` 配置。仅支持固定最新发布路由及稳定 Mac ZIP／DMG／校验文件路由，不代理任意来源。有效元数据缓存 600 秒，成功资产响应缓存 3600 秒，错误不缓存。安装包流式传输，不在 JavaScript 中完整缓冲或克隆。支持 HEAD 与单段 Range，不发送账户、设备或 Hook 数据。

通过本仓库 `main` 分支的手动 `Deploy update Worker` 工作流部署，先添加 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` 为本仓库 Actions secrets。工作流测试并使用独立配置部署检出的提交。不要将密钥值复制进本仓库。凭据需要 Worker 部署及该区域自定义域名／DNS 权限。部署不得改变现有索引 Worker。上线后验证自定义域名与真实安装包，dry run 不能证明这两项。

安装与信任边界见 [ADR-006](../architecture/ADR-006-desktop-updates.md)。

部署：[GitHub Actions](https://github.com/JamesGZM/miband-agent-buddy/actions/workflows/update-worker.yml).

首次创建需要账户／Workers 产品范围的 Workers Admin；创建后收窄为 Workers Editor。域名绑定使用仅限 `ailaogong.men` 的 Workers Routes Write 与 Zone Read，Account Settings Read 用于账户识别。不需要 KV、R2 或 Pages 权限。
