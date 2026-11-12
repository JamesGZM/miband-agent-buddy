# Dedicated update service

**English** · [简体中文](../../zh-CN/development/updates.md) · [繁體中文](../../zh-TW/development/updates.md)

The desktop checks `https://buddy-updates.ailaogong.men/buddy/releases/latest` first, then the official GitHub API on timeout, HTTP failure or invalid metadata. Valid cached releases may arrive up to ten minutes late. The service is an additional trusted metadata intermediary; it is not a release-signing authority. It can serve the metadata/digest together, so compromise of this service is within the documented trust boundary.

The updater derives the Worker download URL from the exact official tag and architecture asset. It streams to a private temporary archive and requires the selected size and SHA-256 before extraction. A failed, partial or corrupt Worker download restarts from byte zero at the fixed GitHub URL. Storage failures stop immediately. Both sources retain archive, bundle identity/version, architecture and signature checks before installation; replacement and rollback are unchanged.

The independent Worker lives in `services/update-worker`; its custom domain is configured in `wrangler.toml`. It serves only the fixed latest-release route and stable Mac ZIP/DMG/checksum routes, never arbitrary origins. Valid metadata is cached for 600 seconds; successful asset responses for 3600 seconds. Errors are not cached. Installers stream without JavaScript buffering or cloning. HEAD and single Range requests are supported. No account, device or Hook data is sent.

Deploy with the manual `Deploy update Worker` workflow on this repository’s `main` branch, after adding `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository Actions secrets. The workflow tests and deploys the checked-out commit with the dedicated config. Do not copy secret values into this repository. The credential needs Worker deployment and custom-domain/DNS access for the zone. Deploying this Worker must leave the existing index Worker unchanged. Verify the custom domain and a real package after deployment; a dry run does not prove either.

See [ADR-006](../architecture/ADR-006-desktop-updates.md) for installation and trust boundaries.

Deployment: [GitHub Actions](https://github.com/JamesGZM/miband-agent-buddy/actions/workflows/update-worker.yml).

For first creation, use Workers Admin at the Workers product/account scope; after creation, reduce it to Workers Editor. Domain binding requires Workers Routes Write and Zone Read scoped only to `ailaogong.men`. Account Settings Read supports account discovery. KV, R2 and Pages permissions are unnecessary.
