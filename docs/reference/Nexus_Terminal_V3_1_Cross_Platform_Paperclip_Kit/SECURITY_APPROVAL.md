# Approval and authorization workflow: Paperclip, Nexus, mobile

## Two distinct approval planes
**Plane 1 — Paperclip build governance:** C1 review and C2 approval at task completion, enforced by Paperclip executionPolicy. This controls who may mark development issues done and authorize a release plan. It **does not** authorize execution of privileged commands on servers.

**Plane 2 — Nexus runtime authorization:** Every sensitive operation and tool call is checked on the server against user, role, host, target VM, action, plan hash, risk, approval freshness, device session, and current host state. A Paperclip agent may *request*, not grant, production privileges.

## Matrix
| Action | Policy |
|---|---|
| Read host/agent status/logs | RBAC-scoped, log access audited |
| Terminal SSH in allowed host | MFA/host-key verified; OS rights unchanged |
| Run tests or build in dev sandbox | Autonomously allowed within restricted workspace |
| Add read-only MCP server or safe skill | Security review of source/capabilities before activation |
| Install connector or OS package in staging | Exact plan; delegated approval if operator pre-authorized scoped test environment |
| Install connector on production | Human host owner + step-up MFA + exact plan approval |
| Restart/stop/redeploy production service | Human approval unless pre-signed narrowly scoped runbook and policy permits |
| Change IAM, networking, firewall, hypervisor credentials | Explicit human approval; high-risk uses second human where possible |
| Destroy VM, delete backups, rotate root access | Default deny; manual break-glass process and tested recovery |

## C1 / C2 for Paperclip development
- C1 reviewer = separate Security/QA agent; for work authored by Security/QA, use Architect and independent CI checks.
- C2 approver = Architect or CEO for normal implementation; human owner for release or sensitive infrastructure work. Avoid self-review and self-approval; Paperclip's stage policy has a **single required approval per stage**, so two-person approvals need *two distinct sequential stages or an external policy check*.
- `maxReviewRounds=3`, then human escalation. Every agent completion must post tests with verifiable logs; failures return to executor.
- C2 *technical* review is not equivalent to runtime production privilege approval.

## Runtime approval workflow
`OPERATION_PROPOSED -> POLICY_EVALUATED -> WAITING_FOR_APPROVER -> (APPROVED | REJECTED | EXPIRED | REVOKED) -> REVALIDATING -> EXECUTING -> VERIFYING -> (SUCCEEDED | FAILED | ROLLED_BACK)`.
- Build immutable request: `request_id`, `operation_id`, `actor_agent_id`, `requester_user_id`, `target_host_id`, `operation_kind`, `normalized_arguments`, `plan_hash`, `diff`, `risk_tier`, `time_window`, `rollback`, and `audit_correlation_id`.
- Notify specified approvers. Mobile push is **notification-only** (minimal host/action metadata); open authenticated Nexus PWA with optional reauthentication.
- Approve/Reject requires actor identity and MFA for sensitive actions, role and fresh policy check, unexpired nonce, matching exact `plan_hash`; approval is single-use and cannot be replayed on a changed command/host.
- On reconnect after offline interval, do not blindly execute stale approvals. Re-probe host state, recompute plan and require reapproval if changed. Durable workflow remains waiting until decision, explicit cancellation or policy-based expiration.
- On execution verify exact remote command via allowlisted helper or host-specific admin identity, record exit/result and detection of partial completion, then update Paperclip issue with *sanitized* evidence.

## Threat model
Cross-tenant SSH hijack, host-key downgrade, auth token theft, unknown relay host, remote execution injection, LLM prompt-injection tool escalation, RBAC bypass through MCP, replayed approval, unauthorized takeover, signed package compromise, malicious plugin/skill, leaked model API keys, forged push, CSRF, event stream loss, model hallucinated completed test, queue duplicate side effects and dual-writing to a PTY.

## Control requirements
- OIDC/MFA and least privilege. Per-host access and per-tool capability grants. Access tokens expire; refresh is explicit and revocable.
- All executors separated from production, no root workspace. Agent actions are isolated and logged. Prod write grants are short-lived and user-issued.
- Sign connector packages and plugin releases, pin dependency versions and commits, store SBOM, scan vulnerabilities, verify build provenance and maintain license ledger.
- No raw secrets inside MCP prompts, model logs, issue descriptions, mobile notifications or screenshots.
- Audit append-only or tamper-evident records with actor, approval, target, arguments hash, outcome, provenance and retention settings.
- Emergency revoke must terminate future access to host, MCP capability, connector mTLS cert and live session attach token, even if idle retention is indefinite.
