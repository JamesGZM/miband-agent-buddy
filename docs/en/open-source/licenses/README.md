# Supplemental dependency license records

**English** · [简体中文](../../../zh-CN/open-source/licenses/README.md) · [繁體中文](../../../zh-TW/open-source/licenses/README.md)

`scripts/collect_licenses.py` reads the locked Cargo metadata for the build's selected target and follows normal dependency edges from the desktop and transport packages. It copies original LICENSE, LICENCE, COPYING, COPYRIGHT and NOTICE files, including nested notices, and records package versions, declared licenses, authors and repository attribution. Build-only tools are not included in this distribution inventory.

Some published crates omit their repository-root licenses. `receipts.json` limits each supplement to an exact package version, declared license and `.cargo_vcs_info.json` revision. Every supplemental file has a SHA-256 hash; `sources.json` also records the upstream Git blob. No license text is fetched during a build. Dependency upgrades that need a new supplement fail until their record is reviewed.

The pbjson, alloc-stdlib and crc-catalog supplements were read from the exact upstream revisions named in the receipts. The objc2 repository's licensing declaration is identical (Git blob `540ae4c81adb5f64a9f61e222b688880da24300e`) at the five revisions used by these crates: `d7d2fa23ceaa5e6096c923b081040e5d81b3b9df`, `b4167b582b2f75f9a1be75495c41b765344fd03c`, `8852b424193ca41602281b3d7540d7c8ed51e49a`, `7b1abfd750a2cacaea71d6a56ecfb83cb7de560b` and `8d214f5477365ffcbcbb7de058c86ed9a518efb7`.

The pinned objc2 declaration links to standard license terms. The pinned dispatch source has an MIT declaration in Cargo metadata but no separate license file. These packages include their complete published crate source, original author metadata and the unmodified SPDX MIT template. Template placeholders are not claims about copyright holders, and no copyright notice is invented. The selectors package includes its complete source with original MPL headers and the standard MPL-2.0 text. Local adapted upstream crates also include their package source, without Git metadata or build outputs.

Generated files live inside the desktop bundle at `Contents/Resources/licenses/rust` on macOS and `licenses/rust` on Windows. They are build outputs, not source-vendored copies in this repository. The inventory records upstream terms and grants no additional rights; preserve the source files and their notices when redistributing.

The mac-notification-sys 0.6.15 supplement preserves its original MIT/Apache texts at revision `deb559683962d314a7693478476bf8d052efa84e`, omitted by the published crate include list.

The Windows webview2-com 0.39.1 and webview2-com-sys 0.39.1 supplements preserve the original repository-root MIT text at `edc2caf886175ccaebe86078c9cfe1ae2a187328`; webview2-com-macros 0.8.1 uses `dffa41a8a46d3f5565eefbff2de57d38d399f158`. Both revisions contain the same license blob, `de9a7e660e173136b351982a34f715af424ff812`, omitted from these published subcrates. Their corresponding published crate source is included with the supplement.
