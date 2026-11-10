---
name: mcp-tool-security
description: Threat model MCP tool invocation, validate caller+host+tool+risk policies outside model, request exact approval for mutations and test prompt-injection and credential leakage.
---
# Mcp Tool Security

Purpose: Threat model MCP tool invocation, validate caller+host+tool+risk policies outside model, request exact approval for mutations and test prompt-injection and credential leakage.

Procedure:
1. Confirm user/task scope and explicit permissions.
2. Document assets, failure modes and acceptance tests.
3. Produce dry-run evidence before any mutating operation.
4. Run only approved development/staging actions with logs and rollback.
5. Include negative tests, final status and unresolved risks in Paperclip issue.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
