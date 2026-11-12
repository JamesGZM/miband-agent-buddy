# 桌面發佈與更新

[English](RELEASING.md) · [简体中文](RELEASING.zh-CN.md) · **繁體中文**

MiBand Agent Buddy 使用 AGPL-3.0-only。公開儲存庫提供原始碼、許可證、聲明、貢獻及安全指南。桌面和手環版本獨立。

## 持續集成

分支推送與 PR 執行 `Source checks`：生成測試資源、Node 測試、架構檢查及兩套 Rust 測試，不構建 App 或 RPK。

`Release packages` 僅在推送穩定 `vX.Y.Z` 標籤或手動指定已有穩定標籤時執行。它構建並測試 Apple Silicon（`macos-15`）、Intel（`macos-15-intel`）、Windows x64（`windows-2025`）及 Windows ARM64（`windows-11-arm`）。發布任務等待兩個平台矩陣全部成功，並驗證全部 16 個安裝包、原始碼及校驗檔案後，才建立或更新 GitHub Release。標籤、package.json 與 Cargo 版本必須一致。原始碼檢查只讀，只有最終發佈任務有 `contents: write`。

發佈資產包括：

- `MiBand-Agent-Buddy-macos-arm64.zip` 與 `MiBand-Agent-Buddy-macos-x64.zip`。
- 各架構的 `SHA256SUMS-*`。
- `MiBand-Agent-Buddy-windows-{x64,arm64}-setup.exe` 及各自的 `.sha256`。
- `MiBand-Agent-Buddy-source-windows-{x64,arm64}.tar.gz` 及校驗和。
- `MiBand-Agent-Buddy-source-{arm64,x64}.tar.gz` 及校驗和，包含審閱後的 Git 跟蹤文件、實際修改的鎖定上游原始碼，以及連結的 Rust 依賴原始碼。
- GitHub 對應準確標籤的原始碼歸檔。

原始碼打包要求乾淨且經過審閱的提交，拒絕私密路徑、符號連結，並排除 Vivo MsgPack。歸檔記錄目標、提交與官方 Node 原始碼 URL，不包含私密帳號或本地生成副本。重跑會替換該標籤資產。Buddy 隨 Mac App 打包，在手環頁面管理。內置更新器要求 GitHub 資產的 SHA-256 摘要。

## 發佈版本

1. 審查提交、[第三方聲明](../../THIRD_PARTY_NOTICES.zh-TW.md)和[驗證指南](../testing.zh-TW.md)，排除私密／本地文件。
2. 同步更新 `package.json`、桌面 Cargo.toml／Cargo.lock 與 Tauri 元數據。在 `CHANGELOG.md` 添加版本說明，工作流以英文原文生成發佈描述，並同步中文更新記錄。僅在手環包變化時更新手環版本。執行完整檢查與兩種構建。
3. 建立並推送審閱後的穩定標籤，例如 `git tag v0.6.0` 和 `git push origin v0.6.0`；這是明確的發佈動作。已有標籤可在 Actions → Release packages → Run workflow 重跑。
4. 等待四架構及 `publish` 成功，檢查安裝包與原始碼歸檔，下載適合的包並驗證 SHA-256。實際驗證舊版更新後，才能聲稱 App 內更新已通過發佈驗收。

草稿 Release 或普通分支推送不會打包。工作流不發佈 npm 包或改變儲存庫可見性。內置檢查器只支援穩定版本。

## App 安裝與更新

App 內含 Node、執行時、共享模塊、原生傳輸與 Buddy 包，可脫離原始碼目錄移動。執行 `npm run build` 後執行 `npm run build:desktop`；加 `-- --release` 選擇優化構建，不會發佈。`python3 scripts/package_release.py` 生成 ZIP，若 Vivo MsgPack 意外進入依賴則失敗。

首次安裝時解壓並移到 `/Applications` 或用戶可寫的應用目錄。GitHub 包使用不帶證書的 ad-hoc 簽章，**未經 Apple 公證**；CI 不建立／匯入證書，也不使用本地簽名身分。本地建置要求已有證書，見[開發簽名](../development/README.zh-TW.md#macos-簽名)。首次打開可能需要在系統設定 → 隱私與安全性中明確批准。不要自動清除 quarantine，也不要將校驗和當作 Apple 公證。

設定 → 關於 → 檢查更新讀取本項目最新穩定 GitHub Release，下載時驗證架構、摘要與解壓後的 App。**安裝並重啟**是獨立動作，會保留 App 數據，並在旁邊留下 `MiBand Agent Buddy.previous-*.app`。目錄不可寫時先移到用戶可寫位置。App Translocation 路徑和開發可執行文件不能原地更新。

本地構建或沒有發佈版本時會如實顯示，不會把原始碼歸檔當成可執行更新。Windows 預覽安裝包包含在同一 Release 中。Linux 包與 GitHub Developer ID 簽名、公證尚未配置；本地簽名使用鑰匙圈中的已有身分。

## Windows 預覽建置

可重用的 [Windows 工作流程](https://github.com/JamesGZM/miband-agent-buddy/actions/workflows/windows.yml)使用原生 x64/ARM64 runner。穩定發布標籤會自動呼叫它，與兩種 Mac 建置一起作為發布門檻；四個架構全部成功後才發布，Release 附帶無證書 NSIS 安裝包、校驗值和對應原始碼。保留手動觸發用於診斷，獨立手動執行只上傳 Actions Artifact，不發布。在對應架構的 Windows Rust/Node 主機完成 bootstrap 和手環建置後，執行 `npm ci --prefix scripts/windows` 和 `python scripts/build_windows.py --arch x64`（或 `arm64`）。將 `BUDDY_NODE_LICENSE` 指向官方 Node LICENSE，Python 使用 UTF-8 模式。Windows 認證與設定使用目前使用者範圍 DPAPI，複製到另一帳號/機器不能遷移登入。預覽版不支援 App 內更新，配對、登入、安裝、通知和硬體行為尚待 Windows 驗證。見 [ADR-012](../architecture/ADR-012-windows-preview.zh-TW.md)。
