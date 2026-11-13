# Local AI integration

**English** · [简体中文](../../zh-CN/development/hooks.md) · [繁體中文](../../zh-TW/development/hooks.md)

## Bundled CLI

For new integrations, copy the generic request from the installed App's **AI integration** page. It copies the complete integration guide and identifies MiBand Agent Buddy by application name/identity, without document links or installation paths. The setup AI resolves the verified installed application through the host or OS application registry, never by guessing or scanning the home directory. The setup AI independently chooses verified host lifecycle triggers that invoke the bundled CLI; users do not select a model/platform. Buddy bundles Node and all integration source, so no checkout, npm or external runtime is required. Never scan the home directory to discover a checkout.

New setup requests user-wide automatic reporting across local projects, new main conversations and later turns. The mechanism is host-dependent; Hooks are one option, not a prerequisite. Do not silently substitute project scope or finish after a CLI test. Complete feasible persistent configuration, then distinguish native activation and real different-project/later-turn verification from transport readiness. A minimal adapter may translate metadata when necessary, but do not build another installer by default or depend on the setup project or another App's private runtime. Prefer supported background observation with bounded, ordered delivery; 300ms bounds ingress only, not the full callback. Required synchronous handlers keep minimal bounded acceptance/handoff and preserve native behavior.

The desktop executable accepts `--buddy-cli guide`, `--buddy-cli status`, `--buddy-cli report` before desktop startup. The [bundled guide](../../../services/runtime/integration-guide.md) defines the shared anonymous source/session/run/seq/state contract. CLI submits to one existing runtime. Its loopback ingress is private implementation detail, not another public integration API.

Local ingress has a 300ms deadline. Hosts bound command launch and serialize each conversation; independent conversations may invoke CLI concurrently without unbounded process queues. Client scheduling/startup adds latency. No path waits for Bluetooth or band ACK. Failure must not block original work or trigger repeated retries. Per-conversation watermarks reject delayed runs, duplicate sequences and reopening terminal runs. Source identities isolate concurrent clients; generic watermarks are bounded to 128 until reset/restart. Native Hooks and generic reporting must not double-count the same conversation. Model-only reporting may miss cancellation; configure only question reminders with real resolution signals. See [ADR-016](../architecture/ADR-016-bundled-integration.md).

The remaining sections document legacy event senders retained for existing configurations. New setup follows the bundled guide; no platform-specific source installer remains.

## Needs-user reminder selection

`PermissionRequest` is Buddy's normalized **needs user** reminder: the whole outer ring turns yellow, even with multiple tasks. It does not answer or authorize anything. Resumption restores the ordinary task palette and retains host task counts. No extra icon or question text is shown.

The setup agent chooses optional question integration from the host's real capabilities; copying the guide alone does not make all AI questions observable. Native Codex/Claude `PermissionRequest` is for approvals. Cursor's existing adapter reports activity but establishes no dedicated permission/question callback. Do not invent event names or tool matchers, inspect transcripts, or require the model to remember manual notifications each turn.

| Route | Requirement and clearing rule |
| --- | --- |
| Native approval | Keep the actual `PermissionRequest` hook; normal same-session resumption or terminal events replace attention. Buddy emits no permission decision. |
| Optional blocking question | Verify a real start and answer/cancel lifecycle, and that the session cannot emit unrelated activity while waiting. Reuse the same provider/session identity and existing reminder/resumption events. |
| Optional nonblocking question | A tool returning is submission, not an answer. The current event-only adapter cannot hold a separate pending question through later activity. Leave mapping disabled unless the harness owns pending-request aggregation, real resolution/cancel/invalidation callbacks, and serialized normalized reporting until the last request closes. |
| No reliable lifecycle | Keep activity reporting and explicitly report question reminders as unsupported/unverified. |

## Supported routes

| Host | Integration | Configuration |
| --- | --- | --- |
| Codex local coding sessions | Native lifecycle command hooks | Project `.codex/hooks.json`; user `$CODEX_HOME/hooks.json` or `~/.codex/hooks.json` |
| Claude Code, including a local project in desktop Code | Native lifecycle command hooks | Project `.claude/settings.local.json`; user `~/.claude/settings.json` |
| DeepSeek or another custom harness | Explicit lifecycle callbacks invoke the generic sender | Add to the actual harness; no invented model-specific settings file |
| Ordinary ChatGPT / Claude desktop Chat | No automatic integration claimed | A local host with supported lifecycle callbacks is required |

