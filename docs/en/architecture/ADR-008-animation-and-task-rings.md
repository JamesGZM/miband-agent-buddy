# ADR-008: Code-drawn Buddy animation and task rings

**English** · [简体中文](../../zh-CN/architecture/ADR-008-animation-and-task-rings.md) · [繁體中文](../../zh-TW/architecture/ADR-008-animation-and-task-rings.md)

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

## Static palettes and bounded animation updates

Host aggregation and ordered colors remain authoritative. The native base palette and portrait projection are cached. Buddy 0.5.11 reduced model writes but still rebooted during physical multi-task testing: this approach alone is insufficient and is not a successful device validation.

The next local candidate separates immutable base widgets from moving highlights. Base widgets use the documented `style.static` modifier and acquire new `tid` keys when their styles change; animation never mutates those lists. A moving widget receives one complete style binding rather than exposing each coordinate and angle as separate reactive fields. Preserve each arc’s existing background color: forcing transparency in 0.5.12 coincided with a user-reported ring deformation, so that visual change is reverted in 0.5.13. The user still reported a thin straight/tangent mismatch in 0.5.13. The next candidate rounds native stroke widths to even pixels: the pet ring and highlights use 8 pixels, with integer centerlines and cap radii; resource strokes remain 6 pixels. Shared native preview uses the same geometry. Edge checks now include cap radii and centerlines, not only outer/inner extents. This is a rendering hypothesis requiring physical confirmation. The moving glyph group is bounded to the actual glyph rather than the entire screen, while all absolute glyph positions remain identical. Pages own their observed glyph copies. No bitmap UI, extra Bluetooth animation frames or FPS reduction is introduced.

Tests cover static binding replacement on palette/page changes, unchanged snapshots, complete style geometry, glyph absolute positions and tight bounds, and lifecycle cancellation. An 80-frame model benchmark records 520 dynamic field writes at each of 1–6 colors, zero base writes and zero component replacements. These counts do not measure native memory, damage regions, panel FPS or prove a reboot cause. Compiler output confirms static style modifiers; physical stability of the candidate still requires verification. See the [official memory guidance](https://iot.mi.com/vela/quickapp/zh/guide/best-practice/memory.html). The documented component list does not establish Canvas availability on this band; do not assume web Canvas APIs exist.

Physical follow-up: the user still reported an incorrect top straight/curve junction in 0.5.14. Even-width quantization did not resolve the reported defect. Keep this an unaccepted local candidate; obtain a clear current device photo and compare the actual join before further geometry changes. Do not claim either background alpha or odd width as the established cause.

The 0.5.15 local measurement build keeps those visual parameters. Documented `getBoundingClientRect` calls compare requested and actual stage/primitive bounds after layout, only on static-node replacement/show. A one-second deadline and generation guards retire missing/late replies; hide/destroy cancel timers. Existing ACK diagnostics carry at most three bounded numeric rectangles and enum statuses, with a desktop health allowlist. Bounds do not measure rasterized stroke coverage or establish radius semantics/crash cause. No screenshots, prompts or device identifiers are collected.

Paint-order correction: physical 0.5.15 measurements returned the requested stage (192x490), straight (8x157), and arc (186x186) bounds and positions. A reference pixel test then reproduced an independent compositing bug: at a straight/curve join, body arcs painted after tip rectangles replaced bright tip pixels with the body color. Drawing every rectangle before every arc also put static arcs above moving straight highlights. Assign loading bodies to layer 1 and tips to layer 2; paint the entire base first, all bodies second, and all tips last. Band arrays separate the existing body/tip drawing primitives without increasing their count. Two fixed, untransformed layer containers preserve stacking when task changes recreate base nodes. Desktop preview uses the same layers. Opaque-interior canvas-command tests cover both loading modes, top/bottom joins and 1-6 colors; template order and stable in-place updates are checked too. Geometry and FPS remain unchanged. These reproduce and fix a reference pixel defect, not a guarantee of firmware antialiasing or physical stability. The local candidate requires device confirmation. Bounds selection also includes the complete capsule when three primitive samples are available, since stage bounds are already established.


## Full-border capability control after the 0.5.16 failure

Physical 0.5.16 still rebooted and the user identified the outer curve as incorrect; successful layout bounds and the tip paint-order test did not establish correct raster contours or stability. A separate local `--capsule-border` template now renders two complete native capsule borders through fixed scroll viewports with both scroll axes disabled. It uses only the first two real host-prepared colors, pauses pet animation through an injected option, and preserves the normal controller, stale/terminal deadlines, connection and display leases. The normal entry remains unchanged and animation defaults on. Preview follows the explicit `animationEnabled=false` receipt. This rejects further blind stroke/radius adjustments as the next experiment. The builder alone selects the template, relocates its checked source imports, and raises only the temporary package to API level 2 and a local next-patch version. Existing commands remain compatible. A numeric/enum-only renderer receipt identifies the control. Compile and 365 software tests do not prove clipping of the positioned child on this firmware. Confirm two distinct half colors and a continuous whole-border curve before adopting this backend; this control does not validate final animation, six colors or long-run stability. No images beyond the launcher, fake task events, preference migrations or publication are introduced.

```sh
python3 scripts/build_band_probe.py --capsule-border --revision 1 --activate
npm run build:desktop -- --release --signing-mode local
```

The activation preserves the previous RPK/metadata. Running `npm run build` afterwards restores the normal source package, so do not do that when packaging this specific control.


## Whole-border loading and breathing after the control

The user reported that the 0.5.17 static control looked normal, and requested both breathing and loading again. This is visual evidence for the whole-border contour only; two-color clipping and endurance were not confirmed. Buddy 0.5.18 adopts whole native borders for the pet page, with shared, code-generated rectangular scroll windows partitioning the host-prepared palette (one through six colors). A single RGBA black border modulates breathing without changing each task color. Two persistent loading body slots and two tip slots each have two clipping windows; their topology and per-frame model writes do not grow with task count. Every child remains the same 184x482, eight-pixel native border in portrait coordinates. Resource rendering and connection/display leases are unchanged.

The alternative of restoring partial progress arcs would reintroduce the unaccepted contour backend. Per-color breathing would scale reactive work with task count. Shared geometry produces the same windows, breathing phase, glyph pose and loading colors for the native page and fresh-receipt desktop preview. This requires the documented API-level-2 scroll component; package identity, preferences and protocol v1 remain compatible. The RPK still contains only the launcher image. Tests cover complete non-overlapping border-pixel coverage, fixed loading slots, projection, breathing, task-independent model writes, teardown and preview reconstruction. These are model assertions, not firmware heap/CPU measurements, clipping/raster proof or restart prevention. Physical animation and endurance acceptance remain pending; no publication is performed.


Physical follow-up: the user accepted the restored effects while two real tasks were running and reported no hang or reboot so far. The desktop preview visibly showed two task colors and loading. This is a short initial check, not an endurance result or proof of six-task stability.

Buddy 0.5.19 coalesces incoming pet-page snapshots into the already scheduled animation tick. Packet acceptance, lease application, ACKs and completion notification processing remain immediate. Intermediate host color plans do not allocate native palettes; only the latest plan is painted. Page switches and static/resource pages retain immediate updates. This bounds rendering work under a burst without reducing the selected animation rate; software tests do not establish physical stability.
