# Architecture

This is the canonical current architecture. Historical architecture URLs redirect here. The app is macOS-only and targets Xiaomi Smart Band 9; physical verification currently covers the NFC model.

```text
Desktop UI → bridge → Tauri commands → application services → private files
                                               ↓ JSON Lines
Codex Hook → loopback HTTP → Node runtime core → transport adapter
Mac sampling ────────────────────┘                    ↓ JSON Lines
                                   Rust SPP/Core transport → Buddy controller
                                                         ← v1 application ACK
```

## Ownership and dependency direction

| Component | Owns | Boundary |
|---|---|---|
| Desktop | Official login window, preferences, selected device, tray/window lifetime | Typed application operations; no credentials in UI responses |
| Runtime core | Connection intent, retry, snapshot delivery, install/wake coordination | Injected clock, scheduler, sampler, transport and identifiers |
| Runtime adapters | OS metrics, loopback HTTP, child process I/O and checkout paths | No reconnect/wake policy |
| Native transport | Fixed upstream Core/SPP, authentication and device operations | JSON Lines, fixed sanitized diagnostic codes |
| Band controller | Snapshot consumption, settings receipts, foreground lifetime and rendering state | Injected Vela APIs and timers |
| Shared modules | v1 validation/ACK matching and existing display/animation calculations | Pure ES5 CommonJS; no platform imports |

Entrypoints compose these parts. Desktop domain/wire models have no platform effects; application operations are shared by tray/window adapters. The credential model retains the vendored account token data type to preserve its persisted format. Vendor and pinned upstream internals remain isolated.

Desktop frontend modules use only `bridge.js` for Tauri calls. Preview rendering consumes the same canonical presentation functions as the band; it reconstructs artwork, not a device screen capture. Mac appearance, band theme and activity state remain independent. Interface text is localized in the desktop frontend (`i18n.js`, `locales.js`: Simplified Chinese, Traditional Chinese, English). Catalog keys are the Traditional Chinese source strings, so runtime and Rust messages are translated at display time without changing the wire contracts. The tray menu and login window title use the same saved `language` preference (`system` by default).

## Contracts and delivery

The desktop/runtime and runtime/transport channels are private inherited stdio with one JSON object per line. Credentials appear only in the necessary connect/initial frames and never in state/health projections. Known commands are typed/validated at boundaries; additive ACK/runtime fields are retained. Synthetic examples shared by JavaScript and Rust live in `packages/buddy-shared/fixtures/v1.json`.

Snapshot protocol v1 keeps `session`, `seq`, CPU/memory/disk, activity mode, `buddyTheme`, `settingsRevision` and `keepScreen`, plus the optional additive `page`. A matching ACK must identify the current session/sequence and a valid receipt. Theme success additionally requires the matching revision/theme and `settingsApplied=true`; queued or failed storage never counts as durable confirmation. The package ID remains `com.macprobe.band9`.

There is one selected device, one transport child and at most one unacknowledged snapshot. Sampling is sequential, approximately every two seconds; new samples replace unsent older data. Connection recovery backs off to 30 seconds and stops after eight retries. Authentication rejection and competing-client conflicts require user action. Disconnect removes reconnect intent. Installation suspends snapshots and waits for a bounded device result.

Missing application ACK enters standby with approximately 30-second probes. A separate device-status check distinguishes sleeping Buddy from link failure. Transport generation checks reject events from abandoned children; pause/disconnect/install clear pending wakes. Stop cancels owned timers and ends workers.

## Activity and bounded wake

Hooks carry only event, hashed session identifier and timestamp. The receiver binds `127.0.0.1:10731`, rejects browser-origin writes, and bounds input. Hook failure exits successfully and never makes a tool permission decision. State is bounded to 128 sessions and not persisted. Active tasks remain active until terminal lifecycle events; after 15 minutes without an event they are marked stale. Parallel tool counts and arbitrary user-input waits are not inferred.

UserPromptSubmit, a new PermissionRequest, and task completion can request wake. Ordinary metrics/tool traffic cannot. One pending event is retained with a 60-second TTL and a 10-second global launch cooldown; attention takes priority. Cancellation/tool resumption invalidates obsolete pending work.

Desktop band actions (theme, page and wake) are user operations ([ADR-002](ADR-002-user-operation-wake.md)). They are accepted while the link is connected, waiting or in standby. Each one replaces queued event work, bypasses the event cooldown, preempts an in-flight event wake, and launches Buddy with a fresh display lease. Runtime state carries one `operation` that settles once (`done`, `failed` or `cancelled`) from the matching settings receipt, the ACK `page`, or the display lease. Launch failure, a 25-second bound, link loss, pause, disconnect and installation also settle it. The optional snapshot `page` is sent only during a page operation. The desktop UI shows progress on the acting control and reports each result in a fixed toast.

Explicit connection/startup requests one initial launch; background reconnect does not synthesize another. Native launch checks the installed app list first. Missing Buddy requests installation; successful installation queues a post-install wake unless paused.

Persistent `keepScreen` stays false. Each accepted wake sends a unique ID with a band-local display lease. The lease uses the saved hold (default 20 seconds, 5–1800) clamped to the ACK's `capabilities.maxWakeHoldMs`, or 30 seconds when Buddy advertises none ([ADR-003](ADR-003-band-capabilities.md)). Duplicate IDs and ordinary snapshots cannot extend it. Hide/exit cancels it; local expiry works without more packets. Launch confirmation requires a matching application ACK, lease ID/remaining time and accepted keep-screen request. Firmware controls actual illumination/sleep; ACK is not physical measurement. See the [validation record](../open-source/VALIDATION.md).

Buddy ACKs advertise `capabilities` (maximum lease, themes, page support). Themes beyond ChatGPT and Claude are applied only when advertised, because older Buddy rejects whole snapshots with unknown enum values. After authentication, every five minutes and on manual refresh, the runtime asks the transport for `device_status`. It exposes the firmware, model, battery, charging and storage values as non-persisted `state.device`; serial number and IMEI are never forwarded.

## Build and compatibility

`scripts/prepare_shared.py` stages canonical shared source for Vela and wraps unchanged CommonJS source for browser ESM. It never rewrites export strings. App-local copies and artwork are generated build outputs; `scripts/render_band_ui.py` remains the geometric band artwork source. Desktop branding uses the approved master `apps/desktop/artwork/app-icon.png`; `scripts/prepare_desktop.py` generates its app/UI sizes and the monochrome menu-bar template.

The desktop embeds its source-checkout path and build-time Node executable; it is not a relocatable distribution bundle. `mac/codex-hook.mjs` and `mac/buddy-runtime.mjs` retain old executable paths. Data location, preferences, Hook endpoint, package identity and public npm commands are unchanged. Rust packages and Quick App dependencies stay independently locked; no workspace manager or runtime rewrite is introduced.
