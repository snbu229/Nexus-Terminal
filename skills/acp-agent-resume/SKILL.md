---
name: acp-agent-resume
description: Use when building or testing Nexus agent-session resume over ACP. Negotiate capabilities, persist the native session ID with workspace and host, call session/resume only if advertised, and never fake a seamless restore.
---

# ACP agent resume

## Use when

A task touches `packages/agent-sessions`, a harness adapter, or the UI that labels an agent session after a reconnect or restart.

Read first: `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/SESSION_PERSISTENCE.md`, and the agent-session API in the M-D1 plan (EZF-43 `plan` document, §4).

## Procedure

1. At `initialize`, read the agent's advertised capabilities and store them with the session. Never assume a capability from the harness name or version.
2. Persist the native agent session ID together with the workspace path, the host and the Nexus logical session ID. A resume uses all four; a mismatch on any of them is a failed resume.
3. Call `session/resume` (or `session/load`) only when the agent advertised it at `initialize`. Otherwise start a new session.
4. Label the outcome exactly: **reattached** (same live process), **resumed** (restored from the agent's own checkpoint), or **new session, not restored**. Never show one as another, and never replay earlier prompts or tool calls to simulate a restore.
5. Event streams are seq-numbered; on reconnect the client resumes with `afterSeq`. A WebSocket is never the session.
6. In M-D1 only the mock harness exists. A real harness, API keys or AI calls need their own approved task.

## Required negative tests

- Resume capability not advertised: a new session starts and the UI says "not restored".
- Stale, unknown or foreign session ID (another user, host or workspace) is rejected.
- Workspace path mismatch is rejected.
- The harness crashes mid-resume: the state ends as failed or new, never as resumed.

## Exit evidence

Test output for the cases above, attached to the Paperclip issue (see the `nexus-test-evidence` skill).

Never treat this instruction document as permission to access production hosts or install executable third-party code.
