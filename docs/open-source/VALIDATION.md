# Validation record

Date: 2026-11-10 (Asia/Singapore).

## Automated

- 37 focused Node tests passed during development: hooks, ACK matching, bounded backoff, theme persistence/failure/late callbacks, both theme animation assets, resource smoothing and lifecycle/exit, CPU zero/unavailable, VM/disk counter parsing and replay rejection.
- Clean local clone (`370a621`) fetched pinned upstream repositories, installed npm dependencies from lock, generated artwork/RPK, passed all 33 Node tests plus 4 desktop Rust and 1 transport Rust tests, and built the macOS app. Tested on Apple Silicon with Node24.11.1 and Python3.14/Pillow12; README now requires Python3.10+ because macOS system Python3.9 cannot install Pillow12. Cargo registry cache was available; build target directories and upstream checkouts were fresh. macOS CI targets Node22/Python3.12; remote CI has not run yet.

## Physical

- Earlier isolated prototype: official Xiaomi login → new AuthKey → direct SPP → matching Buddy 0.3.5 ACK succeeded on Xiaomi Smart Band 9 NFC, firmware 3.1.32.
- Earlier Buddy 0.3.6: foreground keep-screen renewal reported three successful requests with zero failures. This is not a 60-minute physical illumination test.
- Formal client: AstroBox process exited; direct continuous sync with existing Buddy 0.3.6 and battery retrieval verified. App quit/relaunch restored private-file authentication and automatically reconnected without an OS password prompt. Independent installation of Buddy 0.5.0 returned the device success receipt; subsequent 0.5.0 ACKs and durable ChatGPT/Claude setting receipts were observed. The user confirmed character display, tap navigation and resource display work. Initial installation attempt left the old version running; a retry completed. Transfer progress alone is never treated as success.
- Mac UI: Claude warm/light and system-dark, ChatGPT neutral/light and DeepSeek blue/light inspected; app appearance did not switch the selected Buddy theme. Login startup switch created a RunAtLoad entry with --background and disabling removed it; real OS login is not yet tested. Explicit App quit left no app/native transport process and closed the Hook listener at10731. Window close kept syncing; reopening the app restored the hidden main window after adding the macOS Reopen handler. Terminating only the transport recovered in about10seconds with exactly one new transport process and the selected theme intact.
- Band 9 standard: target compatibility, no physical verification yet.
- 60-minute no-touch illumination test: pending; do not interpret keep-screen ACK as a light sensor.

The formal app does not use Keychain after the user's storage preference changed; credentials use app-private files. Auto-return from official login verified by user after switching to private local storage. Directory0700 and credential/preferences files0600 were checked without reading their contents.

A 60-minute no-touch observation started at 15:11:50 Asia/Singapore; pending physical confirmation. Band ACK currently reports character page (page0), so do not label it a resource-page test.
