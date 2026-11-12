---
name: buddy-hooks
description: Connect an existing local AI project to MiBand Agent Buddy activity using Codex, Claude Code, or a custom harness. Use when asked to install, verify, or remove Buddy Hooks in a project; does not connect ordinary web or desktop chat sessions that lack lifecycle hooks.
---

# Buddy Hooks

Set up local activity reporting for the user's selected project. The Buddy desktop app and band connection must already be running. This skill adds observational hooks; it does not set up model credentials or change agent permissions.

## Choose the actual host

- **Codex / local ChatGPT coding:** use `codex` when the host supports Codex lifecycle hooks. Ordinary ChatGPT chat does not become observable by installing this file.
- **Claude Code / Claude desktop Code tab:** use `claude-code` for a local project that loads Claude Code settings. Do not claim the desktop Chat tab or remote sessions can reach this computer's loopback receiver.
- **Cursor:** inspect its actual Hooks configuration and the existing `services/runtime/bin/cursor-hook.mjs` adapter. Preserve its conversation identity and valid non-veto responses. The installer below does not manage Cursor. Do not invent a `PermissionRequest` event or copy Codex async settings into Cursor.
- **DeepSeek or another harness:** use its real lifecycle callbacks and the generic sender below. The model name alone does not imply a hook configuration format. Inspect the harness before changing it.

