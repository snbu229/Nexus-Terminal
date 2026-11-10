---
name: approval-review-and-replay
description: Build immutable operation plan, risk-tier route, single-use plan-hash authorization, MFA and expiry, recheck on reconnect, log decision and enforce no self-approval.
---
# Approval Review And Replay

Purpose: Build immutable operation plan, risk-tier route, single-use plan-hash authorization, MFA and expiry, recheck on reconnect, log decision and enforce no self-approval.

Procedure:
1. Confirm user/task scope and explicit permissions.
2. Document assets, failure modes and acceptance tests.
3. Produce dry-run evidence before any mutating operation.
4. Run only approved development/staging actions with logs and rollback.
5. Include negative tests, final status and unresolved risks in Paperclip issue.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
