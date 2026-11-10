# Architecture RFC — deploy once, manage local/AWS/multiple VMs

## Layers
```
  Browser / PWA / later Desktop+Mobile
       HTTPS + WSS + SSO/MFA + user-scoped short-lived attach token
          |
  API and Control Plane (TypeScript NestJS/Fastify)
     Host registry     Session registry       Agent run registry
     Package plans     Approval service       Notification prefs
     Audit/outbox      Policy engine          Plugin/skill catalog
          |
  +-------------------+---------------------+------------------+
  |                   |                     |                  |
  SSH/SFTP gateway    ACP harness broker    MCP tool gateway   Workflows
  (Go, maintained     (Go/TS, supports      (ToolHive optional) (Temporal)
   SSH lib)            CLI adapters)
  |                   |                     |                  |
  SSH direct / WireGuard / outbound mutually authenticated relay
  |                   |
  Local LAN nodes     Dev agent runners / cloud nodes / VMs
     tmux + SFTP       systemd/container + native harness state
     Optional signed Nexus connector
```

**Boundary:** Paperclip is a separate org/task engine and provider of development agent runs. Paperclip's SSH execution environment is experimental and should point to a dedicated *build* VM, not give every development agent direct control over production hosts.

## Suggested stack
- UI: TypeScript + React + Vite + xterm.js + accessible design system + TanStack Query; PWA notifications; Lucide icons, consistent host and agent state badges.
- API: TypeScript + NestJS or Fastify; PostgreSQL for durable host/session/approval/event data; Redis for ephemeral pubsub and cache only.
- Core gateway/connector: Go (single statically linked signed Linux binary) for SSH transport, relay and connector runtime; systemd service with limited permissions.
- Agent manager: ACP-compatible broker where available, adapters for Claude Code, OpenCode, Codex/Hermes; per-job OS account/container and Git worktree; durable log pointer.
- Workflow engine: Temporal for long-lived approval, reconnection escalation and orchestration jobs; lifecycle actions are idempotent activities with audit.
- Secrets: pluggable secret manager, per-host credentials, no plaintext credential storage in Postgres or workflow payloads.
- Observability: Prometheus + OpenTelemetry + structured audit logs + S3-compatible artifact store (MinIO optional) + Grafana.
- Hosting: Docker Compose for single-node pilot; externalized Postgres/storage for mature production; services behind secure reverse proxy on 443. No need for Kubernetes in first release.

## Network placements
A. **Same LAN:** Nexus server connects directly by SSH to private IP; no connector needed. ACLs for each host.
B. **Nexus in AWS, LAN behind NAT:** Use Headscale/WireGuard private mesh *or* a connector-initiated outbound mTLS relay over 443, with host identity and routes scoped to allowed services. No blind public port forwarding.
C. **AWS instances:** Prefer VPC-private connectivity/VPN/bastion and role-scoped AWS APIs. SSH works only if network and firewall permit.
D. **Disconnected:** Persist metadata/desired state, queue only safely idempotent tasks, no false assumption that remote host is online; resume on re-authenticated connection.

## Server enroll and terminal flow
- Add Host → explicit SSH target and username (or cloud inventory import) → DNS/IP route check → SSH host fingerprint verify/pin → auth test → save credential reference.
- Agentless route: terminal PTY (`tmux`), SFTP, read-only service probe.
- Connector route: generate signed install plan → human approval → signed package install via SSH (or operator-supplied offline package) → one-time enrollment → outbound mTLS tunnel → caps inventory and connector health.
- Distinct 'Mount' workflows: SFTP browser; rsync/SFTP sync; **optional SSHFS/FUSE** on a controlled Linux runner/desktop, not a browser POSIX filesystem. File access governed by OS ACL and explicit path grants.

## Durable model entities
`users, organizations, projects, roles, hosts, host_routes, host_credentials_ref, ssh_host_key_pins, connectors, connector_certificates, terminal_sessions, terminal_attach_events, agent_harnesses, agent_sessions, agent_runs, workspaces, git_worktrees, pending_prompts, approvals, approval_decisions, operation_plans, workflow_runs, notification_preferences, notification_deliveries, incidents, mcp_servers, tools, skill_versions, plugin_versions, audit_events`.

### Key identity invariants
- Stable user-facing `nexus_session_id` points to exactly one `(host_id, remote_uid, multiplexer_type, remote_session_name)` while original process exists.
- Agent run identity separately points to `(host_id, runtime, native_agent_session_id, worktree_id, supervisor_job_id)`.
- Physical socket ID/WSS connection ID are **never** treated as logical session IDs.
- Reattachment is authorized to same principal and narrow host/session capabilities; one active writer per interactive pane unless explicit takeover.

## Illustrative API boundary (Nexus application, not Paperclip API)
`POST /api/v1/hosts`, `POST /hosts/{id}/probe`, `POST /hosts/{id}/install-plan`, `POST /hosts/{id}/connector/install`, `POST /hosts/{id}/connector/revoke`, `GET /hosts/{id}/sessions`, `POST /sessions`, `POST /sessions/{id}/attach-token`, `GET /sessions/{id}/events`, `POST /agent-sessions`, `POST /agent-sessions/{id}/prompt`, `GET /agent-sessions/{id}/events`, `POST /approvals/{id}/decision`, `GET /approvals/inbox`, `POST /operations/{id}/execute`, `GET /notification-preferences`, `PATCH /notification-preferences`, `POST /mcp/tools/{tool}/invoke`, `GET /audit-events`.

Every mutate endpoint must authorize user+role+host+action+risk and validate plan/approval binding in policy service; never accept caller-supplied 'approved':true.

## V3.1 platform adapter boundary
`HostOSAdapter` (`probe`, `installer`, `service`, `package`, `privileges`, `keychain`, `mounts`, `health`) splits macOS from Linux. `darwin/amd64` and `darwin/arm64` use launchd and Apple code-signing; `linux/amd64` and `linux/arm64` use systemd where available and signed distro packages. The central API/dashboard may run on a Mac or Linux host and must not rely on a host-only `docker.sock`. Use Go `darwin/linux` builds and CLI capability probe; no remote privileged action without immutable plan verification. See deployment runbooks.