Read [the integration guide](../../docs/en/development/hooks.md) for event semantics, removal and limitations. Official configuration references: [Codex Hooks](https://learn.chatgpt.com/docs/hooks), [Claude Code Hooks](https://code.claude.com/docs/en/hooks).

## Install into the selected project

Locate the user's existing MiBand Agent Buddy source checkout and selected target project. Use absolute paths; do not invent a checkout path. If no local checkout is available, explain that this source build needs one and obtain the location before configuring executable commands. Never download and execute an unreviewed script directly from a URL.

The installer lives at `scripts/install_agent_hooks.mjs` in the Buddy checkout. Set `BUDDY_ROOT` and `TARGET_PROJECT` to the verified absolute paths, then run the appropriate provider:

```sh
node "$BUDDY_ROOT/scripts/install_agent_hooks.mjs" codex --scope project --project-root "$TARGET_PROJECT" --dry-run --json
node "$BUDDY_ROOT/scripts/install_agent_hooks.mjs" codex --scope project --project-root "$TARGET_PROJECT" --json
```

Replace `codex` with `claude-code` for Claude Code. Codex writes `<project>/.codex/hooks.json`; Claude Code writes `<project>/.claude/settings.local.json`. The installer merges only Buddy entries and preserves unrelated configuration. Backups stay outside the project in the app's private `hook-backups` directory. Linked project configuration directories are rejected. It embeds the current absolute Node and Buddy paths, so rerun setup after moving the checkout or replacing Node. Reinstalling the same scope also upgrades owned handler `async` and `timeout` fields while preserving unrelated settings. `--status --json` reports `needsUpgrade` for old handlers. Background hooks are observational; Codex `SessionEnd` remains synchronous but its sender does not await HTTP. Do not install globally unless the user requests all projects. Do not add local config to version control.

Keep one effective Buddy Hook scope. If the installer reports `blocked: true`, inspect its `conflictingPaths` without printing unrelated configuration. Existing global, ancestor or project-shared hooks can load alongside the requested local hooks; choose the user's intended scope and remove only the previous Buddy definitions before installing another. `installed` describes the requested file, not whether a different scope is trusted or active. The detector recognizes Buddy's standard command paths and Codex inline hook sections; manually review custom wrappers and other plugin sources in `/hooks`.

Review the resulting **Buddy entries only** without printing the rest of the settings file. Never display credentials or environment values. In Codex, ask the user to review and trust the new definitions through `/hooks`; do not bypass trust or change managed policies. For Claude Code, inspect `/hooks` and the active settings source. Start a new local chat/session after setup to load the definitions reliably.

## Select needs-user reminders

Buddy normalizes `PermissionRequest` to **needs user**, displayed as an entirely yellow outer ring. The character and task counts stay unchanged; no question icon or question text is added. Native approval hooks are observational: never approve, deny, answer, inject a follow-up prompt, or change another permission hook.

The **setup agent** selects integrations from the actual host's documented and verified callbacks. Do not ask the working model to remember manual notifications on every turn. Report a capability table after setup: native approval, blocking question, nonblocking question, and how each reminder clears. Mark unsupported or unverified capabilities explicitly.

- Keep native Codex/Claude `PermissionRequest` reporting. It covers host approval prompts, not every AI question. Existing native configurations need no extra question hook merely to show approvals.
- Question reporting is optional. Enable it only for a real request for user input with a verified start **and** answer/cancel/invalidation lifecycle. Do not infer questions from prose, tool arguments, transcripts, a generic tool name, silence or model identity. Never invent a hook event or tool matcher.
- A blocking request can use the existing same-session `PermissionRequest` → resumption (`PreToolUse` / `PostToolUse` / `UserPromptSubmit`) lifecycle only if the host guarantees no other activity in that session while waiting. Preserve the adapter's original provider/session identity; a second custom namespace would create a phantom task. Confirm the native ordering and absence of duplicate handlers before enabling it.
- An async question tool returning means the question was submitted, **not answered**. The current event-only adapter replaces attention on later same-session activity. Therefore it cannot reliably hold an independent nonblocking question reminder. Leave that optional mapping disabled unless the harness itself tracks pending requests and emits the aggregate needs-user/resumption lifecycle from real resolution signals, serializing other callbacks while a reminder is pending. Never clear on an unrelated tool return, another conversation's completion, or a timeout. End/cancel invalidates pending requests; multiple pending requests clear only after the last one resolves.
- Current native Codex setup provides approval reminders. The existing Cursor adapter provides activity only; no dedicated approval/question callback is established by its installed configuration. Do not claim universal question coverage for either. A host without a reliable optional route remains activity-only for questions.

Verify open, duplicate open, actual resolution, cancellation and concurrent conversations using synthetic callbacks in an isolated test receiver. No raw question, answer, options or tool input may be delivered or logged. A configuration check is not evidence that the host emitted the callback or that the physical ring changed.

## Verify the real connection

```sh
node "$BUDDY_ROOT/scripts/install_agent_hooks.mjs" codex --scope project --project-root "$TARGET_PROJECT" --status --json
```

This reports **configured**, not connected. After a new session sends a normal task, check Buddy's received-event count and active task state. Report separately: configuration installed, host trusted/loaded, event received, and physical band response observed. If the host cannot run the local command or user trust is pending, explain that exact limitation; do not mark integration complete from configuration alone.

Counts represent independent main conversations. Claude child events carrying `agent_id` are ignored; subagents, parallel tools and background work within a main conversation are not counted independently. Claude's native `Stop` does not fire on user interruption. If cancellation leaves a stale task, use **Settings → Clear activity** to reset all tracked activity. After 15 minutes without events, Buddy warns that status is stale but keeps the task active and does not infer completion or stop activity hold. A new lifecycle event refreshes its status; terminal events or explicit reset end it. Long silent tasks therefore remain active. Connection loss or pause still lets the band's short watchdog release the active hold.

## Custom harness

Use `services/runtime/bin/agent-hook.mjs <provider> <event> --session <id>` with provider `deepseek` or `custom`. Generate a non-secret, stable ID for each independent conversation/task and reuse it until that task ends. Enqueue notifications in lifecycle callback order on a background queue; never await HTTP delivery in the agent execution path. The CLI sanitizes input and detaches a bounded delivery worker, so awaiting CLI exit waits only for local ingress, not delivery. Catch local launch failures and preserve the harness's original return values and errors. No prompt, tool arguments, transcript, API key, model response, or file contents belong in arguments or payloads.

Map actual callbacks to `UserPromptSubmit` (thinking), `PreToolUse` (working), `PostToolUse` (thinking), `PermissionRequest` (needs user), `Stop` (completed), and `Interrupt` or `SessionEnd` (cancelled/closed). Always send a terminal event on completion or cancellation; do not generate a new ID for every event. Multiple active tasks stay independent, and completion of one must not clear another.

## Remove

Use the same installer, provider, project and scope with `--uninstall --json`. This removes only matching Buddy commands from the selected config. Preserve the backups and other agents' hooks; avoid restoring an old whole-file backup over newer user changes. If the Buddy checkout path changed, inspect the previous Buddy entries and remove those exact commands as well.
