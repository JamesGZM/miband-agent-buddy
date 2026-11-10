# Architecture migration map

The working prototype was reorganized without a stack, wire-version, storage-location or UI redesign. Pre-existing uncommitted functionality was retained.

| Before | Current source / responsibility |
|---|---|
| `desktop` | `apps/desktop` |
| `quickapp` | `apps/band` |
| `mac` service files | `services/runtime/bin`, `src/core`, `src/adapters` |
| `mac/codex-hook.mjs`, `mac/buddy-runtime.mjs` | Stable executable/import compatibility shims |
| `quickapp/src/common/protocol.js` | `packages/buddy-shared/protocol/snapshot.js` |
| `quickapp/src/common/display.js`, `native-ui.js` | `packages/buddy-shared/presentation` |
| `tools`, desktop build script | `scripts` |
| Flat Node tests | `tests/runtime`, `band`, `contracts`, `architecture` |
| Multiple architecture descriptions | Canonical `docs/architecture/README.md`; older URLs redirect |

Desktop Rust modules separate composition, command decoding, login/account adapters, domain/wire models, application services, persistence and worker lifetime. Frontend modules separate Tauri bridge, initial state and preview rendering. Native Rust modules separate platform run loop, stdio/protocol, connection, application operations, session coordination and fixed error codes.

The runtime is created with injected transport, sampling, clock/timers, IDs, paths and named timing settings. Core creation/import has no platform effects. The band page delegates to a controller built with injected Vela APIs/timers. Canonical shared code is staged for Vela and wrapped unchanged for browser ESM.

Local retired service/tests, experiments, historical notes and design material were preserved under `.legacy/pre-architecture`; they are outside the official build. The downloaded upstream symlink was replaced with the same pinned physical sources under `native/transport/upstream`. The old local `desktop/dist` launch path is retained through an ignored symlink; it is not a supported source location.

Commands remain rooted at the repository (`npm run build`, `npm run build:desktop`, `npm test`, `npm run hooks:install`). Existing hook installations do not require reinstalling. Fresh setup uses `npm ci --prefix apps/band`. No new monorepo manager or TypeScript migration was added.

Development rules are in root `AGENTS.md`; boundary checks run in CI. Research and tradeoffs are recorded in ADR-001. See the [validation record](../open-source/VALIDATION.md) for automated/physical evidence.
