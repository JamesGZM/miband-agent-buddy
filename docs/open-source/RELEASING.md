# Source releases and macOS checks

MiBand Agent Buddy is an AGPL-3.0-only source project for macOS. The repository includes its license, third-party notices, contribution guide and security policy. GitHub repository visibility is managed separately from these files; the npm `private` flag prevents accidental registry publication and does not make the source closed.

## Continuous integration

Branch pushes and pull requests run `Source checks` on macOS. It generates the shared adapters and artwork needed by the tests, then runs Node tests, architecture checks and both Rust test suites. It does not invoke the Vela packager or create a desktop `.app`. A newer push cancels the older check run for the same ref.

`Release packages` runs only when a GitHub Release is **published**, including a published prerelease. Creating a tag or saving a draft does not package anything. The workflow checks out the release tag, runs the full build and validation on macOS, then attaches:

- `buddy.debug.rpk`: the locally installable Buddy band package;
- `SHA256SUMS`: the package's SHA-256 checksum.

The release also has GitHub's source archives. Re-running a successful release workflow replaces the two generated assets for the same tag. Publication needs `contents: write`; ordinary source checks retain read-only permissions. The release workflow must be present in the release tag.

## Publishing

1. Review the release commit, notices and [validation record](VALIDATION.md). Do not include private local files or claim device verification that has not occurred.
2. Keep the checkout and versioned app/package metadata consistent with the intended release notes. Desktop and band versions are independent.
3. Create a GitHub Release for the reviewed tag, clearly label it a **macOS source release**, and publish it.
4. Wait for `Release packages` to succeed. Confirm the RPK and checksum are attached. Download and verify the package with `shasum -a 256 -c SHA256SUMS` from the directory containing both files.

The workflow does not change repository visibility or publish an npm package.

## Desktop distribution boundary

Build the desktop app on the user's Mac using the [README](../../README.md#build-from-source). The existing builder embeds the source-checkout and Node executable paths. An `.app` built on a GitHub runner would reference that runner's filesystem, so the workflow validates it but does **not** upload it as a downloadable installer. Keep the user's checkout in a stable location after building.

A relocatable desktop release still needs bundled runtime/resource resolution, dependency redistribution review, and a signing/notarization decision. In particular, [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) records unresolved redistribution terms for a fetched transitive dependency. Do not publish bundled desktop binaries until that is resolved. No Windows or Linux desktop package is currently supported.

The `published` trigger follows [GitHub's release-event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release).
