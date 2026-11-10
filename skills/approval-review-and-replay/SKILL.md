---
name: approval-review-and-replay
description: Use when designing, building or reviewing Nexus operation approvals. Immutable plan, risk-tier routing, single-use plan-hash authorization with MFA and expiry, recheck on reconnect, no self-approval, and no approve path in dev.
---

# Approval review and replay

## Use when

A task touches the approval inbox, the approval API, risk tiers, or any code path that turns a request into permission to act on a host.

Read first: `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/SECURITY_GATES_V3.md` and `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/SECURITY_APPROVAL.md`.

## Rules

- **M-D1 has no authority.** Dev has no approve or deny endpoint, and no request body may carry `approved:true`. The inbox shows read-only fixtures with actions disabled and labelled "dev mock: no authority". Don't build an approve path early.
- Paperclip C1/C2 task review, human production authorization, employee JIT access and AI tool permission are separate approvals (`SECURITY_GATES_V3.md` §1). One never stands in for another.
- An approval binds to the hash of an immutable operation plan (actor, host, command or package, version). It is single-use and expires. Recheck it at execution and on every reconnect.
- Route by risk tier T0–T3. T2 needs host-owner approval with MFA; T3 needs two distinct humans. Fail closed.
- No self-approval, human or agent. Aliases of the same person count as one approver.
- Log every decision with approver, plan hash, time and outcome.

## Required negative tests

Self-approval (human and agent); two aliases of one person; replay of a used approval; expired approval; plan changed after approval; approval used for another host; a dev request carrying `approved:true` is rejected.

## Review

C1 and C2 approve the exact head SHA; the author never approves their own work; a new commit needs re-review. Changes here are in the `human-approval-required` merge class (see `nexus-pr-workflow`).

Never treat this instruction document as permission to access production hosts or install executable third-party code.
