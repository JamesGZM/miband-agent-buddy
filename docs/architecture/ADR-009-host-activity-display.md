# ADR-009: Compile AI display state on the Mac

**English** · [简体中文](ADR-009-host-activity-display.zh-CN.md) · [繁體中文](ADR-009-host-activity-display.zh-TW.md)

## Problem

Two concurrent tasks caused visible band stutter. Session aggregation and priority already belonged to the Mac runtime, but the renderer still derived task colors from counts every frame. Moving highlights also changed native widget lists at capsule junctions. The user requires all multi-AI state calculations to finish on the Mac before delivery.

## Decision

The Mac owns session aggregation, priority, display mode and the task-color plan. The shared pure `activity-ring.colors` compiler runs in the runtime before transmission and in the desktop preview when display inputs change. New Buddy advertises `capabilities.activityRing`; the runtime then sends `activityRing`, an ordered array of one to six uppercase RGB hex colors, instead of `sessionCounts`. Order and array length define the existing equal capsule segments. No prompts, provider identities or individual session events are transmitted.

The band validates that display result once on receipt, applies it and animates it locally. It must not infer AI state from session events or aggregate task counts each animation tick. For old hosts only, counts are converted once per incoming snapshot or applied theme change. Missing-link fallback, completion decay, animation timing and display watchdogs remain local safety responsibilities.

Each renderer caches one current ring layout and at most 33 shade rows. Loading strokes retain one rectangle and one arc each, toggling visibility while moving, rather than inserting/removing widgets at junctions. Rendering time is deducted from the next frame interval; over-budget work yields for at least one millisecond. The approved colors, loading periods, selected FPS and power-saving policy remain unchanged.

## Alternatives

Sending individual AI events to the band violates the ownership rule. Sending full frames or geometry every tick would add Bluetooth traffic and make animation depend on link timing. Changing only FPS would leave observer churn and repeated state work intact. A compact color plan preserves local animation and the existing design.

## Compatibility and evidence

This is an additive v1 field, sent only after capability discovery and renegotiated on reconnect. Older bands keep their existing mode/count fields. The packet limit remains 1024 bytes, package identity and persisted preferences are unchanged. The desktop preview compiles the same plan for its selected theme; it remains a reconstruction, not a device capture.

Tests cover priority/color changes, capability gating, old hosts/bands, malformed plans, packet size, stale/completion fallback, cache invalidation, stable observed objects and render-time budgeting. A 960-frame host simulation changed native list topology 382 times before the fix and zero times afterwards, for one through six tasks. This measures widget-list churn, not panel FPS. Physical smoothness, sustained stability and battery impact require device verification. No publication is implied. Rendering guidance is in the [Quick App UI guide](../development/quickapp-ui.md).

After local code.9 installation on Smart Band 9 NFC firmware 3.1.32 at 10 FPS, the user confirmed normal operation in the requested two-task check of stutter, highlights, character and junctions. This is a short physical pass; sustained stability, measured panel FPS and battery impact remain unverified.
