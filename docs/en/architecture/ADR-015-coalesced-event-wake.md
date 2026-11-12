# ADR-015: Coalesced event wakes

**English** · [简体中文](../../zh-CN/architecture/ADR-015-coalesced-event-wake.md) · [繁體中文](../../zh-TW/architecture/ADR-015-coalesced-event-wake.md)

## Problem

Repeated task-start Hooks could request native launches even when Buddy was already visible and held awake. The launch cooldown delayed redundant opens without removing them.

## Decision

The Mac continues to compute aggregate mode, priority and task colors. A fresh current-link ACK with a visible page, accepted keep-screen state and an unexpired display lease permits snapshot-first event delivery. Concurrent Hooks join the existing bounded display transaction; snapshots carry the latest aggregate state. Per-task completion records remain independent of display coalescing. If the next receipt explicitly reports hidden/off, the transaction may launch once within its original deadline. Explicit user operations retain their existing native wake behavior.

## Alternatives

Permanently deduplicating session + event would suppress legitimate later turns in the same conversation. A longer launch cooldown would only postpone duplicate opens. Band-side task inference would violate ownership and add device load.

## Compatibility and evidence

No device protocol or renderer change. Older Buddy without foreground evidence retains native wake delivery. Existing pause, disconnect, installation, recovery and timer bounds remain. Fake-clock tests cover simultaneous sessions, bursts, real later turns, attention/completion, a deferred launch, hidden-page races and missing ACKs. Local health counters distinguish native launches from snapshot wakes. These tests establish removal of redundant opens; they do not establish the cause or resolution of a physical device reboot.
