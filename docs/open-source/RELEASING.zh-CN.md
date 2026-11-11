# macOS 发布与更新

[English](RELEASING.md) · **简体中文** · [繁體中文](RELEASING.zh-TW.md)

MiBand Agent Buddy 使用 AGPL-3.0-only。公开仓库提供源码、许可证、声明、贡献及安全指南。桌面和手环版本独立。

## 持续集成

分支推送与 PR 运行 `Source checks`：生成测试资源、Node 测试、架构检查及两套 Rust 测试，不构建 App 或 RPK。

`Release packages` 仅在推送稳定 `vX.Y.Z` 标签或手动指定已有稳定标签时执行。它构建并测试 Apple Silicon（`macos-15`）及 Intel（`macos-15-intel`），两者成功后才创建或更新 GitHub Release。标签、package.json 与 Cargo 版本必须一致。源码检查只读，只有最终发布任务有 `contents: write`。

发布资产包括：

- `MiBand-Agent-Buddy-macos-arm64.zip` 与 `MiBand-Agent-Buddy-macos-x64.zip`。
- 各架构的 `SHA256SUMS-*`。
- `MiBand-Agent-Buddy-source-{arm64,x64}.tar.gz` 及校验和，包含审阅后的 Git 跟踪文件、实际修改的锁定上游源码，以及链接的 Rust 依赖源码。
- GitHub 对应准确标签的源码归档。

源码打包要求干净且经过审阅的提交，拒绝私密路径、符号链接，并排除 Vivo MsgPack。归档记录目标、提交与官方 Node 源码 URL，不包含私密账号或本地生成副本。重跑会替换该标签资产。Buddy 随 Mac App 打包，在手环页面管理。内置更新器要求 GitHub 资产的 SHA-256 摘要。

## 发布版本

1. 审查提交、[第三方声明](../../THIRD_PARTY_NOTICES.zh-CN.md)和[验证指南](../testing.zh-CN.md)，排除私密／本地文件。
2. 同步更新 `package.json`、桌面 Cargo.toml／Cargo.lock 与 Tauri 元数据。在 `CHANGELOG.md` 添加版本说明，工作流以英文原文生成发布描述，并同步中文更新记录。仅在手环包变化时更新手环版本。运行完整检查与两种构建。
3. 建立并推送审阅后的稳定标签，例如 `git tag v0.6.0` 和 `git push origin v0.6.0`；这是明确的发布动作。已有标签可在 Actions → Release packages → Run workflow 重跑。
4. 等待两架构及 `publish` 成功，检查安装包与源码归档，下载适合的包并验证 SHA-256。实际验证旧版更新后，才能声称 App 内更新已通过发布验收。

草稿 Release 或普通分支推送不会打包。工作流不发布 npm 包或改变仓库可见性。内置检查器只支持稳定版本。

## App 安装与更新

App 内含 Node、运行时、共享模块、原生传输与 Buddy 包，可脱离源码目录移动。执行 `npm run build` 后执行 `npm run build:desktop`；加 `-- --release` 选择优化构建，不会发布。`python3 scripts/package_release.py` 生成 ZIP，若 Vivo MsgPack 意外进入依赖则失败。

首次安装时解压并移到 `/Applications` 或用户可写的应用目录。目前为 ad-hoc 签名，**未经 Apple 公证**。首次打开可能需要在系统设置 → 隐私与安全性中明确批准。不要自动清除 quarantine，也不要将校验和当作 Apple 公证。

设置 → 关于 → 检查更新读取本项目最新稳定 GitHub Release，下载时验证架构、摘要与解压后的 App。**安装并重启**是独立动作，会保留 App 数据，并在旁边留下 `MiBand Agent Buddy.previous-*.app`。目录不可写时先移到用户可写位置。App Translocation 路径和开发可执行文件不能原地更新。

本地构建或没有发布版本时会如实显示，不会把源码归档当成可执行更新。未配置 Windows／Linux 包或 Apple Developer ID 签名与公证。
