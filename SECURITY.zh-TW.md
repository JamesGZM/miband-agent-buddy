# 安全與隱私

[English](SECURITY.md) · [简体中文](SECURITY.zh-CN.md) · **繁體中文**

## 報告安全漏洞

請使用 GitHub 私密的[報告漏洞表單](https://github.com/JamesGZM/miband-agent-buddy/security/advisories/new)。在協商披露計劃前，漏洞詳情和驗證材料應留在私密報告中。

請提供受影響版本、使用合成數據的最小重現、預期影響與建議修復。不要包含密碼、小米 cookies、認證密鑰、真實設備標識或他人資料。維護者盡力處理，但不保證響應或修復時限。

普通錯誤與連線問題請提交到 [Issues](https://github.com/JamesGZM/miband-agent-buddy/issues)，重現資訊要求見[支援指南](SUPPORT.zh-TW.md)。報告舊版本問題時說明最新版是否也受影響；是否回移修復逐案決定。

## 本地數據

偏好設定與帳號憑據保存在：

```text
~/Library/Application Support/io.github.jamesgzm.miband-agent-buddy/
```

目錄權限為 `0700`，私密文件為 `0600`。憑據沒有保存在 Keychain，也未由本 App 加密；以同一 macOS 用戶執行的程序可能讀取它們。不要上傳或分享這個目錄。

退出帳號會刪除保存的憑據文件和帳號設備選擇記錄，不會撤銷其他小米帳號會話。設備狀態僅在本機使用；桌面狀態不包含序列號和 IMEI。

## 網絡與接入邊界

- 帳號登錄使用小米網頁流程。登錄視窗不能訪問本地應用 IPC，導航和認證重定向限制在小米 HTTPS 域名。
- App 更新來自本項目的 GitHub Releases；替換前驗證架構、下載摘要與解壓後的應用。
- AI 接入向回環地址發送生命週期事件和派生的會話標識，不轉發提示詞、工具參數或對話。
- 接收器綁定 `127.0.0.1:10731`，限制請求大小並拒絕瀏覽器來源寫入；它不能隔離同一台 Mac 上的其他程序。
- 憑據通過繼承的管道傳給本地 worker，不放入命令行或環境變量。原始上游日誌已關閉。
- App 不包含分析或遙測服務。

當前安裝包使用 ad-hoc 簽名，未經 Apple 公證。請從[官方儲存庫 Releases](https://github.com/JamesGZM/miband-agent-buddy/releases)下載。校驗和只能驗證下載完整性，不能證明 Apple 公證。

## 安全分享診斷

可分享 App/macOS 版本、手環型號與韌體、重現步驟和脫敏錯誤資訊。上傳截圖前移除帳號、藍牙地址、序列號與私密項目名稱。測試與漏洞演示使用合成數據。

不要在公開 Issue 或 PR 中上傳應用數據目錄、認證文件、原始藍牙流量及未經脫敏的 AI 對話。
