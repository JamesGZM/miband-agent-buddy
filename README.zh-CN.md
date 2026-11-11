# MiBand Agent Buddy

[English](README.md) · **简体中文** · [繁體中文](README.zh-TW.md)

一款独立的 macOS 伴侣应用，适用于**小米手环 9**。它把手环变成 **Buddy**：一个横屏桌面角色，显示 AI 任务状态，以及 Mac 的 CPU、内存和磁盘占用。

**源码发布 · 桌面端 0.5.0 / Buddy 0.5.4 · AGPL-3.0。** 本项目是社区项目，并非小米、OpenAI、Anthropic 或 DeepSeek 的官方产品。本版本不提供桌面安装包、签名或公证。

## 功能

- 小米官方网页登录，登录后自动回到 App，选择账号和设备，并通过蓝牙 SPP 直接通信。
- 用本地构建的 RPK 安装或更新 Buddy，不需要 AstroBox App 或插件。
- 持续发送 Mac 当前指标，以及 Codex、Claude Code 或自定义本地 harness 脱敏后的生命周期事件，通过匹配的应用回执确认送达。
- 首次使用引导覆盖账号、连接、Buddy 安装和 Hooks 验证。启动时先恢复已保存设置，并提供加载状态和失败重试。
- **Mac 外观**与 **Buddy 主题**互相独立：
  - Mac 外观：Claude / ChatGPT / DeepSeek 强调色，浅色 / 深色 / 跟随系统；
  - Buddy 主题：ChatGPT / Claude / DeepSeek，需要手动应用并经手环确认，不会自动跟随正在使用的 AI 工具。DeepSeek 主题需要手环上的 Buddy 为 0.5.3 或更新版本。
- 实时手环预览包含活动状态灯、手环回报的保持亮屏状态，点击即可唤醒。ACK 确认的是手环软件响应，不是实体屏幕亮度测量。
- 手环页显示电量与充电状态、固件、型号、存储空间、Buddy 版本和最后同步时间。
- 托盘控制、后台运行、可选的登录时启动，以及有上限的自动重连。
- Buddy 0.5.4 在任务思考、执行或等待确认时持续刷新短时亮屏看门狗。保存的亮屏时长是全部任务待机后或手动唤醒后的宽限时间：5 秒到 30 分钟，默认 20 秒。
- 多个工作阶段独立统计，等待确认优先于执行与思考；Buddy 和桌面预览显示活跃与等待数量。一个任务完成不会覆盖另一个仍活跃的任务。
- **界面语言**：简体中文、繁体中文、English。默认跟随 macOS 语言，可在**设置 → 外观 → 语言**中切换；托盘菜单也会一起切换。

Codex 与 Claude Code 使用各自原生的项目 Hooks；Claude Desktop 的本地 **Code** 项目可使用 Claude Code 路径。这里不声称自动接入普通 ChatGPT 或 Claude 聊天。DeepSeek 等模型需要由具有真实本地生命周期回调的 harness 接入，选择视觉主题不会安装 Hooks。Mac 预览根据手环素材与数据重新绘制，不是手环屏幕截图。

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

普通 push 和 pull request 只做源码验证，不打包。发布 GitHub Release 时才执行 macOS 构建，并附上 Buddy RPK 和校验码。桌面端仍需从源码安装，详见[发布说明](docs/open-source/RELEASING.md)。

## 首次连接

以下步骤使用简体中文界面。

