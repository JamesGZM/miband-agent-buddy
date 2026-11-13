# 架構

桌面建置共用 `scripts/runtime_resources.py`，只封裝 runtime bin/src 與共享 protocol/presentation 中的 JavaScript 模組、最小 ESM/CommonJS 套件資訊和目前離線接入指南，不包含開發 npm scripts、測試 fixtures 或額外 Markdown。指南仍供 CLI guide/help 使用，並內嵌於 App 介面；授權／來源資料另行完整封裝，包括上游 README 聲明。

新 AI 接入使用已驗證的宿主 Hooks／回調 → 內建 `--buddy-cli` → 既有 runtime。通用指令附完整接入說明和應用身分，不附安裝路徑，由接入 AI 選擇已驗證的宿主機制。不要求額外環境，不新增對外 API。匿名身分與遞增輪次、順序支援有界並行接收，本機回執不等待裝置。舊 Hooks 保留且不自動遷移。見 [ADR-016](ADR-016-bundled-integration.md)。

[English](../../en/architecture/README.md) · [简体中文](../../zh-CN/architecture/README.md) · **繁體中文**

這裡是當前架構的權威說明，歷史架構地址跳轉到此。本專案把小米手環 9 作為電腦旁的桌面顯示屏，提供 macOS 與 Windows x64/ARM64 桌面 App。實機驗證目前覆蓋 macOS 搭配 NFC 版手環；Windows 仍屬實驗性預覽，其平台邊界與驗證限制見 [ADR-012](ADR-012-windows-preview.md)。

```text
桌面 UI → bridge → Tauri 命令 → 應用服務 → 私密文件
                                  ↓ JSON Lines
AI Hooks → 回環 HTTP → Node 執行時核心 → 傳輸適配器
系統採樣 ─────────────────────┘           ↓ JSON Lines
                          Rust SPP/Core → Buddy 控制器
                                        ← v1 應用 ACK
```

## 所有權與依賴方向

| 組件 | 職責 | 邊界 |
| --- | --- | --- |
| Desktop | 官方登錄視窗、設定、設備選擇、選單列與視窗生命週期 | 類型化應用操作；UI 返回值無憑據 |
| Runtime core | 連線意圖、重試、快照、安裝與喚醒協調 | 注入時鐘、調度器、採樣、傳輸與 ID |
| Runtime adapters | 系統指標、回環 HTTP、子程序 I/O 與目錄 | 不包含重連／喚醒策略 |
| Native transport | 固定的上游 Core／SPP、認證與設備操作 | JSON Lines 與固定脫敏錯誤碼 |
| Band controller | 快照、設定回執、前景生命週期與渲染狀態 | 注入 Vela API 與定時器 |
| Shared modules | v1 校驗、ACK 匹配、顯示與動畫計算 | 純 ES5 CommonJS，無平台導入 |

入口只組裝依賴。桌面領域／協議模型無平台副作用，選單列與視窗共享應用操作。帳號模型保留 vendored token 類型，維持保存格式；vendor 與鎖定的上游代碼獨立隔離。

前端只有 `bridge.js` 訪問 Tauri。預覽使用與手環相同的顯示函數重建圖像，不是設備截圖。桌面外觀、手環主題與活動狀態相互獨立。`i18n.js`／`locales.js` 提供英文、簡體、繁體；繁體源字符串作為 key，執行時與 Rust 消息在展示時翻譯，不改變協議。選單列與登錄標題使用保存的 `language`（預設 `system`）。

## 契約與傳輸

桌面／執行時及執行時／傳輸通過私有繼承 stdio 逐行傳 JSON。憑據僅在必要初始連線幀中出現，不進入 state／health。邊界校驗命令，保留可加字段。JavaScript 與 Rust 共用 `packages/buddy-shared/fixtures/v1.json` 的合成示例。

