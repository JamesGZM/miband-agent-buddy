# ADR-016: Bundled generic AI integration

**English** · [简体中文](../../zh-CN/architecture/ADR-016-bundled-integration.md) · [繁體中文](../../zh-TW/architecture/ADR-016-bundled-integration.md)

## Problem

Platform cards and checkout-dependent installation ask users to understand host internals. Unknown tools cannot use the source installer. Integration must be bundled, observational and safe for concurrent conversations.

## Decision

The default request is user-wide automatic reporting across local projects and new main conversations, with a host-supported mechanism rather than a mandatory Hooks implementation. Perform feasible persistent configuration in the setup turn; do not silently fall back to project scope or end after CLI acceptance. A minimal adapter is conditional, not a new installer framework, and must have user-level lifetime independent of a project or another App's private runtime. Prefer background observation while preserving event order at the host boundary; locks and runtime watermarks alone do not recover background arrival order. Synchronous-only handlers keep minimal bounded local acceptance/handoff. The 300ms ingress limit is not total callback latency. Verify native activation plus real later-turn and different-project automation separately; required trust/reload remains pending until actually completed.

Automatic conversation reporting requires two independent choices: a verified host lifecycle trigger and bundled CLI delivery. A connection or synthetic receipt proves only transport readiness. Setup must establish loaded main-conversation callbacks and verify a later ordinary user turn without ad-hoc model notifications. If reliable triggers or host loading are missing, automatic integration remains incomplete; model-driven/manual reporting must be labeled separately. Do not equate similarly named CLI/SDK and desktop host capabilities.

The desktop executable dispatches `--buddy-cli` before Tauri startup using bundled Node. Host Hooks or verified lifecycle callbacks invoke CLI; CLI submits through a private loopback route to the one running runtime. There is no additional public HTTP API or Bluetooth owner. The integration page copies the complete integration guide and application identity, without installation paths or document links. The setup AI resolves the verified application through the host/OS application registry, selects a verified lifecycle mechanism, preserves settings and reports capability gaps.

The strict contract is anonymous source/session, increasing execution run, increasing event seq and enumerated state. Hash identities at ingress; never retain contents. One conversation has one reporter; callbacks reuse identity across later turns. Runtime owns bounded watermarks, ordering, duplicate suppression and aggregate policy. Terminal runs cannot reopen. A run/session key represents a main conversation execution. Generic watermarks retain at most 128 conversations until reset/restart; capacity errors preserve existing work. Per-conversation rate limiting permits one reserved terminal update. Legacy state remains compatible.

CLI waits at most 300ms for local receipt, never device effects. The host bounds launch time and serializes per-conversation callbacks without building an unbounded process backlog; independent conversations may use concurrent CLI processes. Process startup and scheduling add latency. Reporting failure is fail-open for the task with machine-readable receipts; no polling or unbounded retries. Runtime's existing serialized transport and snapshot coalescing own band delivery.

Only verified pending/resolution lifecycles can drive needs_user. Model-driven reporting has interruption gaps. Disconnection or silence never means completion. Keep existing stale/reset semantics.

## Alternatives

A second public API duplicates the integration surface. An MCP layer adds configuration and tool discovery without supplying lifecycle triggers to command Hooks; remove its server, entrypoint and dedicated schema/tests. Source downloads and system runtimes violate self-contained installation. Awaiting band ACK blocks work; blindly detaching before local acceptance produces misleading receipts. Platform-specific UI remains unnecessary even though hosts retain different configuration formats.

## Retired checkout installers

Remove `install_agent_hooks.mjs` and `install_codex_hooks.mjs` from the scripts directory, along with installer-only tests. Keeping the old automatic platform writer would conflict with the generic host-selected setup. Preserve the public `npm run hooks:install` name as a read-only alias to `buddy-cli.mjs guide`; it no longer writes configuration and old installer flags are unsupported. Tests verify the alias prints the complete guide without changing host configuration, and that both Mac compatibility entries remain. Existing event senders, receiver contracts and user-local backups remain untouched. Historical installer decisions in ADR-004/013 do not prescribe current setup.

## Compatibility

The desktop payload now uses a shared explicit resource boundary instead of copying whole development trees/manifests. Keep production JS modules, minimal module-type/version/license metadata, and the single current integration guide required by CLI guide/help. Exclude fixtures, tests, extra notes and development scripts from the App. Keep complete legal/attribution resources in their separate area. Keeping whole manifests would expose retired installer commands; deleting the live guide would break offline CLI discovery. Staging tests and relocated-bundle execution verify the boundary without changing runtime behavior.

Aggregate status identifies the subsystem as `source: "buddy-activity"` and adds `scope: "aggregate"`. The previous hardcoded `codex-hooks` label was not provider attribution. Counts and timestamps cover all conversations and cannot establish a particular run's state or Hook configuration; verify that run's report receipt instead. Anonymous input source IDs remain unchanged and are not exposed by status.

Keep existing Hook endpoint, compatibility entrypoints, wire v1, private data and npm commands. CLI flags and anonymous activity fields are unchanged. The MCP entrypoint is explicitly retired; existing host MCP registrations must be removed by the setup agent after reviewing only the Buddy entry. Do not auto-migrate legacy Hooks or double-report them. No band change, cloud service, telemetry, release or global configuration installation is part of this decision.

## Entrypoint identity

The bundled CLI and runtime compare canonical file identities, not the literal module URL and argv path. Node can resolve an entry module through a symbolic-link alias while retaining that alias in argv; string equality then silently skips startup. Keep the filesystem lookup in one runtime adapter, outside core, and treat missing/non-file arguments as imports. Comparing only basenames could start an imported service; requiring callers to canonicalize every launch path is fragile. Default Node resolution and preserve-symlinks-main both retain existing direct-entry behavior, with no wire/config change. A linked-directory child-process regression reproduces the empty guide before the fix, while identity and staged-import tests preserve side-effect-free imports. The release archive check also runs under a linked macOS temporary directory.

## Evidence

Tests cover strict content rejection, source isolation, same-millisecond ordering, stale generations, duplicates, terminal closure, capacity/rate limits, isolated loopback receipts, hung ingress and concurrent real CLI processes. A generic execution first observed as working requests a bounded start wake without inventing a thinking event; subsequent thinking maps to resumption, so ordinary tool traffic cannot repeatedly relaunch Buddy. Regression tests cover first working, same-run transitions and later executions. Existing cooldown and connection recovery remain. Signed bundle, relocation and installed-App checks are separate validation steps. Host-loaded WorkBuddy callbacks and physical display must still be observed.
