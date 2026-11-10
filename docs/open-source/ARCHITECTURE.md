# Architecture

```text
Xiaomi official login → Tauri account module → private local credentials
                                      ↓ inherited stdio
Codex hooks → loopback:10731 → Node runtime → Rust SPP transport → Buddy
Mac sampler ────────────────────┘                 ← matching ACK ───┘
```

Tauri owns preferences, account/device selection and tray lifecycle. Node preserves the metrics sampler and sanitized Codex state machine. Rust hosts the pinned AstroBox Core and IOBluetooth main run loop. Neither AstroBox HTTP bridge nor its GUI is on the runtime path.

## State and delivery

A single selected device, one transport process and at most one unacknowledged snapshot are active. Latest sampled data replaces older unsent data. ACK must match session and sequence. Reconnection backs off up to 30 seconds and stops after eight attempts until manual retry. Manual disconnect clears reconnect intent. Installation pauses snapshots and has a bounded timeout.

Activity-source state never selects a visual theme. `appTheme` affects only Mac UI. `buddyTheme` is selected manually and remembered per device after confirmation. Supported values are `chatgpt` and `claude`.

## Additive v1 protocol

Snapshots retain v1 `session`, `seq`, CPU/memory/disk and activity mode. Added fields:

- `buddyTheme`: selected band theme.
- `settingsRevision`: nonnegative integer tracking the desired configuration.
- `keepScreen`: boolean foreground keep-screen preference.

ACK adds `buddyTheme`, `settingsRevision`, `settingsApplied` and retains `appVersion`, `keepScreen`, `keepDiagnostics`, `page` and metrics flags. A storage failure or pending write must not report `settingsApplied=true`. Legacy Buddy versions lacking these fields require update before applying themes. The package remains `com.macprobe.band9`; the visible name is Buddy.

The storage write happens only when configuration changes. Incoming activity fields cannot replace theme state. Startup storage callbacks cannot overwrite a newer incoming configuration. Foreground brightness requests refresh every 30 seconds, independent of render cadence; hide/exit cancels renewal.

## Development limitations

The source-development .app embeds the build checkout path and Node executable location. It is not a standalone redistributable bundle. A distributable installer requires runtime bundling, dependency-license closure and separate signing/notarization work. The implementation is currently macOS only.
