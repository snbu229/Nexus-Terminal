---
name: signed-connector-bootstrap
description: Create a signed, version-pinned Linux connector install plan including changes, permissions, enrollment TTL, rollout, rollback, and security verification tests. Do not install unless authorization exists.
---
# Signed Connector Bootstrap

Purpose: Create a signed, version-pinned Linux connector install plan including changes, permissions, enrollment TTL, rollout, rollback, and security verification tests. Do not install unless authorization exists.

Procedure:
1. Confirm user/task scope and explicit permissions.
2. Document assets, failure modes and acceptance tests.
3. Produce dry-run evidence before any mutating operation.
4. Run only approved development/staging actions with logs and rollback.
5. Include negative tests, final status and unresolved risks in Paperclip issue.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
