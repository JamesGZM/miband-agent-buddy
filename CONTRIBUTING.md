# Contributing to MiBand Agent Buddy

**English** · [简体中文](CONTRIBUTING.zh-CN.md) · [繁體中文](CONTRIBUTING.zh-TW.md)

Contributions are welcome: bug reports, device testing, translations, documentation and code. This guide describes how to prepare a change for review.

## Before you start

- For usage questions, read [Support](SUPPORT.md). Report vulnerabilities through the private channel described in [SECURITY.md](SECURITY.md).
- Search [existing issues](https://github.com/JamesGZM/miband-agent-buddy/issues) before opening a new one. Use the issue templates to describe a reproducible bug or the user problem behind a feature request.
- Discuss substantial features, new device support and architecture changes in an issue before implementing them. Small fixes and documentation corrections can go straight to a pull request.

English, Simplified Chinese and Traditional Chinese are welcome in issues and pull requests.

## Development setup

Fork the repository, create a branch from `main`, and follow the [development guide](docs/development/README.md). It covers macOS dependencies, local builds, the project layout and validation commands.

Keep each pull request focused on one problem. Avoid mixing formatting changes, generated output or unrelated refactors with a behavior change. Add regression tests when fixing a bug, and update documentation for changes that affect users or contributors.

## Engineering guidelines

- Keep Mac appearance, band themes and AI activity independent.
- Prefer code-drawn band interfaces and preserve the approved Buddy design. Follow the [Quick App UI guide](docs/development/quickapp-ui.md) for image resources, animation cost and physical validation.
- Follow the ownership boundaries in the [architecture](docs/architecture/README.md). Platform access belongs in adapters; shared presentation and protocol modules remain platform-independent.
- Validate data at process and application boundaries. For protocol changes, update all affected consumers and the shared synthetic fixtures together.
- Use injected clocks and dependencies for runtime tests. Cancel owned timers, listeners and child processes when an operation ends; ignore callbacks from abandoned sessions.
- Edit source generators rather than generated assets. Keep upstream changes in isolated patches with attribution; do not modify downloaded or vendored source in place.
- Keep UI strings in the localization catalog and update all three interface languages. Preserve keyboard access, visible progress and meaningful error states.
- Propose new network services, analytics or telemetry before adding them. Keep credentials, prompts, conversations, device keys and personal identifiers out of source, tests and diagnostics.

Significant ownership or protocol decisions should include a short ADR under `docs/architecture/` covering the problem, decision, alternatives, compatibility and evidence. [AGENTS.md](AGENTS.md) records the same repository boundaries for coding assistants.

## Validation

Run the smallest relevant suite while developing. Before submitting a code change, run:

```sh
npm test
npm run check:architecture
```

Run the affected Rust suites and builds as listed in the [development guide](docs/development/README.md#validation). UI changes need screenshots or a short recording. Device-related changes need the exact model and firmware tested, the action performed and the observed result. If no device was available, say so; a passing build or software receipt does not establish physical screen behavior.

For documentation-only changes, check links, commands and consistency across the translated READMEs. Report which checks you ran rather than copying a generic test checklist.

## Pull requests

A useful pull request explains:

1. The user-visible problem and resulting behavior.
2. The relevant implementation decision or tradeoff.
3. The tests and manual checks performed, including unverified conditions.
4. Any linked issue, compatibility change or documentation update.

Do not attach private logs, credentials, account screenshots with identifiers, raw Bluetooth captures or local backups. Build products, caches, editor indexes and `.agent` notes belong outside the published source tree. The pull request template is a starting point; keep its final description specific to the change.

Maintainers may request changes or split a proposal before merging. A merged change does not imply an immediate release; versioning and publication follow the [release process](docs/open-source/RELEASING.md).

## Community conduct

Treat contributors and users with respect. Give actionable feedback about the work, make room for different experience levels, and avoid harassment, discrimination, threats or sharing another person's private information. Maintainers may moderate or close disruptive discussions. GitHub's report-abuse tools are available for conduct that violates its platform policies.

## License and attribution

Contributions are made under the project's [AGPL-3.0-only license](LICENSE). Submit only material you have the right to contribute. Retain copyright notices and identify adapted third-party code in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). No contributor license agreement is required.
