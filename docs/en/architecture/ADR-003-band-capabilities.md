# ADR-003: Band capabilities gate longer leases and new themes

**English** · [简体中文](../../zh-CN/architecture/ADR-003-band-capabilities.md) · [繁體中文](../../zh-TW/architecture/ADR-003-band-capabilities.md)

Date: 2026-11-10 Asia/Singapore. Status: accepted by the user's UI and band-feature plan.

## Problem

The user wants a configurable screen hold of up to 30 minutes, a third band theme (DeepSeek) and real device status on the band page. Installed Buddy builds validate whole snapshots: a `wakeHoldMs` above 30 000 or an unknown `buddyTheme` makes Buddy reject the entire snapshot. The desktop must therefore know what the installed Buddy accepts before it sends either one.

## Decision

- Buddy 0.5.3 adds `capabilities` to every ACK: `{maxWakeHoldMs: 1800000, themes: ["chatgpt","claude","deepseek"], page: true}`. The band lease limit and the shared snapshot validator rise to 1 800 000 ms. The existing 30-second keep-screen renewal continues for the whole lease.
- Desktop preferences add `wakeHoldSeconds` (default 20, range 5–1800). The new `wake_hold` action saves it and sends `configure.settings.wakeHoldMs`. `connect` also sends it.
- The runtime sends `min(wakeHoldMs, capabilities.maxWakeHoldMs)`. It falls back to 30 000 when no capability is known (old Buddy, or after installation until the next ACK).
- A `deepseek` theme is refused unless `capabilities.themes` includes it. The Rust service returns "需要更新 Buddy…", and the runtime fails the operation as `unsupported` without changing settings. The desktop disables Apply and labels the card.
- The transport adds a `device_status` operation. It reads device info, status and storage through the upstream `InfoSystem` and emits `{"event":"device", firmware, model, battery, charging, storageTotal, storageFree}`. Serial number and IMEI are never forwarded. `ping` battery events also carry `charging`. The runtime requests status after authentication, every five minutes and on `refresh_device`, and exposes it as non-persisted `state.device`.

## Alternatives

- Inferring support from `appVersion` would couple the desktop to version strings and break for forks or downgrades.
- A separate handshake message would add a new wire round trip, while the ACK already arrives after each snapshot.
- Sending the long lease and retrying on rejection would leave the old band without a valid snapshot.

## Compatibility and evidence

All fields and commands are additive: `wakeHoldMs`, `capabilities`, the `device` event, `device_status`, `refresh_device` and `wake_hold`. Old preferences load with the default hold. Old Buddy keeps receiving leases of at most 30 seconds and only the original two themes. Automated tests cover:

- the runtime hold clamp for absent, large and small capabilities;
- device event validation and refresh scheduling;
- DeepSeek blocked on an old ACK;
- band 30-minute renewal and expiry, DeepSeek assets and ACK capabilities;
- Rust hold validation, persistence and the DeepSeek gate;
- frontend toasts and layout.

Several things are not yet verified. An earlier endurance trial failed at about 46 minutes, so the physical 30-minute display hold needs device confirmation. Storage units are taken as bytes from the upstream protocol and have not been checked on hardware.
