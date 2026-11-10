---
name: third-party-skill-audit
description: Inspect source origin, exact license, manifest, update pin, requested capabilities and install scripts of any skill/plugin before it enters shared catalog.
---
# Third Party Skill Audit

Purpose: Inspect source origin, exact license, manifest, update pin, requested capabilities and install scripts of any skill/plugin before it enters shared catalog.

Procedure:
1. Confirm user/task scope and explicit permissions.
2. Document assets, failure modes and acceptance tests.
3. Produce dry-run evidence before any mutating operation.
4. Run only approved development/staging actions with logs and rollback.
5. Include negative tests, final status and unresolved risks in Paperclip issue.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
