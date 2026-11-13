# 本機 AI 接入

[English](../../en/development/hooks.md) · [简体中文](../../zh-CN/development/hooks.md) · **繁體中文**

## 內建 CLI

新接入請從已安裝 App 的 **AI 接入**頁複製通用指令，其中直接附上完整接入說明與 MiBand Agent Buddy 應用身分，不附文件連結或安裝路徑。由接入 AI 透過宿主或作業系統的應用登錄確認入口，不猜測目錄或掃描家目錄。接入 AI 檢查宿主能力，分別選擇已驗證的生命週期觸發器並透過內建 CLI 投遞，使用者無需選擇模型或平台。Buddy 內建 Node 和接入程式碼，不需要 checkout、npm 或額外執行環境；不要掃描家目錄尋找原始碼。

新接入預設要求使用者全域自動回報，涵蓋本機不同專案、新主對話及後續輪次。觸發機制由宿主能力決定，Hooks 只是選項，不是前提。不得自行降級為專案級設定或測通 CLI 後結束；先完成本輪可做的持久設定，再分別報告宿主啟用、跨專案新對話和後續輪次的真實驗證狀態。必要時可以有最小中繼資料適配器，但不預設另造安裝器，不依賴接入專案或其他 App 的私有執行環境。優先使用宿主支援的背景觀察機制，保持有界、有序投遞；300ms 僅限制接收入口，不是完整回呼時延。必須同步的處理器只做最小有界接收或交接，保持宿主原生行為。

桌面程式在啟動介面前處理 `--buddy-cli guide`、`--buddy-cli status`、`--buddy-cli report`。[內建指南](../../../services/runtime/integration-guide.md) 定義匿名 source/session/run/seq/state 合約。CLI 向唯一已執行的 runtime 提交。內部 loopback 入口是實作細節，不是另一套對外 API。

本機提交時限 300ms；宿主限制命令啟動並依對話序列化，獨立對話可並行呼叫 CLI，不建立無界程序佇列。客戶端排程和啟動另有延遲。均不等待藍牙或手環 ACK；失敗不得阻止原任務或反覆重試。每個對話的輪次與順序水位拒絕遲到、重複和重新開啟已結束輪次的事件；來源隔離並行客戶端，通用水位最多保留 128 個對話至重設或重新啟動。原生 Hooks 與通用接入不可重複統計同一對話。僅模型回報可能漏報取消；提問提醒必須有真實解除訊號。見 [ADR-016](../architecture/ADR-016-bundled-integration.md)。

下文只記錄供既有設定使用的舊事件發送器。新接入遵循內建指南，不再提供平台專用原始碼安裝器。

## 選擇需要用戶的提醒

`PermissionRequest` 在 Buddy 中統一表示**需要用戶介入**：即使有多個任務，外圈也整圈變黃。它不代答、不授權；恢復執行後還原任務配色，主機任務計數保留。不增加問號、圖示或問題文字。

由安裝 Agent 根據宿主的真實能力選擇可選的提問接入。Codex/Claude 原生 `PermissionRequest` 對應授權提示，不等於全部 AI 提問；現有 Cursor 適配器只確認活動上報，未建立專用授權/提問回調。不要虛構事件名或工具匹配器、讀取對話記錄，或要求工作中的模型每輪記住手工上報。

| 方式 | 接入與解除條件 |
| --- | --- |
| 原生授權 | 保留真實 `PermissionRequest`；同會話恢復活動或終止事件替換提醒。Buddy 不輸出授權決定。 |
| 可選阻塞提問 | 驗證真實開始與回答/取消信號，並確認等待時同會話不會產生無關活動。復用同一 provider/session 身分及現有提醒/恢復事件。 |
| 可選非阻塞提問 | 工具返回只代表問題提交，不代表回答。目前事件型適配器不能在後續活動中獨立保留待答問題。除非 harness 自己聚合待答請求、提供真實回答/取消/失效回調，並串行上報歸一化狀態直到最後一個問題關閉，否則不啟用此映射。 |
| 缺少可靠生命週期 | 保留活動上報，明確註明提問提醒未支援或未驗證。 |

## 支援的方式

| 工具 | 接入 | 配置 |
| --- | --- | --- |
| Codex 本地編碼會話 | 原生生命週期命令 Hooks | 項目 `.codex/hooks.json`；用戶 `$CODEX_HOME/hooks.json` 或 `~/.codex/hooks.json` |
| Claude Code，含桌面 Code 中的本地項目 | 原生生命週期命令 Hooks | 項目 `.claude/settings.local.json`；用戶 `~/.claude/settings.json` |
| DeepSeek 或其他自定義 harness | 生命週期回調調用通用發送器 | 接入真實 harness，不虛構模型專屬設定文件 |
| 普通 ChatGPT／Claude 桌面聊天 | 不宣稱自動接入 | 需要提供受支援生命週期回調的本地工具 |

既有適配器設定由實際宿主或接入 AI 管理，不再由儲存庫安裝器寫入。Codex 需要宿主審閱/信任及適用的專案信任；應確認實際載入來源並驗證真實回調。參見官方 [Codex Hooks](https://learn.chatgpt.com/docs/hooks) 與 [Claude Code Hooks](https://code.claude.com/docs/en/hooks)。

## 原始碼相容命令

基於 checkout 的 Codex/Claude 安裝器已退役。新接入使用 App 的完整接入說明，由接入 AI 建立已驗證的生命週期觸發器，透過內建 CLI 投遞。

保留原 npm 命令作為唯讀指南入口：

```sh
npm run hooks:install
```

此命令只輸出內建接入指南，不安裝、升級、移除或信任任何宿主 Hooks；舊 provider/scope/uninstall 參數不再支援。清理既有設定時，檢查實際宿主設定，私密備份後只移除舊 Buddy 條目，保留其他 Hooks 和後續修改。不要用整份舊備份覆蓋目前設定。設定、宿主載入/信任與真實自動事件必須分別驗證。

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

舊處理器變更需在宿主中審閱，並按要求重新載入。新增回調優先使用內建 CLI；儲存庫不再提供升級或重寫宿主設定的腳本。

事件時間戳在發送入口讀取輸入、啟動背景程序之前產生。接收器忽略較早的事件，同一毫秒內終止事件不會被活動事件覆蓋。宿主獨立排程仍可能導致入口亂序啟動，會話退出也可能取消未啟動的通知，因此這不是保證送達的事件日誌。自訂 harness 應按回調順序將通知加入自己的背景佇列，不在 agent 執行路徑等待 HTTP。

## 既有本機 Cursor Hooks

既有 Cursor 包裝腳本可呼叫 `services/runtime/bin/cursor-hook.mjs`。它將原有六個事件映射到相同的 `custom` 會話命名空間，先去除私密內容再背景發送，即使輸入錯誤或不結束也會輸出有效宿主回應。`beforeSubmitPrompt` 回傳 `continue: true`；`preToolUse` 回傳 `permission: "allow"`，表示 Buddy 自身不阻止操作；其他安全 Hooks 與 Cursor 權限仍由宿主管理。不輸出後續提示詞。Cursor 此處未記錄原生 `async` 欄位，不應直接複製 Codex 設定欄位。本轉接程式用於已設定的本機命令，新接入遵循內建指南。參見 [Cursor 官方 Hooks 文件](https://cursor.com/docs/hooks)。
