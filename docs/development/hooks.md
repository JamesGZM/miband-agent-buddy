# Local AI Hooks

Give an AI working in your project the [Buddy Hooks skill](../../skills/buddy-hooks/SKILL.md), or copy this public link:

`https://github.com/JamesGZM/miband-agent-buddy/blob/main/skills/buddy-hooks/SKILL.md`

Ask it to connect **this project** to the running macOS Buddy app. This repository contains the reusable instructions; installing a skill by itself does not install or activate lifecycle hooks.

## Supported routes

| Host | Integration | Configuration |
| --- | --- | --- |
| Codex local coding sessions | Native lifecycle command hooks | Project `.codex/hooks.json`; user `$CODEX_HOME/hooks.json` or `~/.codex/hooks.json` |
| Claude Code, including a local project in desktop Code | Native lifecycle command hooks | Project `.claude/settings.local.json`; user `~/.claude/settings.json` |
| DeepSeek or another custom harness | Explicit lifecycle callbacks invoke the generic sender | Add to the actual harness; no invented model-specific settings file |
| Ordinary ChatGPT / Claude desktop Chat | No automatic integration claimed | A local host with supported lifecycle callbacks is required |

The installer supports `codex` and `claude-code`. Configuration is a local merge, not an agent-permission grant. Codex requires review and trust of non-managed hooks; project trust is also required. Managed policies can prevent local hooks from running. After setup, inspect `/hooks` and start a new session. See the official [Codex discovery and trust rules](https://learn.chatgpt.com/docs/hooks) and [Claude Code configuration](https://code.claude.com/docs/en/hooks).

## Setup and removal

Run from the Buddy checkout, replacing the example target with an existing absolute project path:

```sh
node scripts/install_agent_hooks.mjs codex --scope project --project-root /absolute/project --dry-run --json
node scripts/install_agent_hooks.mjs codex --scope project --project-root /absolute/project --json
node scripts/install_agent_hooks.mjs codex --scope project --project-root /absolute/project --status --json
node scripts/install_agent_hooks.mjs codex --scope project --project-root /absolute/project --uninstall --json
```

Use `claude-code` for Claude. Omit scope/root for explicit user-wide setup. Existing `npm run hooks:install` remains the user-wide Codex entrypoint and forwards flags to the same installer. Installation is idempotent for the same Node and checkout paths. Existing configs are backed up outside the project under `~/Library/Application Support/io.github.jamesgzm.miband-agent-buddy/hook-backups` (directory `0700`, files `0600`) and updated atomically. Invalid JSON, linked config files/directories and malformed hook groups are left untouched. Removal keeps unrelated settings and hook commands; old whole-file backups should not overwrite later changes.

Keep one effective Buddy scope. Project installation checks known user, ancestor and project-shared definitions. When another scope contains Buddy commands, it returns `blocked: true`, `reason: "existing_scope"` and `conflictingPaths` without installing into the selected project. `installed` continues to describe only that selected file. Review which scope the host loads and trusts, then remove the previous Buddy entries if switching scope. Custom wrapper commands and plugin-bundled hooks still require manual inspection in `/hooks`; detection is not proof that a host has loaded a config.

An exclusive `.buddy-lock` serializes Buddy updates to one config. A competing update fails with a retry message. If a process crashes and leaves the empty lock, confirm no installer is running before removing that exact lock. External editors do not honor the lock; avoid editing the same config during installation. The installer checks again before replacement but cannot guarantee exclusion of unrelated applications.

`--status` returns installed definition counts only. Runtime `agent.eventCount` and `lastEventAt` show actual delivery. An ACK confirms software reception, not physical illumination. Moving the source checkout or Node executable invalidates installed absolute commands; reinstall and remove the previous commands.

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
