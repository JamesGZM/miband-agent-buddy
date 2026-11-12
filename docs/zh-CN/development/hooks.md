# 本地 AI Hooks

[English](../../en/development/hooks.md) · **简体中文** · [繁體中文](../../zh-TW/development/hooks.md)

把 [Buddy Hooks skill 原文](../../../skills/buddy-hooks/SKILL.md) 提供给项目中的 AI，或复制公开链接：

`https://github.com/JamesGZM/miband-agent-buddy/blob/main/skills/buddy-hooks/SKILL.md`

请它将**当前项目**连接到正在运行的 Buddy 桌面 App。仓库提供可复用指引，安装 skill 本身不会安装或启用生命周期 Hooks。

## 选择需要用户的提醒

`PermissionRequest` 在 Buddy 中统一表示**需要用户介入**：即使有多个任务，外圈也整圈变黄。它不代答、不授权；恢复执行后还原任务配色，主机任务计数保留。不增加问号、图标或问题文字。

由安装 Agent 根据宿主的真实能力选择可选的提问接入。Codex/Claude 原生 `PermissionRequest` 对应授权提示，不等于全部 AI 提问；现有 Cursor 适配器只确认活动上报，未建立专用授权/提问回调。不要虚构事件名或工具匹配器、读取对话记录，或要求工作中的模型每轮记住手工上报。

| 方式 | 接入与解除条件 |
| --- | --- |
| 原生授权 | 保留真实 `PermissionRequest`；同会话恢复活动或终止事件替换提醒。Buddy 不输出授权决定。 |
| 可选阻塞提问 | 验证真实开始与回答/取消信号，并确认等待时同会话不会产生无关活动。复用同一 provider/session 身份及现有提醒/恢复事件。 |
| 可选非阻塞提问 | 工具返回只代表问题提交，不代表回答。当前事件型适配器不能在后续活动中独立保留待答问题。除非 harness 自己聚合待答请求、提供真实回答/取消/失效回调，并串行上报归一化状态直到最后一个问题关闭，否则不启用此映射。 |
| 缺少可靠生命周期 | 保留活动上报，明确注明提问提醒未支持或未验证。 |

