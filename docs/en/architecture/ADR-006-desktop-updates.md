# ADR-006: Relocatable macOS bundles and explicit GitHub updates

**English** · [简体中文](../../zh-CN/architecture/ADR-006-desktop-updates.md) · [繁體中文](../../zh-TW/architecture/ADR-006-desktop-updates.md)

## Problem

The desktop executable previously embedded checkout and Node paths. A runner-built `.app` could not run on another Mac, so source releases did not provide desktop updates.

## Decision

The builder places an official Node executable, the runtime/shared source layout, native transport and matching Buddy RPK/metadata inside `Contents/Resources/runtime`. Runtime startup prefers these bundle resources. A direct Cargo development run retains its existing checkout fallback. Build checks reject non-system dynamic-library dependencies, and bundle resources are signed locally with an ad-hoc signature. No Apple developer credentials are generated or assumed.

A desktop-owned updater checks only this project's GitHub latest stable release when the user first opens Settings in a session, or requests a manual check. The app name links to the fixed repository; the adjacent version button shows an update dot only for an available package and expands the update controls. It selects a fixed asset name for the running architecture, requires GitHub's SHA-256 asset digest and exact repository download URL, limits redirect hosts/download size/decompressed bytes, and rejects archive traversal, symlinks and duplicate files. The staged bundle must match the identifier/version, contain required runtime files, support the current architecture and pass code-signature integrity validation. GitHub is the release trust boundary; an ad-hoc signature does not establish a publisher identity or notarization.

Downloading does not replace the running app. A separate **install and restart** action stages the verified bundle beside the current app, checks write access without privilege escalation, waits for the app to exit, retains the old bundle as a backup and rolls back if replacement or launching fails. Private app data stays outside the bundle. A source-run executable or App Translocation path cannot update in place. Background check/download state lives outside device/session state and never initiates a Bluetooth operation.

Version tags or an explicit release dispatch build both Mac architectures and publish a GitHub Release only after validation succeeds. Separate source archives contain only reviewed Git-tracked project files, the actual patched pinned upstream files and resolved linked Rust crate sources; private workspace material is rejected. Branch/PR checks never package. The updater ignores prereleases and reports the absence of a release or matching asset explicitly.

## Alternatives

Tauri's signing-key updater would require a persistent release-signing key and public-key enrollment, neither of which is configured. The fixed GitHub digest plus local bundle integrity model is implementable now, with its trust boundary documented. Source-only updates were rejected because they would still require a checkout/compiler on every user's Mac. General arbitrary-URL installers were rejected because this product updates one known app.

## Compatibility and evidence

No private data path, bundle identifier, loopback endpoint or v1 device protocol changes. Native Core's isolated optional-feature patch removes the unused, unlicensed Vivo MsgPack dependency from the actual app graph while preserving upstream defaults for other consumers. The release packager checks that exclusion before producing assets.

Rust tests cover stable version/platform selection, URL trust, unsafe and valid archives, executable modes, and successful replacement/rollback. Workflow tests enforce the release boundary. Full builds and a future real GitHub release remain separate from physical band validation.

References: [GitHub releases](https://docs.github.com/en/rest/releases/releases), [asset digests](https://docs.github.com/en/rest/releases/assets), [Mac runner architectures](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

## Dedicated update service

The desktop checks `https://buddy-updates.ailaogong.men/buddy/releases/latest` first, then the official GitHub API on timeout, HTTP failure or invalid metadata. Valid cached releases may arrive up to ten minutes late. The service is an additional trusted metadata intermediary; it is not a release-signing authority. It can serve the metadata/digest together, so compromise of this service is within the documented trust boundary.

The updater derives the Worker download URL from the exact official tag and architecture asset. It streams to a private temporary archive and requires the selected size and SHA-256 before extraction. A failed, partial or corrupt Worker download restarts from byte zero at the fixed GitHub URL. Storage failures stop immediately. Both sources retain archive, bundle identity/version, architecture and signature checks before installation; replacement and rollback are unchanged.

Operational details: [update service](../development/updates.md).
