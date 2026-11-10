# Contributing

Use small, reviewable changes. Keep Mac appearance, band appearance and activity sources separate. New device support needs a capability/layout definition and a physical test report; do not infer verification from successful compilation.

Before a pull request:

```sh
npm run build
npm test
npm run check:architecture
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --locked --manifest-path native/transport/Cargo.toml
npm run build:desktop
```

Include UI screenshots for visual changes and describe which device/firmware was actually tested. Do not attach credentials, device identifiers, account cookies, prompts, transcripts or raw Bluetooth packets. No additional cloud calls, analytics or telemetry should be introduced without explicit product discussion.

Code contributions are submitted under AGPL-3.0. Retain upstream notices and identify adapted source. No contributor license agreement is required.

Follow [AGENTS.md](AGENTS.md), the [architecture](docs/architecture/README.md) and [development workflow](docs/development/README.md). Significant boundary changes need an ADR. Shared contracts must be validated by every consumer; generated files and private local archives are never edited or committed.
