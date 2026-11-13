# ADR-017: Channel lifecycle and layered recovery

**English** · [简体中文](../../zh-CN/architecture/ADR-017-channel-recovery.md) · [繁體中文](../../zh-TW/architecture/ADR-017-channel-recovery.md)

## Problem

System Bluetooth can stay connected while Buddy returns home or its interconnect/RFCOMM session stops answering. A later ACK timeout previously hid the first failure.

## Decision

Vela owns channel establishment. An injected band controller observes onopen/onclose/onerror, makes a capability-checked, one-second bounded getReadyState query at creation/open, and retains one latest ACK. A close/error permits one replay on the next open; duplicate opens do not grow a queue. Startup not-ready is normal. Destroy retires timers, listeners and callbacks. The optional channelLifecycle capability/ACK evidence contains bounded counters, timestamps, enums and numeric codes only. No raw platform error text is copied.

The Mac immediately probes the device after a missing application ACK. A successful probe permits only the existing bounded, opted-in active-task Buddy recovery. It does not restart the transport. Two failed probes or a real native worker/channel exit use the existing bounded reconnect backoff. This separates application recovery from device-probe and worker recovery; probe failure alone does not prove a physical radio disconnect. Pause, task completion, disconnect, install and abandoned generations retain their cancellation rules.

Diagnostics retain the first observed anomaly with host time, layer, sanitized code and worker generation across automatic reconnects. The original worker exit code/signal is attached once. Capability-gated channel evidence also retains its own band-local first event time/code. Later success/ACK timeouts cannot overwrite the first anomaly. An explicit connect starts a fresh observation window; runtime/App restart also starts a new window. Health-file projection allowlists every new field.

The first ACK timeout allows one quick fresh-snapshot retry; continued idle failures retain the normal 30-second delivery backoff. A failed probe gets a fresh snapshot opportunity before the second probe. Probe request IDs are unique, so late replies cannot settle a newer probe. Explicit user operations supersede a background probe.

## Alternatives

Resetting all Bluetooth connections on ACK loss disrupts healthy channels. Invented reconnect APIs, periodic app relaunches or fake background capabilities are not supported. Treating initial channel setup as a failure would mask the real first outage.

## Compatibility and evidence

Protocol v1 and matching session/sequence receipts are unchanged. Legacy ACKs without the capability remain valid. The cached ACK replay neither reapplies snapshots nor extends display leases. Shared fixtures, fake-clock lifecycle/recovery tests and Rust projection tests cover bounds, stale callbacks, sanitization and first-cause retention. Builds and ACKs cannot establish the cause or resolution of a physical app exit, reboot or long-term drop.

[Vela interconnect](https://iot.mi.com/vela/quickapp/zh/features/network/interconnect.html).
