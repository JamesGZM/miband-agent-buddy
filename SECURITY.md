# Security and privacy

**English** · [简体中文](docs/zh-CN/SECURITY.md) · [繁體中文](docs/zh-TW/SECURITY.md)

## Reporting a vulnerability

Use GitHub's private [Report a vulnerability](https://github.com/JamesGZM/miband-agent-buddy/security/advisories/new) form. Keep vulnerability details and proof-of-concept material in that private report until a disclosure plan is agreed.

Include the affected release, a minimal reproduction with synthetic values, the expected impact and any proposed fix. Do not include passwords, Xiaomi cookies, authentication keys, real device identifiers or another person's data. Maintainers handle reports on a best-effort basis; a response or fix deadline is not guaranteed.

Ordinary bugs and connection problems belong in [Issues](https://github.com/JamesGZM/miband-agent-buddy/issues). See [Support](SUPPORT.md) for the information needed to reproduce them. When reporting an older release, indicate whether the issue also occurs in the latest version; backport decisions are made case by case.

## Local data

Preferences and account credentials are stored under:

```text
~/Library/Application Support/io.github.jamesgzm.miband-agent-buddy/
```

The directory uses permission `0700` and private files use `0600`. Credentials are not stored in Keychain and are not encrypted by this app. Processes running as the same macOS user may be able to read them. Do not upload or share this directory.

Logging out removes the saved credential file and account-specific selection records. It does not revoke other Xiaomi account sessions. Device status is used locally; the desktop state excludes serial numbers and IMEI.

Windows preview builds use Tauri’s per-user app-data directory (`%APPDATA%/io.github.jamesgzm.miband-agent-buddy/`). Preferences and credentials are protected with user-scoped Windows DPAPI before being written. There is no plaintext fallback; copying the files is not an account migration. Processes running as the same Windows user can still request decryption. Do not share this directory.

## Network and integration boundaries

- Account sign-in uses Xiaomi's web flow. The login window has no local application IPC access, and navigation and authentication redirects are restricted to Xiaomi HTTPS domains.
- App update checks and downloads use this project's GitHub releases. The updater verifies the selected architecture, download digest and extracted application before replacement.
- AI integrations send lifecycle events and a derived session identifier to a loopback endpoint. They do not forward prompts, tool arguments or transcripts.
- The integration receiver binds to `127.0.0.1:10731`, limits request size and rejects browser-origin writes. It is not an authentication boundary against other processes on the same Mac.
- Credentials reach local workers through inherited pipes, not command-line arguments or environment variables. Raw upstream logging is disabled.
- The app does not include an analytics or telemetry service.

Current release bundles are ad-hoc signed and not Apple-notarized. Download them from the [official repository releases](https://github.com/JamesGZM/miband-agent-buddy/releases). A matching checksum verifies download integrity; it does not establish Apple notarization.

## Sharing diagnostics safely

Share the app version, macOS version, band model and firmware, reproduction steps and sanitized error text. Review screenshots before attaching them. Remove account details, Bluetooth addresses, serial numbers and private project names. Use synthetic data in test cases and security demonstrations.

Never post the application-data directory, authentication files, raw Bluetooth traffic or unredacted AI conversation content in public issues or pull requests.
