# Linux central self-hosting and remote Linux onboarding
**Status:** proposed release runbook; no live images or scripts have been installed.

## A. Production recommended deployment
Reference test baseline: a currently supported Ubuntu LTS or equivalent maintained Debian/RHEL-compatible release with a pinned deployment manifest. 64-bit CPU, adequate storage and backup. Size from measured load testing, not from guesswork.

1. Prepare a dedicated Linux VM; patch OS; configure DNS, trusted NTP, firewall and admin access via VPN/Teleport, no public unauthenticated SSH panel.
2. Deploy reverse proxy (HTTPS), Nexus API/UI, Postgres durable volume and backup job, relay WebSocket/stream service, notifications worker, metrics and audit collector. Restrict Postgres/network exposure; cap container capabilities and use read-only filesystem where feasible.
3. Select either tested OCI Compose deployment or systemd native installation. Do not require Kubernetes for MVP. Ensure Docker/Podman storage, device permissions and SELinux policies behave as expected on selected distro.
4. Provision GitHub OIDC/Teleport access with server labels, MFA, minimum roles, and short-lived SSH credentials. Keep direct emergency recovery path protected and audited.
5. Use sample **redacted** `.env.example` and secret store; never put credential strings into Paperclip documents, issues or prompts.
6. Test host-to-LAN routes via VPN or approved connector outbound relay; never open port 22 of every LAN server to Internet.
7. Run health, backup/restore, package signature and failover tests; schedule controlled upgrades with tested rollback and human approval.

## B. Remote Linux connector
- First connect SSH agentlessly, identify distro (`/etc/os-release`), arch, init system, package tooling and required privileges, create immutable preview and require host-owner authorization.
- Choose `.deb` / apt (Ubuntu/Debian) or `.rpm` / dnf/yum/zypper (RPM systems) with repository metadata + cryptographic signing; avoid unverified `curl | sudo sh` installers.
- Service uses dedicated unprivileged account and systemd sandboxing; unsupported init systems become `SSH only` until a tested adapter is implemented.
- Outbound mTLS to Nexus; minimal on-host privileged helper exposed only through audited, allowlisted command operations and expiring approval IDs.
- Test disable/uninstall/reinstall, certificate revoke/rotation, offline buffer limits, SELinux/AppArmor and multi-distro package upgrade.

## C. CI matrix
- Ubuntu LTS x86_64 and aarch64
- Debian stable x86_64 and aarch64
- RHEL-compatible x86_64 and aarch64 (license-compliant test image)
- Fedora/openSUSE/Arch as secondary tier where maintained build/test runner available
- Ubuntu older `glibc` native Paperclip Runner fallback must be tested, not assumed
- Alpine/musl and unsupported init: no connector guarantee until ADR and tests

Official Paperclip Runner requirements: https://docs.paperclip.ing/reference/adapters/paperclip-runner/
