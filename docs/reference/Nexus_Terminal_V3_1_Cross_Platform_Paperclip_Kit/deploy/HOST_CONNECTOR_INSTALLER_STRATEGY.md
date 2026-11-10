# Cross-platform connector installer — design and security approval SOP

## Installer abstraction
`platform_probe` -> `CapabilityManifest` -> immutable `InstallPlan` -> `OwnerApproval` -> `ArtifactVerification` -> `Install` -> `Enroll` -> `HealthCheck` -> `AuditReceipt` -> `Rollback`.

`CapabilityManifest` fields: `os_family`, `os_version`, `arch`, `ssh_reachable`, `home_dir`, `shell`, `init_system`, `pkg_manager`, `privilege_mode`, `tcc_selinux_apparmor`, `tmux_available`, `connector_supported`, `mount_capability`, `teleport_enrolled`, `notes`.

`InstallPlan` binds **host ID**, observed SSH host key, artifact SHA-256/signature/key ID, distro/arch, files to change, service unit definition, capabilities, proposed privilege elevation, approve-by timestamp, requester ID, exact action digest and rollback strategy. Approval expires and is **single-use**. Revalidate fingerprint/version/plan hash immediately before any write; deny on mismatch. Display plan in browser or phone authenticated approval inbox; a notification cannot approve directly.

## macOS path
1. Detect `darwin` and arch; detect macOS version and `launchd`, avoid Linux systemd assumptions.
2. Build signed Developer ID `.pkg`, notarize and staple where applicable; verify signature/notarization in installer before install; identify operator authorization needed. Avoid silent TCC/SIP bypass.
3. Use least-privilege dedicated service identity; `launchd` LaunchDaemon when persistent before login is required, LaunchAgent when user-scoped. Do not turn on Remote Login automatically.
4. Enroll mTLS identity with 10-minute one-time token, rotate identity, test fallback to agentless SSH if enrollment fails. Uninstall removes only owned files and revokes cert without deleting sessions/history blindly.

## Linux path
1. Match supported distro + architecture; select pinned signed `.deb`/`.rpm`, verify before package manager invocation.
2. Test systemd service unit and service user; deny unknown init systems unless explicit tested adapter exists.
3. Apply scope-limited privilege rules with exact command allowlists, audit plan and success/failure state. Privileged installation never triggered by agent solely.
4. Enrollment, health, upgrade, rollback and uninstall as above.

## Core security tests
- Tampered package, expired signature, wrong CPU/OS, invalid host key, stale plan version, replayed phone approval, revoked admin, package repository rollback, MITM enrollment and cross-tenant host link all denied.
- Mac Gatekeeper denies unsigned/unnotarized distribution; TCC access fails safely and is explained to user.
- Linux SELinux/AppArmor access control and package-manager failures roll back without leaving overprivileged long-running service.
- Installer must not log API tokens, private keys, approval secrets, or include arbitrary root command channels.

## Agent ownership
A1 architecture contract; A6 package/distribution; A2 connector platform and SSH; A8 identity/approval; A5 negative tests; A4 approval UX; A0 release gate.
