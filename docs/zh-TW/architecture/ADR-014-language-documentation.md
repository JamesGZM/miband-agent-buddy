# ADR-014: 按語言組織文件

[English](../../en/architecture/ADR-014-language-documentation.md) · [简体中文](../../zh-CN/architecture/ADR-014-language-documentation.md) · **繁體中文**

## 問題

同層翻譯讓根目錄擁擠，各指南目錄也混雜三種語言。

## 決定

根目錄僅保留 README.md；其他語言首頁放 docs/readme。指南在 docs/en、docs/zh-CN、docs/zh-TW 使用一致路徑，各有使用者與開發者入口。圖片和原始授權文本共用；英文專案政策、更新紀錄、第三方聲明保留 GitHub 與打包所需的根入口。現行架構為 docs/en/architecture/README.md 及對應翻譯。只保留既有英文架構轉接頁，更新專案內連結。

## 替代方案

刪除翻譯會降低可存取性；只移動 README 無法整理指南；為每個舊翻譯路徑保留轉接會重現擁擠。

## 相容性

使用者明確授權文件搬移，舊語言 README 和已搬移指南 URL 不再有檔案。docs/architecture/README.md、docs/ARCHITECTURE.md、docs/open-source/ARCHITECTURE.md 仍指向現行架構。執行邏輯、npm 命令、授權文本和可執行技能入口不變。

## 證據

文件契約檢查根目錄唯一 README、語言切換、目前語言導覽、Markdown/HTML 圖片連結、錨點和相同可執行範例。展示圖使用實際前端與共用幾何，資料為示例，不是裝置實拍。
