# ADR-007: Explicit Buddy installation inventory

**English** · [简体中文](../../zh-CN/architecture/ADR-007-band-installation-state.md) · [繁體中文](../../zh-TW/architecture/ADR-007-band-installation-state.md)

- Status: accepted
- Date: 2026-11-11

## Problem

An absent application ACK can mean that Buddy is asleep, unavailable or not installed. The previous boolean default and generic install/update control could not distinguish these cases. Comparing the current source manifest also did not prove which RPK the app would install.

## Decision

The native adapter obtains the Xiaomi installed-app list and emits only Buddy's presence and numeric version code. Fingerprints, other package names and other installed applications never enter runtime/UI state. A desktop check sends an explicit request ID, wakes Buddy and waits for its display receipt before a bounded `buddy_status` query. If native launch establishes that Buddy is absent, the check completes as not installed without waiting for an impossible application ACK. Initial and post-install launches reuse the installed-app list already read by launch. Paused startup connections and background reconnections still query without launching the app; a user's manual check is a separate, bounded operation even when background synchronization is off.

The runtime owns an additive `buddy` state with explicit unknown, checking, absent, installed, update-available, current, newer, installing and error states. Query failure preserves the last observed installation without claiming that it remains current. A changed inventory code or confirmed absence clears the old display version and invalidates older in-flight ACKs. An accepted current-session/sequence ACK whose version name exactly matches the bundled package can confirm `current` despite an older cached inventory code. That reported code is retained; the version name never establishes a numeric code. Repeating an unchanged inventory preserves the live version confirmation, while a newer numeric code remains `newer`. An active inventory check stays `checking` until its result arrives.

An explicit installation-success receipt clears old version evidence and starts a separate `install` wake/ACK phase, even with background synchronization off. Transfer progress reaching 100% proves packet delivery, not installation. Core waits up to 120 seconds after transfer for the device's installation result; `install_receipt_missing` means that result was not confirmed, not that the package necessarily failed to install. The expired waiter is cleared. A later fresh ACK or inventory can independently establish the running/installed version without rewriting the original missing-receipt outcome as a received success. Installation failure or uncertainty does not imply removal of an existing app.

The build writes `dist/buddy-package.json` alongside the RPK. It contains the package version name/code and SHA-256. A runtime adapter verifies the package bytes before injecting that available-version metadata into the pure coordinator. Missing or mismatched metadata means that version comparison is unavailable. This indicates the package bundled with the desktop app, not an unverified claim about the newest GitHub release.

All Buddy package status and update controls belong to the band page. The About page's desktop updater remains a separate application concern.

## Alternatives

- Missing ACK as missing app: rejected because sleeping Buddy legitimately sends no ACK.
- Using display version strings for every comparison: rejected because inventory supplies numeric codes even while Buddy sleeps. Exact equality with the verified bundled version is a limited live-ACK confirmation; no numeric code or semantic ordering is inferred from a name.
- Always issue a second inventory request on connection/install: rejected because serialized native operations can delay a wake and its receipt deadline.
- Use the source manifest at runtime: rejected because source and generated package may differ.

## Updating a running page

Before replacing a package, the runtime asks a recently responsive, exit-capable Buddy to exit using the existing snapshot command. A matching receipt starts a 600 ms grace; no receipt falls back to installation after 2 seconds. Other pages install directly without an extra launch. Disconnect and transport replacement cancel the owned preflight timer; late receipts cannot start another transfer. The original total installation deadline remains in force.

Two local updates left Buddy visible but without synchronization until the user exited/reopened it. This supports testing orderly page shutdown before replacement; it does not prove a firmware/interconnect root cause. Tests cover ordering, bounded fallback, cancellation and late receipts; physical validation is separate.

## Compatibility and evidence

The existing `installed` boolean, install command, package identity and RPK path remain available. `check_buddy`, the native `buddy` event and `state.buddy` are additive private-wire fields. The shared fixture is consumed by JavaScript and Rust. Coordinator tests cover absence, older/current/newer codes, failed/expired checks, retained versions after rejected installation, post-install verification, pause/reconnect without wake, stale transport rejection and metadata/package mismatches. Reconciliation tests cover a fresh bundled-version ACK after a missing installation receipt, repeated cached inventory, changed inventory, stale ACK rejection, unknown numeric codes and newer numeric builds. The native test verifies that inventory projection exposes only presence and version code. These automated checks do not prove a physical installation or screen behavior; observed device evidence belongs in the validation record.
