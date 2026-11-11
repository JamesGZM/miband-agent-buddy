# MiBand Agent Buddy

[English](README.md) · [简体中文](README.zh-CN.md) · **繁體中文**

一款獨立的 macOS 夥伴應用，適用於**小米手環 9**。它把手環變成 **Buddy**：一個橫向的桌面角色，顯示 AI 任務狀態，以及 Mac 的 CPU、記憶體和磁碟使用量。

**原始碼發布 · 桌面端 0.5.0 / Buddy 0.5.4 · AGPL-3.0。** 本專案是社群專案，並非小米、OpenAI、Anthropic 或 DeepSeek 的官方產品。本版本不提供桌面安裝檔、簽署或公證。

## 功能

- 小米官方網頁登入，登入後自動返回 App，選擇帳號與裝置，並透過藍牙 SPP 直接通訊。
- 以本機建置的 RPK 安裝或更新 Buddy，不需要 AstroBox App 或外掛。
- 持續傳送 Mac 目前的指標，以及 Codex、Claude Code 或自訂本機 harness 去識別化後的生命週期事件，以相符的應用程式回執確認送達。
- 首次使用引導涵蓋帳號、連線、Buddy 安裝與 Hooks 驗證。啟動時先恢復已儲存設定，並提供載入狀態和失敗重試。
- **Mac 外觀**與 **Buddy 主題**彼此獨立：
  - Mac 外觀：Claude / ChatGPT / DeepSeek 強調色，淺色 / 深色 / 跟隨系統；
  - Buddy 主題：ChatGPT / Claude / DeepSeek，需手動套用並經手環確認，不會自動跟隨正在使用的 AI 工具。DeepSeek 主題需要手環上的 Buddy 為 0.5.3 或更新版本。
- 即時手環預覽包含活動狀態燈、手環回報的保持亮屏狀態，點按即可喚醒。ACK 確認的是手環軟體回應，不是實體螢幕亮度量測。
- 手環頁顯示電量與充電狀態、韌體、型號、儲存空間、Buddy 版本和最後同步時間。
- 選單列控制、背景執行、可選的登入時啟動，以及有上限的自動重新連線。
- Buddy 0.5.4 在任務思考、執行或等待確認時持續刷新短時亮屏看門狗。儲存的亮屏時長是全部任務待機後或手動喚醒後的寬限時間：5 秒到 30 分鐘，預設 20 秒。
- 多個工作階段獨立統計，等待確認優先於執行與思考；Buddy 和桌面預覽顯示活躍與等待數量。一個任務完成不會蓋過另一個仍活躍的任務。
- **介面語言**：简体中文、繁體中文、English。預設跟隨 macOS 語言，可在**設定 → 外觀 → 語言**中切換；選單列選單也會一起切換。

Codex 與 Claude Code 使用各自原生的專案 Hooks；Claude Desktop 的本機 **Code** 專案可使用 Claude Code 路徑。這裡不宣稱自動接入一般 ChatGPT 或 Claude 聊天。DeepSeek 等模型需要由具備真實本機生命週期回呼的 harness 接入，選擇視覺主題不會安裝 Hooks。Mac 預覽依手環素材與資料重新繪製，不是手環螢幕截圖。

## 從原始碼建置

需求：macOS、Xcode Command Line Tools、Git、Node.js 22+、目前穩定版 Rust（支援 edition 2024）、Python 3.10+ 和 Pillow。請把原始碼放在固定位置：這個開發版 App 會參照建置時的原始碼目錄與 Node 執行檔，它不是可任意搬移的發行套件。

```sh
git clone https://github.com/JamesGZM/miband-agent-buddy.git
cd miband-agent-buddy
python3 --version  # 必須為 3.10 或更新；macOS 內建的 /usr/bin/python3 可能太舊
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm ci --prefix apps/band
npm run bootstrap
npm run build
npm test
npm run build:desktop
open 'apps/desktop/dist/MiBand Agent Buddy.app'
```

`bootstrap` 會取得固定版本的上游原始碼，並套用儲存庫中的 Core 建置修補。產生的圖像、下載的原始碼、私密憑證和建置產物都不會提交。

一般 push 和 pull request 只做原始碼驗證，不打包。發布 GitHub Release 時才執行 macOS 建置，並附上 Buddy RPK 和校驗碼。桌面端仍需從原始碼安裝，詳見[發布說明](docs/open-source/RELEASING.md)。

## 首次連線

以下步驟使用繁體中文介面。

