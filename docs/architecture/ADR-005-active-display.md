# ADR-005: Keep the display held during active tasks

**English** · [简体中文](ADR-005-active-display.zh-CN.md) · [繁體中文](ADR-005-active-display.zh-TW.md)

## Problem

One-shot wake leases expire while an agent is still thinking, using tools or waiting for permission. Extending them on every metric packet would also prevent idle sleep and could leave the display held after host failure. Completing one task must not obscure another concurrent task.

## Decision

The persistent `activityKeepAwake` preference is opt-in and defaults to false, including when upgrading an older preference file. The typed `activity_keep_awake` action saves it and updates the runtime without requiring a reconnect. When disabled, event and manual wakes retain their bounded one-shot duration.

Each explicit setting action, in either direction, requests one user wake while the link is ready. This opens a sleeping Buddy before its watchdog can be renewed. The request has visible waking/applying/result states and requires a matching display receipt. Repeated explicit actions also wake, while ordinary configuration snapshots do not. Disconnected or installing changes only store intent. Background synchronization being off does not prevent manual operations: a paused operation sends a bounded display lease and its settings, without renewing active-task holds or resuming background sampling. Resuming synchronization requests one wake if keep-awake is enabled and a task is still active.

The separate `syncEnabled` desktop preference defaults to true. Window and tray pause actions persist its inverse, and worker startup sends the saved pause command before auto-connect. Restarting the desktop therefore cannot briefly launch Buddy or send activity snapshots when synchronization was disabled.

After a transport reconnect authenticates, an opted-in active task restores delivery without requiring a new Hook. A previously confirmed foreground activity lease with `activityHold=true` and an integer `maxActivityHoldMs>=120000` uses snapshot-first recovery for up to one ACK interval. A fresh active foreground receipt or hidden-page receipt cancels the fallback; no confirming receipt requests one bounded `activity_reconnect` wake. Other capabilities retain the immediate recovery-wake policy. The current task/preference/pause state is checked at authentication and again before launch, so idle, ended, disabled or paused work cannot reopen it, including cancellation while a recovery wake is queued. Duplicate authentication notifications are ignored. This is connection recovery, not a periodic relaunch: uninterrupted sessions and ordinary snapshots never synthesize launches. The existing event cooldown and bounded wake/ACK deadline still apply.

Buddy 0.5.4 advertises `capabilities.activityHold=true`. Only after observing that capability in a matching ACK does the runtime add the paired v1 snapshot fields `activityHoldMs` and `idleHoldMs`. When the preference is enabled and `activeSessions` is nonzero, the first is the lesser of 120,000 ms and an advertised integer `maxActivityHoldMs>=1000`; absent or invalid maxima retain the legacy 15,000 ms value. Otherwise it is zero. The latter carries the saved 5–1,800 second idle grace. Disabling the preference during an active lease starts this grace once, without clearing task state. Active aggregate mode takes precedence over a completion-wake animation from an individual session.

The band refreshes its local deadline from each accepted active snapshot's `activityHoldMs`, up to 120,000 ms. Successful brightness API requests refresh every 30 seconds; failed or timed-out requests retry after two seconds while the lease remains valid. Negative native `value` results delivered through a success callback count as failures. Ordinary 2-second snapshots only move the deadline. On the first active-to-idle transition, the band starts the saved idle grace once. Further idle snapshots do not move it. An active user wake retains the activity watchdog instead of substituting a long idle lease.

Resource sampling does not gate task delivery. The runtime keeps at most one sample in flight; snapshots use the latest result for at most two sample intervals, then send unknown metrics until sampling recovers. Failure or a hung filesystem does not suppress active or terminal task snapshots, and late sampling results cannot restart a stopped runtime. This replaces awaiting the whole sample before each delivery; overlapping retries were rejected because a hung filesystem could accumulate work.

If snapshots stop because of disconnect, pause, install or shutdown, the band releases the request when the watchdog expires. Hide, exit and destroy cancel the timers and invalidate old brightness callbacks. Duplicate snapshots cannot renew anything. A resumed foreground page requires a fresh accepted snapshot; cached activity never reactivates it. `wakeDisplay.active` identifies a renewable activity lease; its `remainingMs` is a watchdog, not the user-selected idle duration.

An active session is marked stale after 15 minutes without an event, exposing `freshActiveSessions` and `staleSessions` for diagnostics. Staleness is a warning, never an idle classification: a long thinking or tool call can legitimately emit no further Hooks for hours. When the preference is enabled, every active session continues retaining the display while snapshots arrive, regardless of event age. Only a terminal lifecycle event or explicit reset ends its activity.

Some clients do not emit a terminal event when a task is cancelled, including certain Claude Code Escape cancellations. The stale warning helps the user identify a potentially orphaned task; the explicit reset action resolves it. No elapsed-time heuristic silently ends a real long-running task.

The `reset_activity` command clears tracked sessions and pending/in-flight Hook event wakes while preserving historical event counters. A desktop reset includes a request ID, wakes Buddy once and completes from a matching display/snapshot receipt, including while synchronization is off. The legacy request-less command remains local-only. Reset does not terminate or grant permissions to external AI tasks.

## Charging overlays and transient status failures

A failed device-status probe is not sufficient proof that Bluetooth disconnected. One rejected/timed-out probe keeps the transport and retries after 5 seconds; two consecutive probe failures still trigger recovery. A matching Buddy ACK cancels an outstanding probe and ignores its late failure. Valid battery/status replies or Buddy ACKs reset the failure count.

