# 開發指南

[English](README.md) · [简体中文](README.zh-CN.md) · **繁體中文**

本指南面向從原始碼構建 MiBand Agent Buddy 的貢獻者。安裝與日常使用見[項目 README](../../README.zh-TW.md)。修改前閱讀[貢獻指南](../../CONTRIBUTING.zh-TW.md)與[架構](../architecture/README.zh-TW.md)。

## 環境要求

- macOS、Xcode Command Line Tools 與 Git。
- Node.js 22 或更新版本及 npm；桌面打包需要對應 Node 分發包的許可證。
- 支援 edition 2024 的穩定 Rust 工具鏈。
- Python 3.10 或更新版本；圖像生成使用 `requirements.txt` 鎖定的 Pillow。

自動測試和構建不要求連線手環；物理測試需要相容手環。Node、Rust 和桌麵包使用相同 Mac 架構。

## 首次構建

從儲存庫根目錄執行：

```sh
git clone https://github.com/JamesGZM/miband-agent-buddy.git
cd miband-agent-buddy
python3 --version
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm ci --prefix apps/band
npm run bootstrap
npm run build
npm run build:desktop
open 'apps/desktop/dist/MiBand Agent Buddy.app'
```

確認 Python 至少為 3.10，macOS 自帶版本可能較舊。桌面構建預設在解析後的 Node 可執行文件目錄的 `../LICENSE` 查找許可證；如果安裝佈局不同，請指向該 Node 分發包的真實文件：

```sh
export BUDDY_NODE_LICENSE=/absolute/path/to/node/LICENSE
npm run build:desktop
```

開發 App 輸出到 `apps/desktop/dist/MiBand Agent Buddy.app`。優化構建使用 `npm run build:desktop -- --release`。該參數僅選擇優化構建，不執行發佈；打包與標籤說明見[發佈流程](../open-source/RELEASING.zh-TW.md)。

## macOS 簽名

本地建置預設 `--signing-mode local`，要求鑰匙圈中已有有效程式碼簽名身分。只有一個時自動選擇；多個時透過 `--signing-identity` 或 `BUDDY_SIGNING_IDENTITY` 指定完整名稱／SHA-1。不匯出私鑰、不建立證書，也不會默默退回 ad-hoc。下方佔位符應替換成已有證書的參照。

```sh
npm run build:desktop -- --signing-mode local
BUDDY_SIGNING_IDENTITY='EXISTING_CERTIFICATE_SHA1' npm run build:desktop -- --release --signing-mode local
npm run build:desktop -- --release --signing-mode ci
```

GitHub 明確使用 `ci`，不讀取鑰匙圈並拒絕傳入證書身分，不建立或匯入任何證書，包括臨時／自簽證書。其 ad-hoc 程式簽章不使用證書，用於滿足 Apple Silicon 執行程式碼的簽章要求。本地 App、Node 和傳輸程式使用同一已有證書及各自固定識別；跨建置保持證書和識別一致，才能保留穩定 designated requirement。首次從 ad-hoc 切換或改裝 GitHub 包可能重新要求 macOS 授權。簽名不等於公證。參見 [Apple TN3127](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements)。

## 目錄結構

| 路徑 | 職責 |
| --- | --- |
| `apps/desktop` | Tauri 外殼、帳號與 UI |
| `apps/band` | Vela 頁面、控制器與平台適配 |
| `services/runtime` | 本地執行時、Hooks、採樣與連線策略 |
| `native/transport` | macOS SPP／Core 適配器及固定上游補丁 |
| `packages/buddy-shared` | 純協議與顯示函數 |
| `scripts` | 構建、資源生成、打包與本地設定 |
| `tests` | 執行時、手環、契約和架構測試 |
| `mac` | 相容入口 |
| `skills/buddy-hooks` | 項目級 AI 接入指引 |

[架構文檔](../architecture/README.zh-TW.md)定義所有權與依賴方向，供編碼助手執行的規則原文見 [AGENTS.md](../../AGENTS.md)。

## 驗證

新 checkout 先執行 `npm run build`，生成依賴圖像的測試資源。開發時先測試相關模塊，例如：

```sh
node --test tests/contracts/preview-animation.test.mjs
node --test tests/runtime/runtime-operation.test.mjs
```

然後執行通用檢查及受影響的 Rust 測試：

```sh
npm test
npm run check:architecture
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --locked --manifest-path native/transport/Cargo.toml
cargo test --locked --manifest-path native/transport/Cargo.toml -p corelib device::xiaomi::sar::tests
```

手環、共享模塊或圖像改變後執行 `npm run build`；桌面、執行時、傳輸或隨包資源改變後執行 `npm run build:desktop`。依賴已緩存時 Cargo 可加 `--offline`。