Existing adapter configuration is managed by the actual host or setup AI, not a repository installer. Codex requires native review/trust and project trust where applicable; inspect the loaded settings source and verify real callbacks. See the official [Codex Hooks](https://learn.chatgpt.com/docs/hooks) and [Claude Code Hooks](https://code.claude.com/docs/en/hooks).

## Source compatibility command

The checkout-specific Codex/Claude installers have been retired. New setup uses the App's full setup instructions and lets the setup AI establish a verified lifecycle trigger with bundled CLI delivery.

The existing npm command is retained as a read-only guide alias:

```sh
npm run hooks:install
```

It prints the bundled integration guide. It does not install, upgrade, remove or grant trust to any host Hooks; old provider/scope/uninstall flags are unsupported. For an existing configuration, inspect the actual host settings and remove only the previous Buddy entries with a private backup, preserving other hooks and later edits. Never restore an old whole-file backup over current settings. Host trust/loading and real automatic events must be verified separately from configuration.

## Generic harness sender

These synthetic commands demonstrate one task's lifecycle; use a distinct stable non-secret ID for each real task:

```sh
node services/runtime/bin/agent-hook.mjs deepseek UserPromptSubmit --session example-task-1
node services/runtime/bin/agent-hook.mjs deepseek PreToolUse --session example-task-1
node services/runtime/bin/agent-hook.mjs deepseek PostToolUse --session example-task-1
node services/runtime/bin/agent-hook.mjs deepseek Stop --session example-task-1
```

The sender also accepts JSON on stdin with `hook_event_name` and `session_id`. Claude Code uses that form automatically. `custom`, `chatgpt` and `claude-desktop` are available namespaces for a custom local adapter; they do not install native support in those applications. Prefer `codex` configuration for a host that actually uses Codex hooks, and `claude-code` for Claude Code.

| Event | Display state |
| --- | --- |
| `SessionStart`, `Interrupt`, `SessionEnd` | Idle / cancelled |
| `UserPromptSubmit`, `PostToolUse` | Thinking |
| `PreToolUse` | Working |
| `PermissionRequest` | Needs user |
| `Stop` | Completed briefly, then idle |

Claude's `PostToolUseFailure` maps back to thinking; `StopFailure` maps to interrupted so a failed turn is not shown as success. Unsupported events are ignored by the fail-open client. Events carrying a Claude `agent_id` are ignored: this integration reports main conversations, not subagents or teammates. Main-agent completion does not establish whether background tools or child agents have finished; their work is not counted independently. Arbitrary user-input waits and parallel tools within one session are not inferred.

Claude's native `Stop` does not fire on a user interrupt. If cancellation leaves activity visible, use **Settings → Clear activity** to clear all tracked sessions; this does not cancel the actual AI tasks. The next event starts reporting again. Delivery history is preserved so clearing activity does not imply hooks were uninstalled.

## Privacy and multiple agents

Only the canonical event, SHA-256 session identifier and timestamp reach `http://127.0.0.1:10731/api/codex-event`. New providers namespace session IDs before hashing, so identical session strings from two providers stay separate. Existing Codex hashes and compatibility entrypoints are unchanged. Prompts, tool arguments, transcripts and credentials are never forwarded or logged. The receiver rejects browser-origin requests, bounds request size, and stores state only in memory. Delivery failures produce no decision output and exit successfully within a bounded deadline.

Independent main conversations aggregate by urgency: needs user, working, thinking, complete, idle. `agent.activeSessions` counts active tasks; additive `agent.sessionCounts` splits `thinking`, `working` and `attention`. A task finishing or closing cannot clear another active task. Active sessions remain until a terminal event or explicit reset and become stale after 15 minutes without events. Diagnostic `freshActiveSessions` and `staleSessions` split those active tasks by event age; stale status is a warning, not an idle or completion inference, and active display hold continues until terminal/reset. A new event refreshes the session. Thus a legitimate long silent task stays active; a missed terminal event also needs explicit clearing. Disconnect/pause retains the band's bounded watchdog release. The session store retains at most 128 sessions. Always send terminal events from custom harnesses, including on cancellation.

## Nonblocking observation

Native command hooks run in the background where the host supports it. Codex always runs `SessionEnd` synchronously, so every CLI sender first validates and sanitizes input, then launches a detached delivery worker with no inherited pipes and returns without waiting for HTTP. Input has a 150ms watchdog; the worker has a 600ms HTTP timeout and a 1.2s process watchdog. Process startup still has a small cost. Delivery is best effort, with no retries or permission decisions.

Review any legacy handler changes through the host and reload as required. Prefer the current bundled CLI for newly configured callbacks; no repository script upgrades or rewrites host configuration.

Events carry the timestamp captured by the sender before input processing and worker launch. The receiver ignores older events; at equal timestamps a terminal event cannot be replaced by an active event. Independently scheduled host hooks can still start out of order, and session teardown can cancel pending host work. This is an observational display, not a guaranteed event journal. Custom harnesses should enqueue notifications in callback order on their own background queue without awaiting HTTP in the agent execution path.

## Existing local Cursor hooks

An existing Cursor wrapper can call `services/runtime/bin/cursor-hook.mjs`. It maps the installed six events to the same `custom` session namespace, sanitizes before detached delivery, and emits a valid host response even on invalid or open input. `beforeSubmitPrompt` returns `continue: true`; `preToolUse` returns `permission: "allow"` so Buddy adds no veto. Other security hooks and Cursor permissions remain owned by the host. No follow-up prompt is emitted. Cursor does not document a native `async` field here; do not copy Codex configuration fields into Cursor. This adapter is for an already configured local command; new setup follows the bundled guide. See the official [Cursor Hooks reference](https://cursor.com/docs/hooks).
