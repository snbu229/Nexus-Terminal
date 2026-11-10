# OS compatibility test plan
## Mandatory release gates
Support claims must have dated test results, build hashes and issues. A green ssh connectivity test is NOT enough to label connector support.

| Test | macOS ARM | macOS Intel | Ubuntu x64 | Debian ARM | RHEL-compatible x64 | Other distro |
|---|---|---|---|---|---|---|
| HTTPS dashboard local host | PENDING | PENDING | PENDING | PENDING | PENDING | conditional |
| SSH and pinned host-key | PENDING | PENDING | PENDING | PENDING | PENDING | conditional |
| SFTP / large file | PENDING | PENDING | PENDING | PENDING | PENDING | conditional |
| Remote tmux original reattach | PENDING | PENDING | PENDING | PENDING | PENDING | conditional |
| ACP Claude agent session recovery | PENDING | PENDING | PENDING | PENDING | PENDING | conditional |
| Signed installer verify/rollback | PENDING | PENDING | PENDING | PENDING | PENDING | conditional |
| Service restart after reboot | PENDING | PENDING | PENDING | PENDING | PENDING | conditional |
| Browser disconnect / reconnect | PENDING | PENDING | PENDING | PENDING | PENDING | conditional |
| 30-min offline threshold then retry | PENDING | PENDING | PENDING | PENDING | PENDING | conditional |
| RBAC revoked during offline state | PENDING | PENDING | PENDING | PENDING | PENDING | conditional |
| SFTP virtual mounts | PENDING | PENDING | PENDING | PENDING | PENDING | conditional |
| Warp-like editor zsh/bash & TUI | PENDING | PENDING | PENDING | PENDING | PENDING | conditional |
| Connector certificate revoke / reinstall | PENDING | PENDING | PENDING | PENDING | PENDING | conditional |
| Gateway restart/backup/restore | PENDING | PENDING | PENDING | PENDING | PENDING | conditional |

**Failure policy:** platform stays unsupported for relevant feature until measured passing evidence; do not release broad "supports all distributions" marketing.
