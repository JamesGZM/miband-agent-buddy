# Band brightness and battery status

**English** · [简体中文](../zh-CN/display.md) · [繁體中文](../zh-TW/display.md)

Use the Band brightness slider in Settings → Band display (0–255). Before a brightness choice is saved, the app preserves the native mode; unavailable readings stay unknown. Power saving uses exactly 25 and 10 FPS; switching it off restores the saved brightness and frame rate. The Mac shows “Charging” beside the battery. Below 20%, it displays an in-app warning and requests a Mac system notification once per low-battery cycle, including while charging. Repeated samples/reconnections do not repeat it; reaching 20% rearms the alert. System notification delivery follows macOS notification settings. Battery/charging changes are forwarded from device-state events, with a roughly 5–6 second polling fallback when the link is available; installation, waking and transport work can delay them.

Automatic brightness has its own App switch and disables the manual slider. Power saving temporarily uses manual mode at 25, then restores the selected mode and manual value. An unverified initial zero is shown as unknown instead of becoming a saved default. Brightness operations check native mode/value readback; success callbacks alone do not establish applied brightness.
