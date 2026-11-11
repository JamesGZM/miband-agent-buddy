# Development

Run commands from the repository root. Requirements and first-time installation are in the root README.

```sh
npm ci --prefix apps/band
npm run bootstrap
npm run build
npm test
npm run check:architecture
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --locked --manifest-path native/transport/Cargo.toml
npm run build:desktop
open 'apps/desktop/dist/MiBand Agent Buddy.app'
```

`bootstrap` is the explicit network-fetch step for pinned upstream sources. Offline development can add `--offline` to Cargo commands after dependencies are available. The build commands generate assets/packages but do not install Buddy, change hooks, start services or connect devices. `npm run hooks:install` is a separate explicit setup action; it retains the stable compatibility Hook path.

New users can follow the desktop Buddy checklist and **AI connections** page. The [project Hooks skill](../../skills/buddy-hooks/SKILL.md) provides Codex and Claude Code setup in an existing project and a generic harness sender; [Hooks development](hooks.md) documents supported lifecycle events, scope conflicts and privacy. Configured hooks, host trust, received events and physical display response are distinct checks.

The checklist follows the account → device → application → integration progression used in [AstroBox's device connection guide](https://abox.run/docs/usage/connection), while retaining this app's existing official account flow. It derives completion from current account, connection, Buddy ACK and event evidence. A fresh runtime waits for a new Hook event instead of treating an old installation as proof of a live connection.

Branch/PR CI generates test resources and runs source checks without packaging. Published GitHub Releases run the macOS build and attach only redistributable band artifacts; see [release policy](../open-source/RELEASING.md). The checkout-bound desktop bundle is not a portable download.

## Layout and change workflow

Read root `AGENTS.md` and the [architecture](../architecture/README.md). Applications live in `apps`, Node backend in `services/runtime`, native SPP in `native/transport`, canonical shared code in `packages/buddy-shared`, and all build entrypoints in `scripts`.

1. Identify the behavior and affected boundary; preserve existing uncommitted changes.
2. Make a focused change. Keep platform effects in adapters and business rules testable through injected dependencies.
3. Run the smallest relevant suite, then architecture/contract checks and affected builds.
4. Update the canonical documentation and add an ADR for consequential dependency/interface decisions.
5. Record physical results separately from automated checks; report what was not exercised.

For protocol changes, update the shared synthetic v1 fixture and both Rust/JavaScript consumers. Do not add real device identifiers or credentials. Do not raise component versions merely for file moves.

## Tests and generated files

- `tests/runtime`: pure state/wake policy, sampler parsing, loopback Hook and injected coordinator scenarios.
- `tests/band`: display/settings/keep-screen and the actual controller with fake Vela APIs.
- `tests/contracts`: canonical/generated module parity, IPC fixture, bridge and compatibility entrypoints.
- `tests/architecture`: boundary-checker positive and negative cases; Rust tests stay in owned modules.

`npm test` first stages shared modules. Artwork-dependent tests require `npm run build` once in a fresh checkout. Runtime tests use fake clocks and transports, never edited source copies. Timeouts remain named production settings rather than test-only source replacements.

`npm run check:architecture` is a lightweight static guard for authored sources: core/shared platform imports, cross-app imports, direct frontend Tauri access, retired directories and source-rewriting tests. It is not a full language parser or security boundary; code review remains responsible for dynamic imports and Rust module design.

Never edit `apps/band/src/common/generated`, generated PNGs, desktop assets or downloaded upstream contents. Change canonical modules/generator code and rebuild. The approved desktop icon master is `apps/desktop/artwork/app-icon.png`; `scripts/prepare_desktop.py` derives the desktop and in-app icons and draws the matching monochrome menu-bar template. Both build commands run this preparation; band artwork remains owned by `scripts/render_band_ui.py`. Preserve upstream attribution and isolated patches. Local `.agent` memory, `.legacy` archives and editor indexes are outside the product tree and CI.

## Manual smoke acceptance

After both builds pass, use the rebuilt app to confirm startup/selected-device restoration, connection ACK, one event wake and roughly 20-second natural sleep, pause/resume and explicit-quit worker cleanup. If band controller/protocol code changed, install the rebuilt local RPK for that smoke test. Confirm the physical display with the user; health ACK alone is insufficient. Preserve historical failures and untested device/firmware conditions in the validation record.

The [architecture migration map](REFACTOR.md) lists renamed paths and compatibility behavior.
