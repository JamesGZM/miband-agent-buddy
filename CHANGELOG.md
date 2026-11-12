# Changelog

**English** · [简体中文](CHANGELOG.zh-CN.md) · [繁體中文](CHANGELOG.zh-TW.md)

Notable changes are documented here. Desktop and Buddy versions are maintained independently.

## [0.7.4] - 2026-11-12

### Improved

- Buddy 0.5.18 draws the character-page contour with whole native borders, cached task-color windows, one breathing overlay and fixed loading slots. Tight glyph bounds and in-place style updates limit model writes without scaling animation work with task count.
- Negotiate activity holds up to 120 seconds while retaining the legacy 15-second fallback. Previously confirmed active displays advertising the full 120-second capability receive a snapshot first on reconnect; missing replies trigger a bounded recovery wake, while hidden-page receipts cancel it.

### Fixed

- Preserve the first pending snapshot when the new connection reports its initial app inventory, while still invalidating receipts after a known installation change.
- Match the static two-color border probe in the desktop preview, restore breathing for legacy renderer previews and remove an unused observed glyph offset.
- Include pinned upstream WebView2 license notices and corresponding sources for experimental Windows builds.

### Verification limits

- Includes normal Buddy **0.5.18 / code 40**; use the Band page to update an older installation. The local same-version review-fix package was explicitly reinstalled before this release.
- Short visual feedback accepted the restored effects with two real tasks. Firmware memory use, physical panel FPS, six-task stability, long-duration illumination and restart avoidance remain unverified. Compilation, unit tests, layout bounds and ACKs do not establish those results; see [verification and compatibility](docs/testing.md).
- GitHub macOS packages remain certificate-free ad-hoc signed and are not Apple-notarized. Windows installers remain experimental and are not attached to the macOS Release.

## [0.7.3] - 2026-11-12

### Fixed

- Recover an opted-in active task when reconnection fails before Buddy is launched. Fresh installed metadata and a successful current link probe authorize at most two preparation retries within 60 seconds, without waiting for another Hook. Missing or post-launch results cannot trigger duplicate launches.
- Prioritize the first confirmed display lease ahead of background device queries. Cancel queued/in-flight recovery when task intent or connection ownership changes.
- Includes the native ACK forwarding, actual link-loss handling, bounded response recovery and local-certificate/CI signing separation prepared in the cancelled v0.7.1/v0.7.2 releases.

### Documentation and builds

- Add a live App homepage GIF and screenshots of Band, AI connections, Account, Settings and resource/display views to all README languages.
- Add experimental certificate-free Windows x64/ARM64 NSIS builds, user-scoped DPAPI storage, packaged runtime and corresponding source artifacts. Windows installation and device behavior remain unverified.
- Local macOS packages use an existing user certificate; GitHub packages remain certificate-free. Short physical keep-awake observation passed; long-duration and actual-outage recovery verification remain documented limitations.

## [0.7.2] - 2026-11-12

### Added

- Real macOS App screenshots in all README languages.
- Experimental certificate-free Windows x64/ARM64 NSIS installer workflow, with native runtime packaging, user-scoped DPAPI storage and corresponding sources. Windows device behavior and installation remain unverified.

### Fixed

- Show automatic recovery wake and acknowledgement phases explicitly; radio reconnection, launch enqueueing and Buddy confirmation remain separate states.
- Includes the bounded response recovery, actual link-loss handling and local-certificate/CI signing separation prepared for the cancelled v0.7.1 release.

## [0.7.1] - 2026-11-12

### Fixed

- Keep forwarding Buddy acknowledgements while native device queries are pending; bound independent queries concurrently and reuse known app metadata for later wakes.
- Report actual Bluetooth open/close failures immediately instead of treating a lost link as a sleeping band. Standby now says Buddy is not responding and leaves screen state unconfirmed.
- Retry opted-in active-task delivery promptly after a missed acknowledgement. A successful link probe can request one bounded recovery wake; repeated failures cannot continually reopen Buddy.
- Cancel queued and in-flight recovery when tasks end, settings change or the connection owner stops; late launch results cannot create a display lease.

