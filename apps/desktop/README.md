# MiBand Agent Buddy desktop

See the [root README](../../README.md) for the supported build and usage flow. This is the formal Tauri client, not the former one-shot Setup application.

The UI contains Buddy, devices, account and application settings. Authentication remains in the app-private Application Support directory; only masked device records reach the UI. Official login completion automatically proceeds to device selection.

No distribution installer is published. Local .app builds require the source checkout, built native transport and the Node executable recorded during build to remain in place.

Structure and ownership: [architecture](../../docs/architecture/README.md). Root commands: `npm run build:desktop` and `npm run check:architecture`.
