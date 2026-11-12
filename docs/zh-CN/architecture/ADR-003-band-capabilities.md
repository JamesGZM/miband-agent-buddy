# ADR-003：以手环能力控制长租约与新主题

[English](../../en/architecture/ADR-003-band-capabilities.md) · **简体中文** · [繁體中文](../../zh-TW/architecture/ADR-003-band-capabilities.md)

日期：2026-11-10 Asia/Singapore。状态：用户 UI／手环功能计划已接受。

## 问题

用户需要最多 30 分钟的时长、DeepSeek 主题和真实设备信息。旧 Buddy 整包校验，超过 30,000 ms 的 `wakeHoldMs` 或未知主题会拒绝整份快照，因此发送前必须知道能力。

## 决策

- Buddy 0.5.3 在 ACK 增加 `capabilities`，含 `maxWakeHoldMs:1800000`、三主题及 `page:true`；手环与共享校验上限提高为 1,800,000 ms，成功亮屏保持每 30 秒续期。
- 桌面 `wakeHoldSeconds` 默认 20，范围 5–1800；`wake_hold` 保存并发送 `configure.settings.wakeHoldMs`，connect 也携带。
- 运行时发送保存值与能力上限的较小者，未知能力时最多 30,000 ms。
- DeepSeek 仅在 `capabilities.themes` 明确包含时应用；否则 Rust 提示需要更新，运行时报 unsupported，不改变设置，UI 禁用应用并说明。
- 新 `device_status` 通过上游 InfoSystem 读取固件、型号、电量、充电及存储；不转发序列号和 IMEI。ping 电量事件也带 charging。认证后、每五分钟及 `refresh_device` 请求，结果放入不持久化的 `state.device`。

## 替代方案

从版本名猜能力会耦合版本、破坏 fork／降级兼容。独立握手增加往返，而每份快照已有 ACK。先发送长租约再等拒绝，会让旧设备没有有效快照。

## 兼容与证据

`wakeHoldMs`、`capabilities`、device 事件及相关命令均可加。旧设置加载默认值，旧 Buddy 最多 30 秒且仅两种原主题。自动测试覆盖能力缺失／大小上下限、设备事件与刷新、旧版 DeepSeek 拦截、半小时租约与过期、图像及 ACK、Rust 保存与前端提示。

早期长时间试验约 46 分钟后失败；长租约仍需物理确认。存储单位按上游协议视为字节，硬件单位仍需核对。