快照 v1 保留 `session`、`seq`、CPU／記憶體／磁盤、活動模式、`buddyTheme`、`settingsRevision`、`keepScreen`，並允許 `page`。ACK 必須匹配當前會話和序號。主題確認還要求對應 revision、theme 與 `settingsApplied=true`；排隊或寫入失敗不能算持久化成功。包名保持 `com.macprobe.band9`。

只有一個選定設備、一個傳輸子程序、最多一份待確認快照。採樣約每兩秒一次，最多一個採樣工作，不阻塞任務傳送；超過兩個採樣間隔的結果顯示未知，新數據替換尚未發送的舊數據。重連退避最多 30 秒，八次後停止；認證拒絕與客戶端競爭需要用戶處理。斷開會清除重連意圖；安裝暫停快照並等待有界結果。

缺失 ACK 後進入 standby，只表示 Buddy 暫未回應，不能證明硬體休眠。空閒保持約 30 秒探測；開啟任務亮屏且仍有任務時，兩秒後重試傳送，減少退避對活動看門狗期限的消耗。原生命令仍循序執行，但獨立事件泵會在查詢期間轉送應用 ACK；獨立裝置資訊查詢並行執行，各自限制五秒。傳輸 generation 排除舊子程序回調；暫停、斷線、安裝清除待喚醒工作。停止取消定時器並結束 worker。

通道探測成功後，若開啟任務亮屏、任務仍活動且上次前景 Buddy 等待兩秒後仍未回應，可恢復一次有界喚醒；正常回執會取消它，重複失敗不會週期重開頁面。

## 活動與有界喚醒

Hooks 僅包含事件、會話哈希和時間戳；接收器綁定 `127.0.0.1:10731`，拒絕瀏覽器來源寫入並限制輸入。Codex 相容路徑保留，新 provider 先命名空間再哈希。[內建指南](../../../services/runtime/integration-guide.md)定義目前接入方式（[ADR-016](ADR-016-bundled-integration.md)）；原始碼安裝器已退役，既有事件發送器保持相容。失敗時成功退出，不作權限決定。最多 128 個會話，僅存記憶體，聚合優先級為等待確認、執行、思考；不推斷並行工具或子代理數量。15 分鐘無事件只標為過期，仍保持活動與亮屏續期。`reset_activity` 清除觀察記錄，不取消 AI 任務。

提交任務、通用新輪次首個 working、新權限請求和完成可請求喚醒；同輪次後續 thinking 是恢復而不是新開始，普通指標和工具流量不能。只保留一個事件，TTL 60 秒，全局冷卻 10 秒，等待確認優先；取消和恢復工具執行會使舊請求失效。

新鮮可見且亮屏中的回執及未過期租約允許優先發快照；喚起期間 Hook 合入同一交易。隱藏或關閉亮屏的競爭允許在原期限內後備啟動一次（[ADR-015](ADR-015-coalesced-event-wake.md)）。

桌面主題、頁面、喚醒、時長、任務亮屏、省電、重置、版本檢查都是用戶操作（[ADR-002](ADR-002-user-operation-wake.md)），在 connected／waiting／standby 可執行，替換待處理事件、繞過冷卻、搶佔舊事件喚醒並建立新租約。唯一 `operation` 在匹配亮屏租約及操作專屬設定／頁面／清單回執後結束為 done／failed／cancelled。啟動排隊只進入 applying，不代表完成；啟動失敗、25 秒期限、失聯、斷線、安裝也會終結操作。同步暫停時仍允許手動交易，完成後停止快照，期間不續期任務保持。只有頁面操作發送 `page`，UI 在操作控件顯示進度並固定提示結果。

頁面處理租約前可能先 ACK。早到 ACK 無租約時，使用新序號繼續發送相同 wake ID，直到原始 15 秒期限；不額外啟動或延長期限。後來的有效租約完成操作，明確亮度錯誤立即失敗，取消／過期後遲到回執不能恢復操作。

