# 本地 AI Hooks

[English](../../en/development/hooks.md) · [简体中文](../../zh-CN/development/hooks.md) · **繁體中文**

把 [Buddy Hooks skill 原文](../../../skills/buddy-hooks/SKILL.md) 提供給項目中的 AI，或複製公開連結：

`https://github.com/JamesGZM/miband-agent-buddy/blob/main/skills/buddy-hooks/SKILL.md`

請它將**當前項目**連線到正在執行的 macOS Buddy App。儲存庫提供可復用指引，安裝 skill 本身不會安裝或啟用生命週期 Hooks。

## 支援的方式

| 工具 | 接入 | 配置 |
| --- | --- | --- |
| Codex 本地編碼會話 | 原生生命週期命令 Hooks | 項目 `.codex/hooks.json`；用戶 `$CODEX_HOME/hooks.json` 或 `~/.codex/hooks.json` |
| Claude Code，含桌面 Code 中的本地項目 | 原生生命週期命令 Hooks | 項目 `.claude/settings.local.json`；用戶 `~/.claude/settings.json` |
| DeepSeek 或其他自定義 harness | 生命週期回調調用通用發送器 | 接入真實 harness，不虛構模型專屬設定文件 |
| 普通 ChatGPT／Claude 桌面聊天 | 不宣稱自動接入 | 需要提供受支援生命週期回調的本地工具 |

