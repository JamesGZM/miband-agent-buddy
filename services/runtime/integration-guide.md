# Connect an AI to MiBand Agent Buddy

This is the complete integration guide for the installed **MiBand Agent Buddy** application. Buddy includes its CLI and execution environment. Keep Buddy running. No document link, source checkout, system Node, npm, Python, downloads or cloud service is required.

## Requested outcome: user-wide automatic reporting

Set up continuous automatic status reporting for the current user's actual AI host, covering **all local projects, new main conversations and later turns**. Global here means this user's supported local host, not every AI application, other users or remote environments. Hooks are one possible mechanism, not a requirement: use a verified user-wide host setting, extension callback, SDK lifecycle integration or another deterministic automatic trigger supported by the actual product and version.

Complete the feasible setup in this setup turn: inspect the supported user-wide mechanism and existing Buddy registrations, preserve other settings, implement or reuse one reporter, persist its registration, and perform bounded checks. When setup is authorized, do not stop at a proposed configuration or ask the user to repeat that authorization. Respect any required native review, trust and permissions. A successful CLI test is an intermediate transport check; continue to persistent automatic configuration rather than ending with "CLI works" or instructions for the user to implement it themselves.

Do not silently fall back to project-only configuration. Use project scope only when the user explicitly requests it. If user-wide automation is unavailable, blocked or cannot reach the local application, report **automatic integration incomplete**, identify the exact capability or permission gap, and distinguish any transport test from installation. Do not invent a trigger or substitute model reminders, project instructions or manual CLI calls for the requested scope.

The reporter registration and any owned adapter/state must be independent of the current project and working directory. Use the host's supported user-level configuration source and a private user-level location for an adapter if needed; do not create project-local setup files for a global request. Inspect only known active configuration sources, never search unrelated projects or the home directory. Reuse a verified existing Buddy reporter where possible. Check active global/project sources for duplicate Buddy callbacks; replace only clearly owned redundant entries after verifying the replacement, with a private backup, preserving unrelated settings and later edits.

## Keep setup and reporting minimal

Configure the host's existing supported mechanism directly. Do not create a reusable installer/uninstaller, a new service or a separate integration framework by default. A small persistent adapter is appropriate only when the host cannot directly map lifecycle metadata to the CLI contract; explain that need and reuse an existing verified adapter before creating one. Keep only the adapter and minimal anonymous state required at runtime in a private user-level location. Setup previews, tests, backups and temporary inspection output must not become execution dependencies.

Use the host's supported execution facility or Buddy's bundled environment for any necessary adapter. Do not depend on another application's private Node/interpreter, a temporary work directory or a system runtime that the user has not installed. Resolve and verify the available execution facility before persisting configuration; if the host cannot run the required adapter with these constraints, report that specific capability gap instead of inventing a launcher.

## Nonblocking observation and ordered delivery

Reporting observes work and must not control it. Prefer the host's verified background/observational execution mode where supported. Do not configure every event to wait synchronously for application discovery, a child process and a CLI receipt merely to simplify ordering. If a lifecycle event must run synchronously, keep that handler to minimal bounded local acceptance or handoff, preserve its native non-veto response, and explain any unavoidable wait. Never wait for Bluetooth, screen wake or band ACK in the host path.

Bounded synchronous I/O inside a background worker can be acceptable when the host does not wait for it; the relevant boundary is the host's foreground operation, not whether every internal function uses asynchronous I/O.

Background execution is not itself an ordering guarantee. Stamp stable conversation/run/sequence metadata at the ordered host boundary, or use a bounded per-conversation dispatcher that preserves the host's real event order before delivery. A lock alone prevents concurrent writes but does not recover callback order; runtime watermarks reject stale reports but cannot reconstruct a missed start or terminal event. Do not assign increasing sequences merely in background process arrival order. Verify bursts and interruption/session shutdown, including whether the host cancels pending background work; do not claim reliable completion from an unverified detached process. Do not create unbounded queues, retries or orphan workers.

Terminal delivery must survive cancellation of background callbacks. Do not leave completion, cancellation or session shutdown dependent solely on a separate background drain that the host may cancel. Use a verified host-owned handoff or a bounded synchronous terminal submission when necessary; retain the usual nonblocking path for intermediate activity. A local `ended` flag or queued terminal is not evidence that Buddy received it. Bound the entire terminal callback and preserve its advisory, non-veto behavior.

