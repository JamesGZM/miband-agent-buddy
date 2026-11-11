# ADR-011: Band brightness and battery status

[English](ADR-011-brightness-and-battery.md) · [简体中文](ADR-011-brightness-and-battery.zh-CN.md) · [繁體中文](ADR-011-brightness-and-battery.zh-TW.md)

## Problem

Brightness must retain user intent across power saving; battery/charging updates must not depend on foreground animation. Low battery needs both an app warning and a system notice without repeated alerts.

## Decision

Add capability-gated integer `bandBrightness` (0–255). A valid positive native reading in manual mode seeds durable band settings when no choice exists; an unverified zero stays unknown. Power saving applies exactly 25; disabling restores the saved selection. The band adapter coalesces native writes, bounds callbacks and ignores abandoned page generations. ACK separates durable settings from native applied brightness; an operation completes only after both match. No per-frame brightness calls or new band UI.

The native adapter forwards changed battery/charging projections from Core device-state events without another device request. The runtime keeps a roughly 5–6 second polling fallback behind pending delivery, wake and link probes. Below 20% creates one low-cycle sequence, retained on same-device reconnect and rearmed at 20%. The desktop adapter sends the localized system notification outside the session lock; the app keeps a visible warning. macOS controls notification display. Charging is explicit beside Mac battery, with no band layout change.

## Alternatives and compatibility

An arbitrary upgrade brightness would overwrite existing preferences; frequent writes/polling would compete with delivery. Existing clients omit the additive field and preserve the saved band choice. Legacy bands do not receive it. Low-cycle state is process-local, so an app restart can notify again. No new cloud service is used.

## Evidence

Injected-clock tests cover baseline, 0/255 boundaries, restoration/reload, delayed callbacks, error/timeout, coalescing, capability/durable/native receipts, strict low threshold and reconnect deduplication. Physical brightness, charging and notification delivery require device/OS checks. Official [brightness API](https://iot.mi.com/vela/quickapp/zh/features/system/brightness.html) and [memory guidance](https://iot.mi.com/vela/quickapp/zh/guide/best-practice/memory.html).

Automatic brightness has its own App switch and disables the manual slider. Power saving temporarily uses manual mode at 25, then restores the selected mode and manual value. An unverified initial zero is shown as unknown instead of becoming a saved default. Brightness operations check native mode/value readback; success callbacks alone do not establish applied brightness.
