# Quick App UI development

**English** · [简体中文](quickapp-ui.zh-CN.md) · [繁體中文](quickapp-ui.zh-TW.md)

Buddy's band interface should be drawn in code wherever practical. Preserve the approved characters, capsule outlines, resource layout and interactions when changing the renderer. A drawing prototype tests device capabilities; it does not establish a new product design. See the [development guide](README.md), [architecture](../architecture/README.md) and [rendering decision](../architecture/ADR-008-animation-and-task-rings.md).

## Code and image policy

Use native `div`, `text` and arc `progress` components for the existing interface. Share geometry and animation calculations with the desktop preview. These components have been tested on the target band; do not assume that a browser Canvas API exists in Vela. A missing capability-query API means unknown support, not proof that a component is unsupported.

| Resource | Project policy |
| --- | --- |
| Characters, outlines, resource rings and animation | Generate geometry in code; do not restore PNG frame sequences or full-screen UI images. |
| Band launcher icon | Keep the required `common/icon.png`, generated from the approved master. It is separate from page rendering. |
| Desktop theme thumbnails | Keep the three generated thumbnails on the Mac; do not package them in the band RPK. |
| Future bitmap requirement | Explain why native drawing is unsuitable, minimize dimensions/count and measure package size, decoded memory and device behavior. |

The current build audits the RPK and permits exactly one image: the launcher icon. An intentional asset-policy change must update that audit and its documentation together. Small compressed files can still consume decoded memory and caches. Code drawing also has a cost: excessive nodes, observers or per-frame allocations can perform poorly. Compare actual workloads before claiming a performance benefit.

## Source ownership

| Source | What to change there |
| --- | --- |
| `packages/buddy-shared/presentation/geometry.js` | Canonical 490×192 layout, characters, capsule paths and projection into native 192×490 coordinates; pure ES5 CommonJS. |
| `packages/buddy-shared/presentation/native-ui.js` | Shared animation timing and effective FPS policy. |
| `apps/band/src/controllers/page-controller.js` | Injected platform APIs, observed-state updates and page/timer ownership. |
| `apps/band/src/pages/index/index.ux` | Native templates, styles and text layout. |
| `apps/desktop/ui/preview.js` | Canvas reconstruction of the same native geometry and timing. |
| `scripts/prepare_shared.py` | Generated Vela/browser adapters for canonical shared modules. |
| `scripts/render_band_ui.py` | Three desktop thumbnails and retirement of known obsolete frame directories. |
| `scripts/prepare_band_icon.py` | Launcher icon from `apps/desktop/artwork/app-icon.png`. |

Edit these sources and generators, then rebuild. Do not hand-edit staged app copies or generated assets. Remove obsolete resources through their owning generator; do not delete unrelated local files as cleanup.

## Animation and repaint budget

Multi-AI state calculations belong on the Mac: aggregate sessions, select priority/mode and compile the ordered task colors before sending a snapshot. A capable band receives `activityRing`, not aggregation inputs; it only applies the plan and plays local animation. Legacy compatibility converts counts once per snapshot, not per tick. Keep local link fallback and display watchdogs ([ADR-009](../architecture/ADR-009-host-activity-display.md)).

- Keep observed shape arrays and IDs stable. Update changed fields in place, cache immutable glyph geometry and move a group using a scalar offset. Avoid rebuilding all bound objects every tick. Keep data that does not drive UI outside the observed view model, following the official [memory guidance](https://iot.mi.com/vela/quickapp/zh/guide/best-practice/memory.html).
- Each renderer caches only its current task-color layout and a single fixed native color row (the logical reference can cache up to 33 shade rows). Task/theme/state changes invalidate that cache; moving loading highlights reuse a fixed rectangle/arc pair per stroke. Include rendering time in the frame budget rather than waiting a full interval after rendering. These reduce repeated calculation and widget churn without changing the loading effect or sending frames over Bluetooth; device smoothness still needs measurement.
- Limit component count, nesting and dynamic style changes, following the official [rendering guidance](https://iot.mi.com/vela/quickapp/zh/guide/best-practice/business.html). Skip resource geometry updates when displayed values are unchanged. Stop animation work on hidden pages and cancel owned timers/listeners on destruction.
- Preserve fixed background/fill ordering. Vela [stack](https://iot.mi.com/vela/quickapp/zh/components/container/stack.html) places later direct children above earlier ones; keep tracks in their background container so dynamic children cannot cover the fill.
- Preserve the current projection into native coordinates before binding graphics. A rotated graphics parent was removed after accumulating CPU arc gaps appeared on the device. Check both straight/curve tangencies and moving arc endpoints; unit geometry tests alone cannot establish correct firmware repaint.

Applied memory optimizations: diagnostic counters and resource interpolation state stay in controller closures rather than the observed page model. Constant resource labels and immutable base styles use static bindings; a palette change recreates keyed base nodes. Values and moving highlights remain dynamic. Palette caches compare their bounded color list without allocating a joined key each frame. Native brightness requests run only on foreground/settings changes, not animation ticks. Do not add periodic `runGC`: the official memory guide warns frequent GC can stutter.

`buddyFps` accepts integers from 10 to 30, defaults to 10 and is edited using a number input with Save or Enter. Power saving forces an effective 10 FPS without discarding the selected value. The desktop preview uses the same geometry and effective rate; fresh ACK timing anchors its animation phase. It reconstructs the scene and is not a device screen capture. Font and rasterization differences still need visual comparison.

The selected FPS and ACK `drawing.effectiveFps` describe a scheduling target. Neither they nor the JavaScript frame counter measure delivered panel FPS. The sustainable upper limit and battery cost remain unmeasured; 30 FPS is a test target, not a performance guarantee.

## Build and device validation

From the repository root, build the band resources, run the relevant geometry/controller/preview tests, then the common checks:

```sh
npm run build
node --test tests/band/code-probe.test.mjs tests/band/native-ui.test.mjs tests/contracts/preview-animation.test.mjs
npm test
npm run check:architecture
```

Rebuild the desktop bundle when the preview or bundled RPK changes; the [development guide](README.md) also describes local test versions. Building does not install or publish a version. Report the RPK byte size and image inventory when changing resource generation.

On the device, check both pages, all themes/activity states, resource values across straight/curve junctions, repeated percentage changes, hide/return and repeated foreground launches. Test power saving and saved FPS restoration, then observe sustained tasks and completion-to-idle screen delay separately. Record model, firmware, duration and physical result; a successful transfer or ACK cannot establish rendering, stability or illumination.

On Smart Band 9 NFC firmware 3.1.32, the user reported that local code.3 froze and restarted the device. That version replaced observed arrays at 30 Hz; observer/rendering pressure is a hypothesis, not a proven crash cause. After in-place updates, fixed layering and native-coordinate drawing, the user confirmed normal orientation and no recurring CPU arc gaps in the short code.8 check. This does not establish long-term stability, a measured FPS ceiling or resolution of the original intermittent sleep/disconnect. See [testing and limitations](../testing.md).

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

```sh
npm run build
npm run build:desktop -- --release --signing-mode local
```


Physical follow-up: the user accepted the restored effects while two real tasks were running and reported no hang or reboot so far. The desktop preview visibly showed two task colors and loading. This is a short initial check, not an endurance result or proof of six-task stability.
