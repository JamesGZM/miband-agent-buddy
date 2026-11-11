# 第三方声明

[English](THIRD_PARTY_NOTICES.md) · **简体中文** · [繁體中文](THIRD_PARTY_NOTICES.zh-TW.md)

## AstroBox — AstralSightStudios

MiBand Agent Buddy 使用 [AstralSightStudios](https://github.com/AstralSightStudios) 的协议与账号组件，保留其 AGPL-3.0 许可证及附加署名声明。

| 组件 | 仓库 | 版本与适配 |
| --- | --- | --- |
| Account | https://github.com/AstralSightStudios/AstroBox-NG-Module-Account | `dae3188a9c3a9c757555f51d00a6774ab13f1257`；vendored 代码以 reqwest 替换私有 hostio HTTP，限制重定向与等待范围，不使用上游日志。源码随附 LICENSE 和 NOTICE。 |
| Core | https://github.com/AstralSightStudios/AstroBox-NG-Module-Core | 版本锁定在 `native/transport/upstream-lock.json`。`core-no-network.patch` 与 `core-without-vivo.patch` 隔离可选功能；上游默认网络、RPC、Vivo 功能保持原样，本项目关闭它们。`core-sar-ack-reuse.patch` 在序号回绕时仅清除复用序号的旧确认，保留其他未消费的 MASS 确认，并有回归测试。 |
| Classic SPP | https://github.com/AstralSightStudios/AstroBox-NG-Plugin-BtClassicSpp | 使用锁定版本的 macOS 实现，保留原始源码与许可证。 |
| Bluetooth | https://github.com/AstralSightStudios/AstroBox-NG-Module-Bluetooth | 锁定的构建依赖，bootstrap 保留原始许可证。 |
| Protocol buffers | https://github.com/AstralSightStudios/AstroBox-NG-Module-Pb | 锁定的构建依赖，bootstrap 保留原始许可证。 |
| Vivo MsgPack | https://github.com/AstralSightStudios/AstroBox-NG-Module-Vivo-MsgPack | Core 的可选依赖，所检查版本没有独立 LICENSE。bootstrap 下载它以保持上游功能兼容，但本 App 禁用 `vivo` 和 `rpc`；它不在 App 的 Cargo 锁文件、依赖树及桌面包内。在解决再分发条款前不要启用或分发。 |

上游 Core、Bluetooth、SPP 的 README 除 AGPL 条款外还要求作者与仓库署名。本文件及 App 关于页面提供这些署名。下载的源码和许可证保持完整；仓库提交版本锁与补丁，不提交下载树。Vivo／RPC 排除是独立的本地构建适配，不修改上游默认行为，也不授予额外分发权限。

## 其他依赖

桌面构建执行 `scripts/collect_licenses.py`，将实际解析的 macOS Rust 依赖许可证及署名放入 `Contents/Resources/licenses/rust`。经审阅的补充记录见[许可证记录](docs/open-source/licenses/README.zh-CN.md)。发布 crate 缺少完整许可证、MPL 包及本地适配的上游 crate 同时附带对应包源码。账号模块声明和官方 Node 分发包许可证单独包含。

Tauri 及插件、Rust 依赖和 Vela `aiot-toolkit` 保留各自许可证，准确版本记录在 Cargo.lock 与 apps/band/package-lock.json。Pillow 仅用于本地生成图像。可移动 macOS 包在 `Contents/Resources/licenses` 保留 Node 与上游组件声明。对应 GitHub 标签提供准确项目源码，额外源码归档包含修改后的上游源码与链接的 Rust 包。锁定版本及独立补丁由 `native/transport/upstream-lock.json` 和 bootstrap 标识。构建拒绝非系统 dylib，发布打包拒绝启用 Vivo MsgPack 依赖。

## 灵感与图像

Dan Wahlin 的 [Agent Buddy](https://github.com/DanWahlin/agent-buddy) 启发了基于生命周期的伴侣交互。胶囊、符号、圆环与几何 Buddy 图像由 `scripts/render_band_ui.py` 生成。品牌与工具名称仅用于描述主题和接入，不代表背书或商标授权。许可证原文保持不变；译文不授予额外权利。
