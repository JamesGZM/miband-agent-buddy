# Project development rules

Read [architecture](docs/architecture/README.md) and [development](docs/development/README.md) before structural changes. Explicit user instructions take precedence.

## Repository responsibilities

- `apps/desktop`: Tauri shell, window authorization, account UI and rendering. Only `ui/bridge.js` accesses Tauri from JavaScript.
- `apps/band`: Vela system adapters and page controller. Templates/styles stay in the page; controller dependencies are injected.
- `services/runtime`: `bin` wires processes; `src/core` owns connection/delivery/wake policy; `src/adapters` owns OS, HTTP and child I/O.
- `native/transport`: isolated macOS SPP/Core adapter. Preserve the main-thread IOBluetooth run loop and pinned upstream sources/patches.
- `packages/buddy-shared`: pure ES5 CommonJS protocol and presentation functions. No Node, Tauri, Vela or application imports.
- `scripts`: build/resource generation and local setup. Generated app copies are outputs, never source.
- `tests`: runtime, band, contracts and architecture suites. Rust tests stay beside owned modules.
- `mac`: compatibility entrypoints only. Do not restore retired services here.

## Architecture rules

- Entry points authorize/decode and delegate to application operations. Tray and window actions share services.
- Runtime core imports only core/shared modules. Inject transport, sample, clock, timers, identifiers and paths; imports/factory creation have no platform effects.
- Do not import another app's internals. Share only behavior used by multiple consumers; do not add speculative frameworks.
- Validate IPC at its boundary; preserve additive v1 fields and shared fixtures. Update all consumers and contract tests together.
- Each owner cancels its timers/listeners and stops its children. Ignore callbacks from abandoned sessions. Stop must be idempotent.
- Tests use dependency injection and fake clocks. Do not copy/replace production source to alter timeouts or dependencies.
- Never hand-edit generated adapters/assets, downloaded upstream code or vendored account code. Upstream changes require an isolated recorded patch and attribution.
- Prefer code-drawn band UI from shared geometry, preserving the approved design. Avoid bitmap animation frames; retain the launcher icon. Follow [Quick App UI development](docs/development/quickapp-ui.md) for image exceptions, performance and physical validation.
- Compute multi-AI aggregation, priority, display mode and task-color plans on the Mac before delivery. The band validates/applies compact display results and owns local animation, lifecycle and display safety; never move AI state inference or per-frame session aggregation onto it. Capability-gate additive fields and retain legacy compatibility ([ADR-009](docs/architecture/ADR-009-host-activity-display.md)).
- Task-completion vibration is opt-in. Derive per-task notifications from real host lifecycle transitions on the Mac, independently of aggregate mode; preserve durable delivery deduplication and timer cleanup ([ADR-010](docs/architecture/ADR-010-completion-vibration.md)).

## Changes and verification

- Before editing, identify affected files and state a 3–6 bullet plan. Keep changes focused and preserve uncommitted user work.
- Propose exact commands and their purpose before running them. Run the fastest relevant check first.
- Add/update behavior tests. Run `npm test` and `npm run check:architecture`; run affected Rust tests/builds as documented.
- Architecture changes require a short ADR: problem, decision, alternatives, compatibility and evidence. Keep one canonical current architecture document; historical links redirect to it.
- Preserve both compatibility entrypoints, existing npm commands, private data paths and wire contracts unless the user explicitly approves a migration.
- Report changed files, validation results and unverified conditions. Compilation/ACK does not prove physical screen behavior.

## Privacy and local-only material

- Never log/store secrets, raw prompts, tool arguments, transcripts or device keys in source/fixtures/diagnostics. Use synthetic fixture data.
- No new cloud calls, analytics or telemetry without explicit user instruction. Preserve the existing official account flow and loopback Hook endpoint.
- `.agent`, `.legacy`, `.cursor`, `.codegraph`, credentials, generated assets and build outputs are local-only. Do not commit or delete user-local material as cleanup.
- No UI redesign, stack migration, publication or unrelated behavior changes as part of structural work.
