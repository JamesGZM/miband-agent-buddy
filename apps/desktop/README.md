# Desktop app

The macOS desktop app uses Tauri for window, account and system integration, with a JavaScript interface. It provides Buddy previews, band management, AI connection setup, account access and preferences.

For downloads and first-time setup, see the [project README](../../README.md). For a source build, follow the [development guide](../../docs/en/development/README.md).

## Build

After preparing dependencies and generating the band resources from the repository root:

```sh
npm run build:desktop
open 'apps/desktop/dist/MiBand Agent Buddy.app'
```

Use `npm run build:desktop -- --release` for an optimized build. The app bundles its runtime, transport and Buddy resources, so the built app can be moved independently of the source checkout. See the [release process](../../docs/en/open-source/RELEASING.md) for distribution packages and signing limitations.

## Code boundaries

- `src-tauri/src` owns account access, preferences, process coordination and operating-system integration.
- `ui/bridge.js` is the only frontend module that calls Tauri.
- The remaining `ui` modules render state and handle interaction; credentials are not exposed to them.
- `artwork/app-icon.png` is the icon source. UI assets and app bundles are generated outputs.

Window and tray actions share application services. The [architecture](../../docs/en/architecture/README.md) documents the process and protocol boundaries.
