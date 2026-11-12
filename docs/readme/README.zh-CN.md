<div align="center">

<img src="../../apps/desktop/artwork/app-icon.png" width="80" alt="MiBand Agent Buddy icon">

# MiBand Agent Buddy

### 把小米手环，变成桌面的 AI 状态屏。

把小米手环 9 放在键盘旁，随时查看 AI 任务、动态 Buddy 与电脑资源用量。通过 **macOS 与 Windows 桌面 App** 连接手环，为你的桌面增加一块小屏幕。

**[下载](https://github.com/JamesGZM/miband-agent-buddy/releases/latest)** · [开始使用](#开始使用) · [文档](../zh-CN/README.md) · [更新记录](../zh-CN/CHANGELOG.md)

[English](../../README.md) · **简体中文** · [繁體中文](README.zh-TW.md)

macOS · Windows · Xiaomi Smart Band 9 · AGPL-3.0-only

</div>

<p align="center">
<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="../images/hero.png">
  <img src="../images/hero.gif" width="100%" alt="MiBand Agent Buddy 桌面演示 — AI 任务与电脑资源">
</picture>
</p>

<p align="center"><sub>实际 App 前端搭配示例数据；代码绘制的手环预览并非设备实拍。</sub></p>

## 桌面多一块屏幕，进展一眼可见

| AI 有了小伙伴 | 多个任务，一眼看清 | 电脑状态，就在桌面 |
| --- | --- | --- |
| ChatGPT、Claude、DeepSeek 动态 Buddy 主题。 | 多色圆环呈现独立任务，一个完成不遮住其他任务。 | 随时查看 CPU、内存和磁盘用量。 |

可选任务亮屏与完成振动 · 手环管理 · 桌面托盘控制

亮度、省电、任务亮屏和完成振动均可按需设置。控制方式与通知行为见[显示指南](../zh-CN/display.md)。

## 下载

从 [GitHub Releases](https://github.com/JamesGZM/miband-agent-buddy/releases/latest) 下载适合你电脑的安装包。

| 平台 | 架构 | 安装包 | 便携／App 内更新 |
| --- | --- | --- | --- |
| macOS | Apple Silicon | `MiBand-Agent-Buddy-macos-arm64.dmg` | `MiBand-Agent-Buddy-macos-arm64.zip` |
| macOS | Intel x64 | `MiBand-Agent-Buddy-macos-x64.dmg` | `MiBand-Agent-Buddy-macos-x64.zip` |
| Windows | x64 | `MiBand-Agent-Buddy-windows-x64-setup.exe` | — |
| Windows | ARM64 | `MiBand-Agent-Buddy-windows-arm64-setup.exe` | — |

macOS 打开 DMG 后，将 **MiBand Agent Buddy.app** 拖入 **Applications**；Windows 运行对应的 NSIS 安装包。每次发布均提供校验和与对应源码。

**Windows 已提供实验性预览版，蓝牙／SPP 尚未在 Windows 实机测试。** 构建成功不代表配对、手环通信或重连已验证。App 内更新目前支持 macOS，Windows 用户下载新版安装包更新。Linux 暂不支持。macOS 包尚未经 Apple 公证，Windows 安装包无签名。详见[安装与验证说明](../zh-CN/open-source/RELEASING.md)。

## 开始使用

1. 打开 App 并按照设置引导操作，登录与小米运动健康相同的小米账号和服务地区。
2. 选择手环并完成配对提示。设置时请让手环靠近电脑，并断开其他正在连接手环的 App。
3. 根据提示安装 Buddy，然后打开 **Buddy** 页面选择主题、查看电脑的状态。
4. 可选：打开 **AI 接入**，连接你的编程工具。未接入 AI 时也可以查看 电脑资源用量。

轻点手环屏幕可切换 Buddy 和资源页面，长按可退出 Buddy。点击 桌面 App 的预览可以唤醒手环。

**设置**中的**任务期间保持亮屏**默认关闭；开启后，所有任务结束才开始待机息屏倒数。**省电模式**同样默认关闭。Buddy 的安装与更新在**手环**页面管理；App 更新可通过**设置 → 关于**中的版本按钮检查。

**设置 → 任务通知**中的**任务完成震动**默认关闭。开启后，每个 AI 任务完成时震动一次，多个任务分别完成时分别通知；可选**短震**（默认）或**长震**，时长由手环系统控制。需要支持震动的 Buddy 及宿主真实的完成 Hooks；工具结束、取消和等待确认不会触发。设置页按外观、运行与同步、手环显示、任务通知、关于分组。

## 桌面控制中心

| 手环管理 | AI 接入 |
| --- | --- |
| ![手环管理](../images/app-band.png) | ![AI 接入](../images/app-integrations.png) |

<details>
<summary>更多截图</summary>

| 账号 | 设置 |
| --- | --- |
| ![账号](../images/app-account.png) | ![设置](../images/app-settings.png) |
| **资源监控** | **显示与任务通知** |
| ![资源监控](../images/app-resources.png) | ![显示与任务通知](../images/app-settings-display.png) |


</details>

## 接入 AI 工具

将 **AI 接入**页面的设置请求复制到项目的 AI 对话中，或分享 [Buddy Hooks skill](https://github.com/JamesGZM/miband-agent-buddy/blob/main/skills/buddy-hooks/SKILL.md) 链接，由 AI 按照指引完成项目配置与验证。

| 工具 | 接入方式 |
| --- | --- |
| Codex | 项目 Hooks |
| Claude Code | 项目 Hooks |
| Claude Desktop Code | 本地项目使用 Claude Code 接入方式 |
| 自定义工具，包括使用 DeepSeek 的 harness | 通过本地接入接口发送任务生命周期事件 |

ChatGPT 和 Claude 的普通聊天目前不提供自动任务同步。自定义接入需要真实的任务生命周期事件。配置细节与支持的事件见[接入指南](../zh-CN/development/hooks.md)。

## 兼容性

| 设备 | 状态 |
| --- | --- |
| 小米手环 9 NFC 版 | 已实机测试；请参阅下方已知限制 |
| 小米手环 9 标准版 | 目标支持，实机验证尚未完成 |
| 小米手环 9 Pro／Active 及其他代际 | 暂不支持 |

不同固件下的蓝牙恢复与长时间亮屏仍在持续验证。当前验证范围见[测试与已知限制](../zh-CN/testing.md)。

## 隐私

AI 接入只发送任务状态，不传输提示词、工具参数或对话内容。资源监测在本机进行，项目不包含分析或遥测服务。账号资料保存在本机；分享诊断前请阅读[安全与隐私说明](../zh-CN/SECURITY.md)。

## 参与贡献

欢迎提交问题报告、翻译、文档、设备测试结果和代码。请先阅读[贡献指南](../zh-CN/CONTRIBUTING.md)，再按照[开发文档](../zh-CN/development/README.md)准备环境。使用问题请参阅[支持指南](../zh-CN/SUPPORT.md)。

## 许可证

MiBand Agent Buddy 使用 [AGPL-3.0-only](../../LICENSE) 许可证。第三方组件保留各自的许可证，详见[第三方声明](../zh-CN/THIRD_PARTY_NOTICES.md)。

本项目由社区独立开发，与小米、OpenAI、Anthropic 或 DeepSeek 无隶属关系。

## 致谢

- AstralSightStudios 与 AstroBox 贡献者：[Core](https://github.com/AstralSightStudios/AstroBox-NG-Module-Core)、[Account](https://github.com/AstralSightStudios/AstroBox-NG-Module-Account)、[Bluetooth](https://github.com/AstralSightStudios/AstroBox-NG-Module-Bluetooth) 和 [Classic SPP](https://github.com/AstralSightStudios/AstroBox-NG-Plugin-BtClassicSpp)。
- Dan Wahlin 的 [Agent Buddy](https://github.com/DanWahlin/agent-buddy)，为伴侣角色的交互理念提供了启发。
- [Tauri](https://tauri.app/)、[Xiaomi Vela](https://iot.mi.com/vela/quickapp/)，以及本项目所使用的开源依赖的维护者。
