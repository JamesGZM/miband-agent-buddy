# 本地 AI 接入

[English](../../en/development/hooks.md) · **简体中文** · [繁體中文](../../zh-TW/development/hooks.md)

## 内置 CLI

新接入请从已安装 App 的 **AI 接入**页复制通用指令，其中直接附上完整接入说明与 MiBand Agent Buddy 应用身份，不附文档链接或安装路径。由接入 AI 通过宿主或操作系统的应用注册信息确认入口，不猜测目录或扫描家目录。接入 AI 检查宿主能力，分别选择已验证的生命周期触发器并通过内置 CLI 投递，用户无需选择模型或平台。Buddy 内置 Node 和接入代码，不需要 checkout、npm 或额外运行环境；不要扫描家目录寻找源码。

新接入默认要求用户全局自动上报，覆盖本地不同项目、新主对话及后续轮次。触发机制由宿主能力决定，Hooks 只是选项，不是前提。不得自行降级为项目级配置或测通 CLI 后结束；先完成本轮可做的持久设置，再分别报告宿主启用、跨项目新对话和后续轮次的真实验证状态。必要时可以有最小元数据适配器，但不默认另造安装器，不依赖接入项目或其他 App 的私有执行环境。优先使用宿主支持的后台观察机制，保持有界、有序投递；300ms 仅限制接收入口，不是完整回调时延。必须同步的处理器只做最小有界接收或交接，保持宿主原生行为。

桌面程序在启动界面前处理 `--buddy-cli guide`、`--buddy-cli status`、`--buddy-cli report`。[内置指南](../../../services/runtime/integration-guide.md) 定义匿名 source/session/run/seq/state 合约。CLI 向唯一已运行的 runtime 提交。内部 loopback 入口是实现细节，不是另一套对外 API。

本机提交时限 300ms；宿主限制命令启动并按对话串行化，独立对话可并发调用 CLI，不建立无界进程队列。客户端调度和启动另有延迟。均不等待蓝牙或手环 ACK；失败不得阻止原任务或反复重试。每个对话的轮次和顺序水位拒绝迟到、重复和重新打开已结束轮次的事件；来源隔离并行客户端，通用水位最多保留 128 个对话至重设或重启。原生 Hooks 与通用接入不可重复统计同一对话。仅模型上报可能漏报取消；提问提醒必须有真实解除信号。见 [ADR-016](../architecture/ADR-016-bundled-integration.md)。

下文只记录供既有配置使用的旧事件发送器。新接入遵循内置指南，不再提供平台专用源码安装器。

## 选择需要用户的提醒

`PermissionRequest` 在 Buddy 中统一表示**需要用户介入**：即使有多个任务，外圈也整圈变黄。它不代答、不授权；恢复执行后还原任务配色，主机任务计数保留。不增加问号、图标或问题文字。

由安装 Agent 根据宿主的真实能力选择可选的提问接入。Codex/Claude 原生 `PermissionRequest` 对应授权提示，不等于全部 AI 提问；现有 Cursor 适配器只确认活动上报，未建立专用授权/提问回调。不要虚构事件名或工具匹配器、读取对话记录，或要求工作中的模型每轮记住手工上报。

| 方式 | 接入与解除条件 |
| --- | --- |
| 原生授权 | 保留真实 `PermissionRequest`；同会话恢复活动或终止事件替换提醒。Buddy 不输出授权决定。 |
| 可选阻塞提问 | 验证真实开始与回答/取消信号，并确认等待时同会话不会产生无关活动。复用同一 provider/session 身份及现有提醒/恢复事件。 |
| 可选非阻塞提问 | 工具返回只代表问题提交，不代表回答。当前事件型适配器不能在后续活动中独立保留待答问题。除非 harness 自己聚合待答请求、提供真实回答/取消/失效回调，并串行上报归一化状态直到最后一个问题关闭，否则不启用此映射。 |
| 缺少可靠生命周期 | 保留活动上报，明确注明提问提醒未支持或未验证。 |

## 支持的方式

| 工具 | 接入 | 配置 |
| --- | --- | --- |
| Codex 本地编码会话 | 原生生命周期命令 Hooks | 项目 `.codex/hooks.json`；用户 `$CODEX_HOME/hooks.json` 或 `~/.codex/hooks.json` |
| Claude Code，含桌面 Code 中的本地项目 | 原生生命周期命令 Hooks | 项目 `.claude/settings.local.json`；用户 `~/.claude/settings.json` |
| DeepSeek 或其他自定义 harness | 生命周期回调调用通用发送器 | 接入真实 harness，不虚构模型专属设置文件 |
| 普通 ChatGPT／Claude 桌面聊天 | 不宣称自动接入 | 需要提供受支持生命周期回调的本地工具 |

既有适配器配置由实际宿主或接入 AI 管理，不再由仓库安装器写入。Codex 需要宿主审阅/信任及适用的项目信任；应确认实际加载源并验证真实回调。参见官方 [Codex Hooks](https://learn.chatgpt.com/docs/hooks) 与 [Claude Code Hooks](https://code.claude.com/docs/en/hooks)。

## 源码兼容命令

基于 checkout 的 Codex/Claude 安装器已退役。新接入使用 App 的完整接入说明，由接入 AI 建立已验证的生命周期触发器，通过内置 CLI 投递。

保留原 npm 命令作为只读指南入口：

```sh
npm run hooks:install
```

此命令只输出内置接入指南，不安装、升级、移除或信任任何宿主 Hooks；旧 provider/scope/uninstall 参数不再支持。清理既有配置时，检查实际宿主设置，私密备份后只移除旧 Buddy 条目，保留其他 Hooks 和后续修改。不要用整份旧备份覆盖当前设置。配置、宿主加载/信任与真实自动事件必须分别验证。

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

旧处理器变更需在宿主中审阅，并按要求重新加载。新增回调优先使用内置 CLI；仓库不再提供升级或重写宿主配置的脚本。

事件时间戳在发送入口读取输入、启动后台进程之前生成。接收器忽略更早的事件，同一毫秒内终止事件不会被活动事件覆盖。宿主独立调度仍可能导致入口乱序启动，会话退出也可能取消未启动的通知，因此这不是保证送达的事件日志。自定义 harness 应按回调顺序将通知加入自己的后台队列，不在 agent 执行路径等待 HTTP。

## 已有本机 Cursor Hooks

已有 Cursor 包装脚本可调用 `services/runtime/bin/cursor-hook.mjs`。它将原有六个事件映射到相同的 `custom` 会话命名空间，先脱敏再后台发送，即使输入错误或不结束也会输出有效宿主响应。`beforeSubmitPrompt` 返回 `continue: true`；`preToolUse` 返回 `permission: "allow"`，表示 Buddy 自身不阻止操作；其他安全 Hooks 与 Cursor 权限仍由宿主管理。不输出后续提示词。Cursor 此处未记录原生 `async` 字段，不应直接复制 Codex 配置字段。本适配器用于已配置的本机命令，新接入遵循内置指南。参见 [Cursor 官方 Hooks 文档](https://cursor.com/docs/hooks)。
