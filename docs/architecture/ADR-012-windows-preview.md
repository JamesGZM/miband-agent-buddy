# ADR-012: Windows preview installers

**English** · [简体中文](ADR-012-windows-preview.zh-CN.md) · [繁體中文](ADR-012-windows-preview.zh-TW.md)

## Problem

A Windows workflow alone cannot build the Mac-only native entrypoint, private-file permissions, runtime layout or updater. The user requires x64 and ARM64 installers on every release and cannot validate Windows builds on the local Mac, so native Windows Actions success must be a release gate.

## Decision

Stable release tags call the reusable Windows workflow alongside both Mac jobs, using the same tag. Require Mac arm64/x64 and Windows x64/ARM64 success, then verify all 20 installer/source/checksum assets before the single publish job attaches them to the Release. Manual Windows dispatch remains available for diagnostics; builders retain read-only repository permissions and only publication has write access. Keep IOBluetooth main-thread ownership unchanged. Select the pinned Windows SPP implementation at compile time, start its receive subscription before Core authentication, and run it on the normal Tokio thread. Keep all wake, delivery and multi-AI policy in the shared runtime. Windows samples CPU with Node, memory from total/free bytes and disk from the user drive root. Bundle native Node and transport executables under a preserved runtime source layout; hide private worker console windows.

Windows vault writes use user-scoped DPAPI before touching disk, reject decryption failures and atomically replace files with MoveFileExW. No machine-wide DPAPI or plaintext fallback is permitted. Preferences load through the same Windows vault. Existing Mac private-file bytes and permissions remain unchanged. Windows reads the user locale through the OS API.

## Alternatives and compatibility

A workflow wrapping the existing Mac build would produce no usable Windows installer. Rewriting upstream or replacing the cross-platform runtime would add unnecessary risk. Use an isolated Windows builder and pinned Tauri CLI to produce unsigned NSIS installers on native x64 and ARM64 runners. Include Node and all dependency notices, hashes and corresponding sources. Manual-only dispatch was missed during a release attempt and cannot satisfy the four-architecture gate. Reuse the existing Windows workflow instead of duplicating jobs; standalone manual runs still upload artifacts without publishing. Windows in-app updating is explicitly unsupported; the fixed project/download links open through the OS without shell interpolation. No new application cloud endpoint is introduced.

## Evidence and limits

The Mac Node/architecture/Rust suites and targeted Windows PE validation cover shared behavior and package architecture rejection. Native Windows x64 transport passes cross-target cargo check. Desktop Windows compilation, NSIS installation, account WebView, pairing, SPP, battery/charging, notifications and sustained rendering require Windows runner/device verification; a package or compile result is not physical confirmation. Workflow contracts check the common tag, both platform dependencies and restricted publication permissions; asset tests reject missing Windows installers and corrupt checksums. Windows compilation and packaging evidence must come from the native Actions jobs, not local Mac checks.

## References

[Tauri Windows installers](https://v2.tauri.app/distribute/windows-installer/) · [GitHub runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) · [DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)
