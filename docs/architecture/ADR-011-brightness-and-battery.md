# ADR-011: Band brightness and battery status

[English](ADR-011-brightness-and-battery.md) · [简体中文](ADR-011-brightness-and-battery.zh-CN.md) · [繁體中文](ADR-011-brightness-and-battery.zh-TW.md)

## Problem

Brightness must retain user intent across power saving; battery/charging updates must not depend on foreground animation. Low battery needs both an app warning and a system notice without repeated alerts.

## Decision

Add capability-gated integer `bandBrightness` (0–255). The first native read seeds durable band settings when no choice exists. Power saving applies exactly 25; disabling restores the saved selection. The band adapter coalesces native writes, bounds callbacks and ignores abandoned page generations. ACK separates durable settings from native applied brightness; an operation completes only after both match. No per-frame brightness calls or new band UI.

The runtime samples existing native battery/status about once per minute behind pending delivery, wake and link probes. Below 20% creates one low-cycle sequence, retained on same-device reconnect and rearmed at 20%. The desktop adapter sends the localized system notification outside the session lock; the app keeps a visible warning. macOS controls notification display. Charging is explicit beside Mac battery, with no band layout change.

## Alternatives and compatibility

An arbitrary upgrade brightness would overwrite existing preferences; frequent writes/polling would compete with delivery. Existing clients omit the additive field and preserve the saved band choice. Legacy bands do not receive it. Low-cycle state is process-local, so an app restart can notify again. No new cloud service is used.

## Evidence

Injected-clock tests cover baseline, 0/255 boundaries, restoration/reload, delayed callbacks, error/timeout, coalescing, capability/durable/native receipts, strict low threshold and reconnect deduplication. Physical brightness, charging and notification delivery require device/OS checks. Official [brightness API](https://iot.mi.com/vela/quickapp/zh/features/system/brightness.html) and [memory guidance](https://iot.mi.com/vela/quickapp/zh/guide/best-practice/memory.html).
