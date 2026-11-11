# Changelog

Notable changes are documented here. Desktop and Buddy versions are maintained independently.

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
