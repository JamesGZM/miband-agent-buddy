# MiBand Agent Buddy

**English** · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)

An independent macOS companion for **Xiaomi Smart Band 9**. Turn the band into **Buddy**: a landscape desktop character that displays AI task activity and your Mac's CPU, memory and disk usage.

**Source release · Desktop 0.5.0 / Buddy 0.5.4 · AGPL-3.0.** This is a community project, not an official Xiaomi, OpenAI, Anthropic or DeepSeek product. No desktop installer, signing or notarization is provided in this release.

## What it does

- Xiaomi official web login, automatic return to the app, account/device selection and direct Bluetooth SPP communication.
- Install/update Buddy from the locally built RPK. No AstroBox app or plugin is required.
- Continuously send current Mac metrics and sanitized lifecycle events from Codex, Claude Code or a custom local harness; confirm delivery with matching application ACKs.
- Guide first-time setup through account, connection, Buddy installation and Hooks verification. Startup waits for saved settings, with a loading state and retry on failure.
- Independent **Mac appearance** (Claude / ChatGPT / DeepSeek accent, light / dark / system) and **Buddy themes** (ChatGPT / Claude / DeepSeek). Band themes are manually applied and confirmed; they never follow the active AI tool automatically. DeepSeek requires Buddy 0.5.3 or newer on the band.
- A live band preview with an activity dot, reported display-hold state and click-to-wake. ACKs confirm the band's software response, not physical screen illumination.
- A band page with battery and charging, firmware, model, storage, Buddy version and the last sync time.
- Tray controls, background operation and optional login startup, plus bounded reconnection.
- On Buddy 0.5.4, active tasks refresh a short display watchdog while thinking, working or waiting for confirmation. The saved screen-on time is the grace after all tasks become idle, or after a manual wake: 5 seconds to 30 minutes, default 20 seconds.
- Multiple sessions stay independent. Waiting for confirmation takes priority over working and thinking; active/waiting counts appear on Buddy and the desktop preview. One task finishing does not hide another active task.
- **Interface languages:** Simplified Chinese, Traditional Chinese and English. The default follows the macOS language; change it in **Settings → Appearance → Language**. The tray menu follows the same setting.

Codex and Claude Code use their native project Hooks. A local Claude Desktop **Code** project can use the Claude Code route; ordinary ChatGPT or Claude chat has no automatic integration claimed here. DeepSeek and other models need a harness with real local lifecycle callbacks. Selecting a visual theme does not install Hooks. The Mac preview recreates the band's artwork and data; it is not a screen capture from the device.

## Build from source

Requirements: macOS, Xcode Command Line Tools, Git, Node.js 22+, current stable Rust (edition 2024 support), Python 3.10+ and Pillow. Keep the checkout in a stable location: this source-development app references its build-time checkout and Node executable. It is not a relocatable distribution bundle.

```sh
git clone https://github.com/JamesGZM/miband-agent-buddy.git
cd miband-agent-buddy
python3 --version  # Must be 3.10 or newer; macOS /usr/bin/python3 may be too old
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm ci --prefix apps/band
npm run bootstrap
npm run build
npm test
npm run build:desktop
open 'apps/desktop/dist/MiBand Agent Buddy.app'
```

`bootstrap` fetches pinned upstream sources and applies the checked-in Core build patch. Generated artwork, downloaded sources, private credentials and build outputs are not committed.

Ordinary pushes and pull requests run source checks without packaging. Publishing a GitHub Release runs the macOS builds and attaches the Buddy RPK and checksum. Desktop installation remains source-based; see [release instructions](docs/open-source/RELEASING.md).

## First connection

The steps below use the English interface; the same items exist in both Chinese interfaces.

