# ADR-008: Code-drawn Buddy animation and task rings

**English** · [简体中文](ADR-008-animation-and-task-rings.zh-CN.md) · [繁體中文](ADR-008-animation-and-task-rings.zh-TW.md)

## Problem

Bitmap animation frames made local transfers unnecessarily large. A native drawing experiment established component support but its diagnostic UI did not preserve the approved Buddy design.

## Decision

Band UI development prefers code drawing while preserving the approved design. Image exceptions, source ownership and the validation workflow are defined in the [Quick App UI guide](../development/quickapp-ui.md).

The normal page now draws the approved 490×192 layout using native div rectangles and arc progress components. `packages/buddy-shared/presentation/geometry.js` owns the original three character shapes, seven-pixel capsule outline, state colors, loading highlights, equal concurrent task segments and three nested resource capsules. The desktop canvas consumes the same geometry. Resource labels and numbers retain their existing layout.

Animation keeps 32 breathing levels, 96 loading positions, 17 center positions and original periods. Both band and desktop preview share a selectable 10-30 FPS target, default 10; power saving forces 10 while retaining the selection, without implying measured panel frame rates. Static resource pages retain only their expiry deadline. Hide/destroy/stop cancel owned work.

The generator retires the known generated capsule directories instead of producing image frames. Only three desktop thumbnails remain; the band package contains exactly one image, its launcher icon. The icon uses the approved desktop master with a 160-pixel mark inside a 192-pixel resource. Normal and local experimental builds audit packaged images. The local builder only stages a version suffix and backs up the previous package; it no longer substitutes another UI.

## Resource-page follow-up

The user accepted the role page but still reported resource junction defects. Native resource paths now keep fixed straight segments and semicircles, with round caps only at actual path endpoints. Arc geometry stays fixed while progress percent changes; the two-pixel track and six-pixel fill share the same centerline. IDs and array lengths remain stable over 0–100%. Unchanged displayed values skip geometry generation while ACKs and text fields continue updating. Resource number nodes exist only on the resource page. Tests cover these invariants; the short physical result is recorded below, while device heap/CPU savings remain unmeasured.

## Alternatives

Keeping unused frames wastes transfer time. Inventing a Canvas API lacks firmware evidence. A separate diagnostic character would change the approved design. Native components confirmed on the device and shared pure geometry preserve the existing UI without these dependencies.

## Compatibility and evidence

Protocol v1, package identity, preferences, gestures and screen leases remain unchanged. One singleTask page owns its controller/channel/timers; optional lifecycle, drawing and sanitized transport receipts distinguish page hiding from missing ACKs and transport exits.

On Smart Band 9 NFC firmware 3.1.32 the user confirmed native geometry, arc animation and the new icon. The query API is absent, meaning unknown support rather than unsupported. Three remote foreground launches retained one live page; a deliberate transport SIGTERM recovered automatically. An ACK gap during intentional launcher inspection is not evidence of spontaneous Bluetooth failure. The original intermittent sleep/disconnect cause remains unresolved. The latest user explicitly reports no current sleep.

Tests cover geometry bounds, exact capsule segment lengths, all themes/states, unchanged pose counts, interpolation, normal/reduced cadence, repeated refresh, teardown, and identical generated consumers. Builds and ACKs do not establish physical rendering fidelity, continuous illumination or battery behavior. No release is authorized.

## Device failure and bounded native updates

The user reports code.3 froze and restarted the band. A matching ACK and unit tests had not established runtime stability; this build failed physical validation. The last diagnostic before the report showed page 1, a missing Buddy ACK and zero native transport exits. That does not identify the firmware crash cause.

The earlier working prototype cached glyph rectangles, changed a few scalar fields at 10 Hz and used one arc. Code.3 replaced both observed geometry arrays every tick at 30 Hz and used up to eight arcs on the working pet page, nine on a typical resource page. This conflicts with the official guidance to [update page objects in place](https://iot.mi.com/vela/quickapp/zh/guide/best-practice/memory.html) and [reduce dynamic style changes and repaint](https://iot.mi.com/vela/quickapp/zh/guide/best-practice/business.html). Rendering/observer pressure is a supported hypothesis, not a confirmed crash trace.

The correction uses persistent observed arrays with stable segment IDs and changed-field writes, cached glyph geometry with a single group offset, and one border component per full capsule. The current target defaults to 10 FPS, accepts 10–30 and is fixed at 10 in power saving; only partial strokes require arc components, at most four on a single-session working pet. Resource interpolation and existing screen lease policy remain intact. Tests exercise fifteen simulated minutes without replacing observed arrays and one hundred page switches. Firmware memory use, sustained physical behavior and restart avoidance still require endurance testing.

code.4 observed 19 samples over three minutes with one unchanged page start, continued ACKs and no ACK timeout; the user reported curve/line junction defects on both pages. The native correction converts centerline geometry into LVGL outer-radius strokes and quantizes stroke edges/centers to the same integer pixel grid. A failing-then-passing cross-section test checks outer/inner boundaries at both tangencies for pet and resource widths; firmware wrapper behavior and physical visual quality still require confirmation. The public QuickApp core is prebuilt, so LVGL source supports the radius hypothesis but does not prove the exact proprietary Band 9 adapter implementation.

## Configurable frame rate and preview alignment

The saved optional integer buddyFps ranges from 10 to 30 and defaults to 10. Desktop/runtime/snapshot boundaries validate it. The runtime sends it only after capability discovery and waits for a matching durable settings receipt before confirming a frame-rate operation. Legacy messages retain the saved choice. Power saving overrides the effective rate to 10 on both consumers without overwriting buddyFps. ACK diagnostics report effectiveFps and elapsedMs as targets/timing evidence, not measured physical panel refresh.

The preview consumes native geometry, renders capsule borders inside their boxes, converts arc outer radii to canvas centerlines and applies progress percentages, pixel alignment, caps and glyph group offsets. Resource units/fonts/positions match the band layout. Fresh receipts anchor animation phase and applied FPS. Native fonts/rasterization and physical firmware deviations still require visual validation; this is a reconstruction, not a screen capture.

The user's photo showed doubled strokes even along straight resource segments. A fixed background stack now contains capsule tracks so inserting their children cannot place them above the fill siblings. The user reported improvement in code.7; this supports the correction without proving a unique firmware cause. No redesign or publication is authorized. Public documentation provides no guaranteed sustainable FPS ceiling for this exact application and firmware; 30 is a configurable test target.

## Native drawing coordinates and numeric FPS input

A second device photo showed that the doubled stroke improved but CPU arc updates left accumulating radial gaps. The root cause remains unproven. The band now projects the shared landscape geometry into portrait coordinates before binding native graphics. Capsule, straight, glyph and arc widgets no longer sit beneath a rotated drawing parent; text retains its existing orientation. Projection preserves path lengths, percentages and colors, and caches projected glyphs. This avoids the transformed graphics layer and its invalidation path. The desktop continues consuming the same logical native geometry; unit tests verify the exact projection. In the code.8 check on Smart Band 9 NFC firmware 3.1.32, the user confirmed normal orientation and no recurring gaps during the requested short observation of changing CPU values. This establishes short visual success, not long-term stability, measured panel FPS or resolution of the original sleep/disconnect issue.

FPS uses the existing number-input/save-button pattern, including Enter, integer validation and disabled10 when power saving is active. It replaces the21-option selector at the user's explicit request. No release is authorized.
