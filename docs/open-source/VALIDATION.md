# Validation record

## 2026-11-11 — Startup, project Hooks and active-task display

- 130 Node tests, 17 desktop Rust tests, 3 native transport Rust tests, architecture checks over 86 authored sources, both builds and diff whitespace checks passed locally. Hook integration tests required loopback-listener sandbox permission; project installer fixtures isolate user/ancestor paths and use synthetic data.
- Fake clocks verify eight hours without a new lifecycle Hook while synchronization continues: active display renewal remains on, with no periodic app launch. Concurrent task completion preserves other active tasks; only all-idle starts the saved grace. Pause, disconnect, replay, hidden-page callbacks, reset and legacy capabilities have regression coverage.
- Startup tests cover delayed/failed/timed-out hydration, saved device theme before the first ACK, immediate preview paint and one-minute setting reflection. New-user checklist and project skill copy/navigation passed automated tests and a local browser visual check. Installer review fixes include private external backups, scope conflict detection, update locking and refusal to follow project configuration directories outside the selected project.
- The rebuilt Mac app was installed with a local backup, binary/icon hashes verified, and reopened. Its existing connection returned, the Buddy page showed the saved one-minute duration, and a real local AI Hook updated the activity count. A new-account login was not exercised in this pass.
- Buddy 0.5.4 installation returned success and the next device view reported version 0.5.4. During a real local AI task, the desktop displayed the active retention receipt and one active session. The user confirmed the physical band display was currently staying lit. This passes a short active-task illumination smoke, not an endurance test. The earlier long-duration firmware/lifecycle failure below remains unresolved by an actual endurance retest; no new physical endurance claim is made.

The entries below are historical evidence and retain their original scope and outcomes.

Date: 2026-11-10 (Asia/Singapore).

## Automated

