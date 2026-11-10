---
name: tmux-session-resume
description: Keep logical Nexus session ID bound to host/user/tmux session. Show exact reattach diagnostics and distinguish reconnect vs native process restoration. Test browser/API/network failure.
---
# Tmux Session Resume

Purpose: Keep logical Nexus session ID bound to host/user/tmux session. Show exact reattach diagnostics and distinguish reconnect vs native process restoration. Test browser/API/network failure.

Procedure:
1. Confirm user/task scope and explicit permissions.
2. Document assets, failure modes and acceptance tests.
3. Produce dry-run evidence before any mutating operation.
4. Run only approved development/staging actions with logs and rollback.
5. Include negative tests, final status and unresolved risks in Paperclip issue.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
