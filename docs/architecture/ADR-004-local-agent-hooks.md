# ADR-004: Project-scoped local AI Hooks

**English** · [简体中文](ADR-004-local-agent-hooks.zh-CN.md) · [繁體中文](ADR-004-local-agent-hooks.zh-TW.md)

## Problem

The existing Codex-only setup does not guide a new user through connecting a project, does not support Claude Code or custom harnesses, and cannot label parallel AI work clearly in the desktop.

## Decision

Keep the existing three-field loopback event contract and state/wake policy. Adapt each supported host at the process boundary, namespace new providers' session IDs before hashing, and map host events to canonical states. Add a reusable repository skill that installs into a verified project through a merge-safe installer. Codex uses `.codex/hooks.json`; Claude Code uses `.claude/settings.local.json`. Global installation stays available when explicitly requested. Configuration status and observed event delivery remain separate.

The installer preserves unrelated settings, uses private backups and atomic replacement, refuses malformed or linked config files, and removes only its matching commands. Runtime aggregate state adds counts for thinking, working and attention without exporting session identities. Custom harnesses must send lifecycle and terminal events explicitly. Ordinary desktop chat support is not inferred from a model or product name.

## Alternatives

- Direct HTTP hooks would forward full host payloads, including prompts and tool contents. Local sanitizing commands preserve the privacy contract.
- One global config for every user would hide project intent and scope. Project-local setup is the skill's default.
- Adding provider metadata to every wire event would permit source-labelled UI but is unnecessary for aggregate activity. Namespaced hashes provide isolation without changing the wire contract.

## Compatibility

`npm run hooks:install`, `scripts/install_codex_hooks.mjs`, `mac/codex-hook.mjs`, legacy Codex hashes, the loopback address/header and canonical events remain supported. New clients and the installer use independently testable adapters; core keeps platform-free imports. No cloud service, model API or permission decision is added.

## Evidence

Official [Codex Hooks](https://learn.chatgpt.com/docs/hooks) documents project discovery and trust. Official [Claude Code Hooks](https://code.claude.com/docs/en/hooks) documents user/project configuration and lifecycle payloads. Synthetic tests cover provider privacy/isolation, failed-turn mapping, concurrent aggregate state, scoped paths, backup/merge/removal, idempotence and fail-open behavior. Real host trust and a physical band's display remain manual verification.
