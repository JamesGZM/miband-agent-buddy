# Development guide

**English** · [简体中文](../../zh-CN/development/README.md) · [繁體中文](../../zh-TW/development/README.md)

This guide is for contributors building MiBand Agent Buddy from source. For installation and everyday use, see the [project README](../../../README.md). Read [CONTRIBUTING.md](../../../CONTRIBUTING.md) and the [architecture](../architecture/README.md) before making a change.

The project provides macOS and Windows desktop apps for a band used as a desk display. The first-build commands below target macOS; the Windows preview-build section covers native x64 and ARM64 builds and current limits.

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

## macOS signing

Local builds default to `--signing-mode local` and require an existing valid code-signing identity in the login keychain. A single identity is selected automatically; otherwise use its exact name/SHA-1 via `--signing-identity` or `BUDDY_SIGNING_IDENTITY`. No private key is exported and no certificate is created. Local signing never silently falls back to ad-hoc. Replace the placeholder below with an existing certificate reference.

```sh
npm run build:desktop -- --signing-mode local
BUDDY_SIGNING_IDENTITY='EXISTING_CERTIFICATE_SHA1' npm run build:desktop -- --release --signing-mode local
npm run build:desktop -- --release --signing-mode ci
```

GitHub explicitly uses `ci`, does not inspect the keychain and rejects supplied certificate identities. It creates/imports no certificates, including temporary or self-signed ones. Its ad-hoc code signature uses no certificate and provides the signature required to execute Apple Silicon code. Local App, Node and transport share the selected certificate with distinct fixed identifiers. Keep the same certificate and identifiers across rebuilds for stable designated requirements; the first transition from ad-hoc or switching to a GitHub package can require new macOS authorization. Signing is not notarization. See [Apple TN3127](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements).

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

The [architecture document](../architecture/README.md) defines ownership and dependency direction. [AGENTS.md](../../../AGENTS.md) summarizes repository rules for automated coding tools.

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

Band interfaces should be drawn in code wherever practical, preserving the approved Buddy design. The [Quick App UI guide](quickapp-ui.md) explains native components, image exceptions, shared preview geometry, animation costs and device validation.

Guides are grouped under `docs/en`, `docs/zh-CN` and `docs/zh-TW` with matching paths. The root has one `README.md`; translated homepages live in `docs/readme`. Keep navigation in the selected language and update translations together. Shared images and original license texts keep their canonical paths. Run the documentation link tests after moving pages.

## Generated files and local data

Change canonical source, not generated copies. In particular, do not hand-edit generated shared modules, icons, thumbnails or downloaded upstream trees. The desktop icon master is `apps/desktop/artwork/app-icon.png`; `scripts/prepare_desktop.py` produces its app and tray assets. Band UI geometry is defined by `packages/buddy-shared/presentation/geometry.js`; `scripts/render_band_ui.py` generates only desktop thumbnails and retires obsolete frame directories. `scripts/prepare_band_icon.py` generates the band launcher icon, the only image in the RPK.

Upstream revisions are pinned in `native/transport/upstream-lock.json`. Adaptations belong in recorded patches and [third-party notices](../../../THIRD_PARTY_NOTICES.md). Keep the downloaded licenses intact.

Do not commit build products, dependencies, credentials, editor caches, local backups or `.agent` notes. Never include prompts, transcripts, raw tool arguments, real device identifiers or account secrets in fixtures or diagnostics.

## AI integrations and releases

The [Hooks guide](hooks.md) documents supported events, setup, verification and removal. Hook installation is an explicit action separate from building or testing the app; use a disposable project when testing installer behavior.

Ordinary branch and pull-request CI runs source checks without producing release packages. Version-tagged releases build both Mac and both Windows architectures, and publish all artifacts only after all four succeed. Follow the [release process](../open-source/RELEASING.md) for versioning, source archives, licenses and publication.

## Local device test build

Build the normal code-drawn Buddy page with a local test version and stage it for a local desktop bundle. Previous RPK/metadata are backed up; this does not publish. The launcher icon remains the only image. The historical script name does not imply a separate prototype UI. Rendering, stability and illumination require physical confirmation.

```sh
python3 scripts/build_band_probe.py --revision 8 --activate
npm run build:desktop
```

## Windows preview builds

The reusable [Windows workflow](https://github.com/JamesGZM/miband-agent-buddy/actions/workflows/windows.yml) runs on native x64 and ARM64 runners. Stable release tags call it automatically alongside both Mac builds; all four architecture jobs must succeed before publication. The release includes unsigned NSIS installers, checksums and corresponding sources. Manual workflow dispatch remains available for diagnostics and uploads Actions artifacts without publishing. Use `npm ci --prefix scripts/windows` and `python scripts/build_windows.py --arch x64` (or `arm64`) on the matching Windows Rust/Node host after bootstrap and the band build. Set `BUDDY_NODE_LICENSE` to the official Node LICENSE and use Python UTF-8 mode. Windows credentials and preferences use user-scoped DPAPI; copying those files to a different account/machine does not migrate login. In-app updates are unavailable in the preview. Pairing, login, installation, notifications and hardware behavior need Windows verification. See [ADR-012](../architecture/ADR-012-windows-preview.md).

## README artwork

The artwork source is [scripts/readme-preview.html](../../../scripts/readme-preview.html). It uses the actual desktop frontend and shared band renderer with synthetic demonstration data; it never reads an account, device or running Buddy service. After generating normal UI resources, serve the checkout over loopback:

```sh
python3 scripts/prepare_shared.py
python3 scripts/render_band_ui.py
python3 scripts/prepare_desktop.py
python3 -m http.server 8785 --bind 127.0.0.1
```

Open `http://127.0.0.1:8785/scripts/readme-preview.html` in a browser. Capture the full page (1600 × 1100); `?page=devices`, `hooks`, `account`, `settings`, `resources`, `display` and `buddy` produce the 1600 × 1240 gallery views. Wait for the preview to render, keep the complete background, and label images as App previews with illustrative data. Record the Buddy view for animation; do not claim physical-device FPS from it.

The README hero uses the same source with `?capture=1`. Start “Play documentation demo” after loading, capture one 16-second cycle at the full 1600×1100 page size, and save a `frames.json` list of `{path, at}` records (milliseconds from recording start). Encode the captured synthetic frames with the command below; the PNG is the reduced-motion alternative. This is shared frontend artwork, not a Windows/macOS device verification or panel-FPS recording.

```sh
python3 scripts/encode_readme_hero.py /absolute/path/to/captured-frames
```
