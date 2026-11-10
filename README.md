# MiBand Agent Buddy

**English** · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)

An independent macOS companion for **Xiaomi Smart Band 9**. Turn the band into **Buddy**: a landscape desktop character that displays Codex activity and your Mac's CPU, memory and disk usage.

**Source release · 0.5.0 · AGPL-3.0.** This is a community project, not an official Xiaomi, OpenAI, Anthropic or DeepSeek product. No installer, signing or notarization is provided in this release.

## What it does

- Xiaomi official web login, automatic return to the app, account/device selection and direct Bluetooth SPP communication.
- Install/update Buddy from the locally built RPK. No AstroBox app or plugin is required.
- Continuously send current Mac metrics and sanitized Codex lifecycle events; confirm delivery with matching application ACKs.
- Independent **Mac appearance** (Claude / ChatGPT / DeepSeek accent, light / dark / system) and **Buddy themes** (ChatGPT / Claude / DeepSeek). Band themes are manually applied and confirmed; they never follow the active AI tool automatically. DeepSeek requires Buddy 0.5.3 or newer on the band.
- A live band preview with an activity dot, the real screen state (on with a countdown, or off) and click-to-wake.
- A band page with battery and charging, firmware, model, storage, Buddy version and the last sync time.
- Tray controls, background operation and optional login startup, plus bounded reconnection.
- Event-driven display leases, followed by natural sleep. The screen-on time is configurable from 5 seconds to 30 minutes; the default is 20 seconds.
- **Interface languages:** Simplified Chinese, Traditional Chinese and English. The default follows the macOS language; change it in **Settings → Appearance → Language**. The tray menu follows the same setting.

Only Codex activity is currently integrated. A Claude visual theme does **not** provide Claude Code integration. The Mac preview recreates the band's artwork and data; it is not a screen capture from the device.

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

## First connection

The steps below use the English interface; the same items exist in both Chinese interfaces.

1. Open **Account**, choose the Xiaomi service region and sign in in the official window. Complete any agreement or verification yourself. The app returns automatically and loads devices after the official callback.
2. Open **Band**, select your Band 9 and connect. Disconnect other clients using the same band first.
3. Click **Install or update** to transfer the locally built Buddy RPK. This temporarily pauses normal snapshots. Open Buddy manually on the band after installation.
4. Open **Buddy** to see current data. Select a band theme and click **Apply theme**; “In use” is shown only for a confirmed setting. Click the preview to wake the band.
5. In **Settings**, set the screen-on time and the interface language. Times above 30 seconds are saved with a reminder that they use more band battery.
6. On the band, **tap to switch pages; long-press to exit**. Exiting releases the keep-screen request.

For Codex activity, with this app running:

```sh
npm run hooks:install
```

The installer preserves unrelated hooks and makes a local backup. Review changed hooks in Codex's Hooks settings; the app does not approve trust on your behalf. Metrics work without hooks. Raw prompts, tool arguments and transcripts are never forwarded.

## Local data and background operation

The user account's `~/Library/Application Support/io.github.jamesgzm.miband-agent-buddy/` folder holds:

- preferences: appearance, language, screen-on time and the per-band theme;
- authentication.

The folder has permission **0700** and its files **0600**. **No Keychain or Mac password is used.** These files are not encrypted by this application, and this development build does not claim macOS App Sandbox isolation. Never share this directory. Logout deletes the saved credentials and clears account-specific selection/theme records. Device status (battery, firmware, storage) is kept in memory only. Serial number and IMEI are never read into the app.

Close the window to continue in the tray when background operation is enabled. **Quit** in the tray stops the app and its workers. Login startup is opt-in. For a source checkout, moving/deleting the checkout requires rebuilding the app and reinstalling hook paths.

## Compatibility and verification

| Device | Target | Physical verification |
|---|---|---|
| Xiaomi Smart Band 9 NFC | Yes | See [validation record](docs/open-source/VALIDATION.md) |
| Xiaomi Smart Band 9 standard | Yes | Not yet tested on a physical standard model |
| Band 9 Pro / Active, other generations | No | Not supported in this release |

Buddy 0.5.3 uses a band-local display lease on qualifying wakes, including desktop actions such as applying a theme or switching the band page. The lease is 20 seconds by default and configurable from 5 seconds to 30 minutes. Older Buddy builds are limited to 30 seconds and do not offer the DeepSeek theme; the band advertises its limits in each ACK ([ADR-003](docs/architecture/ADR-003-band-capabilities.md)). A successful API callback is not proof of physical illumination; firmware, power and lifecycle behavior require device testing. See [architecture and protocol](docs/open-source/ARCHITECTURE.md) and [validation](docs/open-source/VALIDATION.md).

## Source and license

Our code is distributed under [AGPL-3.0](LICENSE). Preserve third-party copyright and attribution notices; upstream components retain their applicable terms. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) identifies the AstroBox protocol/account sources and all local adaptations. Agent Buddy inspired the lifecycle-driven desktop companion approach; the active band artwork in this release is generated from this repository's geometry.

See the [repository map and development workflow](docs/development/README.md), [AGENTS.md](AGENTS.md), [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). There is no analytics or telemetry service.
