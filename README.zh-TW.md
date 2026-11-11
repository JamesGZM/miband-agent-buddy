# MiBand Agent Buddy

[English](README.md) · [简体中文](README.zh-CN.md) · **繁體中文**

一款開源 macOS 伴侶應用程式，讓小米手環 9 顯示 AI 任務狀態和 Mac 資源用量。

[下載](https://github.com/JamesGZM/miband-agent-buddy/releases/latest) · [開始使用](#開始使用) · [參與貢獻](CONTRIBUTING.zh-TW.md) · [更新紀錄](CHANGELOG.zh-TW.md)

## 功能

- ChatGPT、Claude 與 DeepSeek 動態 Buddy 主題，在 Mac 上即時預覽。
- 展示思考、執行與等待確認狀態；多個任務共用多色圓環，其中一個任務結束不會遮蔽其他任務。
- 查看 CPU、記憶體和磁碟用量。
- 可選的任務期間保持亮屏、自訂待機息屏時間與省電動畫模式。
- 集中管理手環連線、電量、儲存空間與 Buddy 安裝。
- 選單列控制、可選背景執行、App 更新，以及繁體中文、簡體中文和英文介面。

## 下載

從 [GitHub Releases](https://github.com/JamesGZM/miband-agent-buddy/releases/latest) 下載適合你的 Mac 的安裝包，解壓縮後將 **MiBand Agent Buddy.app** 移到「應用程式」。

| Mac | 安裝包 |
| --- | --- |
| Apple Silicon | `MiBand-Agent-Buddy-macos-arm64.zip` |
| Intel | `MiBand-Agent-Buddy-macos-x64.zip` |

目前版本尚未經過 Apple 公證。如果 macOS 阻止首次開啟，請確認下載來源後按照[安裝說明](docs/open-source/RELEASING.zh-TW.md)操作。目前不支援 Windows 和 Linux。

## 手環亮度與電量狀態

在設定 → 手環顯示中使用亮度滑桿，範圍 0–255。首次執行保留手環目前亮度。省電模式固定為 25 和 10 FPS，關閉後恢復儲存的亮度和幀率。Mac 電量旁會明確顯示「充電中」。低於 20% 時在 App 內提示，並請求一次 Mac 系統通知，充電期間同樣適用；持續低電量及重新連線不會重複提醒，電量恢復至 20% 後重新觸發下一輪提醒。系統通知是否顯示由 macOS 通知設定決定。連線可用時約每分鐘查詢電量和充電狀態，安裝、喚醒和通訊操作可能延遲更新。

## 開始使用

1. 開啟 App 並按照設定引導操作，登入與小米運動健康相同的小米帳號和服務地區。
2. 選擇手環並完成配對提示。設定時請讓手環靠近 Mac，並中斷其他正在連線手環的 App。
3. 根據提示安裝 Buddy，然後開啟 **Buddy** 頁面選擇主題、查看 Mac 的狀態。
4. 可選：開啟 **AI 接入**，連線你的程式開發工具。尚未接入 AI 時也可以查看 Mac 資源用量。

輕點手環螢幕可切換 Buddy 和資源頁面，長按可退出 Buddy。點擊 Mac 上的預覽可以喚醒手環。

**設定**中的**任務期間保持亮屏**預設關閉；開啟後，所有任務結束才開始待機息屏倒數。**省電模式**同樣預設關閉。Buddy 的安裝與更新在**手環**頁面管理；App 更新可透過**設定 → 關於**中的版本按鈕檢查。

**設定 → 任務通知**中的**任務完成震動**預設關閉。開啟後，每個 AI 任務完成時震動一次，多個任務分別完成時分別通知；可選**短震**（預設）或**長震**，時長由手環系統控制。需要支援震動的 Buddy 及宿主真實的完成 Hooks；工具結束、取消和等待確認不會觸發。設定頁按外觀、執行與同步、手環顯示、任務通知、關於分組。

## 接入 AI 工具

將 **AI 接入**頁面的設定請求複製到專案的 AI 對話中，或分享 [Buddy Hooks skill](https://github.com/JamesGZM/miband-agent-buddy/blob/main/skills/buddy-hooks/SKILL.md) 連結，由 AI 按照指引完成專案設定與驗證。

| 工具 | 接入方式 |
| --- | --- |
| Codex | 專案 Hooks |
| Claude Code | 專案 Hooks |
| Claude Desktop Code | 本地專案使用 Claude Code 接入方式 |
| 自訂工具，包括使用 DeepSeek 的 harness | 透過本地接入介面傳送任務生命週期事件 |

ChatGPT 和 Claude 的一般聊天目前不提供自動任務同步。自訂接入需要實際的任務生命週期事件。設定細節與支援的事件見[接入指南](docs/development/hooks.zh-TW.md)。

## 相容性

| 裝置 | 狀態 |
| --- | --- |
| 小米手環 9 NFC 版 | 已實機測試；請參閱下方已知限制 |
| 小米手環 9 標準版 | 目標支援，實機驗證尚未完成 |
| 小米手環 9 Pro／Active 及其他代際 | 暫不支援 |

不同韌體下的藍牙恢復與長時間亮屏仍在持續驗證。目前驗證範圍見[測試與已知限制](docs/testing.zh-TW.md)。

## 隱私

AI 接入只傳送任務狀態，不傳輸提示詞、工具參數或對話內容。資源監測在本機進行，專案不包含分析或遙測服務。帳號資料儲存在本機；分享診斷前請閱讀[安全與隱私說明](SECURITY.zh-TW.md)。

## 參與貢獻

歡迎提交問題回報、翻譯、文件、裝置測試結果和程式碼。請先閱讀[貢獻指南](CONTRIBUTING.zh-TW.md)，再按照[開發文件](docs/development/README.zh-TW.md)準備環境。使用問題請參閱[支援指南](SUPPORT.zh-TW.md)。

## 授權條款

MiBand Agent Buddy 使用 [AGPL-3.0-only](LICENSE) 授權條款。第三方元件保留各自的授權，詳見[第三方聲明](THIRD_PARTY_NOTICES.zh-TW.md)。

本專案由社群獨立開發，與小米、OpenAI、Anthropic 或 DeepSeek 無隸屬關係。

## 致謝

- AstralSightStudios 與 AstroBox 貢獻者：[Core](https://github.com/AstralSightStudios/AstroBox-NG-Module-Core)、[Account](https://github.com/AstralSightStudios/AstroBox-NG-Module-Account)、[Bluetooth](https://github.com/AstralSightStudios/AstroBox-NG-Module-Bluetooth) 和 [Classic SPP](https://github.com/AstralSightStudios/AstroBox-NG-Plugin-BtClassicSpp)。
- Dan Wahlin 的 [Agent Buddy](https://github.com/DanWahlin/agent-buddy)，為伴侶角色的互動理念提供了啟發。
- [Tauri](https://tauri.app/)、[Xiaomi Vela](https://iot.mi.com/vela/quickapp/)，以及本專案所使用的開源依賴的維護者。