- 38 focused Node tests passed during development: hooks, ACK matching, bounded backoff, theme persistence/failure/late callbacks, both theme animation assets, resource smoothing and lifecycle/exit, CPU zero/unavailable, VM/disk counter parsing and replay rejection.
- Clean local clone (`370a621`) fetched pinned upstream repositories, installed npm dependencies from lock, generated artwork/RPK, passed all 33 Node tests plus 4 desktop Rust and 1 transport Rust tests, and built the macOS app. Tested on Apple Silicon with Node24.11.1 and Python3.14/Pillow12; README now requires Python3.10+ because macOS system Python3.9 cannot install Pillow12. Cargo registry cache was available; build target directories and upstream checkouts were fresh. GitHub macOS15 CI with Node22/Python3.12 passed on commit `d5f4274`: [workflow run](https://github.com/JamesGZM/miband-agent-buddy/actions/runs/42775966163). This includes the expanded37Node tests,5desktopRust tests,1transportRust test and both package builds. The local clean clone was also advanced to this commit and passed its updated tests/build.

## Physical

- Earlier isolated prototype: official Xiaomi login → new AuthKey → direct SPP → matching Buddy 0.3.5 ACK succeeded on Xiaomi Smart Band 9 NFC, firmware 3.1.32.
- Earlier Buddy 0.3.6: foreground keep-screen renewal reported three successful requests with zero failures. This is not a 60-minute physical illumination test.
- Formal client: AstroBox process exited; direct continuous sync with existing Buddy 0.3.6 and battery retrieval verified. App quit/relaunch restored private-file authentication and automatically reconnected without an OS password prompt. Independent installation of Buddy 0.5.0 returned the device success receipt; subsequent 0.5.0 ACKs and durable ChatGPT/Claude setting receipts were observed. The user confirmed character display, tap navigation and resource display work. Initial installation attempt left the old version running; a retry completed. Transfer progress alone is never treated as success.
- Mac UI: Claude warm/light and system-dark, ChatGPT neutral/light and DeepSeek blue/light inspected; app appearance did not switch the selected Buddy theme. Login startup switch created a RunAtLoad entry with --background and disabling removed it; real OS login is not yet tested. Explicit App quit left no app/native transport process and closed the Hook listener at10731. Window close kept syncing; reopening the app restored the hidden main window after adding the macOS Reopen handler. Terminating only the transport recovered in about10seconds with exactly one new transport process and the selected theme intact.
- Band 9 standard: target compatibility, no physical verification yet.
- Pausing Mac snapshots for about147seconds then resuming preserved the band foreground lifecycle; keep-screen successful renewal count advanced from62to67 with zero failures/hides. This verifies API renewal independence, not physical illumination.
- **60-minute no-touch illumination test: FAILED.** Observation started at15:11:50; last valid Buddy ACK was about15:58:25 (roughly46min35sec into observation). The user subsequently confirmed the panel was black and a single tap to wake returned to the watch face, not Buddy. This does not distinguish a system dismissal from an application crash. Last reported API counters were100successes/0failures with foreground=true. Reconnection exhausted its bounded attempts without a new app ACK. These counters did not guarantee physical illumination. Root cause is under investigation; resource-page endurance remains untested.

The formal app does not use Keychain after the user's storage preference changed; credentials use app-private files. Auto-return from official login verified by user after switching to private local storage. Directory0700 and credential/preferences files0600 were checked without reading their contents.

The failed observation was on the character page (page0), not the resource page. The public release remains pending this issue.

Final hardening adds terminal handling of explicit authentication rejection (38Node/5desktopRust/2transportRust tests) and removes credential-bearing upstream log statements. No invalid credentials were sent to the physical band to test this path.

## Explicit remote launch probe

After the user confirmed the band was on the watch face and asleep, the formal App was stopped to avoid competing connections. A single AstroBox Core `thirdparty_app::launch` command targeted `hap://app/com.macprobe.band9/pages/index`. Buddy0.5.0 returned two ACKs matching a fresh session (seq1/2), page0, visible=true, shows1/hides0, keep-screen successes1/failures0. The launch command return itself only indicates enqueue success; the new ACKs provide application-response evidence. The user confirmed that, without touching the band, the screen automatically lit and displayed Buddy. Remote launch from an asleep watch-face state therefore passed this single physical trial on the tested Band9 NFC firmware; repeated reliability and other firmware/models remain unverified. This tests a dedicated LaunchApp command, not a generic notification or interconnect-only wake. No automatic relaunch policy is enabled.

## Event-driven wake implementation

The user chose firmware-managed sleep with event-driven wake instead of mandatory60minute continuous illumination. The earlier endurance failure remains recorded, but continuous keep-screen is no longer the selected operating mode. The new runtime disables keepScreen, preserves long-running Codex tasks without inventing completion, and wakes for start/attention/completion events with deduplication, coalescing and expiry. A simulated eight-hour silent task and1000tool cycles produce no periodic launch. Subprocess integration tests simulate a sleeping band: ACK absence enters standby without reconnect churn, device ping remains available, enqueue alone never confirms wake, and matching ACK does.

On the physical band, the updated Mac app reconnected to Buddy0.5.0 and received settingsApplied=true with keepScreen=off. No new band package was installed. The user confirmed natural sleep. A simulated UserPromptSubmit sent through the normal local Hook endpoint then produced wake.reason=start/status=confirmed from a matching band ACK, with keepScreen still off and settingsApplied=true. The simulated session was cleared with SessionEnd without another launch. Physical confirmation of this full hook-driven wake trial is pending. The48Node tests pass, including the two subprocess integration cases;5desktop Rust and2transport Rust tests pass and the Mac app builds.

## Bounded display and initial connection (Buddy0.5.1)

User confirmed the hook-driven0.5.0 trial lit the screen but it went dark too quickly. Buddy0.5.1 adds a local20second event hold, with wake-ID deduplication and cancellation on hide/exit. Persistent keepScreen remains false. Installation received device success; restarting the formal Mac app automatically checked/started the installed Buddy and received version0.5.1 with wake.reason=connection/status=confirmed and keepScreen=on. Within the observation window, ACK changed to keepScreen=off without a release command from the Mac, confirming local lease expiry. The user confirmed that Buddy remained visibly lit for about20seconds and then slept normally without touch. This initial-connection → auto-launch → bounded display → natural sleep trial passed on the tested Band9 NFC; repeated reliability and other devices remain unverified.

53Node tests pass, including bounded hold expiry with no further packets and a missing API callback, duplicate-event non-extension, exit cancellation, connection/install policy and sleeping transport integration. Existing5desktopRust/2nativeRust tests passed; both RPK and Mac builds succeeded. Background reconnect does not regenerate initial connection wakes. Missing installation is simulated; the user's installed app was not removed for testing.


## Architecture refactor — 2026-11-10

Validation used the current working source, including the pre-existing uncommitted Buddy 0.5.1 changes. No release/version migration was performed.

- Automated: 72 Node tests, 8 desktop Rust tests, 3 native transport Rust tests, and architecture boundary checks passed. Existing baseline scenarios were retained; new cases cover injected runtime lifetime, obsolete child events, installation timeout, IPC fixtures, generated module parity, compatibility entries and actual frontend startup/page/preview rendering.
- Both source builds passed. A source-only export into a new isolated directory completed fresh Quick App dependency installation, pinned upstream bootstrap, artwork/shared-module generation, all test suites and both builds. It did not reuse app assets or local upstream symlinks. Dependency caches were allowed.
- UI template/CSS, manifest, keep-screen/settings modules and vendored account source matched the saved pre-refactor bytes. Existing UI behavior was preserved while its bridge/state/preview code was separated.
- Native App smoke: saved account and selected NFC Band 9 restored, matching Buddy 0.5.1 ACK received, local RPK installation returned device success, and post-install application responses resumed. A real Codex start event produced a confirmed wake; subsequent health showed keep-screen off.
- Physical observation: when asked whether the rebuilt Buddy displayed normally and slept naturally after roughly 20 seconds, the user replied “正常。” This is one smoke trial, not a new endurance or multi-device claim.
- Pause/resume: paused UI state was observed and ACK timestamp remained unchanged across a 12-second health comparison; after resuming, a fresh ACK and both Mac preview pages were observed.
- Explicit quit removed all three owned processes and freed loopback port 10731. Relaunch restored account/device/theme and active synchronization; the App was left running normally.

Historical illumination failures and untested ordinary Band 9/other firmware cases above remain applicable. No source publication or binary release was performed as part of this refactor.


## Pre-push review — 2026-11-10

The follow-up review covered all uncommitted source changes and their callers/tests. Two confirmed defects were reproduced with regression assertions and fixed: the Mac preview's numeric CPU reading could render a capacity footer as NaN/NaN (an existing defect), and a malformed queued message could still write an error after band-page destruction. CPU now retains its TOTAL LOAD footer; the controller checks lifetime before reading/parsing messages. No layout or wake policy was changed.

After both fixes, all 72 Node tests, 8 desktop Rust tests, 3 native Rust tests, architecture checks and both source builds passed. The strengthened frontend test uses fresh CPU/memory/disk samples and checks rendered text; the controller test invokes captured valid/malformed callbacks after teardown. Physical evidence above records the earlier architecture smoke trial; these narrow follow-up fixes were verified by regression tests and source builds.
