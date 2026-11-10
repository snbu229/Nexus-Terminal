---
name: qa-chaos-and-release
description: Use when planning or running Nexus fault, chaos or release-readiness tests. Outage, reboot, connector crash, duplicate delivery and second-writer scenarios on disposable infrastructure, raw evidence, and release blocked on failure.
---

# QA chaos and release

## Use when

A task asks for fault or chaos testing, a gate check (G0–G7, M-D1), or release readiness.

Read first: `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/TEST_STRATEGY.md` (fault/chaos and acceptance gates) and `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/compat/COMPATIBILITY_TEST_MATRIX.md`.

## Rules

1. Run scenarios only on **disposable, board-approved test infrastructure** (or the local dev compose). There is no staging today. If the environment doesn't exist, record the scenario as **not run**.
2. Evidence is raw artifacts attached to the Paperclip issue: CI link, logs, test report, artifact digests. A summary is not evidence.
3. QA never approves its own fixtures or test harness; someone else reviews them.
4. Any failure blocks the gate or release. Nobody waives a failing security or negative case alone (see `nexus-c1-review`).
5. A release needs human approval. QA approval is not a release.

## Scenarios

Connector crash and restart; host reboot (show an honest "process lost" or native-resume outcome); duplicate queue delivery; a second writer on one session; Paperclip outage; connector outage; browser disconnect while tmux keeps running; rollback demonstrated end to end.

## Review

C1 and C2 approve the exact head SHA; the author never approves their own work; a new commit needs re-review.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
