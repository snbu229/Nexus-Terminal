---
name: nexus-platform-compatibility
description: Use when designing or testing any Nexus host capability, connector, package or service for macOS and Linux. Covers OS/arch declarations, launchd vs systemd, packaging, SSH-only fallback, and honest compatibility evidence.
---

# Nexus platform compatibility

## Use when

A feature runs on, installs onto, or probes a macOS or Linux host, or a task claims platform support.

Read first: `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/CROSS_PLATFORM_PRODUCT_CONTRACT.md`, `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/compat/supported-platforms.yaml`, `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/compat/COMPATIBILITY_TEST_MATRIX.md`, `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/deploy/DEPLOY_ON_LINUX.md`, `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/deploy/DEPLOY_ON_MACOS.md` and `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/deploy/HOST_CONNECTOR_INSTALLER_STRATEGY.md`.

Never assume a Linux `systemd` command exists on macOS. Never assume a Mac process survives sleep or shutdown.

## Procedure

1. Declare the supported OS, arch, init system, service manager and package manager combinations, plus feature flags, for the feature.
2. Implement platform adapters for `darwin/arm64`, `darwin/amd64`, `linux/arm64` and `linux/amd64` with capability probing and an **SSH-only fallback**.
3. macOS: launchd, hardened signed and notarized `.pkg`, and respect TCC, SIP and Keychain consent. Linux: systemd where available, verified `.deb`/`.rpm`, SELinux and AppArmor fixtures. Agents never hold signing or notarization keys; signing is a human release step.
4. For mounts, prefer an SFTP virtual filesystem. Mark FUSE, SSHFS and macFUSE as optional third-party dependencies.
5. Write tests first. Record exact OS version, arch, hashes, outcome and logs on the Paperclip issue. Don't claim general compatibility without execution evidence; missing evidence means **unverified**.
6. Connector install, package updates, privileged service changes and fleet actions need an immutable plan, host-owner approval and a safe rollback.
7. PTY reattach, deliberate host reboot, Mac sleep/wake, firewall drop, stale roles and expired-approval revalidation are tested on board-approved disposable hosts. If no such host exists (EZF-20 is waiting for infrastructure), record the test as **not run** rather than claim it.

Never print or commit credentials, SSH private keys or code-signing keys. Don't run privileged commands against unapproved targets.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
