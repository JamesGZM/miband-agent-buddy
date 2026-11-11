# ADR-002：用户操作唤醒手环并返回一次结果

[English](ADR-002-user-operation-wake.md) · **简体中文** · [繁體中文](ADR-002-user-operation-wake.zh-TW.md)

日期：2026-11-10 Asia/Singapore。状态：用户 UI／唤醒计划已接受。

## 问题

应用主题等操作依赖 Buddy 已醒且能确认。固件休眠后运行时进入待机，操作被拒绝或无反馈排队，屏幕不亮；UI 缺少单独进度和结果，预览页面切换也未传到手环。

## 决策

- `theme`、`page`、`wake`、`wake_hold`、`activity_keep_awake`、`power_saving`、`reset_activity`、`check_buddy` 在 connected／waiting／standby 可执行，命令带 request ID，configure 根据字段判断操作；重置及清单命令允许可选 ID。
- `requestUser` 替换待处理事件，绕过十秒冷却并抢占事件唤醒。明确用户操作每次建立新启动和新租约，重复值与任意开关方向也一样；时长受能力限制。
- 唯一 `operation` 暴露 `id`、`kind`、`status`、`code`，启动结果令 waking 进入 applying，最后只结算一次 done／failed／cancelled。成功必须有匹配亮屏租约，再满足专属回执：主题持久化、页面匹配、省电能力与持久化值、任务亮屏能力与活动租约；清单先亮屏再查询，确认缺包则直接完成；唤醒、时长、重置使用对应快照回执。
- 启动失败、无 ACK、25 秒期限、失联、断线和安装都会结束当前操作。成功安装后独立进行 install 唤醒／ACK；启动或安装排队不能证明完成。
- 同步暂停仍允许有界手动操作，完成后停止快照，不续期活动任务。操作期间改变暂停状态不会取消明确请求。
- ACK 可能早于页面租约。无租约或亮度 pending／off 时，以新序号继续相同 wake ID，保持原 15 秒期限，不重开、不延期。有效租约完成操作，超时报 display_unconfirmed 或 no_response；明确亮度错误立即失败，过期／取消后迟到回执无效。隐藏页面不消费 wake ID，可在 onShow 后的新快照中应用。
- 本地设置与手环选择在 blocking pool 中持有同一 session mutex 保存，旧的整份设置不得覆盖新选择。断线时只保存意图，不宣称设备已应用。
- v1 增加可选 `page`（0／1），仅页面操作发送。Buddy 0.5.2 应用，旧版忽略并报告 unsupported。
- 前端立即投影请求并阻止重叠手环操作，控件显示进度，每次结果固定提示一次。保存期间保留请求值，丢弃修改前发起的读取，完成后重新读；失败还原控件与配色。IPC 入队不提前结束加载。

## 替代方案

仅改善 connected-only 提示不能满足点击后亮屏。每包唤醒或永久亮屏已因续航与耗电被拒绝。使用每操作 Tauri 返回结果会改 bridge 契约，因此沿现有 state 返回。

## 兼容与证据

命令、已有字段、数据路径、包标识与 Hooks 地址不变，新字段均可加，共享 fixture 覆盖。假时钟测试涵盖睡眠、缺包、无回应、双向设置、暂停操作、清单、安装后验证、旧版能力，以及真实控制器的早到 ACK／onShow／相同 ID；还验证原期限、不额外启动、明确亮度失败及迟到回执。Rust 覆盖串行保存与投影，前端覆盖加载和提示。物理亮屏需独立确认。