Remove queued reports only after an `accepted` or `ignored` runtime receipt. A timeout, killed child, malformed reply, unavailable/busy/capacity/rate_limited result or missing receipt must retain the same source/session/run/seq for bounded recovery. Retry retained endings on a later supported lifecycle callback or explicit recovery, without polling, endless retries or a new task identity. Recover only actual recorded terminal transitions; never infer an ending from silence, discard another conversation, or reset all activity to hide a delivery failure.

The CLI's 300ms ingress deadline covers only local submission. It is not a bound on application lookup, adapter startup, synchronization or total host blocking. Bound the complete callback path with host/process deadlines; an event-loop timer cannot interrupt synchronous child execution or a blocking lock loop. Reuse a previously verified application entry where safe, and re-resolve on relocation or invalidation rather than performing expensive discovery for every state update. State both the execution mode and the actual scope of each timeout in the setup result.

## Identify the application

Application name: **MiBand Agent Buddy**. Application identity: `io.github.jamesgzm.miband-agent-buddy`.

Use the host's application-discovery capability or the operating system's installed-application registry to identify this application and resolve its executable internally. Verify the application identity. On macOS use the registered application identity; on Windows use the installed application's registration. Do not guess an installation directory, executable name, bundle suffix or a command on PATH. Do not scan the home directory or the disk. If application lookup is unavailable or ambiguous, explain the exact limitation and ask the user to select the installed application; never request a source checkout or extra environment.

The copied instructions intentionally contain no installation paths. A host may need to store the verified resolved executable in its private Hook/callback configuration; that is a setup detail, not a path the user must supply or paste. Re-resolve the application if it is moved or its registration changes.

## Choose your mechanism

The mechanism must provide **continuous automatic status reporting across the requested user-wide scope**, not just the setup conversation, an installation test or a one-off tool call. Establish how ordinary conversation activity in new projects and later turns triggers reports without the user asking for a report each time.

Connect the host to Buddy in two steps:

1. **Automatic trigger:** inspect the actual product, edition, version and loaded user-level configuration to choose a verified automatic host mechanism with the requested scope. This decides WHEN a report occurs. Prefer reliable host callbacks over asking the working model to remember calls. A CLI/SDK document with a similar product name does not prove that the user's desktop chat loads the same events or settings. If the host uses Hooks, verify their actual configuration, event schema, review/trust and loading; do not assume those details apply to another host or mechanism.
2. **Delivery channel:** invoke Buddy's bundled CLI from those callbacks. This decides HOW a report reaches Buddy: host Hook/callback → bundled CLI → running runtime. A successful CLI report alone does not establish automatic conversation tracking. No server registration or additional integration protocol is needed.

Preserve settings, preview changes, apply the authorized user-wide configuration, and respect native trust/permissions. Do not invent lifecycle events or assume a model name supplies them. Install only one primary reporter per main conversation. Do not modify other permission decisions. A user request to remove an old integration does not prohibit a newly reviewed generic reporter when needed; do not silently reinstall the retired platform-specific configuration.

### Establish automatic conversation reporting

- Verify callbacks for ordinary user submission, tool execution/resumption, actual main-turn completion and interruption/failure. Map only supported events to the universal states below. A tool ending is not the main conversation ending; a subagent ending must not end or add a main task. Session startup/resume is not automatically an active task.
- Use real host conversation/turn metadata, not a hardcoded test ID, tool-call ID, model-generated prose or a transcript. The reporter must preserve identity and manage increasing run/seq automatically across later turns. Map opaque host turn IDs to execution generations if needed. Serialize callbacks through the host's ordered dispatcher or a minimal adapter with bounded per-conversation synchronization; do not make the working model manually increment counters each turn.
- If a command adapter is needed, use an available host execution facility or Buddy's bundled environment, without installing an extra interpreter. Read only whitelisted lifecycle metadata from callback envelopes. Ignore content-bearing fields; do not open transcripts, log payloads, or use prompt/LLM hooks to infer state. Never block a normal completion, inject continuation prompts or change original tool/permission results for reporting.
- Exclude Buddy's own CLI calls from activity callbacks to avoid recursion. Bound launch/submission time, preserve native non-veto responses and continue original work on reporting failure. Run independent conversations concurrently while preserving each conversation's order.
- Confirm the mechanism is registered at user scope for new MAIN conversations across projects, and separately whether the selected conversation has loaded it. Identify the actual loaded settings source and whether changes affect this conversation or only a new one. Review/trust/reload through the host when required; never bypass or self-grant trust. If a new session is required, explicitly mark the current session as not yet loaded; do not claim current-conversation tracking from a file edit or a subagent-scoped callback.
- If no reliable trigger can be established, report **automatic integration incomplete** with the exact missing capability. CLI can still be transport-ready. Model-driven calls must be labeled best-effort model reporting, and explicit one-off calls manual reporting; neither is a substitute for verified host automation. Do not call setup complete merely because a synthetic CLI test passed.