`npm test` 會準備共享模塊。執行時測試注入依賴與假時鐘，不得替換生產原始碼來改超時。測試使用合成數據，不讀取個人帳號或訪問真實設備；需要監聽器的測試僅綁定回環地址。

架構檢查涵蓋平台導入、跨 App 訪問、`ui/bridge.js` 外直接調用 Tauri、相容入口與生成模塊邊界，作為代碼審查的補充。

UI 改動檢查首次啟動、現有設定、加載／錯誤狀態與鍵盤操作。設備行為需分別報告型號、韌體、物理結果和軟體回執，範圍見[測試與已知限制](../testing.zh-TW.md)。歸檔移動測試單獨受條件控制，驗證可分發 App 時按發佈流程執行。

## 實現流程

1. 明確用戶行為和受影響組件，保持改動聚焦。
2. 修復錯誤時添加回歸測試；協議變化時更新契約測試數據。
3. 在現有邊界內實現；重要架構決策添加 ADR。
4. 執行針對性測試、完整檢查和受影響構建。
5. 更新文檔，在 PR 中說明未驗證條件。

UI 文案位於 `apps/desktop/ui/locales.js`，英文、簡體與繁體同步更新。Mac 外觀、Buddy 主題和 AI 配置獨立。文檔使用同目錄的 `.zh-CN.md`／`.zh-TW.md` 版本，新增導航時保持目標語言，並執行文檔連結測試。

手環介面應盡可能使用程式繪製，保留已確認的 Buddy 設計。[快應用介面指南](quickapp-ui.zh-TW.md)說明原生元件、圖片例外、共用預覽幾何、動畫開銷與實機驗證。

## 生成文件與本地數據

只改原始檔，不手改產生的共用模組、圖示、縮圖或下載的上游程式。桌面圖示源為 `apps/desktop/artwork/app-icon.png`，由 `scripts/prepare_desktop.py` 產生各尺寸。手環幾何源為 `packages/buddy-shared/presentation/geometry.js`；`scripts/render_band_ui.py` 只產生桌面縮圖並清理廢棄幀目錄。`scripts/prepare_band_icon.py` 產生入口圖示，這是 RPK 中唯一的圖片。

上游版本鎖定在 `native/transport/upstream-lock.json`，適配應保留獨立補丁與[第三方聲明](../../THIRD_PARTY_NOTICES.zh-TW.md)，下載的許可證保持原樣。

不提交構建產物、依賴、憑據、編輯器緩存、本地備份及 `.agent`。測試與診斷不得包含提示詞、對話、原始工具參數、真實設備標識或帳號秘密。

## AI 接入與發佈

[Hooks 指南](hooks.zh-TW.md)說明事件、安裝、驗證與移除。安裝 Hooks 是與構建／測試分開的明確操作；測試安裝器請使用一次性項目。

分支和 PR 的 CI 只檢查原始碼，不生成發佈包。版本標籤工作流驗證兩種 Mac 與兩種 Windows 架構全部成功後才發佈。版本、原始碼歸檔、許可證與發佈說明見[發佈流程](../open-source/RELEASING.zh-TW.md)。

## 本地實機測試建置

建置正常的程式繪製 Buddy 頁面，附加本地測試版本並備份舊 RPK／中繼資料，供本地桌面打包，不執行發佈。入口圖示為唯一圖片。腳本的歷史名稱不代表另一套原型 UI；繪製、穩定性及亮屏需實機確認。

```sh
python3 scripts/build_band_probe.py --revision 8 --activate
npm run build:desktop
```

## Windows 預覽建置

可重用的 [Windows 工作流程](https://github.com/JamesGZM/miband-agent-buddy/actions/workflows/windows.yml)使用原生 x64/ARM64 runner。穩定發布標籤會自動呼叫它，與兩種 Mac 建置一起作為發布門檻；四個架構全部成功後才發布，Release 附帶無證書 NSIS 安裝包、校驗值和對應原始碼。保留手動觸發用於診斷，獨立手動執行只上傳 Actions Artifact，不發布。在對應架構的 Windows Rust/Node 主機完成 bootstrap 和手環建置後，執行 `npm ci --prefix scripts/windows` 和 `python scripts/build_windows.py --arch x64`（或 `arm64`）。將 `BUDDY_NODE_LICENSE` 指向官方 Node LICENSE，Python 使用 UTF-8 模式。Windows 認證與設定使用目前使用者範圍 DPAPI，複製到另一帳號/機器不能遷移登入。預覽版不支援 App 內更新，配對、登入、安裝、通知和硬體行為尚待 Windows 驗證。見 [ADR-012](../architecture/ADR-012-windows-preview.zh-TW.md)。
