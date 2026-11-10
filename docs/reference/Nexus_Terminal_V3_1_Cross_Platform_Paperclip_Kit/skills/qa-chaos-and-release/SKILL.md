---
name: qa-chaos-and-release
description: Construct staging outage/host reboot/connector crash/duplicate queue/second-writer scenarios. Capture evidence; block release on failures and demonstrate restore/rollback.
---
# Qa Chaos And Release

Purpose: Construct staging outage/host reboot/connector crash/duplicate queue/second-writer scenarios. Capture evidence; block release on failures and demonstrate restore/rollback.

Procedure:
1. Confirm user/task scope and explicit permissions.
2. Document assets, failure modes and acceptance tests.
3. Produce dry-run evidence before any mutating operation.
4. Run only approved development/staging actions with logs and rollback.
5. Include negative tests, final status and unresolved risks in Paperclip issue.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
