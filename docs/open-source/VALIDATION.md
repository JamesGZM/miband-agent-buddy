# Validation record

Date: 2026-11-10 (Asia/Singapore).

## Automated

- 33 focused Node tests passed during development: hooks, ACK matching, bounded backoff, theme persistence/failure/late callbacks, both theme animation assets, resource smoothing and lifecycle/exit.
- Rust desktop and transport compilation completed; final clean-checkout verification is recorded below when complete.

## Physical

- Earlier isolated prototype: official Xiaomi login → new AuthKey → direct SPP → matching Buddy 0.3.5 ACK succeeded on Xiaomi Smart Band 9 NFC, firmware 3.1.32.
- Earlier Buddy 0.3.6: foreground keep-screen renewal reported three successful requests with zero failures. This is not a 60-minute physical illumination test.
- Formal client: AstroBox process exited; direct continuous sync with existing Buddy 0.3.6 and battery retrieval verified. App quit/relaunch restored private-file authentication and automatically reconnected without an OS password prompt. Independent installation of Buddy 0.5.0 returned the device success receipt; subsequent 0.5.0 ACKs and durable ChatGPT/Claude setting receipts were observed. The user confirmed character display, tap navigation and resource display work. Initial installation attempt left the old version running; a retry completed. Transfer progress alone is never treated as success.
- Band 9 standard: target compatibility, no physical verification yet.
- 60-minute no-touch illumination test: pending; do not interpret keep-screen ACK as a light sensor.

The formal app does not use Keychain after the user's storage preference changed; credentials use app-private files. Auto-return from official login verified by user after switching to private local storage. Directory0700 and credential/preferences files0600 were checked without reading their contents.
