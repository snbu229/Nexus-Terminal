# Product requirements and scope

## Mission
Nexus Terminal is one **self-hosted, open-source** platform to manage SSH-accessible servers, cloud/VM inventory, persistent interactive terminals, AI coding harnesses and delegated workflows, with secure approvals and mobile notifications. Paperclip is the separate development and org/task orchestration layer.

## Prioritized journeys
1. Admin signs in with MFA, adds a LAN/cloud server, validates host fingerprint, connects via SSH without installing an agent, opens multiple terminals.
2. Admin selects **Install Connector**; receives OS/arch/package/security preview, authorizes enrollment, observes signed installation/health, may revoke/uninstall.
3. Admin closes browser or loses Wi-Fi, returns days later, selects a session and reconnects to the **same remote tmux pane / live ACP agent session ID**, when still running. An expired auth token is refreshed via login; it is never infinite-lived.
4. Private LAN machine without inbound reachability establishes outbound mutually authenticated relay; user accesses it from AWS-hosted Nexus securely.
5. Agent runs in isolated worktree on managed VM, shows live transcript, status, token and job logs; a security-sensitive tool call creates an approval and pauses only that action.
6. User gets smartphone alert, logs into Nexus approval inbox, reviews exact diff/target/command, approves with step-up MFA; action executes once, receipt/audit posted to Paperclip issue.
7. User manages permitted VM lifecycle and packages with previews, dry runs, scheduling, rollback and approval.
8. Team installs prebuilt agent templates/skills through catalog after source and permission review; no root/global filesystem access by default.

## Must-have release 1
- Host inventory, SSH/PTY + WebSocket, verified SSH host keys, SFTP explorer, terminals in tabs/splits, tmux persistent sessions, reconnect and replay.
- Optional signed Linux connector, outbound mTLS relay, scoped host metrics, session owner process management, service health.
- Identity/RBAC, audit, protected action approval, email/PWA/in-app alerts, reconnect state machine with unlimited retry until user explicitly stops it.
- Agent job manager with 2 harnesses initially (Claude Code + OpenCode or Codex), ACP where supported, process ownership, workspace isolation, mobile approval inbox.
- Docker Compose staging, tests and backups. Fleet health list.

## Release 2
- Proxmox and AWS EC2 adapters, Linux package/service runbooks, Docker controls, MCP server catalog, skills and plugin catalog, durable workflows, richer AI/notification integrations, multi-user SSO.

## Release 3
- Native desktop app/mobile app if PWA insufficient, Kubernetes plugin, cloud resource provisioning, terminal command assist, RDP/VNC via Guacamole, advanced subagent delegation, optional SSHFS/remote development mounts.

## Non-goals and safety boundaries
- No bypass of OS permissions, no automatic firewall opening or unattended privileged install, no credential discovery, no blanket root token for agents.
- Do not promise SSH/TCP connection remains established during network outages or processes remain alive across OS reboot without supervisor/restart policy.
- A remote terminal, a *file mount*, and an *ACP session* are different constructs; UI must label them distinctly.
- Never use unbounded AI execution/cost. 'No timeout' applies to session retention and reconnect policy, not credential validity, approval lifetime, health probes or compute budget.

## Release quality
Every feature has tests, troubleshooting and rollback documentation. No production release without user approval. Track objective SLOs once workloads and connectivity are measured, not invented.
