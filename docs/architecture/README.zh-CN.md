# 架构

[English](README.md) · **简体中文** · [繁體中文](README.zh-TW.md)

这里是当前架构的权威说明，历史架构地址跳转到此。稳定版面向 macOS 和小米手环 9，实机验证目前覆盖 NFC 版。Windows x64/ARM64 安装包属于实验性预览，其平台边界与验证限制见 [ADR-012](ADR-012-windows-preview.zh-CN.md)。

```text
桌面 UI → bridge → Tauri 命令 → 应用服务 → 私密文件
                                  ↓ JSON Lines
AI Hooks → 回环 HTTP → Node 运行时核心 → 传输适配器
Mac 采样 ─────────────────────┘           ↓ JSON Lines
                          Rust SPP/Core → Buddy 控制器
                                        ← v1 应用 ACK
```

## 所有权与依赖方向

| 组件 | 职责 | 边界 |
| --- | --- | --- |
| Desktop | 官方登录窗口、设置、设备选择、托盘与窗口生命周期 | 类型化应用操作；UI 返回值无凭据 |
| Runtime core | 连接意图、重试、快照、安装与唤醒协调 | 注入时钟、调度器、采样、传输与 ID |
| Runtime adapters | 系统指标、回环 HTTP、子进程 I/O 与目录 | 不包含重连／唤醒策略 |
| Native transport | 固定的上游 Core／SPP、认证与设备操作 | JSON Lines 与固定脱敏错误码 |
| Band controller | 快照、设置回执、前景生命周期与渲染状态 | 注入 Vela API 与定时器 |
| Shared modules | v1 校验、ACK 匹配、显示与动画计算 | 纯 ES5 CommonJS，无平台导入 |

入口只组装依赖。桌面领域／协议模型无平台副作用，托盘与窗口共享应用操作。账号模型保留 vendored token 类型，维持保存格式；vendor 与锁定的上游代码独立隔离。

前端只有 `bridge.js` 访问 Tauri。预览使用与手环相同的显示函数重建图像，不是设备截图。Mac 外观、手环主题与活动状态相互独立。`i18n.js`／`locales.js` 提供英文、简体、繁体；繁体源字符串作为 key，运行时与 Rust 消息在展示时翻译，不改变协议。托盘与登录标题使用保存的 `language`（默认 `system`）。

## 契约与传输

桌面／运行时及运行时／传输通过私有继承 stdio 逐行传 JSON。凭据仅在必要初始连接帧中出现，不进入 state／health。边界校验命令，保留可加字段。JavaScript 与 Rust 共用 `packages/buddy-shared/fixtures/v1.json` 的合成示例。

快照 v1 保留 `session`、`seq`、CPU／内存／磁盘、活动模式、`buddyTheme`、`settingsRevision`、`keepScreen`，并允许 `page`。ACK 必须匹配当前会话和序号。主题确认还要求对应 revision、theme 与 `settingsApplied=true`；排队或写入失败不能算持久化成功。包名保持 `com.macprobe.band9`。

只有一个选定设备、一个传输子进程、最多一份待确认快照。采样约每两秒一次，最多一个采样工作，不阻塞任务传送；超过两个采样间隔的结果显示未知，新数据替换尚未发送的旧数据。重连退避最多 30 秒，八次后停止；认证拒绝与客户端竞争需要用户处理。断开会清除重连意图；安装暂停快照并等待有界结果。

缺失 ACK 后进入 standby，只表示 Buddy 暂未响应，不能证明硬件休眠。空闲保持约 30 秒探测；开启任务亮屏且仍有任务时，两秒后重试传送，减少退避对活动看门狗期限的消耗。原生命令仍串行执行，但独立事件泵会在查询期间转发应用 ACK；独立设备信息查询并发执行，各自限制五秒。传输 generation 排除旧子进程回调；暂停、断线、安装清除待唤醒工作。停止取消定时器并结束 worker。

通道探测成功后，若开启任务亮屏、任务仍活动且上次前台 Buddy 等待两秒后仍未响应，可恢复一次有界唤醒；正常回执会取消它，重复失败不会周期重开页面。

## 活动与有界唤醒

