# Security and privacy

Never include authentication files, AuthKeys, Xiaomi cookies, passwords, raw Bluetooth traffic or unredacted device identifiers in public issues. Describe the affected behavior and a minimal reproduction using dummy values. If private vulnerability reporting is enabled on GitHub, use that channel; otherwise request a private contact without disclosing exploit details publicly.

Authentication is stored in the app's private Application Support directory with 0700/0600 filesystem permissions, not Keychain. It is not application-encrypted. A process running as the same user can potentially access it. Logout removes the stored credential file; it does not revoke the Xiaomi account's other sessions.

The remote Xiaomi login WebView has no local IPC capability. Navigation and HTTP redirects are limited to Xiaomi HTTPS domains. Authentication is passed to local workers over inherited pipes, not command arguments/environment variables. Upstream raw logging is disabled. The Codex hook receiver binds only to 127.0.0.1:10731, rejects browser-origin writes and caps input size; it is not an authentication boundary against other processes running on the same Mac.
