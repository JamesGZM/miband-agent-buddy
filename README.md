# MiBand Agent Buddy

An independent macOS companion for **Xiaomi Smart Band 9**. Turn the band into **Buddy**: a landscape desktop character that displays Codex activity and your Mac's CPU, memory and disk usage.

**Source release · 0.5.0 · AGPL-3.0.** This is a community project, not an official Xiaomi, OpenAI, Anthropic or DeepSeek product. No installer, signing or notarization is provided in this release.

## What it does

- Xiaomi official web login, automatic return to the app, account/device selection and direct Bluetooth SPP communication.
- Install/update Buddy from the locally built RPK. No AstroBox app or plugin is required.
- Continuously send current Mac metrics and sanitized Codex lifecycle events; confirm delivery with matching application ACKs.
- Independent **Mac appearance** (Claude / ChatGPT / DeepSeek, light / dark / system) and **Buddy themes** (ChatGPT / Claude). Band themes are manually applied and confirmed; they never follow the active AI tool automatically.
- Tray controls, background operation, optional login startup, bounded reconnection and foreground keep-screen requests.

Only Codex activity is currently integrated. A Claude visual theme does **not** provide Claude Code integration. The Mac preview recreates the band's artwork and data; it is not a screen capture from the device.

## Build from source

Requirements: macOS, Xcode Command Line Tools, Git, Node.js 22+, current stable Rust (edition 2024 support), Python 3 and Pillow. Keep the checkout in a stable location: this source-development app references its build-time checkout and Node executable. It is not a relocatable distribution bundle.

```sh
git clone https://github.com/JamesGZM/miband-agent-buddy.git
cd miband-agent-buddy
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm ci --prefix quickapp
npm run bootstrap
npm run build
npm test
npm run build:desktop
open 'desktop/dist/MiBand Agent Buddy.app'
```

`bootstrap` fetches pinned upstream sources and applies the checked-in Core build patch. Generated artwork, downloaded sources, private credentials and build outputs are not committed.

## First connection

1. Open **帳號**, choose the Xiaomi service region and sign in in the official window. Complete any agreement or verification yourself. The app returns automatically and loads devices after the official callback.
2. Open **手環**, select your Band 9 and connect. Disconnect other clients using the same band first.
3. Click **安裝／更新** to transfer the locally built Buddy RPK. This temporarily pauses normal snapshots. Open Buddy manually on the band after installation.
4. Open **Buddy** to see current data. Select a band theme and click **套用至手環**; “使用中” is shown only for a confirmed setting.
5. On the band, **tap to switch pages; long-press to exit**. Exiting releases the keep-screen request.

For Codex activity, with this app running:

```sh
npm run hooks:install
```

The installer preserves unrelated hooks and makes a local backup. Review changed hooks in Codex's Hooks settings; the app does not approve trust on your behalf. Metrics work without hooks. Raw prompts, tool arguments and transcripts are never forwarded.

## Local data and background operation

The user account's `~/Library/Application Support/io.github.jamesgzm.miband-agent-buddy/` holds preferences and authentication, with directory permission **0700** and file permission **0600**. **No Keychain or Mac password is used.** These files are not encrypted by this application; this development build does not claim macOS App Sandbox isolation. Never share this directory. Logout deletes the saved credentials and clears account-specific selection/theme records.

Close the window to continue in the tray when background operation is enabled. **退出** stops the app and its workers. Login startup is opt-in. For a source checkout, moving/deleting the checkout requires rebuilding the app and reinstalling hook paths.

## Compatibility and verification

| Device | Target | Physical verification |
|---|---|---|
| Xiaomi Smart Band 9 NFC | Yes | See [validation record](docs/open-source/VALIDATION.md) |
| Xiaomi Smart Band 9 standard | Yes | Not yet tested on a physical standard model |
| Band 9 Pro / Active, other generations | No | Not supported in this release |

Foreground keep-screen calls are refreshed conservatively. A successful API callback is not proof of an indefinitely illuminated panel; firmware, power and lifecycle behavior require device testing. See [architecture and protocol](docs/open-source/ARCHITECTURE.md) and [validation](docs/open-source/VALIDATION.md).

## Source and license

Our code is distributed under [AGPL-3.0](LICENSE). Preserve third-party copyright and attribution notices; upstream components retain their applicable terms. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) identifies the AstroBox protocol/account sources and all local adaptations. Agent Buddy inspired the lifecycle-driven desktop companion approach; the active band artwork in this release is generated from this repository's geometry.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). There is no analytics or telemetry service.