1. 開啟**帳號**，選擇小米服務地區，在官方視窗中登入。條款同意與安全驗證請自行完成。官方回呼後 App 會自動返回並載入裝置。
2. 開啟**手環**，選擇你的手環 9 並連線。請先中斷其他正在使用同一手環的用戶端。
3. 點按**安裝或更新**，傳送本機建置的 Buddy RPK。傳送期間會暫停一般同步。安裝完成後在手環上手動開啟 Buddy。
4. 開啟 **Buddy** 查看目前資料。選擇手環主題後點按**套用主題**；只有手環確認後才會顯示「使用中」。點按預覽可以喚醒手環。
5. 在**設定**中調整**待機後亮屏時長**和介面語言。儲存後會立即反映到 Buddy 頁；舊版手環的能力上限另行提示。較長的寬限時間會增加手環耗電。
6. 開啟 **Hooks**，選擇實際使用的 AI 工具，將接入指令或 [Buddy Hooks skill](https://github.com/JamesGZM/miband-agent-buddy/blob/main/skills/buddy-hooks/SKILL.md) 連結複製到該專案的 AI 對話。完成設定與宿主信任後，新增工作階段並發起任務，確認 Buddy 收到了事件。
7. 在手環上：**輕點切換頁面，長按離開**。離開時會釋放保持亮屏的要求。

也可以在 App 執行時，從本儲存庫手動設定專案 Hooks。請將 `/absolute/project` 替換為既有專案的絕對路徑：

```sh
node scripts/install_agent_hooks.mjs codex --scope project --project-root /absolute/project --dry-run --json
node scripts/install_agent_hooks.mjs codex --scope project --project-root /absolute/project --json
```

Claude Code 將 `codex` 替換為 `claude-code`。安裝程式合併到 `.codex/hooks.json` 或 `.claude/settings.local.json`，保留無關設定並建立私有本機備份。請檢查宿主的 Hooks 與信任設定，App 不會代為批准。`npm run hooks:install` 保留為明確的使用者層級 Codex 設定入口。不安裝 Hooks 也能顯示系統指標。原始提示詞、工具參數和對話記錄都不會被轉送。

自訂 harness 回呼、驗證與移除步驟見 [Hooks 引導](docs/development/hooks.md)與 [ADR-004](docs/architecture/ADR-004-local-agent-hooks.md)。僅安裝 skill 或寫入設定不代表事件已經送達。某個工作階段連續 15 分鐘沒有生命週期事件時，只會提示狀態待確認，仍保持活躍，並在同步正常時持續亮屏。長時間執行的工具可能沒有新事件，不能僅憑經過的時間判斷任務完成；活動狀態持續到終止事件或手動重置。如果宿主未回報 Esc 等取消操作，可使用**設定 → 清除活動**：它會重置本機觀察到的全部工作階段，保留已收到的事件計數，不會取消 AI 宿主中的任務。

## 本機資料與背景執行

目前使用者的 `~/Library/Application Support/io.github.jamesgzm.miband-agent-buddy/` 目錄保存：

- 偏好設定：外觀、語言、待機後的亮屏寬限時間，以及每個手環的主題；
- 認證資料。

目錄權限為 **0700**，檔案權限為 **0600**。**不使用鑰匙圈，也不需要 Mac 密碼。** 這些檔案沒有經過本應用程式加密，這個開發版也不宣稱具備 macOS App Sandbox 隔離。請勿分享該目錄。登出會刪除已儲存的憑證，並清除與帳號相關的裝置選擇和主題紀錄。裝置狀態（電量、韌體、儲存空間）只保存在記憶體中；序號和 IMEI 從不讀入 App。

開啟背景執行時，關閉視窗後會繼續在選單列中執行。選單列中的**退出**會停止 App 及其背景程序。登入時啟動需手動開啟。原始碼版若搬移或刪除原始碼目錄，需要重新建置 App 並重新安裝 hook 路徑。

## 相容性與驗證

| 裝置 | 支援 | 實機驗證 |
|---|---|---|
| 小米手環 9 NFC 版 | 是 | 見[驗證紀錄](docs/open-source/VALIDATION.md) |
| 小米手環 9 標準版 | 是 | 尚未在實體標準版上測試 |
| 手環 9 Pro / Active 及其他世代 | 否 | 本版本不支援 |

Buddy 0.5.4 會宣告支援任務持續亮屏。收到有效的活躍狀態快照後，手環刷新本機 15 秒看門狗；全部活躍工作階段結束或手動重置本機活動後，儲存的待機寬限時間只啟動一次。任務本身沒有依執行時長設定的逾時，看門狗檢查的是同步是否仍在繼續。暫停、中斷連線或宿主故障導致快照停止時，短時看門狗會在手環本機到期。隱藏或離開 Buddy 也會釋放要求。行為與測試見 [ADR-005](docs/architecture/ADR-005-active-display.md)。

舊版 Buddy 保留一次性亮屏租約，包括套用主題、切換頁面等桌面操作；其宣告的能力可能將儲存時長限制為 30 秒。DeepSeek 主題需要 Buddy 0.5.3 或更新版本（[ADR-003](docs/architecture/ADR-003-band-capabilities.md)）。回呼與 ACK 成功都不是實體螢幕亮度量測，韌體、電源和生命週期行為需要實機測試。參見[架構與協定](docs/open-source/ARCHITECTURE.md)及[驗證紀錄](docs/open-source/VALIDATION.md)，了解實際完成的驗證。

## 原始碼與授權

本專案程式碼以 [AGPL-3.0](LICENSE) 發布。請保留第三方版權與署名聲明，上游元件沿用各自的條款。[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 列出了 AstroBox 協定與帳號流程的來源及所有本機修改。由生命週期驅動的桌面夥伴構想受 Agent Buddy 啟發；本版本手環上的畫面由本儲存庫的幾何程式碼產生。

另見[儲存庫結構與開發流程](docs/development/README.md)、[AGENTS.md](AGENTS.md)、[CONTRIBUTING.md](CONTRIBUTING.md) 和 [SECURITY.md](SECURITY.md)。本專案沒有任何統計分析或遙測服務。
