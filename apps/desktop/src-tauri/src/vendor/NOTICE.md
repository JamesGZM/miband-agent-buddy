# AstroBox account reference

`xiaomi.rs` derives from AstralSightStudios / AstroBox-NG-Module-Account:
https://github.com/AstralSightStudios/AstroBox-NG-Module-Account/blob/dae3188a9c3a9c757555f51d00a6774ab13f1257/src/xiaomi.rs

Upstream license: AGPL-3.0, with the attribution requirement stated in its README. LICENSE is retained alongside this file.

Local adaptation: `hostio::http` imports replaced with `reqwest` / `reqwest_cookie_store`. The caller supplies `crate::net::default_client_builder`, bounded timeouts, and a Xiaomi HTTPS redirect boundary. No upstream logger is enabled; callers translate raw errors into non-sensitive UI messages. No remote login credentials are passed to the local UI.

Credential-bearing upstream log statements are removed so future logger initialization cannot expose cookies, account identifiers or authentication responses.
