# ADR (proposed): tmux is the default PTY backend; Herdr is an optional session provider

Status: **Proposed.** Needs C1 (A5) and C2 (A0). NX2-007 (session protocol ADR) may supersede this.
Origin: EZF-13 (NX3-106). Evidence: `docs/research/component-comparison.md` §5.
Author: A1 Nexus CTO / Research Architect.

## Context

Remote terminals and agents must survive SSH and WebSocket loss (SESSION_PERSISTENCE.md). Candidates:

- tmux 3.8 (ISC). Distro-packaged on Linux and available on macOS.
- Herdr v0.9.5 (Apache-2.0, pre-1.0, HEAD `ee5bfb5041bb`). A Rust multiplexer for coding agents with:
  - working, blocked and idle state per pane;
  - a Unix socket API with a bundled JSON Schema;
  - multi-machine attach over SSH;
  - layout and native-agent-session restore after a server restart. Original processes do not survive a restart.

## Decision

1. **tmux is the default** `SessionProvider` on Linux and macOS hosts.
2. **Herdr is a candidate optional `SessionProvider`** for R2. Its value is agent-state detection, which maps to `pending_prompts`. The adapter may ship only if all of these hold:
   - Herdr's remote self-install is disabled. Installs happen only through the signed Nexus install plan.
   - The Herdr socket is treated as user-equivalent privilege. It is never exposed to agents or other UIDs (lab test P-3).
   - Herdr is pinned by release tag.
3. Zellij stays deferred.

## Consequences

- The identity invariants in ARCHITECTURE (`nexus_session_id` maps to `(host, uid, multiplexer_type, remote_session_name)`) already carry `multiplexer_type`, so no schema change is needed.
- "Restore after restart" is never presented to users as process survival. This is true for both backends.

## Alternatives considered

- Herdr as the default backend. Rejected for now: pre-1.0, installed via `curl | sh` and not distro-packaged, and its socket API is a broad control surface.
