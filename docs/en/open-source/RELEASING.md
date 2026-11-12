# Desktop releases and updates

**English** · [简体中文](../../zh-CN/open-source/RELEASING.md) · [繁體中文](../../zh-TW/open-source/RELEASING.md)

MiBand Agent Buddy is an AGPL-3.0-only desktop-display project for Xiaomi Smart Band 9, with macOS and Windows desktop apps. The public repository includes source, licenses, notices, contribution and security guidance. Desktop and band versions are independent.

## Continuous integration

Branch pushes and pull requests run `Source checks`: generated test resources, Node tests, architecture checks and both Rust suites. They do not build an App or RPK.

`Release packages` runs only for a pushed stable `vX.Y.Z` tag or an explicit workflow dispatch with an existing stable version tag. It builds and tests Apple Silicon (`macos-15`), Intel (`macos-15-intel`), Windows x64 (`windows-2025`) and Windows ARM64 (`windows-11-arm`). The publish job requires both platform matrices and validates all 20 installer, source and checksum files before creating or updating the GitHub Release. Tag, package.json and Cargo package versions must agree. Ordinary checks have read-only repository access; only the final publish job receives `contents: write`.

Release assets:

- `MiBand-Agent-Buddy-macos-{arm64,x64}.dmg` installers and individual `.sha256` files;
- `MiBand-Agent-Buddy-macos-arm64.zip` and `MiBand-Agent-Buddy-macos-x64.zip`;
- architecture-specific `SHA256SUMS-*` files;
- `MiBand-Agent-Buddy-windows-{x64,arm64}-setup.exe` and individual `.sha256` files;
- `MiBand-Agent-Buddy-source-windows-{x64,arm64}.tar.gz` and checksums;
- `MiBand-Agent-Buddy-source-{arm64,x64}.tar.gz` plus checksums: reviewed Git-tracked project files, actual patched pinned upstream files and resolved linked Rust dependency sources;
- GitHub's source archives for the exact tag.

Source packaging requires a clean reviewed commit, rejects private paths/symlinks and omits the excluded Vivo MsgPack source. It records the target/revision and exact official Node source URL; no private account files or generated local workspace copies are included. A rerun replaces assets for that tag. Buddy's package is included inside the desktop app and managed through its Band page. Release checksums and GitHub asset SHA-256 digests are available to users; the built-in updater requires the GitHub digest.

## Publish a version

1. Review the commit, [notices](../../../THIRD_PARTY_NOTICES.md) and [verification guide](../testing.md). Keep private/local files out of the commit.
2. Update `package.json`, desktop Cargo.toml/Cargo.lock and Tauri metadata together. Add the version's entry to `CHANGELOG.md`; the workflow uses it as the release description. Change the band version only if its package changed. Run the full documented checks and both builds.
3. Create and push the reviewed stable tag, for example `git tag v0.6.0` then `git push origin v0.6.0`. This is the explicit publication action. Alternatively rerun the workflow for an existing tag using Actions → Release packages → Run workflow.
4. Wait for all four architecture jobs and `publish` to succeed. Confirm assets and source archives are attached, download the appropriate package and verify its SHA-256. Exercise an update from the previous installed version before describing in-app updates as release-tested.

Creating a draft release or ordinary branch push does not package. This workflow does not publish npm packages or change repository visibility. Stable releases only are supported by the built-in update checker.

## App installation and updates

The app now carries its Node runtime, shared modules, native transport and Buddy package, and can be moved without a source checkout. Build with `npm run build` then `npm run build:desktop`; add `-- --release` for optimized binaries. `python3 scripts/package_release.py` creates DMG installers with an Applications shortcut plus portable ZIPs, verifies the disk image and fails if the excluded Vivo MsgPack dependency reappears.

For first installation, open the DMG and drag the App to its Applications shortcut, or unzip the portable ZIP and move the App to `/Applications` or another user-writable Applications folder. GitHub bundles use certificate-free ad-hoc code signatures and are **not Apple-notarized**. CI never creates/imports certificates or uses local signing identities. Local builds instead require an existing certificate; see [development signing](../development/README.md#macos-signing). macOS may require the standard explicit approval in System Settings → Privacy & Security on first opening. Do not remove quarantine automatically or claim that a checksum provides Apple notarization.

Settings → About → Check for updates queries the project Worker first, with direct official GitHub fallback; both serve this project's latest stable GitHub Release. Downloading verifies its architecture asset and digest, then validates the extracted app. **Install and restart** is a separate action that preserves app data and retains the previous app beside it as `MiBand Agent Buddy.previous-*.app`. If the installation folder is not writable, move the app to a user-writable Applications folder. Apps launched through App Translocation and direct development executables cannot update in place.

A local build or absent release is shown honestly; the app does not offer a source archive as an executable update. GitHub Developer ID signing/notarization is not configured; local certificate signing uses an existing keychain identity. Windows preview installers are included in the same release; Linux bundles are not configured.

## Windows preview builds

The reusable [Windows workflow](https://github.com/JamesGZM/miband-agent-buddy/actions/workflows/windows.yml) runs on native x64 and ARM64 runners. Stable release tags call it automatically alongside both Mac builds; all four architecture jobs must succeed before publication. The release includes unsigned NSIS installers, checksums and corresponding sources. Manual workflow dispatch remains available for diagnostics and uploads Actions artifacts without publishing. Use `npm ci --prefix scripts/windows` and `python scripts/build_windows.py --arch x64` (or `arm64`) on the matching Windows Rust/Node host after bootstrap and the band build. Set `BUDDY_NODE_LICENSE` to the official Node LICENSE and use Python UTF-8 mode. Windows credentials and preferences use user-scoped DPAPI; copying those files to a different account/machine does not migrate login. In-app updates are unavailable in the preview. Pairing, login, installation, notifications and hardware behavior need Windows verification. See [ADR-012](../architecture/ADR-012-windows-preview.md).

**Windows Bluetooth/SPP has not been tested on real Windows hardware.** Successful Actions compilation, Rust tests and NSIS packaging do not verify pairing, band communication, reconnection or continuous operation.
