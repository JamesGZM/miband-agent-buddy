# ADR-005: Keep the display held during active tasks

## Problem

One-shot wake leases expire while an agent is still thinking, using tools or waiting for permission. Extending them on every metric packet would also prevent idle sleep and could leave the display held after host failure. Completing one task must not obscure another concurrent task.

## Decision

Buddy 0.5.4 advertises `capabilities.activityHold=true`. Only after observing that capability in a matching ACK does the runtime add the paired v1 snapshot fields `activityHoldMs` and `idleHoldMs`. The first is 15,000 ms whenever `activeSessions` is nonzero, and zero only when no active sessions remain. The latter carries the saved 5–1,800 second idle grace. Active aggregate mode takes precedence over a completion-wake animation from an individual session.

The band refreshes a local 15-second deadline on each accepted active snapshot. Brightness API refreshes retain their existing 30-second interval; ordinary 2-second samples only move the deadline. On the first active-to-idle transition, the band starts the saved idle grace once. Further idle snapshots do not move it. An active user wake retains the activity watchdog instead of substituting a long idle lease.

If snapshots stop because of disconnect, pause, install, shutdown or failed sampling, the band releases the request when the watchdog expires. Hide, exit and destroy cancel the timers and invalidate old brightness callbacks. Duplicate snapshots cannot renew anything. A resumed foreground page requires a fresh accepted snapshot; cached activity never reactivates it. `wakeDisplay.active` identifies a renewable activity lease; its `remainingMs` is a watchdog, not the user-selected idle duration.

An active session is marked stale after 15 minutes without an event, exposing `freshActiveSessions` and `staleSessions` for diagnostics. Staleness is a warning, never an idle classification: a long thinking or tool call can legitimately emit no further Hooks for hours. As explicitly requested, every active session continues retaining the display while snapshots arrive, regardless of event age. Only a terminal lifecycle event or explicit reset ends its activity.

Some clients do not emit a terminal event when a task is cancelled, including certain Claude Code Escape cancellations. The stale warning helps the user identify a potentially orphaned task; the explicit reset action resolves it. No elapsed-time heuristic silently ends a real long-running task.

The explicit `reset_activity` command clears tracked sessions and pending/in-flight Hook event wakes without launching Buddy. It preserves connection/user-operation wakes and historical event counters. The next normal snapshot contains idle activity, so an existing active lease starts the saved idle grace. Reset does not terminate or grant permissions to external AI tasks.

## Alternatives

- An unlimited persistent keep-screen setting has no band-local recovery after host failure.
- Renewing a long wake lease on every metric packet prevents idle sleep and magnifies disconnect drain.
- Re-launching the band app periodically interrupts user navigation and violates explicit wake policy.

## Compatibility

Protocol v1, `keepScreen=false`, unique wake IDs, data paths and the prior event-wake policy remain unchanged. Older bands that do not advertise the capability keep their existing one-shot leases. Each transport connection forgets prior capabilities and negotiates again. Rust boundaries preserve the additive fields without platform changes. Desktop and band versions remain independent.

The same capable snapshots include optional `sessionCounts` with `thinking`, `working` and `attention` integer counts (combined maximum 128). A shared pure formatter renders the compact active/waiting totals on the pet page and desktop preview. Counts contain no task names, provider session identifiers or content; they disappear when snapshots go stale or all sessions are idle.

## Evidence

The compact presentation takes design cues from [Code Light AI](https://github.com/cuihp/code-light-ai), which aggregates concurrent sessions by highest-priority status and shows an active count, and [AgentHUD](https://github.com/garunnir/AgentHUD), which offers per-session compact status indicators. Buddy uses one manually selected character plus active/waiting totals to fit its small landscape display. No source, artwork or transcript-reading implementation was copied from those projects.

Fake-clock tests cover an eight-hour task without a new Hook remaining held without periodic launches, aggregate concurrent sessions, one-time idle grace, stale activity warnings, fresh/stale session mixtures, explicit reset without an event wake, preserved user operations, pause/disconnect expiry, duplicate packets, stale API callbacks, hidden/exited pages and legacy capability fallback. The shared synthetic fixture passes JavaScript and Rust boundaries. Firmware acceptance and actual physical screen illumination still require device testing; an ACK is not that observation.
