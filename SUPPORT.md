# Support

**English** · [简体中文](docs/zh-CN/SUPPORT.md) · [繁體中文](docs/zh-TW/SUPPORT.md)

Start with the [getting-started guide](README.md#getting-started), [latest release notes](https://github.com/JamesGZM/miband-agent-buddy/releases) and [current compatibility limits](docs/en/testing.md). Usage questions and reproducible bugs can be raised in [GitHub Issues](https://github.com/JamesGZM/miband-agent-buddy/issues).

## Installation

Choose the Apple Silicon or Intel download that matches your Mac, unzip it and move the app to Applications. Current builds are not Apple-notarized; see the [installation instructions](docs/en/open-source/RELEASING.md) if macOS blocks the first launch. Windows and Linux are not supported.

## Account and connection

Use the same Xiaomi account and service region as Mi Fitness. Follow the app's first-connection instructions and confirm any pairing prompt on the band and Mac. During setup, keep the band nearby and disconnect other apps using it.

For an interrupted connection, check the status shown in **Band**, then reconnect. If the band remains unresponsive, restart it normally and try again. Routine recovery does not require factory-resetting the band or removing its Xiaomi account binding.

Buddy installation and version checks are managed in **Band**. Report the exact message shown there; a sleeping Buddy and an uninstalled Buddy are different conditions.

## AI activity

Open **AI connections** and follow the setup request for the host you actually use. After configuring it, start a new task and check whether the app receives an event. A visual theme does not configure the AI host.

If a finished task remains active because the host did not send its completion event, use **Settings → Reset task display**. This clears the locally observed task state without cancelling work in the AI host. Integration details are in the [Hooks guide](docs/en/development/hooks.md).

Task keep-awake requires activity sync and actual task events. For unexpected sleep, record the elapsed time, current task/connection state, last sync and whether Buddy was exited. Clicking the Mac preview requests a manual wake. The local fix restores one wake after transport reconnect only while task keep-awake, synchronization and an active task are all present; API acceptance still does not prove physical illumination.

## Reporting a problem

Include:

- App version, macOS version and Mac architecture.
- Band model and firmware version, if the problem involves a band.
- Steps to reproduce, expected behavior and actual behavior.
- Whether this is first-time setup, an update or a reconnect.
- Sanitized screenshots or error text, and any workaround you found.

Never attach credentials, account cookies, device keys, Bluetooth addresses, raw device traffic, prompts or conversation content. See [SECURITY.md](SECURITY.md) for private vulnerability reporting and safe diagnostics.

Support is provided by the community on a best-effort basis. A response time or compatibility with unlisted devices is not guaranteed.