Invoke the verified application entry with `--buddy-cli`. The following notation describes argument arrays; it is not a command to run before application lookup:

```
MiBand Agent Buddy + ["--buddy-cli", "guide"]
MiBand Agent Buddy + ["--buddy-cli", "status"]
MiBand Agent Buddy + ["--buddy-cli", "report", "--source", "<opaque-client-id>", "--session", "<opaque-conversation-id>", "--run", "1", "--seq", "1", "--state", "thinking"]
```

The angle-bracket values are placeholders. Supply the resolved executable and arguments separately where supported. Neither the display name nor the notation above is a promised shell alias. No system PATH modification or elevated permission is needed by the executable itself.

## Universal reporting logic

Each independent main conversation has one stable, anonymous `source` + `session` pair. Use random identifiers, not user names, project names, paths, prompts or credentials. IDs contain 1–96 ASCII letters/digits or `._:-`, beginning with a letter/digit. The runtime hashes this pair before tracking it. Reuse that pair across later turns and reporter reloads. Do not count tools, subagents or background steps within a main conversation as separate tasks.

Persist one reporter source identity and a stable mapping from the host's main-conversation identifier to its anonymous session identity. Never create a new source or session for each message, turn, callback, process launch, retry or setup rerun. A new turn advances `run` on the existing conversation; duplicate callbacks and delivery retries reuse their original tuple. Reconfiguration must reuse existing identities and pending deliveries. If identities cannot be recovered, explain that limit before replacing them; do not silently create a second reporter for the same conversation. Buddy cannot deduplicate unrelated anonymous identities by inspecting conversation contents.

For the first execution use `run: 1`. After completion/cancellation/failure increment `run` for the next execution. Within a run, increment `seq` for each meaningful state change. Retries reuse the same run/seq. Serialize events within a conversation; independent conversations can report concurrently. The integration layer should generate these fields automatically where possible. An event's identity is its source/session/run/seq tuple.

Report one of these states:

- `thinking`: beginning or resuming reasoning.
- `working`: performing work such as tools or commands.
- `needs_user`: a real pending approval or input request with a reliable resolution lifecycle.
- `completed`: the execution actually finished successfully.
- `cancelled`: the execution was interrupted or invalidated.
- `failed`: the execution ended unsuccessfully.

All five fields (`source`, `session`, `run`, `seq`, `state`) are required by CLI `report`. Flags use those same names. There are no text/content fields; unknown fields are rejected. Ended runs cannot be reopened, even by a higher sequence; a new run must have a larger number. Delayed lower runs/sequences and retries return `ignored` without replaying effects.

A new run first observed as `thinking` or `working` can request the existing bounded start wake; an initial `needs_user` requests attention. Do not invent a fake thinking event just to wake the band. Later tool/resumption events within that run only update activity. Existing wake cooldown, connection recovery and display confirmation still apply, so acceptance is not an instant-wake guarantee.

Only report meaningful transitions. Do not report Buddy calls themselves, poll status during normal work, send heartbeats, or repeatedly retry. A receipt confirms runtime acceptance only, never physical band display. The CLI waits at most 300ms for local runtime ingress, never for Bluetooth, wake, reconnect or band ACK. The host must bound its command launch and preserve non-veto Hook results. Serialize each conversation's callbacks; independent conversations may invoke separate CLI processes concurrently. Do not create an unbounded process backlog. These are processing deadlines, not guaranteed total client latency. The host controls tool scheduling and approval. Continue the original task on unavailable/busy/capacity/rate_limited results. Never change original tool results or permission decisions to make reporting succeed.

The runtime tracks at most 128 generic conversation watermarks until reset/restart, accepts at most 30 nonterminal updates per second per conversation and always permits an eligible ending through that rate limit. One ending cannot clear another conversation. State aggregation and display delivery stay on the desktop; repeated intermediate display snapshots are coalesced by the existing runtime. Existing legacy Hooks remain compatible; do not double-report the same conversation through legacy and generic routes.

