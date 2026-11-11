# ADR-002: User operations wake the band and report one result

Date: 2026-11-10 Asia/Singapore. Status: accepted by the user's UI/wake plan.

## Problem

Desktop actions such as applying a Buddy theme required an awake, acknowledging band. Once firmware slept the band the runtime entered standby, the action was rejected or silently queued, and the screen never lit. The UI had no per-action progress or fixed success/failure feedback, and switching the preview page never reached the band.

## Decision

- Desktop band actions (`theme`, `page`, `wake`, `wake_hold`, `activity_keep_awake`, `power_saving`, `reset_activity`, `check_buddy`) are allowed in `connected`, `waiting` and `standby`. Each sends a request ID with the runtime command; configure infers its operation kind from the changed field. Reset and inventory commands accept additive optional request IDs.
- The wake policy accepts `requestUser`. It replaces any queued event, is not subject to the 10-second event cooldown, and preempts an in-flight event wake. Every explicit user operation sends a new launch and a fresh lease using the saved, capability-clamped duration, including repeated values and either direction of a switch.
- Runtime state exposes one `operation` (`id`, `kind`, `status`, `code`). It moves from `waking` to `applying` on the launch result and settles once as `done`, `failed` or `cancelled`:
  - every installed-app operation requires the matching display lease acknowledgement before success;
  - theme is done after a durable matching settings receipt;
  - page is done when the ACK `page` equals the request, otherwise `unsupported`;
  - power saving also requires advertised support and the durable matching power preference;
  - activity keep-awake requires advertised support and the activity lease state for the accepted snapshot;
  - inventory checks wake first, then obtain a fresh inventory result; a native `app_missing` result completes the check as not installed, since no app can be opened;
  - wake, timeout changes and task reset complete from their matching snapshot/display receipt.
  Launch failure, missing ACK, a 25-second bound, link loss, disconnect and installation settle it. A successful installation starts a separate `install` wake/ACK phase after transfer; enqueueing either launch or install is never completion evidence.
- Activity synchronization controls background events and snapshots. Explicit operations still wake and deliver one bounded snapshot transaction while paused, then stop. Paused snapshots do not renew active-task leases. Changing pause during an explicit operation does not cancel that user request.
- A matching application ACK can arrive before the page processes its display lease. An absent lease or pending/off brightness state keeps the same wake ID on fresh-sequence snapshots until the original 15-second wake deadline. This does not relaunch Buddy or reset either deadline. A later valid lease completes the wake; expiry reports `display_unconfirmed` if an ACK arrived, or `no_response` otherwise. Explicit brightness errors still fail immediately. Cancelled/expired operations cannot be revived by late receipts. The band does not consume a wake ID while its page is not shown, so a later snapshot can safely apply that same ID after `onShow`.
- Local preferences and band choices are persisted while holding the same session mutex on the blocking pool. No delayed full-preference snapshot may overwrite a newer choice. Disconnected settings are saved for the next connection without claiming application to a band.
- Snapshot v1 gains an optional `page` (0 or 1), sent only while a page operation is active. Buddy 0.5.2 applies it; older Buddy ignores it, and that is reported as `unsupported`.
- The desktop projects the request immediately and rejects overlapping band actions. The UI greys the acting control with progress text and announces each settled operation once in a fixed toast.
- Frontend preference changes retain the requested value while saving. State reads started before a mutation are discarded; completion waits for a fresh read. Failed saves restore the previous control and palette. Buttons, switches and the preview share the worker's waking/applying states, so an IPC enqueue cannot prematurely end the loading indicator.

## Alternatives

Keeping the connected-only gate with a better message would not meet the expectation that touching the app lights the band. Waking on every snapshot or holding the screen continuously was rejected earlier for endurance and battery reasons. Per-operation Tauri return values would change the bridge contract, so the result travels through the existing state projection instead.

## Compatibility and evidence

Existing commands, fields, storage paths, the package ID and the Hook endpoint are unchanged. New fields are additive, and the shared fixture covers the new commands and actions. Automated coverage includes fake-clock scenarios for sleeping/missing/silent Buddy, explicit settings in either switch direction, manual operations with background sync off, inventory after wake, post-install wake and old-Buddy capability handling. A runtime test uses the actual band controller to verify a pre-show ACK followed by `onShow` and the same wake ID; other tests assert exact original-deadline expiry, no additional launch, immediate brightness errors and rejection of late receipts after cancellation/expiry. Rust tests cover serialized local preference saves preserving band choices, gating and projection; frontend tests cover loading and result feedback. Physical illumination still requires device confirmation; an ACK is not proof of a lit panel.
