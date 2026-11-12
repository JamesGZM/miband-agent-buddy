# ADR-004：項目級本地 AI Hooks

[English](../../en/architecture/ADR-004-local-agent-hooks.md) · [简体中文](../../zh-CN/architecture/ADR-004-local-agent-hooks.md) · **繁體中文**

## 問題

原來的 Codex 專用設定缺少新用戶項目接入引導，不支援 Claude Code 或自定義 harness，也不能清楚表達併發 AI 工作。

## 決策

保留原三字段回環事件與狀態／喚醒策略，在程序邊界適配工具，新 provider 在會話哈希前加命名空間，映射為標準事件。儲存庫 skill 通過安全合併安裝器配置已驗證項目：Codex 為 `.codex/hooks.json`，Claude Code 為 `.claude/settings.local.json`；明確要求時仍可全局安裝。配置存在與真實事件送達分開報告。

安裝器保留無關設定，使用私密備份與原子替換，拒絕錯誤或連結配置，只移除匹配命令。聚合狀態統計思考、執行、等待，不導出會話身份。自定義工具必須明確發送生命週期與終止事件，不能根據模型或產品名推斷普通桌面聊天支援。

## 替代方案

- 直接 HTTP Hooks 可能轉發完整提示詞和工具載荷，本地脫敏命令維持隱私。
- 統一全局配置隱藏項目意圖與 scope，因此 skill 預設項目級。
- provider 元數據有利於來源標籤，但聚合顯示不需要；命名空間哈希隔離會話，無需改變協議。

## 相容

保留 `npm run hooks:install`、`scripts/install_codex_hooks.mjs`、`mac/codex-hook.mjs`、舊 Codex 哈希、地址／header 及事件。客戶端和安裝器有獨立適配測試，核心不導入平台模塊。不增加雲服務、模型 API 或權限決定。

## 證據

官方 [Codex Hooks](https://learn.chatgpt.com/docs/hooks)說明發現與信任；[Claude Code Hooks](https://code.claude.com/docs/en/hooks)說明配置與生命週期載荷。合成測試覆蓋隱私隔離、失敗映射、併發聚合、scope、備份合併移除、冪等及 fail-open。工具實際信任和手環顯示仍需手動驗證。
