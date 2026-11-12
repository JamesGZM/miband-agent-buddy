# Verification and compatibility

**English** · [简体中文](../zh-CN/testing.md) · [繁體中文](../zh-TW/testing.md)

## Automated checks

Run these commands from the repository root after completing the [development setup](development/README.md):

```sh
npm run build
npm test
npm run check:architecture
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --locked --manifest-path native/transport/Cargo.toml
cargo test --locked --manifest-path native/transport/Cargo.toml -p corelib device::xiaomi::sar::tests
npm run build:desktop
```

Runtime and band tests use injected clocks, transports and platform adapters. Contract tests exercise startup, saved settings, asynchronous artwork, first-run routing and protocol compatibility. Architecture checks enforce the ownership boundaries in the [architecture guide](architecture/README.md).

Pull requests run source checks without producing application packages. Release builds additionally validate both Mac architectures, package contents, code-signature integrity and execution from a relocated archive. Results are available in [GitHub Actions](https://github.com/JamesGZM/miband-agent-buddy/actions).

## Device coverage

| Environment | Coverage |
| --- | --- |
| macOS on Apple Silicon | Local builds, desktop UI and device connection checks |
| macOS on Intel | Release build and archive validation in CI; physical band testing still needed |
| Windows x64 / ARM64 | Native Actions builds, Rust tests and NSIS packaging; real Windows Bluetooth/SPP and device behavior untested |
| Xiaomi Smart Band 9 NFC | Account connection, Buddy installation, activity sync and short wake checks on firmware 3.1.32 |
| Xiaomi Smart Band 9 | Targeted by the application; physical confirmation still needed |

Buddy 0.5.18 installation and software communication have been verified on the NFC model with firmware 3.1.32, including explicit reinstallation of the same-version review-fix package. The user accepted the restored breathing/loading effects during an earlier short check with two real tasks; a 115-second diagnostic observation recorded no new page recreations, transport closes, ACK timeouts or page errors. These observations do not establish physical panel FPS, battery consumption, six-task stability, continuous illumination or restart avoidance. The latest reinstall receipt is not a new physical visual or endurance result.

Local keep-awake regression tests cover failed/hung sampling with continuing task snapshots, stale metrics becoming unknown, one in-flight sampler, late results after stop, negative brightness success payloads, bounded retries, and one active-task recovery wake after transport reconnect. These are software checks; they do not establish extended physical endurance.

## Manual acceptance

Use a test account and device where possible. Do not erase an existing account or pairing merely to exercise onboarding.

1. Launch without saved account data. Verify the welcome action, account region, device selection and pairing instructions.
2. Restart with a saved device. Verify its theme and preferences return without a flashing preview or a repeated first-run guide.
3. Switch among themes while artwork is cold. Check that complete frames replace one another without blank or mixed layers.
4. Verify absent, installed and updated Buddy states on the Band page. Treat transfer completion and installation confirmation separately.
5. Exercise manual wake and settings with activity sync both on and off. Confirm the result on the physical screen as well as in the app.
6. Run overlapping AI sessions. Completing one session must leave the others active; only the final completion starts the idle timer when task keep-awake is enabled.
7. Verify power saving, disconnect recovery, window close and explicit quit. Restore the user's original settings after testing.
8. Observe task keep-awake beyond the previous failure time. Record task state, connection, last sync and display diagnostics when sleep occurs. Cover long thinking/tool/approval waits, final completion, and watchdog release after sync stops. Verify one recovery wake after a real transport reconnect with an active opted-in task; idle, paused, disabled and ended tasks must stay quiet.

## Current limitations

- Bluetooth recovery and extended task keep-awake need further testing across firmware versions. Extended screen-on sessions may end unexpectedly on the tested firmware; a successful API response alone does not prove physical illumination.
- A band installation can complete without its final result reaching the Mac. Reconnect and check the running version before reinstalling.
- Animation update rates are scheduling targets. Actual panel frame rate and power use have not been measured.
- GitHub macOS packages are certificate-free ad-hoc signed, not Apple-notarized. The standard macOS first-open approval may be required.
- AI integrations depend on lifecycle events exposed by each host. A theme name does not imply a native Hooks API exists in that product.

Report reproducible problems through the [support guide](../../SUPPORT.md). Keep account data, device keys, prompts and transcripts out of public reports.

On Smart Band 9 NFC firmware 3.1.32, the user confirmed visible dimming from manual brightness 202 to power-saving 25. Native readback and the App verified auto on/off, disabled manual controls, mode restoration and the saved manual value. Installation now exits a responsive old page first; subsequent local updates automatically resumed synchronization. This is a short device check, not battery/endurance measurement or proof of a firmware root cause. The user also confirmed faster charging-state updates and automatic Buddy restoration after reconnecting the charger without manually reopening Buddy. The runtime tolerates a transient status-probe failure and uses device events plus a 5–6 second polling fallback. This short recovery check does not establish uninterrupted Bluetooth connectivity. Low-battery system notification delivery still requires OS validation; threshold/deduplication tests do not prove macOS notification display.

On 2026-11-12, the local App, bundled Node and transport were signed with an existing Apple Development certificate and fixed distinct identifiers. Two different test binaries produced the same certificate-based designated requirement. After one authorization for the new identity, the user confirmed that restarting the unchanged App did not prompt again and reconnected. The actual manual wake operation then completed with a matching display receipt; post-restart diagnostics showed no ACK timeout or transport close during this short check. CI signing-mode selection is tested locally; no new GitHub release was published. This does not verify physical automatic recovery after a future missing ACK or cross-build TCC retention on all macOS versions.

Local preparation-recovery fix: 328 Node tests pass, including failed-reconnect recovery without a new Hook, bounded prelaunch retries and initial query ordering. The user confirmed sustained physical illumination during a 2–3 minute observation; a five-minute local health observation checks ongoing ACKs. This is not yet a physical confirmation of automatic recovery after a real radio outage or long-duration endurance.

**Windows Bluetooth/SPP has not been tested on real Windows hardware.** Successful Actions compilation, Rust tests and NSIS packaging do not verify pairing, band communication, reconnection or continuous operation.