明確連線／啟動喚醒一次；背景重連在認證時檢查當前狀態，只有同步開啟、任務亮屏開啟且仍有活動任務，才恢復一次喚醒。空閒、已結束、暫停或關閉時保持安靜，重複認證也不再次啟動。原生工作階段首次使用應用前檢查安裝清單，後續喚醒複用已知中繼資料，安裝會使準備狀態失效；缺失 Buddy 時要求安裝；安裝成功後單獨進行喚醒／ACK，即使同步已暫停。

`syncEnabled` 預設 true，視窗與選單列共用，啟動時先恢復暫停再自動連線。每次明確手動操作，無論重複值或開關方向，都請求一次喚醒。恢復同步且任務仍活動、亮屏已開啟時也喚醒一次。所有設定修改在 blocking pool 中持有同一 session mutex 保存，防止舊快照覆蓋新選擇。

持久化 `keepScreen` 始終 false；獨立 `activityKeepAwake` 預設 false，改變後立即保存並配置執行時。事件／手動喚醒使用獨立 ID 與本地租約，時長預設 20 秒、範圍 5–1800 秒，受 `capabilities.maxWakeHoldMs` 限制；無能力時最多 30 秒（[ADR-003](ADR-003-band-capabilities.md)）。重複 ID 不延長租約。

對於已確認前台活動租約、且支援較長活動租約的 Buddy，背景重連後先嘗試同步快照最多八秒。新鮮的前台活動回執或隱藏頁面回執會取消後備啟動；缺失回執才可請求既有的有界活動恢復。裝置／owner 改變、任務結束、暫停、關閉任務亮屏、安裝及使用者操作均取消待執行的後備啟動。

Buddy 0.5.4 起提供 `activityHold`。開啟後，遞增序號的活動快照續期本地看門狗；依 `capabilities.maxActivityHoldMs` 協商，上限 120000 毫秒，缺失或無效能力值保留舊版 15000 毫秒。獨立的喚醒確認期限仍為 15 秒。全部任務結束或關閉亮屏後，只啟動一次保存的待機寬限。普通空閒快照不滑動期限；同步中斷會本地過期，hide／exit 取消全部租約。亮度成功每 30 秒續期，失敗或回調超時兩秒後重試，負值 success 結果算失敗。可選 `sessionCounts` 在原圓環最多顯示六種併發顏色，不顯示數量文字或 provider 身份，獨立於主題。舊 Buddy 保持原字段和單次租約（[ADR-005](ADR-005-active-display.md)）。確認需要匹配 ACK、租約 ID／剩餘時間和接受的亮屏請求；韌體決定實際顯示，ACK 不測量物理螢幕。見[驗證指南](../testing.md)。

ACK 的 `capabilities` 聲明最大租約、主題、頁面、省電。新主題只有明確支援才發送，避免舊 Buddy 拒絕整份快照。省電預設關閉，兩端持久化，僅對支援設備發送。動畫目標可設 10–30 FPS，預設 10，省電固定 10；buddyFps 經能力協商、整數校驗和持久化回執確認。角色外圈由完整原生邊框與固定 scroll 裁切視窗組成，一個 RGBA 邊框統一產生呼吸，八個固定 Loading 視窗的每幀工作量不隨任務顏色數增加。角色幾何快取，資源頁保留 progress 弧線。桌面預覽使用同一份共享幾何與新鮮回執的動畫相位／幀率，隱藏即停；任務數最多六色，準確數量留在桌面膠囊外（[ADR-008](ADR-008-animation-and-task-rings.md)）。認證後、每五分鐘和手動刷新時讀取 `device_status`，韌體、型號、電量、充電和存儲放入非持久化 `state.device`，不轉發序列號或 IMEI。

