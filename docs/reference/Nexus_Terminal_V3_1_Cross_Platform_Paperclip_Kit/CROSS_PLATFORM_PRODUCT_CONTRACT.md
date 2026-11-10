# Nexus Terminal V3.1 — macOS + Linux compatibility product contract
**Date:** 2026-11-10. Status: planned and test-gated, not yet implemented.

## The compatibility promise
Nexus shall (a) host the web dashboard/control plane on a supported Mac or Linux machine, (b) access Mac and Linux remote systems using ordinary SSH without requiring a connector, (c) optionally install a signed host connector appropriate to that OS, (d) preserve terminal/agent sessions through client/browser/gateway disconnects when the remote process survives, and (e) offer equivalent employee RBAC, audit and approvals regardless of host OS.

**Not a blanket all-versions pledge:** "all macOS/Linux versions" means broad multi-distribution support with a published, tested support matrix, plus agentless fallback for reachable legacy SSH servers. Historical/EOL systems cannot be guaranteed safe or supported. No weakening TLS, SSH, code signing or authentication for compatibility. Discover incompatible hosts and show actionable warning/remediation.

## Product shipping forms
1. **Web edition:** central Nexus server with HTTPS, dashboard/PWA. Deploy natively or in container on Linux; deploy natively or in a container runtime on macOS. Use PostgreSQL as durable database, not ephemeral container storage.
2. **Desktop companion (optional):** Tauri app with macOS Apple Silicon + Intel bundles and Linux x64/ARM64 packages, pointing to remote or local control plane. The dashboard remains usable in browser without desktop app.
3. **Host connector:** Go (or approved Rust) `nexus-agent` binaries for `darwin/arm64`, `darwin/amd64`, `linux/arm64`, `linux/amd64`. Sign releases; on macOS sign and notarize installer where appropriate, on Linux verify package signatures. OS abstraction provides supervisor and package-manager adapters.
4. **Agentless mode:** OpenSSH via authorized jump/proxy/VPN; SFTP virtual file browser; remote tmux session if available and permissioned. Native user-space SSH may exist before connector enrollment.

## Baseline test tiers (final support versions depend on P00 investigation)
- Tier A: latest supported macOS and two preceding supported major versions, on real Apple Silicon and Intel hardware **where OS vendor supports that combination**; Ubuntu supported LTS, Debian stable, RHEL/Rocky/Alma supported major releases; Linux x86_64 and aarch64.
- Tier B: Fedora, openSUSE/SLES, Arch, Amazon Linux variants, and Linux environments using OpenRC/runit: SSH/SFTP first, optional connector after explicit platform-specific test and published compatibility status.
- Tier C: older/EOL hosts: agentless SSH with risk warning and no default privileged connector install; never promise all features or security guarantees.
- `musl`/Alpine: not guaranteed to run the current Paperclip native runner; alternative legacy Paperclip adapter and statically-linked Nexus helper may be assessed separately.
- Explicit unsupported/not-yet-tested label for unverified distributions, kernel/CPU architecture, or OS versions.

## Responsibilities and platform differences
| Requirement | macOS | Linux |
|---|---|---|
| Persistent service | launchd LaunchDaemon/LaunchAgent appropriate to owner/use; never misuse `systemd` | systemd default; optional supervisor adapter after tested support |
| Terminal shells | zsh default, Bash optional, Fish if installed | Bash/sh, zsh/fish optional |
| OS identification | `sw_vers`, `uname -m`, `sysctl`, `id` | `/etc/os-release`, `uname`, package system, init system |
| Installer | Developer ID signed/notarized `.pkg` for distribution; test uninstall and recovery | signed `.deb`/`.rpm`, repository and checksum; test uninstall and recovery |
| Package ops | Homebrew when installed and authorized, vendor pkg installers; user vs system context | apt/dnf/yum/zypper/pacman as explicitly supported; sudo policies |
| Service operations | `launchctl` and `launchd` semantics | `systemctl` when available; capability-gated alternatives |
| Remote mounts | app SFTP virtual filesystem; optional macFUSE requiring explicit approval | app SFTP virtual filesystem; optional FUSE/sshfs if installed and safe |
| Secrets | OS Keychain integration where feasible; backend vault canonical | backend vault canonical, Linux OS secrets optional |
| Disk/privileges | macOS TCC, SIP, Full Disk Access consent; cannot bypass | Unix permissions, SELinux/AppArmor policies; cannot bypass |
| Connectivity | app outbound TLS permitted; remote Mac must enable Remote Login to accept SSH | SSH daemon/policy controls; VPN, jump or outbound relay |

## Host-service survival and guaranteed semantics
- No application idle disconnect. Reconnect attempts continue as long as authorization remains valid. Network retries have short **attempt deadlines** to avoid hanging, not a final session expiration.
- Mac sleep or power-down suspends/disrupts networking; full reboot terminates ordinary PTY/tmux. Agents must differentiate reattach-original vs resume-from-checkpoint as a new run. Offer power-management guidance for Mac mini always-on hosting; do not override user power policies silently.
- `tmux` availability is detected; if missing, show consent-based package installation or fallback to a clearly marked nonpersistent SSH shell.
- On every reconnect: reauthenticate human, re-evaluate current team/role/revocation state, renew scoped short-lived credentials and acquire writer lease. Never replay unsubmitted commands or expired approvals.
- All changes are scoped to owned/authorized hosts, with recorded human confirmation for privileged installation and production actions.

## Cross-platform acceptance gates
- One Ubuntu x64 central deployment, one macOS arm64 local deployment, one macOS Intel deployment/test runner and one enterprise Linux RPM-family host are tested in CI/hardware lab (or missing hardware explicitly blocks GA support claim).
- Browser refresh, Wi-Fi drop, gateway restart, connector restart, Mac sleep/wake, Linux reboot, and policy revoke during reconnection are tested independently.
- macOS `.pkg` signature/notarization/Gatekeeper, launchd boot autostart, uninstall/reinstall, app permission constraints; Linux rpm/deb signature, systemd startup, SELinux/AppArmor observations, rollback.
- Command editor works with Bash/zsh and remote PTY/TUI; role revocation prevents reattach on every host OS.
- SFTP works without kernel mount; FUSE mount tests conditional and require clear fallback warnings.

## Verified external baseline references
- Paperclip Runner OS routing: https://docs.paperclip.ing/reference/adapters/paperclip-runner/
- Paperclip host installer: https://github.com/paperclipai/paperclip/blob/master/doc/INSTALLING.md
- Apple background daemons: https://support.apple.com/guide/terminal/script-management-with-launchd-apdc6c1077b-5d5d-4d35-9c19-60f2397b2369/mac
- Apple code signing/notarization: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- Apple enable SSH/SFTP: https://support.apple.com/guide/mac-help/allow-a-remote-computer-to-access-your-mac-mchlp1066/mac
- Teleport macOS installation/agent support: https://goteleport.com/docs/installation/macos/
