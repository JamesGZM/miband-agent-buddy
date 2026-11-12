# ADR-012：Windows 預覽安裝包

[English](ADR-012-windows-preview.md) · [简体中文](ADR-012-windows-preview.zh-CN.md) · **繁體中文**

## 問題

僅新增 Windows 工作流程無法編譯依賴 Mac 的原生入口、私有檔案權限、執行時布局與更新器。使用者需要 x64 和 ARM64 安裝包，Windows 遠端建置成功與否不作為 Mac 發布門檻。

## 決定

保持 Mac 發布流程和 IOBluetooth 主執行緒歸屬不變。編譯時選擇固定版本的 Windows SPP 實作，在 Core 認證前啟動接收訂閱，使用普通 Tokio 執行緒。喚醒、投遞與多 AI 策略仍由共享執行時負責。Windows 透過 Node 採集 CPU，以總量與空閒量計算記憶體，並採集使用者磁碟根目錄。原生 Node 與傳輸程式隨保留原始碼布局的執行時打包，私有子程序不彈控制台。

Windows vault 在寫入磁碟前使用目前使用者範圍的 DPAPI，加密/解密失敗不能降級為明文，使用 MoveFileExW 原子替換。禁止機器範圍 DPAPI。設定也透過 Windows vault 載入；Mac 現有檔案位元組與權限保持不變。系統語言透過 Windows 原生 API 讀取。

## 備選方案與相容性

直接執行 Mac 建置腳本不會產生可用的 Windows 安裝包。改寫上游或替換執行時會擴大風險。因此使用獨立建置腳本和固定版本 Tauri CLI，在原生 x64/ARM64 runner 上產生無證書 NSIS 安裝包，包含 Node、依賴聲明、校驗值與對應原始碼。手動工作流程只有讀取權限，僅上傳 Artifact，不發布也不阻擋 Mac。Windows 暫不支援 App 內更新；固定專案/下載連結透過系統開啟，不插入 shell。沒有新增應用雲端介面。

## 證據與限制

Mac Node/架構/Rust 套件以及 Windows PE 校驗測試覆蓋共享行為和架構拒絕邏輯；Windows x64 原生傳輸層通過跨目標 cargo check。Windows 桌面編譯、NSIS 安裝、帳號 WebView、配對、SPP、電量/充電、通知及持續繪製仍需 runner/實機驗證；編譯或打包不等於物理驗證。Windows Actions 結果由使用者自行確認。

## 參考資料

[Tauri Windows installers](https://v2.tauri.app/distribute/windows-installer/) · [GitHub runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) · [DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)
