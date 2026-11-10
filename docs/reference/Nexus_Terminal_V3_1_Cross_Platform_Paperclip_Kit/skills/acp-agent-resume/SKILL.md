---
name: acp-agent-resume
description: Negotiate ACP capabilities, persist native agent session ID and workspace, call session/resume only if advertised, and never fake seamless restoration on failure.
---
# Acp Agent Resume

Purpose: Negotiate ACP capabilities, persist native agent session ID and workspace, call session/resume only if advertised, and never fake seamless restoration on failure.

Procedure:
1. Confirm user/task scope and explicit permissions.
2. Document assets, failure modes and acceptance tests.
3. Produce dry-run evidence before any mutating operation.
4. Run only approved development/staging actions with logs and rollback.
5. Include negative tests, final status and unresolved risks in Paperclip issue.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
