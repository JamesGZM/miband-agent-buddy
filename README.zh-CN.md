# MiBand Agent Buddy

[English](README.md) · **简体中文** · [繁體中文](README.zh-TW.md)

一款独立的 macOS 伴侣应用，适用于**小米手环 9**。它把手环变成 **Buddy**：一个横屏桌面角色，显示 Codex 的活动状态，以及 Mac 的 CPU、内存和磁盘占用。

**源码发布 · 0.5.0 · AGPL-3.0。** 本项目是社区项目，并非小米、OpenAI、Anthropic 或 DeepSeek 的官方产品。本版本不提供安装包、签名或公证。

## 功能

- 小米官方网页登录，登录后自动回到 App，选择账号和设备，并通过蓝牙 SPP 直接通信。
- 用本地构建的 RPK 安装或更新 Buddy，不需要 AstroBox App 或插件。
- 持续发送 Mac 当前指标和脱敏后的 Codex 生命周期事件，并通过匹配的应用回执确认送达。
- **Mac 外观**与 **Buddy 主题**互相独立：
  - Mac 外观：Claude / ChatGPT / DeepSeek 强调色，浅色 / 深色 / 跟随系统；
  - Buddy 主题：ChatGPT / Claude / DeepSeek，需要手动应用并经手环确认，不会自动跟随正在使用的 AI 工具。DeepSeek 主题需要手环上的 Buddy 为 0.5.3 或更新版本。
- 实时手环预览：左上角是活动状态灯，右上角显示真实屏幕状态（亮屏倒计时或息屏），点击预览即可唤醒手环。
- 手环页显示电量与充电状态、固件、型号、存储空间、Buddy 版本和最后同步时间。
- 托盘控制、后台运行、可选的登录时启动，以及有上限的自动重连。
- 事件触发的亮屏租约，到期后自然息屏。亮屏时长可设置为 5 秒到 30 分钟，默认 20 秒。
- **界面语言**：简体中文、繁体中文、English。默认跟随 macOS 语言，可在**设置 → 外观 → 语言**中切换；托盘菜单也会一起切换。

目前只接入了 Codex 的活动状态。Claude 视觉主题**不**代表接入了 Claude Code。Mac 上的预览是根据手环的画面素材和数据重新绘制的，不是手环屏幕截图。

## 从源码构建

需要：macOS、Xcode Command Line Tools、Git、Node.js 22+、当前稳定版 Rust（支持 edition 2024）、Python 3.10+ 和 Pillow。请把源码放在固定位置：这个开发版 App 会引用构建时的源码目录和 Node 可执行文件，它不是可随意搬动的分发包。

```sh
git clone https://github.com/JamesGZM/miband-agent-buddy.git
cd miband-agent-buddy
python3 --version  # 必须为 3.10 或更新；macOS 自带的 /usr/bin/python3 可能太旧
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm ci --prefix apps/band
npm run bootstrap
npm run build
npm test
npm run build:desktop
open 'apps/desktop/dist/MiBand Agent Buddy.app'
```

`bootstrap` 会获取固定版本的上游源码，并应用仓库中的 Core 构建补丁。生成的图像、下载的源码、私密凭证和构建产物都不会提交。

## 首次连接

以下步骤使用简体中文界面。

1. 打开**账号**，选择小米服务地区，在官方窗口中登录。协议确认和安全验证请自行完成。官方回调后 App 会自动返回并加载设备。
2. 打开**手环**，选择你的手环 9 并连接。请先断开其他正在使用同一手环的客户端。
3. 点击**安装或更新**，传输本地构建的 Buddy RPK。传输期间会暂停普通同步。安装完成后在手环上手动打开 Buddy。
4. 打开 **Buddy** 查看当前数据。选择手环主题后点击**应用主题**；只有手环确认后才会显示「使用中」。点击预览可以唤醒手环。
5. 在**设置**中调整亮屏时长和界面语言。超过 30 秒也可以保存，但会提醒你这会增加手环耗电。
6. 在手环上：**轻点切换页面，长按退出**。退出时会释放保持亮屏的请求。

如需显示 Codex 活动，在 App 运行时执行：

```sh
npm run hooks:install
```

安装程序会保留无关的 hooks，并在本地备份。请在 Codex 的 Hooks 设置中检查变更；App 不会替你确认信任。不安装 hooks 也能显示系统指标。原始提示词、工具参数和对话记录都不会被转发。

## 本地数据与后台运行

当前用户的 `~/Library/Application Support/io.github.jamesgzm.miband-agent-buddy/` 目录保存：

- 偏好设置：外观、语言、亮屏时长，以及每个手环的主题；
- 认证信息。

目录权限为 **0700**，文件权限为 **0600**。**不使用钥匙串，也不需要 Mac 密码。** 这些文件没有经过本应用加密，这个开发版也不声称有 macOS App Sandbox 隔离。请勿分享该目录。退出登录会删除已保存的凭证，并清除与账号相关的设备选择和主题记录。设备状态（电量、固件、存储空间）只保存在内存中；序列号和 IMEI 从不读入 App。

开启后台运行时，关闭窗口后会继续在托盘中运行。托盘中的**退出**会停止 App 及其后台程序。登录时启动需要手动开启。源码版如果移动或删除源码目录，需要重新构建 App 并重新安装 hook 路径。

## 兼容性与验证

| 设备 | 支持 | 实机验证 |
|---|---|---|
| 小米手环 9 NFC 版 | 是 | 见[验证记录](docs/open-source/VALIDATION.md) |
| 小米手环 9 标准版 | 是 | 尚未在实体标准版上测试 |
| 手环 9 Pro / Active 及其他代 | 否 | 本版本不支持 |

符合条件的唤醒会让 Buddy 0.5.3 在手环本地持有一段亮屏租约，包括应用主题、切换页面等桌面操作。租约默认 20 秒，可设为 5 秒到 30 分钟。旧版 Buddy 最多 30 秒，也不提供 DeepSeek 主题；手环会在每次回执中声明自己支持的上限（[ADR-003](docs/architecture/ADR-003-band-capabilities.md)）。API 回调成功不代表屏幕真的亮了，固件、电源和生命周期行为需要实机测试。参见[架构与协议](docs/open-source/ARCHITECTURE.md)和[验证记录](docs/open-source/VALIDATION.md)。

## 源码与许可

本项目代码以 [AGPL-3.0](LICENSE) 发布。请保留第三方版权和署名声明，上游组件沿用各自的条款。[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 列出了 AstroBox 协议与账号流程的来源和所有本地改动。由生命周期驱动的桌面伴侣思路受 Agent Buddy 启发；本版本手环上的画面由本仓库的几何代码生成。

另见[仓库结构与开发流程](docs/development/README.md)、[AGENTS.md](AGENTS.md)、[CONTRIBUTING.md](CONTRIBUTING.md) 和 [SECURITY.md](SECURITY.md)。本项目没有任何统计分析或遥测服务。