安裝器支援 `codex` 與 `claude-code`，僅合併本地配置，不授予 AI 操作權限。Codex 需要審閱並信任非托管 Hooks，項目本身也需要信任；管理策略可能阻止執行。完成後檢查 `/hooks` 並開始新會話。參閱官方 [Codex 發現與信任規則](https://learn.chatgpt.com/docs/hooks)及 [Claude Code 配置](https://code.claude.com/docs/en/hooks)。

## 設定與移除

從 Buddy 儲存庫執行，將示例目標替換為已有項目的絕對路徑：

```sh
node scripts/install_agent_hooks.mjs codex --scope project --project-root /absolute/project --dry-run --json
node scripts/install_agent_hooks.mjs codex --scope project --project-root /absolute/project --json
node scripts/install_agent_hooks.mjs codex --scope project --project-root /absolute/project --status --json
node scripts/install_agent_hooks.mjs codex --scope project --project-root /absolute/project --uninstall --json
```

Claude 使用 `claude-code`。明確要求用戶級安裝時省略 scope/root。原有 `npm run hooks:install` 保持為用戶級 Codex 入口，並轉發參數。同一 Node 和 checkout 路徑的安裝具有冪等性。原配置在項目外的 `~/Library/Application Support/io.github.jamesgzm.miband-agent-buddy/hook-backups` 私密備份，目錄權限 `0700`、文件 `0600`，並原子更新。無效 JSON、符號連結文件／目錄及錯誤的 hook 組不修改。移除只清理匹配命令，不覆蓋後來改動；不要直接用整份舊備份還原。

保持單一有效 Buddy scope。項目安裝會檢查用戶級、祖先及項目共享配置。其他 scope 已有 Buddy 命令時，返回 `blocked: true`、`reason: "existing_scope"` 與 `conflictingPaths`，不安裝目標配置。`installed` 只描述選定文件。先確認工具實際加載及信任的 scope，再移除舊條目。自定義 wrapper 與插件 Hooks 仍需在 `/hooks` 人工檢查；檢測到配置不代表已加載。

獨佔 `.buddy-lock` 串行化同一配置的 Buddy 更新，衝突時返回重試資訊。程序崩潰留下空鎖時，先確認安裝器已停止再移除該鎖。外部編輯器不遵守此鎖；安裝時避免編輯同一配置。替換前會再次檢查，但不能保證排除其他應用的併發修改。

`--status` 只返回配置定義數；實際送達看執行時 `agent.eventCount` 與 `lastEventAt`。ACK 確認軟體接收，不證明物理亮屏。移動原始碼或 Node 會使絕對命令失效，需要重新安裝並移除舊命令。

## 通用 harness 發送器

以下合成示例展示一個任務的生命週期；真實任務使用獨立、穩定、非敏感的 ID：

```sh
node services/runtime/bin/agent-hook.mjs deepseek UserPromptSubmit --session example-task-1
node services/runtime/bin/agent-hook.mjs deepseek PreToolUse --session example-task-1
node services/runtime/bin/agent-hook.mjs deepseek PostToolUse --session example-task-1
node services/runtime/bin/agent-hook.mjs deepseek Stop --session example-task-1
```

發送器也接受 stdin JSON 中的 `hook_event_name` 與 `session_id`，Claude Code 自動使用這種形式。`custom`、`chatgpt`、`claude-desktop` 是自定義適配器可用的命名空間，不代表這些應用有原生支援。實際使用 Codex Hooks 的工具選 `codex`，Claude Code 選 `claude-code`。

| 事件 | 顯示狀態 |
| --- | --- |
| `SessionStart`、`Interrupt`、`SessionEnd` | 空閒／取消 |
| `UserPromptSubmit`、`PostToolUse` | 思考 |
| `PreToolUse` | 執行 |
| `PermissionRequest` | 等待用戶 |
| `Stop` | 短暫完成後轉為空閒 |

Claude 的 `PostToolUseFailure` 回到思考，`StopFailure` 映射為中斷，避免將失敗顯示為成功。不支援的事件由 fail-open 客戶端忽略。帶 Claude `agent_id` 的事件被忽略，本接入報告主會話，不獨立統計子代理或團隊任務；主任務結束也不能證明背景工具已完成。不會推斷任意等待輸入或一個會話內並行工具的數量。

Claude 原生 `Stop` 不在用戶中斷時觸發。取消後仍顯示活動可用**設定 → 重置任務顯示**清除觀察狀態，不會取消真實 AI 任務；下一個事件會重新開始。歷史送達計數保留，重置不代表 Hooks 卸載。

## 隱私與多任務

只有標準事件、SHA-256 會話標識與時間戳發送到 `http://127.0.0.1:10731/api/codex-event`。新 provider 在哈希前添加命名空間，避免相同會話字符串衝突。舊 Codex 哈希與相容入口不變。提示詞、工具參數、對話和憑據從不轉發或記錄。接收器拒絕瀏覽器來源寫入、限制請求大小，狀態僅保存在記憶體中；發送失敗在有界時間內成功退出，不輸出權限決定。

獨立主會話按等待用戶、執行、思考、完成、空閒的優先級聚合。`agent.activeSessions` 統計活動任務；可加字段 `agent.sessionCounts` 分為 `thinking`、`working`、`attention`。一個任務結束不能清除另一個。活動會話在終止事件或手動重置前保留，15 分鐘無事件後顯示過期警告；`freshActiveSessions`、`staleSessions` 用於診斷。過期不代表空閒，開啟任務亮屏後仍續期，所以長時間安靜任務可保持活動；遺漏結束事件則需手動清除。新事件會刷新會話。斷線或暫停仍由手環本地看門狗釋放。最多保留 128 個會話。自定義接入必須在完成、失敗與取消時發送終止事件。

## 非阻塞觀察

支援背景命令的宿主使用非同步 Hooks。Codex 的 `SessionEnd` 一律同步，因此每個 CLI 發送入口先驗證、去除私密內容，再啟動不繼承管道的獨立發送程序，不等待 HTTP。輸入看門狗為 150ms；發送程序的 HTTP 逾時為 600ms，程序看門狗為 1.2 秒。程序啟動仍有少量開銷。通知採盡力送達，不重試、不輸出權限決定。

在相同作用域重新執行安裝器可升級既有 Buddy 設定：僅更新其 `async`、`timeout`，保留其他 Hooks 與設定，替換前產生私有備份。`--status --json` 的 `needsUpgrade` 標記舊設定。透過 `/hooks` 檢查變更並重新開啟宿主會話。

事件時間戳在發送入口讀取輸入、啟動背景程序之前產生。接收器忽略較早的事件，同一毫秒內終止事件不會被活動事件覆蓋。宿主獨立排程仍可能導致入口亂序啟動，會話退出也可能取消未啟動的通知，因此這不是保證送達的事件日誌。自訂 harness 應按回調順序將通知加入自己的背景佇列，不在 agent 執行路徑等待 HTTP。

## 既有本機 Cursor Hooks

既有 Cursor 包裝腳本可呼叫 `services/runtime/bin/cursor-hook.mjs`。它將原有六個事件映射到相同的 `custom` 會話命名空間，先去除私密內容再背景發送，即使輸入錯誤或不結束也會輸出有效宿主回應。`beforeSubmitPrompt` 回傳 `continue: true`；`preToolUse` 回傳 `permission: "allow"`，表示 Buddy 自身不阻止操作；其他安全 Hooks 與 Cursor 權限仍由宿主管理。不輸出後續提示詞。Cursor 此處未記錄原生 `async` 欄位，不應直接複製 Codex 設定欄位。本轉接程式用於已設定的本機命令，安裝器仍只管理 Codex 和 Claude Code。參見 [Cursor 官方 Hooks 文件](https://cursor.com/docs/hooks)。
