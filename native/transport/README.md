# Buddy native transport

Long-running macOS SPP transport using pinned AstroBox Core and the upstream IOBluetooth implementation. See ../../THIRD_PARTY_NOTICES.md.

Run `python3 bootstrap.py`, then `cargo build --locked`. The application launches this process with inherited stdio; credentials are supplied only in its first input frame. Subsequent JSON-line commands are snapshots, installation of the local Buddy package, or disconnect. Output is limited to structured state/progress and application ACKs. Never enable raw upstream logs.

This binary is an internal component, not a generic network server. IOBluetooth delegates remain on the main run loop. Core work runs on a Tokio runtime on another thread. The parent bounds connection/ACK/install times and terminates abandoned sessions.
