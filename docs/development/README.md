# Development guide

This guide is for contributors building MiBand Agent Buddy from source. For installation and everyday use, see the [project README](../../README.md). Read [CONTRIBUTING.md](../../CONTRIBUTING.md) and the [architecture](../architecture/README.md) before making a change.

## Requirements

- macOS with Xcode Command Line Tools and Git.
- Node.js 22 or later and npm. Desktop packaging also needs the license file from the Node distribution being bundled.
- A current stable Rust toolchain with edition 2024 support.
- Python 3.10 or later; artwork generation uses the pinned Pillow version in `requirements.txt`.

A compatible band is needed for physical testing, but not for the automated suites or builds. Use the same Mac architecture for Node, Rust and the desktop package being built.

## First build

Run commands from the repository root:

```sh
git clone https://github.com/JamesGZM/miband-agent-buddy.git
cd miband-agent-buddy
python3 --version
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm ci --prefix apps/band
npm run bootstrap
npm run build
npm run build:desktop
open 'apps/desktop/dist/MiBand Agent Buddy.app'
```

Check that `python3 --version` reports at least 3.10; the Python supplied with macOS may be older. The desktop builder looks for the Node license at `../LICENSE` relative to the resolved Node executable's directory. If your installation stores it elsewhere, set `BUDDY_NODE_LICENSE` to that distribution's actual license file before building:

```sh
export BUDDY_NODE_LICENSE=/absolute/path/to/node/LICENSE
npm run build:desktop
```

`npm run bootstrap` downloads pinned upstream sources and applies the recorded patches. `npm run build` generates shared modules and artwork and compiles the band app. `npm run build:desktop` builds a relocatable macOS app containing its runtime dependencies. Build commands do not install Buddy on a band, configure AI Hooks or connect a device.

The development app is written to `apps/desktop/dist/MiBand Agent Buddy.app`. An optimized build is available with `npm run build:desktop -- --release`. Distribution packaging and version tags are covered by the [release process](../open-source/RELEASING.md).

## Project layout

| Path | Responsibility |
| --- | --- |
| `apps/desktop` | Tauri shell, account flow, preferences, tray and desktop interface |
| `apps/band` | Vela adapters, page controller and band views |
| `services/runtime` | Local AI integration, Mac metrics and connection/wake coordination |
| `native/transport` | macOS Bluetooth adapter and pinned upstream integration |
| `packages/buddy-shared` | Platform-independent protocol and presentation functions |
| `scripts` | Build, resource generation, packaging and local setup tools |
| `tests` | Runtime, band, contract and architecture suites |
| `mac` | Supported compatibility entrypoints |
| `skills/buddy-hooks` | Project-level AI integration instructions |

The [architecture document](../architecture/README.md) defines ownership and dependency direction. [AGENTS.md](../../AGENTS.md) summarizes repository rules for automated coding tools.

## Validation

Generate resources with `npm run build` once in a fresh checkout before running artwork-dependent tests. Use targeted tests during development, for example:

```sh
node --test tests/contracts/preview-animation.test.mjs
node --test tests/runtime/runtime-operation.test.mjs
```

Then run the common checks and affected Rust suites:

```sh
npm test
npm run check:architecture
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --locked --manifest-path native/transport/Cargo.toml
cargo test --locked --manifest-path native/transport/Cargo.toml -p corelib device::xiaomi::sar::tests
```

Rebuild `npm run build` when changing band code, shared modules or artwork. Rebuild `npm run build:desktop` when changing the desktop, runtime, transport or bundled resources. After dependencies are cached, Cargo supports `--offline` for local checks.

`npm test` stages shared modules before testing. Runtime tests use injected dependencies and fake clocks; do not alter production source to substitute timeouts. Tests use synthetic fixtures and must not read personal account data or contact a physical device. Tests that need a local listener bind only to loopback.

Architecture checks cover platform imports, cross-app access, direct Tauri calls outside `ui/bridge.js`, compatibility entrypoints and generated-module boundaries. They supplement code review rather than replacing it.

For a UI change, verify first launch, an existing user's saved settings, loading/error states and keyboard access. For device behavior, report the model, firmware and the physical result separately from builds and software receipts. See [testing and known limitations](../testing.md) for the current verification scope. The archive-relocation integration test is separately gated; follow the release process when validating a distributable app.

## Implementation workflow

1. Identify the user-facing behavior and affected component. Keep the change focused.
2. Add a regression test for a behavior fix, or update the relevant contract fixtures when the protocol changes.
3. Implement within the existing ownership boundaries. Add an ADR for a consequential architecture decision.
4. Run targeted checks, the common suites and affected builds.
5. Update user-facing and contributor documentation, and describe unverified conditions in the pull request.

UI text lives in `apps/desktop/ui/locales.js`; update English, Simplified Chinese and Traditional Chinese together. Mac appearance, Buddy theme and AI host configuration are separate settings.

## Generated files and local data

Change canonical source, not generated copies. In particular, do not hand-edit generated shared modules, band PNGs, desktop assets or downloaded upstream trees. The desktop icon master is `apps/desktop/artwork/app-icon.png`; `scripts/prepare_desktop.py` produces its app and tray assets. Band artwork is generated by `scripts/render_band_ui.py`.

Upstream revisions are pinned in `native/transport/upstream-lock.json`. Adaptations belong in recorded patches and [third-party notices](../../THIRD_PARTY_NOTICES.md). Keep the downloaded licenses intact.

Do not commit build products, dependencies, credentials, editor caches, local backups or `.agent` notes. Never include prompts, transcripts, raw tool arguments, real device identifiers or account secrets in fixtures or diagnostics.

## AI integrations and releases

The [Hooks guide](hooks.md) documents supported events, setup, verification and removal. Hook installation is an explicit action separate from building or testing the app; use a disposable project when testing installer behavior.

Ordinary branch and pull-request CI runs source checks without producing release packages. Version-tagged releases build the supported Mac architectures and publish their artifacts after validation. Follow the [release process](../open-source/RELEASING.md) for versioning, source archives, licenses and publication.
