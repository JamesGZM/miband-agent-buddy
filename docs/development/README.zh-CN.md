# 开发指南

[English](README.md) · **简体中文** · [繁體中文](README.zh-TW.md)

本指南面向从源码构建 MiBand Agent Buddy 的贡献者。安装与日常使用见[项目 README](../../README.zh-CN.md)。修改前阅读[贡献指南](../../CONTRIBUTING.zh-CN.md)与[架构](../architecture/README.zh-CN.md)。

## 环境要求

- macOS、Xcode Command Line Tools 与 Git。
- Node.js 22 或更新版本及 npm；桌面打包需要对应 Node 分发包的许可证。
- 支持 edition 2024 的稳定 Rust 工具链。
- Python 3.10 或更新版本；图像生成使用 `requirements.txt` 锁定的 Pillow。

自动测试和构建不要求连接手环；物理测试需要兼容手环。Node、Rust 和桌面包使用相同 Mac 架构。

## 首次构建

从仓库根目录运行：

```sh
git clone https://github.com/JamesGZM/miband-agent-buddy.git
cd miband-agent-buddy
python3 --version
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm ci --prefix apps/band
npm run bootstrap
npm run build
npm run build:desktop
open 'apps/desktop/dist/MiBand Agent Buddy.app'
```

确认 Python 至少为 3.10，macOS 自带版本可能较旧。桌面构建默认在解析后的 Node 可执行文件目录的 `../LICENSE` 查找许可证；如果安装布局不同，请指向该 Node 分发包的真实文件：

```sh
export BUDDY_NODE_LICENSE=/absolute/path/to/node/LICENSE
npm run build:desktop
```

开发 App 输出到 `apps/desktop/dist/MiBand Agent Buddy.app`。优化构建使用 `npm run build:desktop -- --release`。该参数仅选择优化构建，不执行发布；打包与标签说明见[发布流程](../open-source/RELEASING.zh-CN.md)。

## macOS 签名

本地构建默认 `--signing-mode local`，要求钥匙串中已有有效代码签名身份。只有一个时自动选择；多个时通过 `--signing-identity` 或 `BUDDY_SIGNING_IDENTITY` 指定完整名称／SHA-1。不导出私钥、不创建证书，也不会静默退回 ad-hoc。下面的占位符应替换成已有证书的引用。

```sh
npm run build:desktop -- --signing-mode local
BUDDY_SIGNING_IDENTITY='EXISTING_CERTIFICATE_SHA1' npm run build:desktop -- --release --signing-mode local
npm run build:desktop -- --release --signing-mode ci
```

GitHub 明确使用 `ci`，不读取钥匙串并拒绝传入证书身份，不创建或导入任何证书，包括临时／自签证书。其 ad-hoc 程序签名不使用证书，用于满足 Apple Silicon 执行代码的签名要求。本地 App、Node 和传输程序使用同一已有证书及各自固定标识；跨构建保持证书和标识一致，才能保留稳定 designated requirement。首次从 ad-hoc 切换或改装 GitHub 包可能重新要求 macOS 授权。签名不等于公证。参见 [Apple TN3127](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements)。

## 目录结构

| 路径 | 职责 |
| --- | --- |
| `apps/desktop` | Tauri 外壳、账号与 UI |
| `apps/band` | Vela 页面、控制器与平台适配 |
| `services/runtime` | 本地运行时、Hooks、采样与连接策略 |
| `native/transport` | macOS SPP／Core 适配器及固定上游补丁 |
| `packages/buddy-shared` | 纯协议与显示函数 |
| `scripts` | 构建、资源生成、打包与本地设置 |
| `tests` | 运行时、手环、契约和架构测试 |
| `mac` | 兼容入口 |
| `skills/buddy-hooks` | 项目级 AI 接入指引 |

[架构文档](../architecture/README.zh-CN.md)定义所有权与依赖方向，供编码助手执行的规则原文见 [AGENTS.md](../../AGENTS.md)。

## 验证

新 checkout 先执行 `npm run build`，生成依赖图像的测试资源。开发时先测试相关模块，例如：

```sh
node --test tests/contracts/preview-animation.test.mjs
node --test tests/runtime/runtime-operation.test.mjs
```

然后执行通用检查及受影响的 Rust 测试：

```sh
npm test
npm run check:architecture
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --locked --manifest-path native/transport/Cargo.toml
cargo test --locked --manifest-path native/transport/Cargo.toml -p corelib device::xiaomi::sar::tests
```

