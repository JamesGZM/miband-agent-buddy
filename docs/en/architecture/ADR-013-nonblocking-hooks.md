# ADR-013: Nonblocking observational Hooks

**English** · [简体中文](../../zh-CN/architecture/ADR-013-nonblocking-hooks.md) · [繁體中文](../../zh-TW/architecture/ADR-013-nonblocking-hooks.md)

Historical decision: source-installation and skill distribution are superseded by [ADR-016](ADR-016-bundled-integration.md). The old installer scripts are removed; the npm command now prints the offline guide. The event-contract and privacy decisions below remain relevant.

## Problem

Synchronous command hooks wait for local HTTP delivery (about 600ms when the receiver stalls). Fail-open exit codes alone do not prevent delays. Reinstalling formerly matched only commands, leaving old synchronous fields unchanged.

## Decision

Use native async handlers where supported. Every CLI sanitizes input before launching a detached worker with ignored stdio; the agent never awaits HTTP. The sender bounds input to 150ms and the worker bounds HTTP to 600ms and process lifetime to 1.2s. Codex SessionEnd remains explicitly synchronous but only runs the short ingress. No retry queue or raw payload storage is introduced. Timestamp before input/dispatch; ignore older arrivals and prevent same-millisecond active events from overwriting terminal state. Reinstall updates only owned handler async/timeout fields, preserving other settings, private backup and atomic replacement.

## Alternatives

Shorter HTTP deadlines still delay the agent. Unbounded background processes leak resources; inheriting host pipes keeps callers waiting. Adding a durable queue would require a new storage/lifecycle contract. Native async alone does not address synchronous-only SessionEnd or custom harnesses.

## Compatibility

Keep both compatibility entrypoints, library forwarding APIs, session hashes and the three-field event contract. Delivery is best effort: native async hooks can start out of order or be cancelled at teardown. Captured sender time is not a host sequence number. A later-millisecond new prompt can reopen a completed session.

## Evidence

Targeted tests exercise detached workers, closed host pipes, malformed/open input, sanitized payloads, matching-handler upgrades, import purity and reordered events. Local process startup still has a small cost. Native host loading/trust and physical band response require separate observation.

## Cursor local compatibility

The local Cursor shim calls the same bounded detached delivery through a tested Cursor adapter. Preserve its `custom` namespace, conversation identity and existing command path. Cursor preToolUse needs a valid permission response; an empty object risks schema rejection. Always emit the non-veto response, including on input/launch failure. Other hook decisions remain untouched. Tests cover lifecycle/privacy mappings, failed dispatch, unterminated stdin and response shapes.
