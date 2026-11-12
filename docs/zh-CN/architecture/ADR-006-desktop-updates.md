# ADR-006：可移动 macOS 包与明确的 GitHub 更新

[English](../../en/architecture/ADR-006-desktop-updates.md) · **简体中文** · [繁體中文](../../zh-TW/architecture/ADR-006-desktop-updates.md)

## 问题

原桌面可执行文件嵌入源码与 Node 路径，CI 的 App 无法在另一台 Mac 运行，源码发布不能提供桌面更新。

## 决策

构建在 `Contents/Resources/runtime` 包含官方 Node、运行时／共享源码、原生传输及对应 Buddy RPK／元数据。启动优先随包资源，直接 Cargo 开发运行保留源码后备。拒绝非系统动态库，使用 ad-hoc 签名，不假设或生成 Apple 开发者凭据。

桌面更新器只查询本仓库最新稳定 GitHub Release，在会话首次打开设置或手动检查时执行。App 名链接固定仓库，旁边版本按钮仅在有包时显示更新点并展开控件。按架构选择固定资产名，要求 GitHub SHA-256 和准确下载 URL，限制重定向、下载及解压大小，拒绝路径逃逸、链接和重复文件。待安装包必须匹配标识／版本、包含资源、支持当前架构且签名完整。GitHub 是发布信任边界；ad-hoc 签名不证明发布者身份或 Apple 公证。

下载不替换当前 App。独立的**安装并重启**在当前目录旁暂存验证包，检查写权限而不提权，等待退出，保留旧包，替换或启动失败时回滚。私密数据在包外。源码可执行文件与 App Translocation 路径不能原地更新。后台更新状态独立于设备，不发起蓝牙操作。

版本标签或明确工作流调度在两种架构验证后发布。源码归档只包含审阅且被 Git 跟踪的项目文件、实际修改后的上游与链接 Rust 源码，拒绝本地私密材料。分支／PR 不打包。更新器忽略预发布，明确报告无发布或无匹配资产。

## 替代方案

Tauri 密钥签名更新需要尚未配置的长期密钥与公钥注册。当前使用固定 GitHub 摘要与本地完整性，公开信任边界。仅源码更新仍要求每个用户安装编译环境；任意 URL 安装器也不符合单一已知 App 的范围。

## 兼容与证据

不改私密路径、包标识、回环端点或 v1 协议。Core 独立可选功能补丁排除未使用、许可未明确的 Vivo MsgPack，保留其他消费者的上游默认值，打包时检查排除结果。

Rust 覆盖稳定版本／架构选择、URL 信任、合法和危险归档、执行权限、替换及回滚；工作流测试维护发布边界。完整构建、真实 GitHub 发布与手环物理验证分别报告。

参考：[GitHub Releases](https://docs.github.com/en/rest/releases/releases)、[资产摘要](https://docs.github.com/en/rest/releases/assets)、[Mac runner 架构](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。
