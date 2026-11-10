---
name: ssh-host-onboarding
description: Use when adding a host to Nexus inventory or building the ssh-dev provider. Pinned host key (never accept a change automatically), read-only capability probes for macOS and Linux (launchd/systemd, package manager, tmux), SSH-only fallback, and never production.
---

# SSH host onboarding

## Use when

A task creates a host inventory entry, connects to a host over SSH, probes host capabilities, or works on `packages/terminal-sandbox` (`ssh-dev`).

Read first: `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/CROSS_PLATFORM_PRODUCT_CONTRACT.md`, `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/compat/supported-platforms.yaml`, and the M-D1 plan (EZF-43 `plan` document, §5).

## Targets

- M-D1: only the in-process test server or the compose `sandbox-host`. Never a real host, never production.
- Later milestones: only board-approved disposable hosts named on the issue.

## Procedure

1. **Host key pinned.** Generate an ephemeral host key for the test target and pin it. An unknown or changed key is rejected, never accepted automatically. Show the fingerprint for a human to verify.
2. **Keys stay ephemeral.** Private keys exist only in memory or a temp dir, are never logged or committed, and are deleted at teardown.
3. **Inventory entry is immutable once created.** It records id, name, OS, arch, environment, route (LAN, cloud, relay) and terminal provider. A change creates a new revision.
4. **Read-only probes only.** Allowed: `uname -sm`, `/etc/os-release` or `sw_vers`, presence of `systemctl` or `launchctl`, the package manager (`apt`, `dnf`, `yum`, `zypper`, `brew`), `tmux -V`, the login shell. Never install, start or stop a service, change config, or use `sudo`.
5. **Platform differences.** Linux uses systemd (or another init: record it); macOS uses launchd and `brew` is optional. Don't run a Linux command on macOS; probe first.
6. **SSH-only fallback.** If tmux or a connector is missing, offer plain SSH with no persistence claim.
7. Report pass or fail per probe with the raw output.

## Required negative tests

Unknown host key rejected; changed host key rejected; wrong user or key rejected; a probe that would write is refused; no key material in logs; macOS and Linux probe fixtures each map correctly.

## Exit evidence

Test output attached to the Paperclip issue. Probes on a real OS that wasn't available are recorded as **not run**.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
