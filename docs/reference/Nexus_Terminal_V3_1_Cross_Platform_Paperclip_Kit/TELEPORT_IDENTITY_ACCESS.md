# Nexus Identity Gateway — Teleport-style Zero-Trust employee and agent access

Status: architecture requirements and edition compatibility research; not deployed.

## Non-negotiable principle
There are **two separate authorization domains**: human/employee access to hosts, and autonomous-agent permissions to tools/actions. GitHub repository permission does not implicitly grant a shell on that server. Every action is authorized server-side with a specific principal, host, action, sensitivity and freshness.

## Recommended strategy
**Phase 1**: deploy/evaluate self-hosted Teleport Community Edition as an optional enterprise-grade SSH identity gateway for staff, while Nexus integrates through documented client/API mechanisms. Teleport handles SSH certs/RBAC/audit where it supports them; Nexus handles UX, orchestration, connector actions and independent policy on top. Do not build your own SSH CA or access broker until threat-model review proves need. Keep a provider-agnostic `AccessProvider` contract to replace or add Teleport later.

**Phase 2**: for richer IdP sources (OIDC/Entra/Okta), advanced UI request workflow, device-trust and governance, run proof-of-concept with Teleport Enterprise and document cost. If strictly open-source-only is mandatory, evaluate Keycloak for Nexus login and a compatible SSH certificate issuance/broker stack; do not claim that Keycloak by itself replaces Teleport SSH enforcement.

Teleport 18.x Community edition (verify deployed version before production): supports GitHub SSO, RBAC, SSH certificate issuance, auditing, session recording, agentless OpenSSH integration. Community access requests are role requests submitted by CLI, approved by an auth-service administrator with `tctl`; advanced JIT approval UI/reviewers and dual authorization are Enterprise capabilities. Do not present Nexus UI as if those APIs exist in CE. The Nexus approval ledger can gate **Nexus-mediated privileged actions**, but must NOT bypass Teleport's source-of-truth SSH access decisions. Research a safe adapter that can translate approved requests to supported Teleport operations using a separately authorized service account, or defer this integration.

## Identity and GitHub flow
1. Create GitHub OAuth connector with minimum `read:org` scope; verify GitHub org and team slugs and access to those memberships.
2. Map GitHub org/team membership to limited Nexus employee roles (and Teleport roles where integration permits); refresh membership at login and periodically, and react to org webhook signals only after verification.
3. For login, redirect to the identity provider; establish short-lived Nexus app session with MFA step-up on high-risk actions. Never give the browser a reusable Teleport admin credential.
4. For host connect, recompute effective policy with user/team, host labels, environment, SSH login, time-bound grants and explicit denies. Obtain role-scoped short-lived certificate from the trusted provider; the browser never holds long-lived host private keys.
5. On team deletion, user disablement or certificate/policy revocation, prevent new sessions and detach existing Nexus interactive streams where technically enforceable; distinguish previously-running remote processes. Don't promise instantaneous revocation of all already-issued SSH certs without server enforcement.
6. Separate identity GitHub OAuth from GitHub App installed for repository access. The latter must use repo-scoped installation tokens and should not confer server access.

## Starting role matrix — deny unless explicitly allowed
| Role | Dev servers | Stage servers | Prod servers | View recordings | Approve high-risk changes | Configure access policies |
|---|---|---|---|---|---|---|
| Platform owner | JIT admin | JIT admin | Human-approved JIT | Yes | Yes, with MFA | Yes, with dual control |
| Developer | Shell + SFTP | Read + requested elevation | No | Own sessions | No | No |
| DevOps | Shell, service ops | Shell on approved labels | JIT time-boxed | Team scoped | Stage only | No |
| Auditor | Metadata & redacted recordings | Metadata | Metadata | Authorized events only | No | No |
| Contractor | Explicit labeled hosts, TTL | No | No | Own only | No | No |
| AI build agent | Sandbox hosts only | No | No | Own CI logs | Cannot authorize itself | No |
| SRE AI agent | Read-only inventory | Read-only metrics | Read-only where explicit | Selected audit events | Suggest/request only | No |

Use attribute-based restriction beyond role: `environment`, `team`, `project`, `host_labels`, `ssh_login`, `command_class`, `source_network`, `actor_type` and `expiry`.

## Session and approval semantics
- `serverAccessGrant` is *not* a session. The browser/web app can persistently reconnect to the same `tmux` session only after **fresh RBAC authorization and short-lived credential refresh**.
- Access request has who/why/host/role/commands/duration/approval policy/evidence. Approval is bound to immutable request digest and requester; MFA step-up; no self-approval; two distinct human approvers for production when required.
- Approval of a plan never equals execution. At execution, revalidate digest, permissions, target fingerprint, host labels, token expiry, idempotency, change window and current security posture.
- Employees can be invited, mapped to GitHub organization teams, assigned project scopes, suspended, and offboarded. Every grant and removal recorded in immutable audit stream; log correlation to command blocks and agent activities without exposing passwords/API keys.
- Shared live sessions require owner authorization, read-only observer option, explicit input handover, role recheck on each join. Support HIPAA/PII retention constraints only if separately specified, with encryption, redaction, retention and deletion rules.
- For SSH access controlled by Teleport, do not allow Nexus direct SSH fallback as a hidden bypass. Agentless mode still requires enrolling/trusting Teleport CA and routes. Host enrollment is a privileged change with owner approval.

## Interface contracts
`IdentityProvider`: loginCallback(), lookupGroups(), userStatus(), sessionClaims()
`AccessProvider`: listHostResources(), authorize(), issueEphemeralSession(), revokeUser(), auditEvents(), accessRequestCapabilities()
`PolicyDecision`: `allow`, `denyReasons`, `effectiveRoles`, `mfaRequired`, `requestRequired`, `decisionId`, `expiresAt`
`JITGrant`: `subjectId`, `hostScope`, `role`, `duration`, `requestId`, `approverIds`, `planDigest`, `revocationState`

## Security and negative tests
- GitHub OAuth callback CSRF/state/nonce protection, token leakage tests, invalid org membership, member changes, dual roles and explicit deny.
- Certificate freshness and MFA tested when reconnecting after >30min network outage; no session access if actor was deprovisioned during outage.
- Contractor tries cross-host, auditor tries command, AI tries approving own shell escalation, developer attempts direct SSH bypass: all denied and audited.
- Replay of approval / approval for changed host fingerprint / stale login / revoked org membership: deny.
- Teleport CE access request limitations demonstrated in proof-of-concept; no invented feature claims.
- Enrollment of OpenSSH node rolls back safely if sshd validation fails; recoverability preserved.

## Primary references (verify versions and licenses)
- https://goteleport.com/docs/feature-matrix/
- https://goteleport.com/docs/setup/admin/github-sso/
- https://goteleport.com/docs/enroll-resources/server-access/openssh/openssh-agentless/
- https://goteleport.com/docs/identity-governance/access-requests/oss-role-requests/
- https://goteleport.com/docs/reference/access-controls/roles/
- https://goteleport.com/docs/reference/architecture/session-recording/
