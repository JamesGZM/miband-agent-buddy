# ADR-010: Opt-in task completion vibration

**English** · [简体中文](ADR-010-completion-vibration.zh-CN.md) · [繁體中文](ADR-010-completion-vibration.zh-TW.md)

## Problem and decision

Users need one vibration for each completed AI task, including tasks that finish while other sessions remain active. A change in aggregate display mode cannot establish which task completed.

`completionVibration` defaults to false and is persisted on the Mac and band. `completionVibrationMode` accepts only `short` and `long`, defaults to `short` and remains saved when notifications are disabled. The Mac observes each accepted main-session `Stop` transition from thinking, working or awaiting approval. Tool completion, approval requests, cancellation, session cleanup and manual reset do not count. Hosts must expose real lifecycle Hooks; task completion is not inferred from elapsed time, metric values or missing events.

The Mac queues at most 128 recent completions, expires undelivered events after 60 seconds and batches counts under an opaque notification ID. New Buddy advertises `completionVibration`; only then does the runtime send the setting and optional `completion: {id, count}`. Legacy bands receive neither field. Enabling the switch does not replay events observed while disabled. Pause, disable, explicit disconnect, reset and installation clear queued notifications.

The band validates the payload, waits for durable settings and foreground visibility, and saves the last accepted ID before requesting vibration. Matching receipts acknowledge acceptance, not physical motor operation. A lost ACK or page restart therefore cannot replay the same current delivery. Storage failures fail closed. Saving before vibrating favors avoiding duplicates; a crash between saving and the physical effect can lose a notification. This is not a claim of exactly-once physical delivery.

The injected adapter calls `vibrator.vibrate({mode: selectedMode})`; request spacing is 600 ms for short mode and 2000 ms for long mode. These intervals separate requests; the band system determines actual pulse duration. The mode field is sent only after `completionVibrationModes` capability discovery and changes require a matching durable receipt. Hide, disable and teardown cancel queued pulses and timers. The existing completion wake policy brings Buddy to the foreground; this feature adds no periodic background relaunch. The official [Vela vibrator documentation](https://iot.mi.com/vela/quickapp/en/features/system/vibrator.html) lists `vibrate` for Band 9; its `start`/`stop` APIs are not supported on that model and are not used. The manifest declares `system.vibrator`.

## Alternatives, compatibility and evidence

Triggering from aggregate `complete` misses partially completed concurrent tasks. Triggering from every Stop packet or frame repeats notifications. Assuming newer timed-vibration APIs work on Band 9 lacks device support. The compact ID/count protocol preserves v1, the 1024-byte limit, existing package identity and local animation ownership.

Injected-clock tests cover default-off persistence, each session finishing independently, simultaneous completion counts, cancellation, lost receipts, restart deduplication, storage failures, timer cleanup and old bands. Physical vibration and timing require device confirmation; an accepted receipt proves only software acceptance. See the [verification guide](../testing.md).