1. 打开**账号**，选择小米服务地区，在官方窗口中登录。协议确认和安全验证请自行完成。官方回调后 App 会自动返回并加载设备。
2. 打开**手环**，选择你的手环 9 并连接。请先断开其他正在使用同一手环的客户端。
3. 点击**安装或更新**，传输本地构建的 Buddy RPK。传输期间会暂停普通同步。安装完成后在手环上手动打开 Buddy。
4. 打开 **Buddy** 查看当前数据。选择手环主题后点击**应用主题**；只有手环确认后才会显示「使用中」。点击预览可以唤醒手环。
5. 在**设置**中调整**待机后亮屏时长**和界面语言。保存后会立即反映到 Buddy 页；旧版手环的能力上限单独提示。较长的宽限时间会增加手环耗电。
6. 打开 **Hooks**，选择实际使用的 AI 工具，将接入指令或 [Buddy Hooks skill](https://github.com/JamesGZM/miband-agent-buddy/blob/main/skills/buddy-hooks/SKILL.md) 链接复制到该项目的 AI 对话。完成配置与宿主信任后，新建工作阶段并发起任务，确认 Buddy 收到了事件。
7. 在手环上：**轻点切换页面，长按退出**。退出时会释放保持亮屏的请求。

也可以在 App 运行时，从本仓库手动配置项目 Hooks。请将 `/absolute/project` 替换为已有项目的绝对路径：

```sh
node scripts/install_agent_hooks.mjs codex --scope project --project-root /absolute/project --dry-run --json
node scripts/install_agent_hooks.mjs codex --scope project --project-root /absolute/project --json
```

Claude Code 将 `codex` 替换为 `claude-code`。安装程序合并到 `.codex/hooks.json` 或 `.claude/settings.local.json`，保留无关配置并创建私有本地备份。请检查宿主的 Hooks 与信任设置，App 不会代为批准。`npm run hooks:install` 保留为显式的用户级 Codex 配置入口。不安装 Hooks 也能显示系统指标。原始提示词、工具参数和对话记录都不会被转发。

自定义 harness 回调、验证和移除步骤见 [Hooks 引导](docs/development/hooks.md)与 [ADR-004](docs/architecture/ADR-004-local-agent-hooks.md)。仅安装 skill 或写入配置不代表事件已经送达。某个工作阶段连续 15 分钟没有生命周期事件时，只会提示状态待确认，仍保持活跃，并在同步正常时持续亮屏。长时间运行的工具可能没有新事件，不能仅凭经过的时间判断任务完成；活动状态持续到终止事件或手动重置。如果宿主未回报 Esc 等取消操作，可使用**设置 → 清除活动**：它会重置本地观察到的全部工作阶段，保留已收到的事件计数，不会取消 AI 宿主中的任务。

## 本地数据与后台运行

当前用户的 `~/Library/Application Support/io.github.jamesgzm.miband-agent-buddy/` 目录保存：

- 偏好设置：外观、语言、待机后的亮屏宽限时间，以及每个手环的主题；
- 认证信息。

目录权限为 **0700**，文件权限为 **0600**。**不使用钥匙串，也不需要 Mac 密码。** 这些文件没有经过本应用加密，这个开发版也不声称有 macOS App Sandbox 隔离。请勿分享该目录。退出登录会删除已保存的凭证，并清除与账号相关的设备选择和主题记录。设备状态（电量、固件、存储空间）只保存在内存中；序列号和 IMEI 从不读入 App。

开启后台运行时，关闭窗口后会继续在托盘中运行。托盘中的**退出**会停止 App 及其后台程序。登录时启动需要手动开启。源码版如果移动或删除源码目录，需要重新构建 App 并重新安装 hook 路径。

## 兼容性与验证

| 设备 | 支持 | 实机验证 |
|---|---|---|
| 小米手环 9 NFC 版 | 是 | 见[验证记录](docs/open-source/VALIDATION.md) |
| 小米手环 9 标准版 | 是 | 尚未在实体标准版上测试 |
| 手环 9 Pro / Active 及其他代 | 否 | 本版本不支持 |

Buddy 0.5.4 会声明支持任务持续亮屏。收到有效的活跃状态快照后，手环刷新本地 15 秒看门狗；全部活跃工作阶段结束或手动重置本地活动后，保存的待机宽限时间只启动一次。任务本身没有按运行时长设置的超时，看门狗检查的是同步是否仍在继续。暂停、断开连接或宿主故障导致快照停止时，短时看门狗会在手环本地到期。隐藏或退出 Buddy 也会释放请求。行为与测试见 [ADR-005](docs/architecture/ADR-005-active-display.md)。

旧版 Buddy 保留一次性亮屏租约，包括应用主题、切换页面等桌面操作；其声明的能力可能将保存时长限制为 30 秒。DeepSeek 主题需要 Buddy 0.5.3 或更新版本（[ADR-003](docs/architecture/ADR-003-band-capabilities.md)）。回调和 ACK 成功都不是实体屏幕亮度测量，固件、电源和生命周期行为需要实机测试。参见[架构与协议](docs/open-source/ARCHITECTURE.md)及[验证记录](docs/open-source/VALIDATION.md)，了解实际完成的验证。

## 源码与许可

本项目代码以 [AGPL-3.0](LICENSE) 发布。请保留第三方版权和署名声明，上游组件沿用各自的条款。[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 列出了 AstroBox 协议与账号流程的来源和所有本地改动。由生命周期驱动的桌面伴侣思路受 Agent Buddy 启发；本版本手环上的画面由本仓库的几何代码生成。

另见[仓库结构与开发流程](docs/development/README.md)、[AGENTS.md](AGENTS.md)、[CONTRIBUTING.md](CONTRIBUTING.md) 和 [SECURITY.md](SECURITY.md)。本项目没有任何统计分析或遥测服务。