安装后分别报告原生授权、阻塞提问、非阻塞提问能力及解除方式。用隔离接收器验证重复开始、回答、取消和并发会话；配置存在不代表宿主已触发或物理屏幕已验证。详见 [安装 Skill](../../../skills/buddy-hooks/SKILL.md#select-needs-user-reminders)。

## 支持的方式

| 工具 | 接入 | 配置 |
| --- | --- | --- |
| Codex 本地编码会话 | 原生生命周期命令 Hooks | 项目 `.codex/hooks.json`；用户 `$CODEX_HOME/hooks.json` 或 `~/.codex/hooks.json` |
| Claude Code，含桌面 Code 中的本地项目 | 原生生命周期命令 Hooks | 项目 `.claude/settings.local.json`；用户 `~/.claude/settings.json` |
| DeepSeek 或其他自定义 harness | 生命周期回调调用通用发送器 | 接入真实 harness，不虚构模型专属设置文件 |
| 普通 ChatGPT／Claude 桌面聊天 | 不宣称自动接入 | 需要提供受支持生命周期回调的本地工具 |

安装器支持 `codex` 与 `claude-code`，仅合并本地配置，不授予 AI 操作权限。Codex 需要审阅并信任非托管 Hooks，项目本身也需要信任；管理策略可能阻止执行。完成后检查 `/hooks` 并开始新会话。参阅官方 [Codex 发现与信任规则](https://learn.chatgpt.com/docs/hooks)及 [Claude Code 配置](https://code.claude.com/docs/en/hooks)。

## 设置与移除

从 Buddy 仓库运行，将示例目标替换为已有项目的绝对路径：

```sh
node scripts/install_agent_hooks.mjs codex --scope project --project-root /absolute/project --dry-run --json
node scripts/install_agent_hooks.mjs codex --scope project --project-root /absolute/project --json
node scripts/install_agent_hooks.mjs codex --scope project --project-root /absolute/project --status --json
node scripts/install_agent_hooks.mjs codex --scope project --project-root /absolute/project --uninstall --json
```

Claude 使用 `claude-code`。明确要求用户级安装时省略 scope/root。原有 `npm run hooks:install` 保持为用户级 Codex 入口，并转发参数。同一 Node 和 checkout 路径的安装具有幂等性。原配置在项目外的 `~/Library/Application Support/io.github.jamesgzm.miband-agent-buddy/hook-backups` 私密备份，目录权限 `0700`、文件 `0600`，并原子更新。无效 JSON、符号链接文件／目录及错误的 hook 组不修改。移除只清理匹配命令，不覆盖后来改动；不要直接用整份旧备份还原。

保持单一有效 Buddy scope。项目安装会检查用户级、祖先及项目共享配置。其他 scope 已有 Buddy 命令时，返回 `blocked: true`、`reason: "existing_scope"` 与 `conflictingPaths`，不安装目标配置。`installed` 只描述选定文件。先确认工具实际加载及信任的 scope，再移除旧条目。自定义 wrapper 与插件 Hooks 仍需在 `/hooks` 人工检查；检测到配置不代表已加载。

独占 `.buddy-lock` 串行化同一配置的 Buddy 更新，冲突时返回重试信息。进程崩溃留下空锁时，先确认安装器已停止再移除该锁。外部编辑器不遵守此锁；安装时避免编辑同一配置。替换前会再次检查，但不能保证排除其他应用的并发修改。

`--status` 只返回配置定义数；实际送达看运行时 `agent.eventCount` 与 `lastEventAt`。ACK 确认软件接收，不证明物理亮屏。移动源码或 Node 会使绝对命令失效，需要重新安装并移除旧命令。

## 通用 harness 发送器

以下合成示例展示一个任务的生命周期；真实任务使用独立、稳定、非敏感的 ID：

```sh
node services/runtime/bin/agent-hook.mjs deepseek UserPromptSubmit --session example-task-1
node services/runtime/bin/agent-hook.mjs deepseek PreToolUse --session example-task-1
node services/runtime/bin/agent-hook.mjs deepseek PostToolUse --session example-task-1
node services/runtime/bin/agent-hook.mjs deepseek Stop --session example-task-1
```

发送器也接受 stdin JSON 中的 `hook_event_name` 与 `session_id`，Claude Code 自动使用这种形式。`custom`、`chatgpt`、`claude-desktop` 是自定义适配器可用的命名空间，不代表这些应用有原生支持。实际使用 Codex Hooks 的工具选 `codex`，Claude Code 选 `claude-code`。

| 事件 | 显示状态 |
| --- | --- |
| `SessionStart`、`Interrupt`、`SessionEnd` | 空闲／取消 |
| `UserPromptSubmit`、`PostToolUse` | 思考 |
| `PreToolUse` | 执行 |
| `PermissionRequest` | 等待用户 |
| `Stop` | 短暂完成后转为空闲 |

Claude 的 `PostToolUseFailure` 回到思考，`StopFailure` 映射为中断，避免将失败显示为成功。不支持的事件由 fail-open 客户端忽略。带 Claude `agent_id` 的事件被忽略，本接入报告主会话，不独立统计子代理或团队任务；主任务结束也不能证明后台工具已完成。不会推断任意等待输入或一个会话内并行工具的数量。

Claude 原生 `Stop` 不在用户中断时触发。取消后仍显示活动可用**设置 → 重置任务显示**清除观察状态，不会取消真实 AI 任务；下一个事件会重新开始。历史送达计数保留，重置不代表 Hooks 卸载。

## 隐私与多任务

只有标准事件、SHA-256 会话标识与时间戳发送到 `http://127.0.0.1:10731/api/codex-event`。新 provider 在哈希前添加命名空间，避免相同会话字符串冲突。旧 Codex 哈希与兼容入口不变。提示词、工具参数、对话和凭据从不转发或记录。接收器拒绝浏览器来源写入、限制请求大小，状态仅保存在内存中；发送失败在有界时间内成功退出，不输出权限决定。

独立主会话按等待用户、执行、思考、完成、空闲的优先级聚合。`agent.activeSessions` 统计活动任务；可加字段 `agent.sessionCounts` 分为 `thinking`、`working`、`attention`。一个任务结束不能清除另一个。活动会话在终止事件或手动重置前保留，15 分钟无事件后显示过期警告；`freshActiveSessions`、`staleSessions` 用于诊断。过期不代表空闲，开启任务亮屏后仍续期，所以长时间安静任务可保持活动；遗漏结束事件则需手动清除。新事件会刷新会话。断线或暂停仍由手环本地看门狗释放。最多保留 128 个会话。自定义接入必须在完成、失败与取消时发送终止事件。

## 非阻塞观察

支持后台命令的宿主使用异步 Hooks。Codex 的 `SessionEnd` 始终同步，因此每个 CLI 发送入口先校验、脱敏，再启动不继承管道的独立发送进程，不等待 HTTP。输入看门狗为 150ms；发送进程的 HTTP 超时为 600ms，进程看门狗为 1.2 秒。进程启动仍有少量开销。通知采用尽力送达，不重试、不输出权限决定。

在相同作用域重新运行安装器可升级已有 Buddy 配置：仅更新其 `async`、`timeout`，保留其他 Hooks 和设置，替换前生成私有备份。`--status --json` 的 `needsUpgrade` 标记旧配置。通过 `/hooks` 检查变更并重新开启宿主会话。

事件时间戳在发送入口读取输入、启动后台进程之前生成。接收器忽略更早的事件，同一毫秒内终止事件不会被活动事件覆盖。宿主独立调度仍可能导致入口乱序启动，会话退出也可能取消未启动的通知，因此这不是保证送达的事件日志。自定义 harness 应按回调顺序将通知加入自己的后台队列，不在 agent 执行路径等待 HTTP。

## 已有本机 Cursor Hooks

已有 Cursor 包装脚本可调用 `services/runtime/bin/cursor-hook.mjs`。它将原有六个事件映射到相同的 `custom` 会话命名空间，先脱敏再后台发送，即使输入错误或不结束也会输出有效宿主响应。`beforeSubmitPrompt` 返回 `continue: true`；`preToolUse` 返回 `permission: "allow"`，表示 Buddy 自身不阻止操作；其他安全 Hooks 与 Cursor 权限仍由宿主管理。不输出后续提示词。Cursor 此处未记录原生 `async` 字段，不应直接复制 Codex 配置字段。本适配器用于已配置的本机命令，安装器仍只管理 Codex 和 Claude Code。参见 [Cursor 官方 Hooks 文档](https://cursor.com/docs/hooks)。
