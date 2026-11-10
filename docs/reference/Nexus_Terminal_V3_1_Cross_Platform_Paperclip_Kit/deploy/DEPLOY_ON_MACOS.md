# Mac mini / macOS local hosting and remote Mac onboarding
**Status:** future deployment runbook; commands are examples pending built artifacts and validated release versions.

## A. Hosting control plane on macOS
Recommended: dedicated always-on Mac mini, managed OS updates, stable power and LAN, monitored disk, HTTPS even on LAN, backups on a different device. Do not equate a laptop with a 24/7 server; sleep and restart interrupt running services.

1. Verify CPU (`uname -m`), OS (`sw_vers`), disk, full-disk encryption and user roles. Confirm current macOS is in `compat/supported-platforms.yaml`.
2. Install the supported Node/Go/Postgres/container runtime through a vetted distribution; choose one supported track: **native launchd** (preferred for low-overhead local use) or an approved Docker VM environment (simpler parity with Linux staging). The containers have a separate networking and filesystem boundary on Mac; test host access, volume backup and restart.
3. Deploy Nexus API/UI, PostgreSQL with persistent volume, reverse proxy, TLS, and outbound relay; do not expose database to Internet. Start via a user-owned `launchd` service or system-owned service appropriate to the privilege model. Service definitions are delivered and signed with product, never downloaded and run as a blind shell pipe.
4. Create administrator via OIDC; enable MFA, audit sink and nonproduction remote host inventory. Back up PostgreSQL and keys to separately managed encrypted storage.
5. Verify auto-start after reboot and (when host is unlocked/logged out if expected), app status, restore-from-backup, graceful shutdown, and `tmux`/SSH identity paths.
6. Publish URL through internal DNS + VPN first; external access via dedicated zero-trust proxy only after threat review. Use certificate rotation and network firewalls.

## B. Managing the Mac as a target
- Apple: System Settings > General > Sharing > Remote Login, restrict allowed users to least privilege. Host SSH fingerprint must be verified out-of-band and pinned.
- Agentless SSH/SFTP and remote tmux where available; install `tmux` only with owner consent.
- One-click Connector must generate a macOS-specific install plan, show required user/admin authorization, verify signed/notarized `.pkg` prior to install. Install a dedicated non-root identity and launchd helper; certificate enrollment only with short-lived token.
- Respect TCC / SIP, user consent for inaccessible folders, Keychain. Do not automatically enable Full Disk Access or bypass macOS consent dialogs.
- Distinguish outbound connectivity availability from Mac sleep or offline conditions; no reconnect deadline terminates a session.

## C. Mac launchd smoke tests (future CI or operator test)
- Install/restart/logout/reboot and confirm service health and stable connector host identity; test GUI logout and system daemon availability.
- Check crash autorestart, stale lock cleanup, logs, config file permissions, no world-readable token, rollback and uninstall.
- Sleep/Wake restores relay and shows whether original tmux/agent process survived; duplicate PTY avoided.
- Confirm Intel and ARM64 installers; Gatekeeper signature and notarization before shipping binaries externally.

Official references: https://support.apple.com/guide/terminal/script-management-with-launchd-apdc6c1077b-5d5d-4d35-9c19-60f2397b2369/mac ; https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution ; https://support.apple.com/guide/mac-help/allow-a-remote-computer-to-access-your-mac-mchlp1066/mac
