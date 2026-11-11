# Buddy native transport

Long-running macOS SPP transport using pinned AstroBox Core and the upstream IOBluetooth implementation. See [third-party notices](../../THIRD_PARTY_NOTICES.md).

Run `python3 bootstrap.py`, then `cargo build --locked`. The application launches this process with inherited stdio; credentials are supplied only in its first input frame. Subsequent JSON-line commands are snapshots, installation of the local Buddy package, or disconnect. Output is limited to structured state/progress and application ACKs. Never enable raw upstream logs.

This binary is an internal component, not a generic network server. IOBluetooth delegates remain on the main run loop. Core work runs on a Tokio runtime on another thread. The parent bounds connection/ACK/install times and terminates abandoned sessions.

Owned source is split into protocol/stdio boundaries, connection, application operations, session coordination, sanitized error classification and platform run-loop composition. No reconnect or wake policy belongs here; those remain in the Node runtime. Shared synthetic IPC fixtures are tested with both Rust packages and JavaScript.

SPP uses Core's advertised 32-frame window without an overrun allowance. Buddy installation configures the public `XiaomiDevice.config.mass` with one-part batches and a one-window backlog (32-part fallback), without changing ACK or write deadlines. Core's flow-control pass waits for at least one ACK but does not drain the entire backlog: a 32-part batch can add more entries than that pass removes. With one-part batches, a queue below the window can grow only to the window, and a successful wait removes at least one entry before the next enqueue. This keeps outstanding MASS sequence slots below the 256-value sequence space even under single-ACK progress. The adapter uses existing upstream APIs; no pacing sleep or transport replacement is added.
