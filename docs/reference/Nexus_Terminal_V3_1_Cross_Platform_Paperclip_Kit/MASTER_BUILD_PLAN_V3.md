# Nexus Terminal V3 — Ultimate Product & Implementation Master Plan

**Date:** 2026-11-10. **Status:** design and Paperclip task specification, not working software. Owner retains final authority for production access and release.

## Product promise
An operator-owned, self-hosted web/desktop-first platform to centrally connect LAN/cloud hosts; manage SSH, SFTP and VM lifecycles; run persistent human and AI terminal sessions; provide Warp-like editable command input and command blocks; orchestrate Claude/OpenCode/etc. agents through ACP/MCP; apply Teleport-style GitHub-team/RBAC/JIT access; and route safe approval requests to mobile phones with complete auditable history. Intended for **authorized** company infrastructure only.

## Hard requirements
- One deployable central Nexus dashboard on private on-prem or AWS VM with HTTPS, MFA, RBAC, backups, health checks, audit log.
- Agentless SSH available if hosts are reachable; optional signed connector installed only after approved owner action. Reverse/outbound tunnel for NAT when host has permitted outbound connectivity, or VPN/jump host.
- Employee accounts and host access mapped to GitHub organization/team membership, with deny-by-default resource labeling. Access to GitHub repositories and SSH servers remain **separate policy scopes**.
- Session persistence: sessions do not end on browser close or connection idle; bridge/WebSocket reconnects indefinitely with backoff. Same tmux target is reattached if host/process exists; native agent resume if supported. Revoked users must NOT regain interactive access.
- Warp-style CodeMirror input editor and xterm PTY fallback; edit mid-command, multiline, autocompletion and historical blocks. Never hijack keyboard from a TUI or silently replay commands.
- Attach/read multiple AI agents, observe run state, gate privileged actions, notify human approvers through self-hosted channels and mobile/PWA, perform secure approval from a fresh authenticated session.
- Inventory VMs across SSH, Proxmox/KVM/libvirt and cloud providers; snapshots/power actions only through supported APIs with approval.
- Open-source-first dependencies, licensing audit and independently designed UX. Claude/other hosted models and Warp itself may be proprietary; the delivered **product** can be open source while supporting proprietary agent adapters.

## Proposed components
1. **React/Next.js web frontend:** fleet dashboard, editor, terminal blocks, agent pane, approvals, settings, skills catalog, audit, user administration. `xterm.js` terminal emulator; `CodeMirror 6` smart editor; optional Tauri desktop wrapper after web stabilization.
2. **API/control plane (Go or TypeScript; ADR):** auth sessions, user/role policy, fleet inventory, resource ownership, audit, notification rules, approval lifecycle, WebSocket gateway and real-time events. PostgreSQL durable system of record.
3. **SSH/identity gateway:** Teleport integration option for secure host access, short-lived certs, node audit; separate direct SSH adapter only for explicitly permitted resources and transport modes. No ad hoc SSH CA invented by AI agents.
4. **Nexus connector (Go/Rust; ADR):** signed systemd-managed non-root service, bound to registered host and control plane using mTLS, outbound relay, jobs/metrics, one-time enrollment, narrow sudo helper for approved package operations; no unmanaged remote code execution.
5. **Remote session controller:** tmux sockets or evaluated multiplexer; stable ID + PTY process + output buffer cursor; dedicated resource owners, input leases and reattach authorization; agents run as managed jobs with checkpoints where supported.
6. **Agent harness adapter:** Claude Code, OpenCode, Codex, Hermes where documented; ACP as preferred adapter, native provider adapters as needed; capability declaration (resume, cancel, permission prompt, tool call view, worktree, cost, session id).
7. **Workflow + MCP control:** durable state machine (Temporal optional after ADR; DB-backed outbox acceptable MVP), tool allowlist, per-agent scope tokens, approval gates and idempotency. MCP servers sandboxed and observable; no agent permission to modify its own access policy.
8. **Notifications:** in-app, email, webhooks, Gotify/ntfy; push routes only to authenticated approval inbox. Retry indefinitely for connection failure with configured alerts; approval TTL always bounded.
9. **Fleet management:** Proxmox, libvirt and AWS EC2 adapters, Docker/systemd/Ansible agents; action plan/preview/approval/reconcile, dry-run before mutation.
10. **Ops platform:** reverse proxy, TLS, PostgreSQL backup and PITR, Prometheus/OpenTelemetry, structured logs, SBOM, CI code signing, migration/rollback, repository deployment pipeline.

## Architecture boundaries
**Management vs access**: Nexus web portal is not a bypass around the Teleport or policy gateway. Server authorization checked at every connect, reattach, input lease, privileged tool call and file operation.

**Terminal vs process**: WebSocket is ephemeral; remote tmux session and independently supervised agent are persistent. Idle browser state does not kill them. Machine reboot can kill a PTY; checkpoint-based agent resume produces a new process, never claims the same PID.

