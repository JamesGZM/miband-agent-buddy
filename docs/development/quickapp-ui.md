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
- Each renderer caches only its current task-color layout and up to 33 small shade rows. Task/theme/state changes invalidate that cache; moving loading highlights reuse a fixed rectangle/arc pair per stroke. Include rendering time in the frame budget rather than waiting a full interval after rendering. These reduce repeated calculation and widget churn without changing the loading effect or sending frames over Bluetooth; device smoothness still needs measurement.
- Limit component count, nesting and dynamic style changes, following the official [rendering guidance](https://iot.mi.com/vela/quickapp/zh/guide/best-practice/business.html). Skip resource geometry updates when displayed values are unchanged. Stop animation work on hidden pages and cancel owned timers/listeners on destruction.
- Preserve fixed background/fill ordering. Vela [stack](https://iot.mi.com/vela/quickapp/zh/components/container/stack.html) places later direct children above earlier ones; keep tracks in their background container so dynamic children cannot cover the fill.
- Preserve the current projection into native coordinates before binding graphics. A rotated graphics parent was removed after accumulating CPU arc gaps appeared on the device. Check both straight/curve tangencies and moving arc endpoints; unit geometry tests alone cannot establish correct firmware repaint.

Applied memory optimizations: diagnostic counters and resource interpolation state stay in controller closures rather than the observed page model. Only constant resource labels use `static`; values, shapes and colors remain dynamic. Palette caches compare their bounded color list without allocating a joined key each frame. Native brightness requests run only on foreground/settings changes, not animation ticks. Do not add periodic `runGC`: the official memory guide warns frequent GC can stutter.

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