Buddy 安裝只在手環頁面管理。`state.buddy` 區分未知、檢查、缺失、已安裝、可更新、匹配、新版本、安裝中與錯誤。清單只包含 Buddy 是否存在及數字版本；無 ACK 不代表未安裝。初始／安裝後啟動復用清單，暫停啟動與背景重連只讀查詢。明確 `check_buddy` 先喚醒並確認顯示，再檢查清單；確認缺包時直接完成。隨包版本由實際 RPK 的 SHA-256 綁定。新 ACK 名稱恰好等於隨包版本時，即使緩存數字舊，也可確認 current，但不能推斷數字版本；清單變化會使舊證據失效，更大數字仍為 newer。傳輸完成不算安裝回執，後續 ACK 可獨立證明執行版本，不能重寫原缺失回執結果。安裝錯誤留在手環管理狀態（[ADR-007](ADR-007-band-installation-state.md)）。

## 構建與相容

多 AI 彙總、優先序、顯示模式和任務配色方案必須在 Mac 計算。發現 `activityRing` 能力後，執行服務發送有序顏色清單取代任務計數；手環只驗證、套用並負責本地動畫與安全保護。相容舊主機時只在快照到達時轉換計數，不得每幀彙總（[ADR-009](ADR-009-host-activity-display.md)）。

任務完成通知預設關閉，依據主機逐會話事件獨立判斷，不依賴整體模式。Mac 發送有界的編號／次數；Buddy 持久化去重後請求所選系統短震／長震。模式修改受能力門控並匹配持久化回執（[ADR-010](ADR-010-completion-vibration.md)）。

`scripts/prepare_shared.py` 將共享原始碼複製給 Vela，並包裝原 CommonJS 為瀏覽器 ESM，不改 export 字符串。App 副本與圖像都是生成產物。手環幾何源為 `packages/buddy-shared/presentation/geometry.js`，`scripts/render_band_ui.py` 只產生桌面縮圖並清除舊幀；桌面品牌源為 `apps/desktop/artwork/app-icon.png`，由 `prepare_desktop.py` 生成圖標及單色選單列模板。

桌麵包在 `Contents/Resources/runtime` 攜帶 Node、執行時、共享原始碼、原生傳輸、RPK 和元數據，直接 Cargo 開發執行保留原始碼路徑後備。Worker 優先、GitHub 直連兜底的更新檢查、下載和驗證安裝屬於桌面更新器（[ADR-006](ADR-006-desktop-updates.md)），獨立於設備狀態。`mac/codex-hook.mjs` 與 `mac/buddy-runtime.mjs` 保留舊入口；數據位置、設定、Hooks 地址、包標識和公開 npm 命令不變。Rust 與 Quick App 獨立鎖定依賴，不引入工作區管理器或執行時重寫。


正式手環頁面與桌面預覽使用共用程式幾何（ADR-008）；RPK 圖片僅保留入口圖示，本地建置器暫存同一 UI 的測試版本。後續手環介面優先使用程式繪製並保留已確認設計；圖片例外、效能及實機檢查遵循[快應用介面指南](../development/quickapp-ui.md)。

[手環亮度與電量狀態](ADR-011-brightness-and-battery.md).

啟動前的準備失敗（`app_query_failed` / `app_sync_failed`）可以為開啟保持亮屏的活躍任務授權 60 秒內最多兩次重試，必須有本連線的新安裝清單與成功鏈路探測。仍遵守現有冷卻和亮屏確認時限；沒有結果或啟動失敗不能授權重試。首次背景裝置查詢延至首次喚醒確認後。見 [ADR-005](ADR-005-active-display.md)。

## 發送與文件決策

- [ADR-013](ADR-013-nonblocking-hooks.md): 有界背景 Hooks、既有設定升級與順序限制。
- [ADR-014](ADR-014-language-documentation.md): 語言目錄、根目錄唯一 README 與文件搬移。

- [ADR-015](ADR-015-coalesced-event-wake.md): 合併事件喚起.
- [獨立更新服務](../development/updates.md).