**Design vs adoption**: draw inspiration from Warp and Teleport public behavior and legal OSS; use clean-room functional specs, licensing review, not copying proprietary code.

## Six milestone gates
M0 **Research & product contract:** 8+ products investigated, maintained OSS choice table, licensure/SBOM plan, Warp command UX spec, Teleport edition proof, threat model, complete acceptance matrix.
M1 **Secure access & platform foundation:** staging deploy, GitHub identity mapping, deny/allow resource-label policies, user isolation, audit, short-lived credentials, end-to-end identity recheck tests.
M2 **Terminal & connector:** editor with reliable shell/TUI switching, SSH/SFTP, signed one-click connector, LAN/cloud routing, same-session reattach, no unapproved command execution.
M3 **Agent orchestration & approvals:** ACP sessions, agent registry, permission inbox, on-phone step-up authentication, approval replay protections, durable workflows, scoped MCP.
M4 **Fleet dashboard & UX:** multi-VM listing, role-aware views, telemetry, command blocks, software catalog, skills and templates, responsive navigation.
M5 **Quality & release:** destructive chaos in disposable VMs, outage/role-revoke/browser tests, load testing, Pentest review, release signing, human-approved production deployment and rollback drill.

## Implementation chain
Research / feature validation -> ADR and acceptance tests -> platform security primitives -> GitHub identity + host policy -> SSH mux -> Warp editor -> signed connector and secure relay -> agent harness and secure approval workflow -> fleet adapters and skills -> E2E and chaos -> staging and human-approved release.

Parallelism: while A7 builds editor under A1's contracts, A8 builds auth policy under A1; A2 builds core SSH/API; A3 builds harness once session API exists; A4 builds dashboard against mocks; A6 builds staging/signed packaging; A5 tests every branch independently.

## Definition of Done (every issue)
- Runnable source checked into a branch with PR; reproducible commands/scripts and tests; no fictional measurements.
- Includes unit tests, negative/security tests, UI screenshots/video where appropriate, QA sign-off, API/ADR and operator docs, rollback for risky changes.
- All changes through CI; default branch branch-protected, no test bypass; C1 independent QA/security and C2 architect/authorized human per risk.
- Required evidence attached to corresponding Paperclip issue: test reports, screenshots, CI link, threat-model changes, signed artifact digests if release.
- Acceptance satisfied on disposable staging VMs before any production action. Real production access requires explicit separate human authorization.

## No-timeout policy details
Reconnect workers continuously retry until disabled/revoked, using capped exponential backoff with jitter (e.g. 1-60 seconds initial then 5-minute polling); notify at 5/30 minutes. This is **not** disabling token expiry, input lease timeout, MFA requirements or audit retention. Control plane restarts cannot assume remote process survives unless remote tmux/supervisor does. Mobile notification delivery failures go to durable retry and escalation.

## License and community caveats
Teleport Community supports GitHub SSO and RBAC but Enterprise-only richer JIT UI/review features (see feature matrix). An independent Nexus approval workflow may govern Nexus actions, but cannot pretend to grant Teleport CE enterprise capabilities. If advanced access governance is mandatory, price Enterprise or build a correctly enforced open-source-compatible independent access broker after security review. Warp is proprietary; implement original editor using public behavior and open-source libraries.

## Official documentation seed sources
- Warp modern editor: https://docs.warp.dev/terminal/editor
- Teleport GitHub SSO: https://goteleport.com/docs/setup/admin/github-sso/
- Teleport editions: https://goteleport.com/docs/feature-matrix/
- Teleport agentless OpenSSH: https://goteleport.com/docs/enroll-resources/server-access/openssh/openssh-agentless/
- Paperclip issue documents: https://github.com/paperclipai/paperclip-docs/blob/main/docs/reference/api/issues.md
- Paperclip skills: https://github.com/paperclipai/paperclip-docs/blob/main/docs/reference/skills.md
- Anthropic model IDs: https://platform.claude.com/docs/en/models/overview

## V3.1 mandatory macOS and Linux implementation extension
`CROSS_PLATFORM_PRODUCT_CONTRACT.md` and `compat/supported-platforms.yaml` are normative. Mac and Linux are both **control-plane hosting targets** and **remote managed targets**. The interface uses OS capability detection to choose installers, service management, auth/mount abilities and known test status. The user can manage a Mac through SSH/SFTP even if no connector is installed. macOS connectors use launchd and signed/notarized packages; Linux uses tested init adapters and signed deb/rpm. Mac sleep/wake cannot guarantee a running process; claim original reattach only if process survived. Add P00 support matrix, P01 Mac/Linux CI and identity work, P02 zsh/bash/editing, P03 multi-OS signed connector, P09 hardware/security tests, P10 distribution and runbooks; all become required blockers before phase gate closure. See `TASK_SUMMARY.md`.