手环、共享模块或图像改变后执行 `npm run build`；桌面、运行时、传输或随包资源改变后执行 `npm run build:desktop`。依赖已缓存时 Cargo 可加 `--offline`。

`npm test` 会准备共享模块。运行时测试注入依赖与假时钟，不得替换生产源码来改超时。测试使用合成数据，不读取个人账号或访问真实设备；需要监听器的测试仅绑定回环地址。

架构检查涵盖平台导入、跨 App 访问、`ui/bridge.js` 外直接调用 Tauri、兼容入口与生成模块边界，作为代码审查的补充。

UI 改动检查首次启动、现有设置、加载／错误状态与键盘操作。设备行为需分别报告型号、固件、物理结果和软件回执，范围见[测试与已知限制](../testing.zh-CN.md)。归档移动测试单独受条件控制，验证可分发 App 时按发布流程执行。

## 实现流程

1. 明确用户行为和受影响组件，保持改动聚焦。
2. 修复错误时添加回归测试；协议变化时更新契约测试数据。
3. 在现有边界内实现；重要架构决策添加 ADR。
4. 执行针对性测试、完整检查和受影响构建。
5. 更新文档，在 PR 中说明未验证条件。

UI 文案位于 `apps/desktop/ui/locales.js`，英文、简体与繁体同步更新。Mac 外观、Buddy 主题和 AI 配置独立。文档使用同目录的 `.zh-CN.md`／`.zh-TW.md` 版本，新增导航时保持目标语言，并运行文档链接测试。

手环界面应尽可能使用代码绘制，保留已确认的 Buddy 设计。[快应用界面指南](quickapp-ui.zh-CN.md)说明原生组件、图片例外、共享预览几何、动画开销与实机验证。

## 生成文件与本地数据

只改源文件，不手改生成的共享模块、图标、缩略图或下载的上游代码。桌面图标源为 `apps/desktop/artwork/app-icon.png`，由 `scripts/prepare_desktop.py` 生成各尺寸。手环几何源为 `packages/buddy-shared/presentation/geometry.js`；`scripts/render_band_ui.py` 只生成桌面缩略图并清理废弃帧目录。`scripts/prepare_band_icon.py` 生成入口图标，这是 RPK 中唯一的图片。

上游版本锁定在 `native/transport/upstream-lock.json`，适配应保留独立补丁与[第三方声明](../../THIRD_PARTY_NOTICES.zh-CN.md)，下载的许可证保持原样。

不提交构建产物、依赖、凭据、编辑器缓存、本地备份及 `.agent`。测试与诊断不得包含提示词、对话、原始工具参数、真实设备标识或账号秘密。

## AI 接入与发布

[Hooks 指南](hooks.zh-CN.md)说明事件、安装、验证与移除。安装 Hooks 是与构建／测试分开的明确操作；测试安装器请使用一次性项目。

分支和 PR 的 CI 只检查源码，不生成发布包。版本标签工作流验证支持的两种 Mac 架构后才发布。版本、源码归档、许可证与发布说明见[发布流程](../open-source/RELEASING.zh-CN.md)。

## 本地实机测试构建

构建正常的代码绘制 Buddy 页面，附加本地测试版本并备份旧 RPK／元数据，供本地桌面打包，不执行发布。入口图标为唯一图片。脚本的历史名称不代表另一套原型 UI；绘制、稳定性及亮屏需实机确认。

```sh
python3 scripts/build_band_probe.py --revision 8 --activate
npm run build:desktop
```

## Windows 预览构建

手动触发的 [Windows 工作流](https://github.com/JamesGZM/miband-agent-buddy/actions/workflows/windows.yml)使用原生 x64/ARM64 runner，上传无证书 NSIS 安装包、校验值和对应源码，不发布 Release，也不阻挡 Mac 发布。在对应架构的 Windows Rust/Node 主机完成 bootstrap 和手环构建后，执行 `npm ci --prefix scripts/windows` 和 `python scripts/build_windows.py --arch x64`（或 `arm64`）。将 `BUDDY_NODE_LICENSE` 指向官方 Node LICENSE，Python 使用 UTF-8 模式。Windows 认证与设置使用当前用户范围 DPAPI，复制到另一账号/机器不能迁移登录。预览版不支持 App 内更新，配对、登录、安装、通知和硬件行为尚待 Windows 验证。见 [ADR-012](../architecture/ADR-012-windows-preview.zh-CN.md)。
