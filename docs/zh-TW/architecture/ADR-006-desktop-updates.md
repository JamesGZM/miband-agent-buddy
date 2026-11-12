# ADR-006：可移動 macOS 包與明確的 GitHub 更新

[English](../../en/architecture/ADR-006-desktop-updates.md) · [简体中文](../../zh-CN/architecture/ADR-006-desktop-updates.md) · **繁體中文**

## 問題

原桌面可執行文件嵌入原始碼與 Node 路徑，CI 的 App 無法在另一台 Mac 執行，原始碼發佈不能提供桌面更新。

## 決策

構建在 `Contents/Resources/runtime` 包含官方 Node、執行時／共享原始碼、原生傳輸及對應 Buddy RPK／元數據。啟動優先隨包資源，直接 Cargo 開發執行保留原始碼後備。拒絕非系統動態庫，使用 ad-hoc 簽名，不假設或生成 Apple 開發者憑據。

桌面更新器只查詢本儲存庫最新穩定 GitHub Release，在會話首次打開設定或手動檢查時執行。App 名連結固定儲存庫，旁邊版本按鈕僅在有包時顯示更新點並展開控件。按架構選擇固定資產名，要求 GitHub SHA-256 和準確下載 URL，限制重定向、下載及解壓大小，拒絕路徑逃逸、連結和重複文件。待安裝包必須匹配標識／版本、包含資源、支援當前架構且簽名完整。GitHub 是發佈信任邊界；ad-hoc 簽名不證明發佈者身份或 Apple 公證。

下載不替換當前 App。獨立的**安裝並重啟**在當前目錄旁暫存驗證包，檢查寫權限而不提權，等待退出，保留舊包，替換或啟動失敗時回滾。私密數據在包外。原始碼可執行文件與 App Translocation 路徑不能原地更新。背景更新狀態獨立於設備，不發起藍牙操作。

版本標籤或明確工作流調度在兩種架構驗證後發佈。原始碼歸檔只包含審閱且被 Git 跟蹤的項目文件、實際修改後的上游與連結 Rust 原始碼，拒絕本地私密材料。分支／PR 不打包。更新器忽略預發佈，明確報告無發佈或無匹配資產。

## 替代方案

Tauri 密鑰簽名更新需要尚未配置的長期密鑰與公鑰註冊。當前使用固定 GitHub 摘要與本地完整性，公開信任邊界。僅原始碼更新仍要求每個用戶安裝編譯環境；任意 URL 安裝器也不符合單一已知 App 的範圍。

## 相容與證據

不改私密路徑、包標識、回環端點或 v1 協議。Core 獨立可選功能補丁排除未使用、許可未明確的 Vivo MsgPack，保留其他消費者的上游預設值，打包時檢查排除結果。

Rust 覆蓋穩定版本／架構選擇、URL 信任、合法和危險歸檔、執行權限、替換及回滾；工作流測試維護髮布邊界。完整構建、真實 GitHub 發佈與手環物理驗證分別報告。

參考：[GitHub Releases](https://docs.github.com/en/rest/releases/releases)、[資產摘要](https://docs.github.com/en/rest/releases/assets)、[Mac runner 架構](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。

## 獨立更新服務

桌面先檢查 `https://buddy-updates.ailaogong.men/buddy/releases/latest`，逾時、HTTP 失敗或元資料無效時直連 GitHub 官方 API。有效快取允許延遲十分鐘。服務是新增的可信元資料中間層，並非發佈簽名機構；它同時提供元資料與摘要，服務被入侵屬於信任邊界內的風險。

更新器從準確的官方版本和架構資產推導 Worker 下載地址，串流寫入私有暫存歸檔，大小和 SHA-256 全部匹配才解壓。Worker 下載失敗、不完整或損壞時，從零開始直連固定 GitHub URL 下載。儲存失敗立即停止。兩條路徑均保留歸檔、包標識與版本、架構和簽名檢查；替換及回滾不變。

維運說明：[更新服務](../development/updates.md)。

安裝交接會保留已驗證下載包，直到旁置副本通過驗證且安裝助手成功啟動。複製、驗證、寫入助手或啟動失敗時，只清除自有的半成品旁置目錄。交接前的儲存、位置或助手失敗保留可重試的就緒狀態並顯示失敗原因，每次重試重新驗證包。無效包不能重試安裝。
