---
name: teleport-rbac-identity
description: Use when designing or building Nexus employee identity and SSH access. GitHub org/team login, short-lived certificates, deny-by-default host policy, revocation and JIT access, through the AccessProvider abstraction (Keycloak + step-ca proposed primary, Teleport optional and external).
---

# Identity and SSH access (Teleport-style)

## Use when

A task touches login, GitHub team mapping, roles, host labels, SSH certificates, JIT access, revocation or offboarding.

Read first:

- `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/TELEPORT_IDENTITY_ACCESS.md` and `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/SECURITY_GATES_V3.md`.
- `docs/research/access-provider-evaluation.md` (EZF-7: capability comparison, threat model, T-01..T-19 test plan).
- `docs/adr/ADR-PROPOSED-access-provider-keycloak-step-ca-primary.md` (_pending_: on branch `EZF-24-nx2-005a-human-legal-review-of-licence-ledger-counsel-questions-7-human-only`; status Proposed, needs human board C2).

## Provider position (as of the proposed ADR)

- Build against the `AccessProvider` abstraction. Proposed primary path: Keycloak (identity brokering) + step-ca (short-lived SSH certs) + OpenSSH on hosts. Keycloak never enforces SSH by itself; OpenSSH does.
- Teleport is optional and external, subject to licensing approval. **Never bundle, redistribute, embed or auto-install Teleport binaries or images** (CE licence bans embedding). **No reuse of Teleport source** (AGPL-3.0). Talk to an operator-installed Teleport only through its documented APIs.
- Teleport CE has no access-request UI and no dual authorization. Don't build UI controls the provider can't honour.

## Rules

1. Deny by default. Map GitHub org/team to roles, then roles to host labels and logins. The GitHub scope is `read:org` only; tokens are never logged or sent to the browser.
2. **GitHub repository access never means SSH role authorization.** Repo permissions and server access are separate policies.
3. Short-lived certificates only; validated host identity; MFA for risky actions; JIT grants are separate, scoped and expiring; no direct-SSH bypass.
4. Recheck revocation at every reattach. Until EZF-20 T-11 passes, revocation is **TTL-bound**: don't claim immediate revocation, and show the exposure window.
5. Human and AI identities stay separate. Agents never get production or root access.
6. Use disposable fixtures only. Never change production identity policy without human authorization.

## Required negative tests

Unknown team or org denied; repo-only member denied SSH; expired cert denied; revoked user denied on reattach; offboarded user loses access within the stated TTL; self-approved JIT request denied; over-scoped GitHub token rejected.

## Deliverables and review

ADR (see `nexus-architecture-adr`), policy matrix, API contract in `packages/contracts`, denial and offboarding tests, and PRs. This work is always in the `human-approval-required` merge class: C1 by QA Security (A5) and C2 on the exact head SHA, plus a recorded human board approval. The author never approves their own work; a new commit needs re-review.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
