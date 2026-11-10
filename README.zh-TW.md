# MiBand Agent Buddy

[English](README.md) · [简体中文](README.zh-CN.md) · **繁體中文**

一款獨立的 macOS 夥伴應用，適用於**小米手環 9**。它把手環變成 **Buddy**：一個橫向的桌面角色，顯示 Codex 的活動狀態，以及 Mac 的 CPU、記憶體和磁碟使用量。

**原始碼發布 · 0.5.0 · AGPL-3.0。** 本專案是社群專案，並非小米、OpenAI、Anthropic 或 DeepSeek 的官方產品。本版本不提供安裝檔、簽署或公證。

## 功能

- 小米官方網頁登入，登入後自動返回 App，選擇帳號與裝置，並透過藍牙 SPP 直接通訊。
- 以本機建置的 RPK 安裝或更新 Buddy，不需要 AstroBox App 或外掛。
- 持續傳送 Mac 目前的指標與去識別化的 Codex 生命週期事件，並以相符的應用程式回執確認送達。
- **Mac 外觀**與 **Buddy 主題**彼此獨立：
  - Mac 外觀：Claude / ChatGPT / DeepSeek 強調色，淺色 / 深色 / 跟隨系統；
  - Buddy 主題：ChatGPT / Claude / DeepSeek，需手動套用並經手環確認，不會自動跟隨正在使用的 AI 工具。DeepSeek 主題需要手環上的 Buddy 為 0.5.3 或更新版本。
- 即時手環預覽：左上角是活動狀態燈，右上角顯示真實螢幕狀態（亮屏倒數或息屏），點按預覽即可喚醒手環。
- 手環頁顯示電量與充電狀態、韌體、型號、儲存空間、Buddy 版本和最後同步時間。
- 選單列控制、背景執行、可選的登入時啟動，以及有上限的自動重新連線。
- 事件觸發的亮屏租約，到期後自然息屏。亮屏時長可設定為 5 秒到 30 分鐘，預設 20 秒。
- **介面語言**：简体中文、繁體中文、English。預設跟隨 macOS 語言，可在**設定 → 外觀 → 語言**中切換；選單列選單也會一起切換。

目前只整合了 Codex 的活動狀態。Claude 視覺主題**不**代表整合了 Claude Code。Mac 上的預覽是依手環的畫面素材與資料重新繪製，不是手環螢幕截圖。

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

## 首次連線

以下步驟使用繁體中文介面。

1. 開啟**帳號**，選擇小米服務地區，在官方視窗中登入。條款同意與安全驗證請自行完成。官方回呼後 App 會自動返回並載入裝置。
2. 開啟**手環**，選擇你的手環 9 並連線。請先中斷其他正在使用同一手環的用戶端。
3. 點按**安裝或更新**，傳送本機建置的 Buddy RPK。傳送期間會暫停一般同步。安裝完成後在手環上手動開啟 Buddy。
4. 開啟 **Buddy** 查看目前資料。選擇手環主題後點按**套用主題**；只有手環確認後才會顯示「使用中」。點按預覽可以喚醒手環。
5. 在**設定**中調整亮屏時長和介面語言。超過 30 秒也能儲存，但會提醒你這會增加手環耗電。
6. 在手環上：**輕點切換頁面，長按離開**。離開時會釋放保持亮屏的要求。

如需顯示 Codex 活動，在 App 執行時執行：

```sh
npm run hooks:install
```

安裝程式會保留無關的 hooks，並在本機備份。請在 Codex 的 Hooks 設定中檢查變更；App 不會替你確認信任。不安裝 hooks 也能顯示系統指標。原始提示詞、工具參數和對話記錄都不會被轉送。

## 本機資料與背景執行

目前使用者的 `~/Library/Application Support/io.github.jamesgzm.miband-agent-buddy/` 目錄保存：

- 偏好設定：外觀、語言、亮屏時長，以及每個手環的主題；
- 認證資料。

目錄權限為 **0700**，檔案權限為 **0600**。**不使用鑰匙圈，也不需要 Mac 密碼。** 這些檔案沒有經過本應用程式加密，這個開發版也不宣稱具備 macOS App Sandbox 隔離。請勿分享該目錄。登出會刪除已儲存的憑證，並清除與帳號相關的裝置選擇和主題紀錄。裝置狀態（電量、韌體、儲存空間）只保存在記憶體中；序號和 IMEI 從不讀入 App。

開啟背景執行時，關閉視窗後會繼續在選單列中執行。選單列中的**退出**會停止 App 及其背景程序。登入時啟動需手動開啟。原始碼版若搬移或刪除原始碼目錄，需要重新建置 App 並重新安裝 hook 路徑。

## 相容性與驗證

| 裝置 | 支援 | 實機驗證 |
|---|---|---|
| 小米手環 9 NFC 版 | 是 | 見[驗證紀錄](docs/open-source/VALIDATION.md) |
| 小米手環 9 標準版 | 是 | 尚未在實體標準版上測試 |
| 手環 9 Pro / Active 及其他世代 | 否 | 本版本不支援 |

符合條件的喚醒會讓 Buddy 0.5.3 在手環本機持有一段亮屏租約，包括套用主題、切換頁面等桌面操作。租約預設 20 秒，可設為 5 秒到 30 分鐘。舊版 Buddy 最多 30 秒，也不提供 DeepSeek 主題；手環會在每次回執中宣告自己支援的上限（[ADR-003](docs/architecture/ADR-003-band-capabilities.md)）。API 回呼成功不代表螢幕真的亮了，韌體、電源和生命週期行為需要實機測試。參見[架構與協定](docs/open-source/ARCHITECTURE.md)和[驗證紀錄](docs/open-source/VALIDATION.md)。

## 原始碼與授權

本專案程式碼以 [AGPL-3.0](LICENSE) 發布。請保留第三方版權與署名聲明，上游元件沿用各自的條款。[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 列出了 AstroBox 協定與帳號流程的來源及所有本機修改。由生命週期驅動的桌面夥伴構想受 Agent Buddy 啟發；本版本手環上的畫面由本儲存庫的幾何程式碼產生。

另見[儲存庫結構與開發流程](docs/development/README.md)、[AGENTS.md](AGENTS.md)、[CONTRIBUTING.md](CONTRIBUTING.md) 和 [SECURITY.md](SECURITY.md)。本專案沒有任何統計分析或遙測服務。
