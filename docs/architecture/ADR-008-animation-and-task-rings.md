# ADR-008: Smooth animation and task rings

## Problem

The band updated character layers every 200 ms and the desktop preview every 100 ms. Twenty-four loading frames sampled at 3/6 frames per second and eight breathing levels made their movement visibly stepped. Only idle moved the center symbol. A text count inside the small capsule competed with the character and did not match the requested visual treatment.

## Decision

- The normal band scheduler targets 30 updates per second while a character animates or a resource value interpolates. The desktop preview aligns paints with animation frames and caps normal paints at the same target. `powerSaving` is a separate opt-in preference, default false, that lowers both to five updates per second. These are scheduling targets, not measured device frame-rate guarantees.
- Pre-rendered image-source updates remain the band rendering mechanism. Existing device evidence showed that bound opacity/position properties did not reliably repaint; this change adds no speculative Vela API. Artwork now has 32 breathing levels, 96 loading positions and 17 subpixel center positions. The loading cycle retains its previous duration; every live activity state moves the center across all three themes.
- Thinking and working reuse their theme's byte-identical idle ring images. Only the image filename is shared: each activity keeps its own breathing period, center motion and loading highlight. The generator removes the 192 known duplicate filenames and retains every distinct image frame. Only the three full-opacity idle rings needed for desktop thumbnails are emitted; 51 unused still rings are omitted.
- The power preference is persisted on the Mac and additively in band settings. New Buddy advertises `capabilities.powerSaving`; the runtime sends the optional boolean only when supported. Old stored settings default to false; messages omitting the field preserve an existing choice. A bounded pending-write queue retains the newest requested settings while an earlier storage callback completes. ACKs report the durable power choice.
- Concurrent activity colors the existing main ring, retaining its original path, seven-pixel thickness and breathing phase. One session keeps the original state color; two to six sessions replace that ring with equally spaced color segments. The first segment retains the theme/state color, and the loading highlight continues on the same path. Larger totals saturate at six; exact counts remain outside the capsule in the desktop session summary. Colors are visual task slots, not provider identities, because the wire carries aggregate counts only. Stale/idle counts restore the original ring. No extra outline or `ACTIVE` text is drawn in the capsule.
- Resource pages stop scheduling once interpolation settles and only retain the data-expiry deadline. Band hide/exit cancels animation timers. Desktop preview stops while hidden or without a canvas, coalesces refreshes, and keeps at most 192 decoded image references. Stop is idempotent and clears image callbacks/listeners.

## Alternatives

Simply reducing timer delays would retain visibly repeated frames and the static thinking symbol. Preloading every frame for every theme would increase memory with no benefit to the current view. Replacing the renderer with a new canvas/native animation API would require a larger platform change and fresh device evidence. The chosen change retains the existing tested image rendering path.

## Compatibility and evidence

The snapshot version and package identity remain unchanged; optional `powerSaving` is boolean-validated and capability gated. Buddy 0.5.5 (version code 17) adds the new capability and assets. Existing themes, resource fields, screen leases and gestures remain compatible.

Fake-clock tests cover normal/reduced cadence, live changes, hidden/destroyed callbacks, resource settling and pending settings writes. Artwork tests check generated paths, distinct intermediate pixels and all state/theme combinations. Preview tests verify the paint cap, reduced cadence, bounded cache, absence of task text and no background animation work. Actual delivered frame rate, battery use and physical smoothness still require device observation; build/ACK success alone does not establish them.

The lossless ring reuse reduced the 0.5.5 development RPK from 8,422,213 to 7,904,678 bytes after unused still removal. Before/after SHA-256 comparisons matched all 768 theme/state/breath-level combinations and every retained PNG; exactly 192 duplicate files were removed. This reduces transfer volume without reducing animation detail and does not establish a device package-size limit. The resulting build passed all 179 Node tests and the architecture check.
