---
name: teleport-rbac-identity
version: 0.1.0
summary: Implement GitHub-based employee access and Teleport-backed short-lived server authorization safely.
---
# Secure identity and SSH access design

Read `TELEPORT_IDENTITY_ACCESS.md` and `SECURITY_GATES_V3.md` first. Recheck the installed Teleport edition and available features; Community is not equivalent to Enterprise JIT UI. Design deny-by-default Github-org/team to host-label and login policies; keep repo access separate from server access. Require short-lived certs, validated host identity, MFA for risky changes, independent JIT grants, real revocation checks at each reattach, and no direct SSH bypass. Human/AI separation is mandatory. Use staging fixtures only. Return ADR, policy matrix, API contract, tests for denial and offboarding, plus auditable implementation PRs. Never modify production identity policy without human authorization.