Hooks 仅包含事件、会话哈希和时间戳；接收器绑定 `127.0.0.1:10731`，拒绝浏览器来源写入并限制输入。Codex 兼容路径保留，新 provider 先命名空间再哈希。[项目 skill 原文](../../skills/buddy-hooks/SKILL.md)与只合并的安装器支持项目配置（[ADR-004](ADR-004-local-agent-hooks.zh-CN.md)）。失败时成功退出，不作权限决定。最多 128 个会话，仅存内存，聚合优先级为等待确认、执行、思考；不推断并行工具或子代理数量。15 分钟无事件只标为过期，仍保持活动与亮屏续期。`reset_activity` 清除观察记录，不取消 AI 任务。

提交任务、新权限请求和完成可请求唤醒，普通指标和工具流量不能。只保留一个事件，TTL 60 秒，全局冷却 10 秒，等待确认优先；取消和恢复工具执行会使旧请求失效。

桌面主题、页面、唤醒、时长、任务亮屏、省电、重置、版本检查都是用户操作（[ADR-002](ADR-002-user-operation-wake.zh-CN.md)），在 connected／waiting／standby 可执行，替换待处理事件、绕过冷却、抢占旧事件唤醒并建立新租约。唯一 `operation` 在匹配亮屏租约及操作专属设置／页面／清单回执后结束为 done／failed／cancelled。启动排队只进入 applying，不代表完成；启动失败、25 秒期限、失联、断线、安装也会终结操作。同步暂停时仍允许手动交易，完成后停止快照，期间不续期任务保持。只有页面操作发送 `page`，UI 在操作控件显示进度并固定提示结果。

页面处理租约前可能先 ACK。早到 ACK 无租约时，使用新序号继续发送相同 wake ID，直到原始 15 秒期限；不额外启动或延长期限。后来的有效租约完成操作，明确亮度错误立即失败，取消／过期后迟到回执不能恢复操作。

明确连接／启动唤醒一次；后台重连在认证时检查当前状态，只有同步开启、任务亮屏开启且仍有活动任务，才恢复一次唤醒。空闲、已结束、暂停或关闭时保持安静，重复认证也不再次启动。原生会话首次使用应用前检查安装清单，后续唤醒复用已知元数据，安装会使准备状态失效；缺失 Buddy 时要求安装；安装成功后单独进行唤醒／ACK，即使同步已暂停。

`syncEnabled` 默认 true，窗口与托盘共用，启动时先恢复暂停再自动连接。每次明确手动操作，无论重复值或开关方向，都请求一次唤醒。恢复同步且任务仍活动、亮屏已开启时也唤醒一次。所有设置修改在 blocking pool 中持有同一 session mutex 保存，防止旧快照覆盖新选择。

持久化 `keepScreen` 始终 false；独立 `activityKeepAwake` 默认 false，改变后立即保存并配置运行时。事件／手动唤醒使用独立 ID 与本地租约，时长默认 20 秒、范围 5–1800 秒，受 `capabilities.maxWakeHoldMs` 限制；无能力时最多 30 秒（[ADR-003](ADR-003-band-capabilities.zh-CN.md)）。重复 ID 不延长租约。

对于已确认前台活动租约、且支持较长活动租约的 Buddy，后台重连后先尝试同步快照最多八秒。新鲜的前台活动回执或隐藏页面回执会取消后备启动；缺失回执才可请求既有的有界活动恢复。设备／owner 改变、任务结束、暂停、关闭任务亮屏、安装及用户操作均取消待执行的后备启动。

Buddy 0.5.4 起提供 `activityHold`。开启后，递增序号的活动快照续期本地看门狗；根据 `capabilities.maxActivityHoldMs` 协商，上限 120000 毫秒，缺失或无效能力值保留旧版 15000 毫秒。独立的唤醒确认期限仍为 15 秒。全部任务结束或关闭亮屏后，只启动一次保存的待机宽限。普通空闲快照不滑动期限；同步中断会本地过期，hide／exit 取消全部租约。亮度成功每 30 秒续期，失败或回调超时两秒后重试，负值 success 结果算失败。可选 `sessionCounts` 在原圆环最多显示六种并发颜色，不显示数量文字或 provider 身份，独立于主题。旧 Buddy 保持原字段和单次租约（[ADR-005](ADR-005-active-display.zh-CN.md)）。确认需要匹配 ACK、租约 ID／剩余时间和接受的亮屏请求；固件决定实际显示，ACK 不测量物理屏幕。见[验证指南](../testing.zh-CN.md)。

