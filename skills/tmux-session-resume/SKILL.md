---
name: tmux-session-resume
description: Use when building or testing Nexus terminal session persistence with tmux. Bind the logical session to host + user + tmux session, recheck authorization at every reattach, never replay commands, and report reconnect separately from process restore.
---

# tmux session resume

## Use when

A task touches terminal-session persistence, reattach, the session list, or reconnect diagnostics.

Read first: `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/SESSION_PERSISTENCE.md`.

## Rules

1. Bind the Nexus logical session ID to host + user + tmux session name. A reattach that doesn't match all three is rejected.
2. Recheck authorization at **every** reattach. A revoked or disabled user is denied, even if the tmux session is still running.
3. Never replay or re-send a command on reattach. Show output from the buffer only (M-D1: ring-buffer replay with `afterSeq`).
4. Report "reconnected" (the stream came back) separately from "process restored" (same process still running). Show exact diagnostics when reattach fails.
5. Probe that tmux exists on the host (macOS and Linux). If it doesn't, use the SSH-only fallback and make no persistence claim.

## Required negative tests

Browser drop, API restart and network drop each reattach without replay; a revoked user is denied; tmux missing falls back to SSH-only with no persistence claim.

## Exit evidence

Test output attached to the Paperclip issue. Real-host reboot cases need board-approved disposable hosts; otherwise record them as **not run**.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
