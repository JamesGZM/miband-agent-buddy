# ADR-002：用戶操作喚醒手環並返回一次結果

[English](ADR-002-user-operation-wake.md) · [简体中文](ADR-002-user-operation-wake.zh-CN.md) · **繁體中文**

日期：2026-11-10 Asia/Singapore。狀態：用戶 UI／喚醒計劃已接受。

## 問題

應用主題等操作依賴 Buddy 已醒且能確認。韌體休眠後執行時進入待機，操作被拒絕或無反饋排隊，螢幕不亮；UI 缺少單獨進度和結果，預覽頁面切換也未傳到手環。

## 決策

- `theme`、`page`、`wake`、`wake_hold`、`activity_keep_awake`、`power_saving`、`reset_activity`、`check_buddy` 在 connected／waiting／standby 可執行，命令帶 request ID，configure 根據字段判斷操作；重置及清單命令允許可選 ID。
- `requestUser` 替換待處理事件，繞過十秒冷卻並搶佔事件喚醒。明確用戶操作每次建立新啟動和新租約，重複值與任意開關方向也一樣；時長受能力限制。
- 唯一 `operation` 暴露 `id`、`kind`、`status`、`code`，啟動結果令 waking 進入 applying，最後只結算一次 done／failed／cancelled。成功必須有匹配亮屏租約，再滿足專屬回執：主題持久化、頁面匹配、省電能力與持久化值、任務亮屏能力與活動租約；清單先亮屏再查詢，確認缺包則直接完成；喚醒、時長、重置使用對應快照回執。
- 啟動失敗、無 ACK、25 秒期限、失聯、斷線和安裝都會結束當前操作。成功安裝後獨立進行 install 喚醒／ACK；啟動或安裝排隊不能證明完成。
- 同步暫停仍允許有界手動操作，完成後停止快照，不續期活動任務。操作期間改變暫停狀態不會取消明確請求。
- ACK 可能早於頁面租約。無租約或亮度 pending／off 時，以新序號繼續相同 wake ID，保持原 15 秒期限，不重開、不延期。有效租約完成操作，超時報 display_unconfirmed 或 no_response；明確亮度錯誤立即失敗，過期／取消後遲到回執無效。隱藏頁面不消費 wake ID，可在 onShow 後的新快照中應用。
- 本地設定與手環選擇在 blocking pool 中持有同一 session mutex 保存，舊的整份設定不得覆蓋新選擇。斷線時只保存意圖，不宣稱設備已應用。
- v1 增加可選 `page`（0／1），僅頁面操作發送。Buddy 0.5.2 應用，舊版忽略並報告 unsupported。
- 前端立即投影請求並阻止重疊手環操作，控件顯示進度，每次結果固定提示一次。保存期間保留請求值，丟棄修改前發起的讀取，完成後重新讀；失敗還原控件與配色。IPC 入隊不提前結束加載。

## 替代方案

僅改善 connected-only 提示不能滿足點擊後亮屏。每包喚醒或永久亮屏已因續航與耗電被拒絕。使用每操作 Tauri 返回結果會改 bridge 契約，因此沿現有 state 返回。

## 相容與證據

命令、已有字段、數據路徑、包標識與 Hooks 地址不變，新字段均可加，共享 fixture 覆蓋。假時鐘測試涵蓋睡眠、缺包、無回應、雙向設定、暫停操作、清單、安裝後驗證、舊版能力，以及真實控制器的早到 ACK／onShow／相同 ID；還驗證原期限、不額外啟動、明確亮度失敗及遲到回執。Rust 覆蓋串行保存與投影，前端覆蓋加載和提示。物理亮屏需獨立確認。
