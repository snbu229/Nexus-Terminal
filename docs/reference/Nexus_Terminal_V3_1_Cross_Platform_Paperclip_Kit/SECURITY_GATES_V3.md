# V3 Approval & security gate policy

## Distinguish five unrelated approvals
1. Paperclip technical **C1**: independent QA tests & security analysis; no write on target infrastructure.
2. Paperclip technical **C2**: architect/CTO accepts spec and code; author cannot self-approve.
3. **Human production change authorization**: owner approves specific release/command/host/version with fresh MFA; AI never substitutes for this.
4. **Employee server JIT access**: distinct authorization with scoped role, user, host labels and expiry; Teleport enforcement where integrated. A Paperclip C2 is not a server-access grant.
5. **AI tool permission**: agent may request restricted MCP/SSH/tool action; machine-enforced scoped token and policy decide whether authorization exists.

## Action risk tiers
- T0 read-only docs, synthetic tests, public research -> agents autonomous in sandbox.
- T1 development repo changes, tests, non-prod deployment -> C1 + C2, protected CI.
- T2 signed connector installation on staging VM, package/service changes, employee role configuration -> explicit operator or delegated host-owner approval; MFA and immutable plan digest.
- T3 production shell access, broad admin role, credential rotation, firewall edits, VM destroy/snapshot restore, disabling recordings -> two distinct humans or stronger organization-specific threshold. Always fail closed.

## Workflow
Propose -> validate actor/resource scope -> classify risk -> generate immutable action-plan digest -> send minimal mobile push -> authenticated approval screen -> MFA / second human where needed -> verify approver separation, expiration and current policy -> issue single-use short-lived action capability scoped to host/version/digest -> execute with protected service identity -> record transcript/structured events -> verify postcondition and rollback if failed -> close evidence.

## Revoke / outage
If authorization revoked while terminal remains running: disconnect stream, deny input and new joins; do not let reconnect grandfather access. If event arrives while offline, enforce at central gateway and node on next access. Provider certificate expiry remains bounded regardless of persistent tmux process. Approval request expiry NEVER indefinite, regardless of long-running sessions. Approvals revalidated after reconnect; stale packets not replayed.

## Red-team/negative tests
Self-approval, multiple account aliases approving same request, changed command after approval, reused one-time grant, replayed mobile link, wrong host label, cross-tenant websocket, dual input writers, bypass through direct SSH, disabled user resuming detached tmux, malicious OSC output, path traversal in SFTP, unsigned connector package, forged GitHub org webhook, credential leakage into recordings, outdated policy cache, background agents calling unapproved tools.

## License and trust checkpoints
Review dependency tree/SBOM/signature; check third-party license obligations; do not copy proprietary Warp/Teleport code. A research skill is not a permission to bypass product restrictions. Use the Teleport source/documentation only with its actual licensing terms and deployment edition capabilities.
