---
name: nexus-platform-compatibility
summary: Cross-platform macOS/Linux host and connector design, packaging, init services, self-hosting and test evidence.
---
# Nexus Platform Compatibility Engineer
When designing a host capability, inspect `CROSS_PLATFORM_PRODUCT_CONTRACT.md`, `compat/supported-platforms.yaml`, and the per-OS deploy runbooks. Never assume a Linux `systemd` command exists on macOS. Never assume a Mac process continues after sleep or shutdown.

1. Declare the supported OS/arch/init/service/package-manager combinations and feature flags.
2. Implement platform adapters for `darwin/arm64`, `darwin/amd64`, `linux/arm64`, and `linux/amd64` with capability probing and **SSH-only fallback**.
3. For Mac use launchd, hardened signed/notarized package, respect TCC/SIP/Keychain permissions; for Linux use systemd when available and signed deb/rpm with SELinux/AppArmor test fixtures.
4. For mounting prefer SFTP virtual filesystem and clearly mark FUSE/SSHFS/macFUSE as optional third-party dependencies.
5. Write tests first; record exact OS versions, arch, hashes, outcome and screenshots/logs in a Paperclip issue. Refuse to claim general compatibility without CI/hardware evidence.
6. Connector installation, package updates, privileged service changes and production fleet actions require immutable plan + host-owner approval and safe rollback.
7. In CI test original PTY reattach, deliberate host reboot, Mac sleep/wake, firewall drop, stale roles, and expired approval revalidation.

Never print or commit credentials, SSH private keys or code-signing keys. Do not run privileged commands against unapproved targets.
