# ADR-003：以手環能力控制長租約與新主題

[English](../../en/architecture/ADR-003-band-capabilities.md) · [简体中文](../../zh-CN/architecture/ADR-003-band-capabilities.md) · **繁體中文**

日期：2026-11-10 Asia/Singapore。狀態：用戶 UI／手環功能計劃已接受。

## 問題

用戶需要最多 30 分鐘的時長、DeepSeek 主題和真實設備資訊。舊 Buddy 整包校驗，超過 30,000 ms 的 `wakeHoldMs` 或未知主題會拒絕整份快照，因此發送前必須知道能力。

## 決策

- Buddy 0.5.3 在 ACK 增加 `capabilities`，含 `maxWakeHoldMs:1800000`、三主題及 `page:true`；手環與共享校驗上限提高為 1,800,000 ms，成功亮屏保持每 30 秒續期。
- 桌面 `wakeHoldSeconds` 預設 20，範圍 5–1800；`wake_hold` 保存併發送 `configure.settings.wakeHoldMs`，connect 也攜帶。
- 執行時發送保存值與能力上限的較小者，未知能力時最多 30,000 ms。
- DeepSeek 僅在 `capabilities.themes` 明確包含時應用；否則 Rust 提示需要更新，執行時報 unsupported，不改變設定，UI 禁用應用並說明。
- 新 `device_status` 通過上游 InfoSystem 讀取韌體、型號、電量、充電及存儲；不轉發序列號和 IMEI。ping 電量事件也帶 charging。認證後、每五分鐘及 `refresh_device` 請求，結果放入不持久化的 `state.device`。

## 替代方案

從版本名猜能力會耦合版本、破壞 fork／降級相容。獨立握手增加往返，而每份快照已有 ACK。先發送長租約再等拒絕，會讓舊設備沒有有效快照。

## 相容與證據

`wakeHoldMs`、`capabilities`、device 事件及相關命令均可加。舊設定加載預設值，舊 Buddy 最多 30 秒且僅兩種原主題。自動測試覆蓋能力缺失／大小上下限、設備事件與刷新、舊版 DeepSeek 攔截、半小時租約與過期、圖像及 ACK、Rust 保存與前端提示。

早期長時間試驗約 46 分鐘後失敗；長租約仍需物理確認。存儲單位按上游協議視為位元組，硬件單位仍需核對。
