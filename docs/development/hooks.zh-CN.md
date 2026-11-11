# 本地 AI Hooks

[English](hooks.md) · **简体中文** · [繁體中文](hooks.zh-TW.md)

把 [Buddy Hooks skill 原文](../../skills/buddy-hooks/SKILL.md) 提供给项目中的 AI，或复制公开链接：

`https://github.com/JamesGZM/miband-agent-buddy/blob/main/skills/buddy-hooks/SKILL.md`

请它将**当前项目**连接到正在运行的 macOS Buddy App。仓库提供可复用指引，安装 skill 本身不会安装或启用生命周期 Hooks。

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
