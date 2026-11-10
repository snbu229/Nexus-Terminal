# ADR (proposed): per-prompt rotation of the shell-integration marker nonce

Status: **Proposed – needs design and testing**
Origin: NX3-104 command-editor behaviour spec, BR-12(c) (docs/research/command-editor-behaviour-spec.md); EZF-22.

## Context
The initial release rotates the OSC 133 marker nonce per session only. The nonce is delivered outside the PTY by a write-once fixed SSH operation (BR-12 c0). A leaked nonce stays valid for the rest of the session.

## Question
Can the nonce rotate at every prompt without sending a new nonce in `D` or any other PTY output, and without making the event log or any PTY-visible channel carry it?

## Constraints (from the spec)
- Never transmit a new nonce in PTY output (including `D`).
- Delivery must use an authorized, audited, revocable fixed operation (TELEPORT_IDENTITY_ACCESS; NX3-111), not free-form exec.
- Same-user processes can read files and forge events; any design must state its residual risk.
- Must work for bash/zsh/fish and inside tmux.

## Open design points
- Per-prompt delivery path (write-once file per prompt vs. pre-delivered batch/hash chain) and its race with shell prompt timing.
- Behaviour when a rotation delivery is missing (expected: UNKNOWN state, no draft captured).
- Cost and latency over SSH, failure modes on reconnect.
- Tests required before adoption: TC-12 extensions, tmux fixtures (TC-21), reattach.

## Decision
None yet. The CTO's ADR task may adopt this stub.
