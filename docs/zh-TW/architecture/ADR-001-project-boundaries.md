# ADR-001：明確邊界，保留現有技術棧

[English](../../en/architecture/ADR-001-project-boundaries.md) · [简体中文](../../zh-CN/architecture/ADR-001-project-boundaries.md) · **繁體中文**

日期：2026-11-10 Asia/Singapore。狀態：用戶重構計劃已接受。

## 問題

原型混合已退役和受支援原始碼，桌面／執行時生命週期集中在入口，測試與構建耦合原始碼位置；集成測試通過替換原始碼改變依賴與時間。

## 決策

保留 Tauri + Node + Rust SPP + Vela，明確 apps／services／native／shared 邊界。入口只負責組合，IPC 類型化並校驗，共享模塊為純 ES5，執行時與控制器注入依賴，CI 增加小型邊界檢查。保留相容入口、存儲格式與協議。

## 參考與採用思路

以下為 2026-11-10 閱讀的主要原始碼，僅參考設計，不複製實現。

- [Yaak platform](https://github.com/mountain-loop/yaak/tree/main/packages/platform/src)及[開發指南](https://github.com/mountain-loop/yaak/blob/main/DEVELOPMENT.md)，main：隔離系統訪問，明確 Node sidecar 邊界；不採用其 gRPC、插件和多包工作區。
- [Clash Verge Rev commands](https://github.com/clash-verge-rev/clash-verge-rev/blob/dev/src-tauri/src/cmd/mod.rs)，blob `1bb2d30411f9ea55bb79c097ffb890d272198107`，及[入口](https://github.com/clash-verge-rev/clash-verge-rev/blob/dev/src-tauri/src/main.rs)，blob `eb0af31951e108fc3b03ca6df45f8c3c4c275190`：分離原生組裝、命令與程序操作；不採用其全局服務及執行時調優。
- [GitButler 開發規則](https://github.com/gitbutlerapp/gitbutler/blob/master/AGENTS.md)，blob `996c996250a22ef567bd8a543cdbac18e15479f1`：版本化目錄職責、聚焦改動與驗證要求；本項目不需要同等構建編排。

## 替代方案與影響

純 Rust 後端可減少語言與程序，但需重寫已驗證的採樣、Hooks、喚醒。只移動目錄無法消除生命週期耦合，通用設備／AI 插件系統無當前需求，均暫不採用。

生成包裝增加準備步驟，但保留單一共享原始碼且不引入 bundler。協議保留可加字段，持久化帳號保留原 token 類型；明確批准安裝遷移前保留相容入口。採樣工具不承擔傳輸策略。

驗證保留原案例，補充假時鐘協調、生命週期清理、IPC 一致、相容及負面架構測試，執行兩種構建；物理測試證據單獨記錄。
