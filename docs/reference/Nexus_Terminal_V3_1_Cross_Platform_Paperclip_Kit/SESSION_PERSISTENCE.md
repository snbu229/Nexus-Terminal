# Persistent sessions and infinite reconnect policy

## Three session lifetimes — not interchangeable
**Terminal:** SSH transport drops without remote PTY shell closing; use remote `tmux` with stable naming and separate privileges. **AI agent:** run under a durable local supervisor/service and persist native ACP/CLI session identity. **Workflow:** use a durable process engine such as Temporal and persist events/approval state. A UI WebSocket is just an attachment to these resources.

## Required behavior
- Closing tabs, reconnecting networks, locking laptops, restarting Nexus's API/gateway should **not kill** remote `tmux`/supervised AI process.
- When a user reconnects, resolve `nexus_session_id` from Postgres, validate access and current remote key, connect to **the same host and remote multiplexer session name** rather than `tmux new` with random name.
- For ACP, feature-detect `session/resume` (or `session/load` on compatible implementations) and validate native session ID/workspace. On failures, clearly show 'Session stopped—resume from saved conversation/checkpoint' with user's permission; never silently create a fake same session.
- The original remote host may stay alive even after entire Nexus server restarts, but a `tmux` session usually ends on **host reboot**. Managed jobs can restart at boot; terminal itself cannot revive the prior interactive process. Persist enough logs/commands to display history without claiming true PTY continuity.
- Session record persists until an authorized owner explicitly closes it or retention policy purges archived records. The app must not auto-expire merely due to idle time.
- Auth/attach tokens **must expire and refresh**, and enterprise security policies may explicitly revoke a session. This does not violate 'no idle timeout'.

## Reconnect state machine
`CONNECTED -> DEGRADED -> RECONNECTING -> OFFLINE (if confirmed) -> RECOVERED -> CONNECTED`.
Other terminal conditions: `AUTH_REQUIRED`, `HOST_KEY_CHANGED` (hard stop), `REVOKED` (hard stop), `REMOTE_PROCESS_EXITED` (show native resumption choice), `UNKNOWN` (cannot verify host).
- Backoff: start 1s, double with decorrelated jitter, cap around 60s while network unavailable; retry **indefinitely** while authorized and feature enabled. Reset after successful handshake.
- 30m outage: notification/escalation threshold **only**, not a stop. Optional warnings at 5m and recurring updates with cool-down. Delivery is idempotent; on recovery send one 'restored' message.
- Ping/pong must have finite network detection deadlines; these are *probe* timeouts, not session inactivity lifetimes.
- Client offline queue: queue prompts only when semantics are safe/idempotent and user explicitly chose queueing; never queue destructive commands without fresh approval on reconnect.
- Reconnect with log resume cursor / sequence number so user sees last known output and new output once; bound stored output by configurable size/time.

## Cross-device session management
- Display all terminal and agent sessions with host, path, running/idle/blocked/awaiting approval/offline, last heartbeat, owner, resource usage.
- Default terminal viewer is read-only for collaborators; input requires explicit control token. Transfer/takeover is logged and revokes old writer capabilities.
- One-click attach opens same tmux pane; split panes and tabs are UI views, not extra processes unless explicitly created.
- User may connect to a VM, then choose 'New Claude Code session', choose model, repo/worktree, skill grants and tool permissions. Agent manager starts supervised job, not arbitrary unsandboxed root shell.

## Test matrix
- Browser close; WiFi switch; VPN/relay drop; reverse proxy restart; API restart; connector restart; tmux detached; same user reattach; second-user denied; concurrent input takeover; output seq/replay; 1h/24h outage fast-forward; host reboot; native ACP agent crash; key rotation; permission revoked mid-run; offline queued approvals never execute without re-check.