ACK 的 `capabilities` 声明最大租约、主题、页面、省电。新主题只有明确支持才发送，避免旧 Buddy 拒绝整份快照。省电默认关闭，两端持久化，仅对支持设备发送。动画目标可设 10–30 FPS，默认 10，省电固定 10；buddyFps 经能力协商、整数校验和持久化回执确认。角色外圈由完整原生边框与固定 scroll 裁切视窗组成，一个 RGBA 边框统一产生呼吸，八个固定 Loading 视窗的每帧工作量不随任务颜色数增加。角色几何缓存，资源页保留 progress 弧线。桌面预览使用同一份共享几何与新鲜回执的动画相位／帧率，隐藏即停；任务数最多六色，准确数量留在桌面胶囊外（[ADR-008](ADR-008-animation-and-task-rings.zh-CN.md)）。认证后、每五分钟和手动刷新时读取 `device_status`，固件、型号、电量、充电和存储放入非持久化 `state.device`，不转发序列号或 IMEI。

Buddy 安装只在手环页面管理。`state.buddy` 区分未知、检查、缺失、已安装、可更新、匹配、新版本、安装中与错误。清单只包含 Buddy 是否存在及数字版本；无 ACK 不代表未安装。初始／安装后启动复用清单，暂停启动与后台重连只读查询。明确 `check_buddy` 先唤醒并确认显示，再检查清单；确认缺包时直接完成。随包版本由实际 RPK 的 SHA-256 绑定。新 ACK 名称恰好等于随包版本时，即使缓存数字旧，也可确认 current，但不能推断数字版本；清单变化会使旧证据失效，更大数字仍为 newer。传输完成不算安装回执，后续 ACK 可独立证明运行版本，不能重写原缺失回执结果。安装错误留在手环管理状态（[ADR-007](ADR-007-band-installation-state.zh-CN.md)）。

## 构建与兼容

多 AI 聚合、优先级、显示模式和任务配色方案必须在 Mac 计算。发现 `activityRing` 能力后，运行时发送有序颜色清单代替任务计数；手环只验证、应用并负责本地动画与安全保护。兼容旧主机时只在快照到达时转换计数，不得每帧聚合（[ADR-009](ADR-009-host-activity-display.zh-CN.md)）。

任务完成通知默认关闭，依据主机逐会话事件独立判断，不依赖整体模式。Mac 发送有界的编号／次数；Buddy 持久化去重后请求所选系统短震／长震。模式修改受能力门控并匹配持久化回执（[ADR-010](ADR-010-completion-vibration.zh-CN.md)）。

`scripts/prepare_shared.py` 将共享源码复制给 Vela，并包装原 CommonJS 为浏览器 ESM，不改 export 字符串。App 副本与图像都是生成产物。手环几何源为 `packages/buddy-shared/presentation/geometry.js`，`scripts/render_band_ui.py` 只生成桌面缩略图并清除旧帧；桌面品牌源为 `apps/desktop/artwork/app-icon.png`，由 `prepare_desktop.py` 生成图标及单色托盘模板。

桌面包在 `Contents/Resources/runtime` 携带 Node、运行时、共享源码、原生传输、RPK 和元数据，直接 Cargo 开发运行保留源码路径后备。GitHub 更新检查、下载和验证安装属于桌面更新器（[ADR-006](ADR-006-desktop-updates.zh-CN.md)），独立于设备状态。`mac/codex-hook.mjs` 与 `mac/buddy-runtime.mjs` 保留旧入口；数据位置、设置、Hooks 地址、包标识和公开 npm 命令不变。Rust 与 Quick App 独立锁定依赖，不引入工作区管理器或运行时重写。


正式手环页面与桌面预览使用共享代码几何（ADR-008）；RPK 图片仅保留入口图标，本地构建器暂存同一 UI 的测试版本。后续手环界面优先使用代码绘制并保留已确认设计；图片例外、性能及实机检查遵循[快应用界面指南](../development/quickapp-ui.zh-CN.md)。

[手环亮度与电量状态](ADR-011-brightness-and-battery.zh-CN.md).

启动前的准备失败（`app_query_failed` / `app_sync_failed`）可以为开启保持亮屏的活跃任务授权 60 秒内最多两次重试，必须有本连接的新安装清单与成功链路探测。仍遵守现有冷却和亮屏确认时限；没有结果或启动失败不能授权重试。首次后台设备查询延至首次喚醒确认后。见 [ADR-005](ADR-005-active-display.zh-CN.md)。
