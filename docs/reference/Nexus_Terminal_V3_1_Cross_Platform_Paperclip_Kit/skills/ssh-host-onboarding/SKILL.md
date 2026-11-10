---
name: ssh-host-onboarding
description: Create immutable host inventory entry, verify SSH host key and credentials, probe capabilities in read-only mode, explain LAN/cloud route, and report pass/fail. Never accept a host-key change automatically.
---
# Ssh Host Onboarding

Purpose: Create immutable host inventory entry, verify SSH host key and credentials, probe capabilities in read-only mode, explain LAN/cloud route, and report pass/fail. Never accept a host-key change automatically.

Procedure:
1. Confirm user/task scope and explicit permissions.
2. Document assets, failure modes and acceptance tests.
3. Produce dry-run evidence before any mutating operation.
4. Run only approved development/staging actions with logs and rollback.
5. Include negative tests, final status and unresolved risks in Paperclip issue.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
