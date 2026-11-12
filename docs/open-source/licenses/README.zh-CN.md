# 依赖许可证补充记录

[English](README.md) · **简体中文** · [繁體中文](README.zh-TW.md)

`scripts/collect_licenses.py` 读取所选构建目标锁定的 Cargo 元数据，从桌面和传输包沿普通依赖关系收集 LICENSE、LICENCE、COPYING、COPYRIGHT、NOTICE（包括嵌套声明），记录版本、声明许可证、作者与仓库。仅用于构建的工具不进入分发清单。

部分 crate 发布包遗漏仓库根目录许可证。`receipts.json` 将补充文件限制为准确版本、声明许可证及 `.cargo_vcs_info.json` 提交；每份文件都有 SHA-256，`sources.json` 还记录上游 Git blob。构建时不下载许可证。升级依赖如需新补充，必须先审阅记录，否则构建失败。

pbjson、alloc-stdlib、crc-catalog 来自 receipts 指定的准确上游提交。五个 objc2 提交的许可证声明相同，Git blob 为 `540ae4c81adb5f64a9f61e222b688880da24300e`：`d7d2fa23ceaa5e6096c923b081040e5d81b3b9df`、`b4167b582b2f75f9a1be75495c41b765344fd03c`、`8852b424193ca41602281b3d7540d7c8ed51e49a`、`7b1abfd750a2cacaea71d6a56ecfb83cb7de560b`、`8d214f5477365ffcbcbb7de058c86ed9a518efb7`。

锁定的 objc2 声明链接到标准条款；dispatch 在 Cargo 元数据声明 MIT，但没有独立许可文件。这些包包含完整发布源码、原作者元数据和未修改的 SPDX MIT 模板。模板占位符不声称版权持有人身份，也不虚构版权声明。selectors 包包含原 MPL 文件头、完整源码及标准 MPL-2.0 条款。本地适配的上游 crate 同样附带源码，排除 Git 元数据和构建产物。

生成内容在 macOS 桌面包中位于 `Contents/Resources/licenses/rust`，在 Windows 中位于 `licenses/rust`，不作为 vendored 源码提交。清单仅记录上游条款，不授予额外权利；再分发时保留原始源码及声明。所有许可证原文保持不变。

mac-notification-sys 0.6.15 的补充记录保留上游 `deb559683962d314a7693478476bf8d052efa84e` 版本原始 MIT/Apache 文本，发布包的 include 列表遗漏了这些文件。

Windows 的 webview2-com 0.39.1 和 webview2-com-sys 0.39.1 补充记录保留上游 `edc2caf886175ccaebe86078c9cfe1ae2a187328` 的仓库根目录原始 MIT 文本；webview2-com-macros 0.8.1 对应 `dffa41a8a46d3f5565eefbff2de57d38d399f158`。两个提交的许可证 Git blob 均为 `de9a7e660e173136b351982a34f715af424ff812`，这些发布子包遗漏了该文件。补充文本随附各包完整发布源码。