### Build and signing

- Local builds require an existing signing certificate and use fixed App/Node/transport identifiers, preserving stable certificate-based code identity across rebuilds.
- GitHub builds explicitly use certificate-free ad-hoc signing. They do not read the local keychain, accept local signing identities, or create/import temporary certificates.
- Add regression coverage and three-language signing and verification guidance. Local certificate authorization persistence and a manual wake receipt were verified; physical automatic recovery and extended screen-on reliability still require device testing.

Buddy remains **0.5.10**; no band reinstall is required.

## [0.7.0] - 2026-11-11

### Added

- Automatic-brightness switch, disabled manual control in auto mode, native readback verification and restoration after power saving.
- Band brightness slider (0–255), power-saving brightness fixed at 25, explicit charging status and low-battery Mac notifications plus an in-app warning below 20%.
- Opt-in task completion vibration, off by default: short/long choices (default short), one vibration for each observed AI task completion, including concurrent tasks, with durable notification deduplication.
- Settings grouped into appearance, startup/sync, band display, task notifications and about.
- Buddy frame-rate input from 10 to 30 FPS; power saving uses 10 FPS while retaining the selected rate.
- English, Simplified Chinese and Traditional Chinese contributor documentation with language-preserving navigation and Quick App development guidance.

### Improved

- Code-drawn Buddy characters and resource rings preserve the existing design. The band package contains only its launcher icon as an image, reducing local transfer size.
- Multi-AI state and task colors are compiled on the Mac. Stable native widgets, cached geometry/color levels and frame-time budgeting reduce animation work.
- Mac previews share native geometry, effective frame rate and animation timing with Buddy.

### Fixed

- Tolerate a transient status-query failure and restore an active Buddy once after a charging overlay.
- Gracefully exit a responsive running Buddy before replacing its package, with bounded fallback and cancellation.
- Resource-ring junctions, doubled strokes and accumulating CPU arc gaps during updates.
- Brightness-request failure handling, stalled sampling and active-task reconnect recovery, with bounded callbacks and retries.
- Page/controller ownership and diagnostics distinguish hidden pages, missing receipts and transport failures.

Includes stable Buddy **0.5.10** without a test suffix. Physical panel FPS, battery impact and extended screen-on reliability remain unmeasured; see the [verification guide](docs/testing.md).

## [0.6.0] - 2026-11-11

### Added

- Guided first launch, from Xiaomi account sign-in to connecting a band and setting up AI activity.
- Project-scoped Hooks setup for Codex, Claude Code and compatible AI harnesses.
- GitHub update checks and installation for the macOS app.
- Portable Apple Silicon and Intel downloads, with checksums and corresponding source archives.
- Optional task keep-awake and power-saving controls.

### Improved

- Startup and theme previews wait for complete frames before displaying new artwork.
- Concurrent tasks share the original Buddy ring through colored segments.
- Animations move across all supported Buddy themes and activity states.
- Manual band controls show waking, applying and confirmed states.
- Buddy installation and update management live on the Band page.
- First-run guidance no longer appears just because an existing device reconnects.

### Fixed

- Saved preferences reverting after delayed state refreshes or writes.
- Incorrect storage-meter fill and stale version-update prompts.
- Premature wake failures when an application response arrives before its display is ready.
- Lost transport acknowledgements when sequence numbers wrap during large transfers.

This release includes Buddy 0.5.5. See the [verification guide](docs/testing.md) for compatibility and current limitations.

[0.6.0]: https://github.com/JamesGZM/miband-agent-buddy/releases/tag/v0.6.0
[0.7.0]: https://github.com/JamesGZM/miband-agent-buddy/releases/tag/v0.7.0
