# Verification and compatibility

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
| Xiaomi Smart Band 9 NFC | Account connection, Buddy installation, activity sync and short wake checks on firmware 3.1.32 |
| Xiaomi Smart Band 9 | Targeted by the application; physical confirmation still needed |

Buddy 0.5.5 installation and software communication have been verified on the NFC model. Physical frame rate, battery consumption and continuous screen-on reliability remain unverified.

## Manual acceptance

Use a test account and device where possible. Do not erase an existing account or pairing merely to exercise onboarding.

1. Launch without saved account data. Verify the welcome action, account region, device selection and pairing instructions.
2. Restart with a saved device. Verify its theme and preferences return without a flashing preview or a repeated first-run guide.
3. Switch among themes while artwork is cold. Check that complete frames replace one another without blank or mixed layers.
4. Verify absent, installed and updated Buddy states on the Band page. Treat transfer completion and installation confirmation separately.
5. Exercise manual wake and settings with activity sync both on and off. Confirm the result on the physical screen as well as in the app.
6. Run overlapping AI sessions. Completing one session must leave the others active; only the final completion starts the idle timer when task keep-awake is enabled.
7. Verify power saving, disconnect recovery, window close and explicit quit. Restore the user's original settings after testing.

## Current limitations

- Bluetooth recovery and extended task keep-awake need further testing across firmware versions. Extended screen-on sessions may end unexpectedly on the tested firmware; a successful API response alone does not prove physical illumination.
- A band installation can complete without its final result reaching the Mac. Reconnect and check the running version before reinstalling.
- Animation update rates are scheduling targets. Actual panel frame rate and power use have not been measured.
- macOS packages are ad-hoc signed, not Apple-notarized. The standard macOS first-open approval may be required.
- AI integrations depend on lifecycle events exposed by each host. A theme name does not imply a native Hooks API exists in that product.

Report reproducible problems through the [support guide](../SUPPORT.md). Keep account data, device keys, prompts and transcripts out of public reports.
