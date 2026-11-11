# ADR-005: Keep the display held during active tasks

**English** · [简体中文](ADR-005-active-display.zh-CN.md) · [繁體中文](ADR-005-active-display.zh-TW.md)

## Problem

One-shot wake leases expire while an agent is still thinking, using tools or waiting for permission. Extending them on every metric packet would also prevent idle sleep and could leave the display held after host failure. Completing one task must not obscure another concurrent task.

## Decision

The persistent `activityKeepAwake` preference is opt-in and defaults to false, including when upgrading an older preference file. The typed `activity_keep_awake` action saves it and updates the runtime without requiring a reconnect. When disabled, event and manual wakes retain their bounded one-shot duration.

Each explicit setting action, in either direction, requests one user wake while the link is ready. This opens a sleeping Buddy before its watchdog can be renewed. The request has visible waking/applying/result states and requires a matching display receipt. Repeated explicit actions also wake, while ordinary configuration snapshots do not. Disconnected or installing changes only store intent. Background synchronization being off does not prevent manual operations: a paused operation sends a bounded display lease and its settings, without renewing active-task holds or resuming background sampling. Resuming synchronization requests one wake if keep-awake is enabled and a task is still active.

The separate `syncEnabled` desktop preference defaults to true. Window and tray pause actions persist its inverse, and worker startup sends the saved pause command before auto-connect. Restarting the desktop therefore cannot briefly launch Buddy or send activity snapshots when synchronization was disabled.

After a transport reconnect authenticates, an opted-in active task requests one connection wake to restore Buddy and its watchdog, without requiring a new Hook. The current task/preference/pause state is checked at authentication and again before launch, so idle, ended, disabled or paused work cannot reopen it, including cancellation while a recovery wake is queued. Duplicate authentication notifications are ignored. This is connection recovery, not a periodic relaunch: uninterrupted sessions and ordinary snapshots never synthesize launches. It replaces the unconditional no-wake reconnect policy, which left an active task dark after a lost transport. The existing event cooldown and bounded wake/ACK deadline still apply.

Buddy 0.5.4 advertises `capabilities.activityHold=true`. Only after observing that capability in a matching ACK does the runtime add the paired v1 snapshot fields `activityHoldMs` and `idleHoldMs`. The first is 15,000 ms when the preference is enabled and `activeSessions` is nonzero; otherwise it is zero. The latter carries the saved 5–1,800 second idle grace. Disabling the preference during an active lease starts this grace once, without clearing task state. Active aggregate mode takes precedence over a completion-wake animation from an individual session.

The band refreshes a local 15-second deadline on each accepted active snapshot. Successful brightness API requests refresh every 30 seconds; failed or timed-out requests retry after two seconds while the lease remains valid. Negative native `value` results delivered through a success callback count as failures. Ordinary 2-second snapshots only move the deadline. On the first active-to-idle transition, the band starts the saved idle grace once. Further idle snapshots do not move it. An active user wake retains the activity watchdog instead of substituting a long idle lease.

Resource sampling does not gate task delivery. The runtime keeps at most one sample in flight; snapshots use the latest result for at most two sample intervals, then send unknown metrics until sampling recovers. Failure or a hung filesystem does not suppress active or terminal task snapshots, and late sampling results cannot restart a stopped runtime. This replaces awaiting the whole sample before each delivery; overlapping retries were rejected because a hung filesystem could accumulate work.

If snapshots stop because of disconnect, pause, install or shutdown, the band releases the request when the watchdog expires. Hide, exit and destroy cancel the timers and invalidate old brightness callbacks. Duplicate snapshots cannot renew anything. A resumed foreground page requires a fresh accepted snapshot; cached activity never reactivates it. `wakeDisplay.active` identifies a renewable activity lease; its `remainingMs` is a watchdog, not the user-selected idle duration.

An active session is marked stale after 15 minutes without an event, exposing `freshActiveSessions` and `staleSessions` for diagnostics. Staleness is a warning, never an idle classification: a long thinking or tool call can legitimately emit no further Hooks for hours. When the preference is enabled, every active session continues retaining the display while snapshots arrive, regardless of event age. Only a terminal lifecycle event or explicit reset ends its activity.

Some clients do not emit a terminal event when a task is cancelled, including certain Claude Code Escape cancellations. The stale warning helps the user identify a potentially orphaned task; the explicit reset action resolves it. No elapsed-time heuristic silently ends a real long-running task.

The `reset_activity` command clears tracked sessions and pending/in-flight Hook event wakes while preserving historical event counters. A desktop reset includes a request ID, wakes Buddy once and completes from a matching display/snapshot receipt, including while synchronization is off. The legacy request-less command remains local-only. Reset does not terminate or grant permissions to external AI tasks.

## Alternatives

- An unlimited persistent keep-screen setting has no band-local recovery after host failure.
- Renewing a long wake lease on every metric packet prevents idle sleep and magnifies disconnect drain.
- Re-launching the band app periodically interrupts user navigation and violates explicit wake policy.

## Compatibility

Protocol v1, `keepScreen=false`, unique wake IDs, data paths and the prior event-wake policy remain unchanged. Older bands that do not advertise the capability keep their existing one-shot leases. Each transport connection forgets prior capabilities and negotiates again. Rust boundaries preserve the additive fields without platform changes. Desktop and band versions remain independent.

The same capable snapshots include optional `sessionCounts` with `thinking`, `working` and `attention` integer counts (combined maximum 128), independently of the keep-awake preference. A shared pure presentation maps the active total to colored segments within the existing main ring, retaining its geometry and adding one color per concurrent session up to six. The small band display has no active-count text. The colors express concurrency, not AI provider identity; counts contain no task names, session identifiers or content. The ring returns to its ordinary appearance when snapshots go stale or all sessions are idle.

## Evidence

The compact presentation takes design cues from [Code Light AI](https://github.com/cuihp/code-light-ai), which aggregates concurrent sessions by highest-priority status and shows an active count, and [AgentHUD](https://github.com/garunnir/AgentHUD), which offers per-session compact status indicators. Buddy uses one manually selected character and colors within its existing main ring to fit the small landscape display. No source, artwork or transcript-reading implementation was copied from those projects.

Fake-clock tests cover default-off bounded wakes, immediate manual changes from standby in both switch directions, paused manual operations, disabled-sync startup, an opted-in eight-hour task without a new Hook remaining held without periodic launches, aggregate sessions, one-time idle grace, stale activity warnings, reset/display receipts, request-less reset compatibility, pause/disconnect expiry, duplicate packets, stale API callbacks, hidden/exited pages and legacy capability fallback. Rust tests cover legacy defaults, persistence and UI projection; shared synthetic fixtures validate JavaScript and Rust boundaries. Firmware acceptance and actual physical screen illumination still require device testing; an ACK is not that observation.
