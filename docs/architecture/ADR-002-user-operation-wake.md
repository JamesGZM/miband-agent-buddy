# ADR-002: User operations wake the band and report one result

Date: 2026-11-10 Asia/Singapore. Status: accepted by the user's UI/wake plan.

## Problem

Desktop actions such as applying a Buddy theme required an awake, acknowledging band. Once firmware slept the band the runtime entered standby, the action was rejected or silently queued, and the screen never lit. The UI had no per-action progress or fixed success/failure feedback, and switching the preview page never reached the band.

## Decision

- Desktop band actions (`theme`, `page`, `wake`) are allowed in `connected`, `waiting` and `standby`. Each sends a request ID with the runtime command (`configure.request`, `show_page`, `wake`).
- The wake policy accepts `requestUser`. It replaces any queued event, is not subject to the 10-second event cooldown, and preempts an in-flight event wake. Every user operation sends a new launch and a new 20-second display lease.
- Runtime state exposes one `operation` (`id`, `kind`, `status`, `code`). It moves from `waking` to `applying` on the launch result and settles once as `done`, `failed` or `cancelled`:
  - theme is done after a durable matching settings receipt;
  - page is done when the ACK `page` equals the request, otherwise `unsupported`;
  - wake is done when the matching display lease is acknowledged.
  Launch failure, missing ACK, a 25-second bound, link loss, pause, disconnect and installation settle it.
- Snapshot v1 gains an optional `page` (0 or 1), sent only while a page operation is active. Buddy 0.5.2 applies it; older Buddy ignores it, and that is reported as `unsupported`.
- The desktop projects the request immediately and rejects overlapping band actions. The UI greys the acting control with progress text and announces each settled operation once in a fixed toast.

## Alternatives

Keeping the connected-only gate with a better message would not meet the expectation that touching the app lights the band. Waking on every snapshot or holding the screen continuously was rejected earlier for endurance and battery reasons. Per-operation Tauri return values would change the bridge contract, so the result travels through the existing state projection instead.

## Compatibility and evidence

Existing commands, fields, storage paths, the package ID and the Hook endpoint are unchanged. New fields are additive, and the shared fixture covers the new commands and actions. Automated coverage includes fake-clock runtime scenarios for a sleeping band, missing Buddy, a silent band, pause cancellation and old-Buddy page handling, plus band controller page handling, Rust gating and projection, and frontend loading and toast rendering. Physical illumination still requires device confirmation; an ACK is not proof of a lit panel.