1. Open **Account**, choose the Xiaomi service region and sign in in the official window. Complete any agreement or verification yourself. The app returns automatically and loads devices after the official callback.
2. Open **Band**, select your Band 9 and connect. Disconnect other clients using the same band first.
3. Click **Install or update** to transfer the locally built Buddy RPK. This temporarily pauses normal snapshots. Open Buddy manually on the band after installation.
4. Open **Buddy** to see current data. Select a band theme and click **Apply theme**; “In use” is shown only for a confirmed setting. Click the preview to wake the band.
5. In **Settings**, set **Screen-on time after idle** and the interface language. The saved time appears immediately on Buddy; an older band's capability limit is shown separately. Longer grace periods use more band battery.
6. Open **Hooks**, choose the actual AI host and copy its setup request or the [Buddy Hooks skill](https://github.com/JamesGZM/miband-agent-buddy/blob/main/skills/buddy-hooks/SKILL.md) link into that project's AI chat. After configuration and host trust, start a new session and send a task; verify that Buddy receives an event.
7. On the band, **tap to switch pages; long-press to exit**. Exiting releases the keep-screen request.

For direct project setup, run from this checkout with the app running. Replace `/absolute/project` with your existing project's absolute path:

```sh
node scripts/install_agent_hooks.mjs codex --scope project --project-root /absolute/project --dry-run --json
node scripts/install_agent_hooks.mjs codex --scope project --project-root /absolute/project --json
```

Replace `codex` with `claude-code` for Claude Code. The installer merges into `.codex/hooks.json` or `.claude/settings.local.json`, preserves unrelated settings and makes a private local backup. Review the host's Hooks/trust settings; the app does not approve trust on your behalf. `npm run hooks:install` remains the explicit user-wide Codex setup. Metrics work without Hooks. Raw prompts, tool arguments and transcripts are never forwarded.

For custom harness callbacks, verification and removal, see the [Hooks guide](docs/development/hooks.md) and [ADR-004](docs/architecture/ADR-004-local-agent-hooks.md). Installing a skill or writing a configuration alone does not prove event delivery. After 15 minutes without a lifecycle event, a session is marked as needing status verification, but stays active and continues to hold the display while synchronization works. Long-running tools may be silent; elapsed time alone never means a task completed. Activity ends on a terminal event or manual reset. If a host does not report a cancellation such as Esc, use **Settings → Clear activity**: it resets all locally observed sessions while preserving the received-event count, and does not cancel tasks in their AI hosts.

## Local data and background operation

The user account's `~/Library/Application Support/io.github.jamesgzm.miband-agent-buddy/` folder holds:

- preferences: appearance, language, screen-on grace after idle and the per-band theme;
- authentication.

The folder has permission **0700** and its files **0600**. **No Keychain or Mac password is used.** These files are not encrypted by this application, and this development build does not claim macOS App Sandbox isolation. Never share this directory. Logout deletes the saved credentials and clears account-specific selection/theme records. Device status (battery, firmware, storage) is kept in memory only. Serial number and IMEI are never read into the app.

Close the window to continue in the tray when background operation is enabled. **Quit** in the tray stops the app and its workers. Login startup is opt-in. For a source checkout, moving/deleting the checkout requires rebuilding the app and reinstalling hook paths.

## Compatibility and verification

| Device | Target | Physical verification |
|---|---|---|
| Xiaomi Smart Band 9 NFC | Yes | See [validation record](docs/open-source/VALIDATION.md) |
| Xiaomi Smart Band 9 standard | Yes | Not yet tested on a physical standard model |
| Band 9 Pro / Active, other generations | No | Not supported in this release |

Buddy 0.5.4 advertises active-task display support. Accepted active snapshots renew a band-local 15-second watchdog; when all active sessions end or local activity is reset, the saved idle grace starts once. There is no elapsed-task timeout: the watchdog checks synchronization, not how long a task runs. If snapshots stop because of pause, disconnect or host failure, the short watchdog expires locally. Hiding or exiting Buddy also releases the request. This behavior and its tests are described in [ADR-005](docs/architecture/ADR-005-active-display.md).

Older Buddy builds retain one-shot wake leases, including desktop actions such as applying a theme or switching pages. Their advertised limit may cap the saved duration at 30 seconds; DeepSeek themes require Buddy 0.5.3 or newer ([ADR-003](docs/architecture/ADR-003-band-capabilities.md)). Successful callbacks and ACKs are not measurements of physical illumination: firmware, power and lifecycle behavior require device testing. See [architecture and protocol](docs/open-source/ARCHITECTURE.md) and the [validation record](docs/open-source/VALIDATION.md) for what was actually verified.

## Source and license

Our code is distributed under [AGPL-3.0](LICENSE). Preserve third-party copyright and attribution notices; upstream components retain their applicable terms. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) identifies the AstroBox protocol/account sources and all local adaptations. Agent Buddy inspired the lifecycle-driven desktop companion approach; the active band artwork in this release is generated from this repository's geometry.

See the [repository map and development workflow](docs/development/README.md), [AGENTS.md](AGENTS.md), [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). There is no analytics or telemetry service.