A charging transition from false to true can request one recovery after a 2-second settling delay, when synchronization/task keep-awake are enabled, a task remains active, and Buddy was displayed earlier in this connection. Hidden charging-page ACKs do not erase that prior display context. Initial/repeated charging samples do not relaunch it. Pause, task reset, disabling keep-awake, unplugging, disconnect and install cancel pending recovery. Transport generation and task/settings checks also apply before launch. Ordinary battery samples never periodically reopen Buddy.

## ACK forwarding and active delivery retry

Problem: awaiting a slow native command inside the event-receiver branch withheld Buddy ACKs, and a missed ACK then imposed 30 seconds of idle backoff, exceeding the 15-second activity watchdog.

Decision: keep one serial command future and drive its event receiver concurrently. Dropping the owner cancels that future before device cleanup; no detached command worker survives. Run the three independent info queries concurrently within their existing five-second bounds and omit the redundant pre-loop battery query. Reuse session metadata for subsequent wakes; installation invalidates readiness. Fixed sanitized failure codes identify inventory, sync and launch stages. An opted-in active task retries snapshot delivery after two seconds; idle/paused/disabled behavior retains its previous backoff. Standby and stale screen receipts are shown as unconfirmed, never inferred physical sleep.

Keeping the blocking command branch or periodically launching Buddy would preserve the timeout loop or interrupt navigation. The decision preserves serial command order, protocol v1 and the existing bounded manual wake. Fake-clock tests reproduce a single missed ACK and verify recovery before watchdog expiry without another launch; native tests prove ACK forwarding during a pending command and cancellation when the event owner closes. Physical endurance still requires device verification.

The owned SPP adapter forwards terminal open/close errors into a session-local signal instead of discarding them. The connection attempt and active event pump stop immediately on that signal, cancel pending work and report fixed `bluetooth_open_failed` / `bluetooth_link_closed` codes; raw native details never enter diagnostics. This leaves the pinned main-thread transport unchanged.

## One recovery wake for an unresponsive active Buddy

A live Bluetooth link can outlast its foreground Buddy page. After an application ACK timeout, an opted-in active task still retries snapshots promptly. A successful current link probe starts a two-second settling window so the retry ACK can arrive first. If Buddy remains unresponsive, was last acknowledged in the foreground and supports activity hold, request one `activity_unresponsive` wake through the existing cooldown, TTL and 15-second confirmation bound. A normal ACK cancels settling/queued recovery. Only a foreground keep-screen-on receipt rearms a later outage; repeated probes and timeouts cannot repeatedly launch Buddy during the same outage.

A failed/missing probe, idle task, paused sync, disabled hold or acknowledged hidden page cannot trigger this recovery. Manual operations and event wakes retain priority. Task completion/reset, disabling hold, pause, disconnect, installation and owner replacement cancel pending recovery, and eligibility is checked again before launch. This replaces passive waiting for an app that can no longer consume snapshots without adding periodic relaunches or changing protocol v1. Fake-clock tests cover recovery/confirmation, transient reply loss, cooldown cancellation, one-attempt limits, rearming and owner/settings/task cancellation. Physical behavior remains subject to the device verification guide.

An already-sent recovery also abandons its wake ID when tasks end or policy/ownership changes, so a late native launch result cannot create a display lease.

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

## Recovery after a failed preparation step

A reconnect can fail its app inventory/status query before any launch was issued. Subsequent snapshots may refresh the native app metadata without opening Buddy, while the previous ACK and capabilities belong to an abandoned transport. For an opted-in active task, retain a 60-second preparation-recovery intent with at most two retries. Require fresh current-generation installed metadata and a successful current link probe, then use the existing launch cooldown and confirmation bound. Only fixed `app_query_failed` / `app_sync_failed` results authorize a retry; missing results, launch failures and missing apps do not. A successful enqueue ends this retry intent and still requires Buddy’s display receipt. Normal ACKs, user operations, task completion/reset, pause, disabled hold, install and owner changes cancel queued work; late results cannot create a lease. Initial background device queries wait until the initial Buddy wake is confirmed, keeping them behind the display lease. Fake-clock regression tests cover the reproduced failed-reconnect path, bounded attempts, probe/inventory gates, query ordering and cancellation; physical continuous-operation validation is still required.

## Short disconnects during active work

Lease negotiation and reconnect bridging have separate gates: a valid 60,000 ms maximum negotiates a 60-second hold, but only a previously confirmed active foreground receipt advertising `activityHold=true` and an integer maximum of at least 120,000 ms enables snapshot-first reconnect. Shorter or legacy capabilities retain the immediate bounded recovery wake.

Buddy 0.5.11 advertises `maxActivityHoldMs=120000`. The host clamps active leases to that ceiling; an absent/invalid capability retains the legacy 15-second value. This keeps the last active task display through a bounded communication gap while the page remains visible. An explicit inactive snapshot starts the saved idle grace immediately, and hide/back/destroy cancels all holds. Two minutes without renewal still releases the screen rather than retaining it indefinitely. On reconnect, a previously confirmed bridged display first gets a fresh snapshot and up to one ACK interval to reply; a confirmed active display cancels fallback launch, while a hidden-page receipt respects the hidden page. A missing reply falls back to the existing bounded wake. Initial inventory from a newly authenticated owner must not discard that owner’s first pending snapshot; a known installation change still invalidates older receipts. Fake clocks cover 45-second gaps, the two-minute bound, explicit terminal delay, legacy negotiation, snapshot-first reconnect and cancellation. Physical validation of this combined version is pending.