## Waiting and interruption boundaries

Native approval events and actual user questions are different capabilities. Enable `needs_user` only when you know when the interaction opens and resolves/cancels. For a blocking interaction, report the resumed activity after real resolution. For nonblocking interactions, the reporter must retain pending requests and keep `needs_user` while any remain; unrelated tools finishing do not prove an answer. Do not send the question, answer, options or tool arguments. If reliable resolution is unavailable, omit this optional mapping and state the limitation.

Model-driven reporting can miss interruption, shutdown and the final event. Do not claim automatic lifecycle coverage from an instruction alone. A reliable host callback can cover those transitions; otherwise explain the gap. Silence or connection closure never proves completion. After 15 minutes without events Buddy warns that state is stale but keeps work active. The user can clear stale activity in Buddy Settings without cancelling the actual AI work.

## Verify and remove

CLI `status` returns `source: "buddy-activity"` and `scope: "aggregate"`. This identifies Buddy's activity subsystem, not the reporting AI or transport. It is different from the anonymous input `source` used to isolate conversations. `eventCount`, `activeSessions`, `sessionCounts` and `lastEventAt` cover all tracked conversations. A rising event count does not identify a provider, and a nonzero active count after your run ends does not prove that run is still active. Check the receipt for your own run's terminal report; do not require aggregate activity to reach zero or infer that legacy Hooks are enabled from this status.

First use CLI `status` to confirm local availability. Synthetic reports validate the transport only; end every synthetic run. Then start and finish one real ordinary task with the configured mechanism. Report separately: configuration installed, host loaded/trusted, event count changed, start/end states observed, and physical band response observed by the user. Test independent conversations and cancellation where the host supports it. Do not read transcripts or expose unrelated configuration/credentials while inspecting settings.

Automatic verification must include a **later ordinary user turn without a notification instruction** and a **new main conversation in a different project**, without copying setup instructions or adding project configuration again. The host mechanism, not extra ad-hoc report commands from the setup model, must produce start and terminal reports. Verify another turn increments the run while retaining conversation identity, and that the second conversation does not share or close it. Test real interruption where supported; otherwise mark cancellation unsupported or unverified. If host loading or the user's later turn is pending, leave automatic verification pending instead of substituting another synthetic test. Complete all feasible configuration before requesting the remaining user action; do not defer installation merely because later conversation verification needs the user.

Verify deduplication and failure recovery separately: replay the same callback, restart/reload the reporter, run several later turns in one conversation, and overlap two independent conversations. One active conversation must remain one task across repeated messages; ending either of two tasks must leave the other active. Simulate failed terminal submission and cancelled background delivery using synthetic metadata in isolation: the ending must remain recoverable under its original identity and close only that run after a successful retry. Then verify real terminal receipts through the host. Event count increasing is normal and is not task count increasing. Report synthetic checks and real host cancellation coverage separately; a configured background handler alone does not prove delivery.

Finish with a concise result for each item, supported by non-content evidence rather than full configuration dumps:

- **User-wide configuration:** installed/reused, blocked or unsupported; name the actual host and user-level configuration source, and whether the reporter is independent of the setup project. A project-only edit does not pass this item.
- **Transport:** available/unavailable, with the CLI receipt; this item alone does not complete setup.
- **Host activation:** loaded, unverified, or **Native review, trust or reload pending**. State the exact required native action when pending; do not bypass it or claim a file edit activated callbacks.
- **Automatic behavior:** later ordinary turn and different-project new conversation each verified/pending, with start/terminal and identity-isolation evidence. A synthetic report or aggregate event count alone does not pass this item.
- **Remaining limits:** cancellation coverage, optional needs-user mapping and physical band observation, each verified, unsupported or pending. State the smallest next action for any pending item.

Call user-wide automatic integration complete only when configuration, activation and real automatic cross-project behavior are verified. Otherwise state what is installed and what remains pending; do not collapse partial results into "connected".

For removal, delete only the reporter/CLI callback entry you added; preserve existing settings and later edits. The desktop process remains the sole runtime and Bluetooth owner. Local-only entrypoints do not make remote/cloud hosts able to reach this computer; a host-provided local bridge is required. No cloud bridge is included.
