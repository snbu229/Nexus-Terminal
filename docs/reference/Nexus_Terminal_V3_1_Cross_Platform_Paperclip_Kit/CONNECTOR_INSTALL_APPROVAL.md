# Secure One-Click Nexus Connector — exact technical workflow

## Architectural principle
The connector is an **optional**, pinned, signed Linux package and outbound-only service. SSH-only works without it. A connector does not bypass SSH authentication, network constraints, firewall ownership, or OS permissions. It should not provide unrestricted root remote command execution.

## Host install state diagram
`UNREGISTERED -> SSH_VERIFIED -> COMPATIBILITY_PROBED -> PLAN_READY -> AWAITING_APPROVAL -> APPROVED -> BOOTSTRAPPING -> SIGNED_BINARY_VERIFIED -> INSTALLED -> ENROLLED -> HEALTHY`
On failures: `INSTALL_FAILED`, `ENROLLMENT_FAILED`, `REVOKED` with safe rollback/uninstall paths. The dashboard shows an immutable install event timeline.

## Detailed steps
1. Operator selects Host, provides target DNS/IP, explicit SSH user/port and credential reference; reject unknown or changed SSH host key except with fresh owner verification.
2. Direct SSH preflight reads `uname`, distro ID/version, CPU architecture, init system, package manager, disk availability, `sudo -n` privilege capability, route to Nexus relay, SELinux/AppArmor state. Probe commands are read-only; report exact findings.
3. Server creates immutable `InstallPlan`: host identity, SSH host fingerprint, package name/version SHA256 signature identity, architecture, changes to disk/files/services, required privileges, network egress, approximate blast radius, rollback instructions, maintenance window. Show readable diff; default *No Install*.
4. Host owner signs into Nexus with MFA, reviews plan and selects **Approve and Install**. Approval contains `plan_hash`, `host_id`, `allowed_operation`, `actor_id`, single-use nonce, creation/expiry, and a policy-evaluated host role. For staging, an explicit scoped delegated approval may be used. **Production** requires human approval.
5. Nexus issues a one-time short-lived bootstrap enrollment token tied to host, plan and a connector-generated public key. Store hashed token and mark consumed atomically; never embed reusable management token in shell script.
6. Bootstrap downloads a **pinned signed** package from configured release endpoint or receives a verified offline artifact over SFTP. Verify digest and signature using a pinned trusted publishing key/Sigstore policy **before** running installation scripts. Validate expected package ID, version, architecture and signature identity. Avoid raw `curl | bash` or unauthenticated arbitrary GitHub `latest` downloads.
7. A narrowly scoped privileged install helper performs filesystem package operations and systemd setup; verify writes, ownership, and service; run installed process as non-root `nexus-connector` user. No broad `NOPASSWD: ALL` sudo rule. If a privileged sub-operation is later required, enforce a narrow allowlisted helper.
8. Connector generates unique machine key in locked-down local store; enrolls with TLS-verified central endpoint via one-time token, completes challenge/response, obtains short-lived machine certificate. Certificate is scoped to host and rotates automatically. Implement revocation list and audience checks.
9. Connector initiates outbound mTLS over 443 (WebSocket/HTTP2 or equivalent), advertises capabilities (health, metrics, supervised jobs) and reports signed version/build. Server verifies healthy connection and that machine ID/SSH fingerprint match expected host.
10. Nexus marks `HEALTHY`, records package provenance, cert fingerprint, operator approval, install logs (redacted), and a link to rollback. Report install failure accurately; never call it healthy solely because command exited 0.
11. Upgrades use staged signed versions, compatibility checks and rollback. Revoke disables tunnel authorizations and removes service trust. Uninstall requires approval, stops service, removes files according to documented retention settings, revokes certs and closes relay routes.

## Process privileges and OS hardening
- systemd unit should set `User=nexus-connector`, `NoNewPrivileges=yes`, `PrivateTmp=yes`, `ProtectSystem=strict` with explicitly writable state directory, `ProtectHome=yes` and restricted capabilities/device/address families after integration testing.
- Connector runs with outbound-only network and no inbound listener by default. Access to Docker socket, privileged sysfs, shell, filesystem exports or VM hypervisor sockets denied unless separately approved and mounted read-only/least-privileged.
- All operations use an `OperationPlan` service with server-side authorization and a connector-side independent capability check. Certificate authentication alone cannot grant root authority.
- Store secrets in OS-protected key store or encrypted file with strict permissions. Rotation and revocation are first-class.

## Failure conditions and tests
- Unknown host-key, MITM relay, expired/replayed enrollment, signature mismatch, package wrong arch, no sudo, unavailable relay, certificate theft/revocation, connector restart, rolling upgrade incompatibility, downgrade/replay, offline host before approval, approver losing rights, idempotent retry of partial install, audit gap and secrets printed to logs.
- Installer should support a **dry-run** and a **no-connector SSH fallback**. Do not block SSH-only usage when connector install fails.

## UI action contracts
`Prepare installation` (read-only) → `Review exact changes` → `Approve` (step-up MFA) → `Install` → `Validate` → `Rollback / Uninstall`.
The frontend button may initiate an approved workflow, but does not contain root credentials or run installation logic in the browser.
