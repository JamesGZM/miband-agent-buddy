# 獨立更新服務

[English](../../en/development/updates.md) · [简体中文](../../zh-CN/development/updates.md) · **繁體中文**

桌面先檢查 `https://buddy-updates.ailaogong.men/buddy/releases/latest`，逾時、HTTP 失敗或元資料無效時直連 GitHub 官方 API。有效快取允許延遲十分鐘。服務是新增的可信元資料中間層，並非發佈簽名機構；它同時提供元資料與摘要，服務被入侵屬於信任邊界內的風險。

更新器從準確的官方版本和架構資產推導 Worker 下載地址，串流寫入私有暫存歸檔，大小和 SHA-256 全部匹配才解壓。Worker 下載失敗、不完整或損壞時，從零開始直連固定 GitHub URL 下載。儲存失敗立即停止。兩條路徑均保留歸檔、包標識與版本、架構和簽名檢查；替換及回滾不變。

獨立 Worker 位於 `services/update-worker`，自訂域名在 `wrangler.toml` 設定。僅支援固定最新發佈路由及穩定 Mac ZIP／DMG／校驗文件路由，不代理任意來源。有效元資料快取 600 秒，成功資產回應快取 3600 秒，錯誤不快取。安裝包串流傳輸，不在 JavaScript 中完整緩衝或複製。支援 HEAD 與單段 Range，不發送帳戶、設備或 Hook 資料。

透過本儲存庫 `main` 分支的手動 `Deploy update Worker` 工作流部署，先添加 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` 為本儲存庫 Actions secrets。工作流測試並使用獨立設定部署檢出的提交。不要將密鑰值複製進本儲存庫。憑據需要 Worker 部署及該區域自訂域名／DNS 權限。部署不得改變現有索引 Worker。上線後驗證自訂域名與真實安裝包，dry run 不能證明這兩項。

安裝與信任邊界見 [ADR-006](../architecture/ADR-006-desktop-updates.md)。

部署：[GitHub Actions](https://github.com/JamesGZM/miband-agent-buddy/actions/workflows/update-worker.yml).

首次建立需要帳戶／Workers 產品範圍的 Workers Admin；建立後收窄為 Workers Editor。域名綁定使用僅限 `ailaogong.men` 的 Workers Routes Write 與 Zone Read，Account Settings Read 用於帳戶識別。不需要 KV、R2 或 Pages 權限。
