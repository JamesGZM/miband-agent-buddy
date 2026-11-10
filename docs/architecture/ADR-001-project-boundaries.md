# ADR-001: Explicit boundaries without a stack rewrite

Date: 2026-11-10 Asia/Singapore. Status: accepted by the user's refactor plan.

## Problem

The working prototype mixed retired and supported sources, concentrated desktop/runtime lifecycle rules in entrypoints, and coupled tests/build steps to application source locations. The runtime integration harness rewrote source text to substitute dependencies and durations.

## Decision

Keep Tauri + Node + Rust SPP + Vela. Group apps/services/native/shared sources explicitly. Use thin entrypoints, typed/validated IPC, pure shared ES5 modules, injected runtime/controller dependencies and a small CI boundary checker. Keep stable executable shims and existing storage/wire formats.

## References and adopted ideas

Inspected primary GitHub sources on 2026-11-10; these are design references, not copied implementation.

- [Yaak platform package](https://github.com/mountain-loop/yaak/tree/main/packages/platform/src) and [development guide](https://github.com/mountain-loop/yaak/blob/main/DEVELOPMENT.md), main branch: isolate host access and retain an explicit Node sidecar boundary. We do not adopt its gRPC/plugin infrastructure or many-package workspace.
- [Clash Verge Rev command modules](https://github.com/clash-verge-rev/clash-verge-rev/blob/dev/src-tauri/src/cmd/mod.rs), inspected file blob `1bb2d30411f9ea55bb79c097ffb890d272198107`, and [entrypoint](https://github.com/clash-verge-rev/clash-verge-rev/blob/dev/src-tauri/src/main.rs), blob `eb0af31951e108fc3b03ca6df45f8c3c4c275190`: separate native composition, command handling and process operations. Its runtime tuning/global services are not adopted.
- [GitButler development rules](https://github.com/gitbutlerapp/gitbutler/blob/master/AGENTS.md), inspected file blob `996c996250a22ef567bd8a543cdbac18e15479f1`: version the repository map, focused-change rules and validation expectations. Its build orchestration is unnecessary here.

## Alternatives and consequences

A Rust-only backend would reduce languages/processes but require rewriting verified sampling/Hook/wake behavior. Directory-only cleanup would leave lifecycle and testing coupling intact. A general device/AI plugin system has no current acceptance requirement. These alternatives are deferred.

Generated wrappers add a preparation step but preserve a single source without a new bundler. Wire models retain additive fields for compatibility. The vendored token data type remains in persisted credentials. Compatibility shims must remain until an explicit installation migration is approved. CPU/ACK responsibilities are separated; no transport policy belongs in sampling utilities.

Validation: preserve baseline cases; add fake-time coordinator, lifecycle cleanup, IPC parity, compatibility and negative architecture checks; run both source builds and record physical smoke evidence separately.
