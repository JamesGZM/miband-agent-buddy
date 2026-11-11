# Changelog

**English** · [简体中文](CHANGELOG.zh-CN.md) · [繁體中文](CHANGELOG.zh-TW.md)

Notable changes are documented here. Desktop and Buddy versions are maintained independently.

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
