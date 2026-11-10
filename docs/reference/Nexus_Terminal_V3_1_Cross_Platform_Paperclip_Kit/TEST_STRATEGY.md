# Testing and release assurance (automated, with human security gates)

## CI per PR
Typecheck, unit tests, lint, formatting, schema/migrations, Go race tests, secret scan, SAST/dependency scan, SBOM/license scan, Docker image scan, signed artifact verification. Run full tests from fresh checkout; upload immutable logs and test report.

## Contract/integration
Ephemeral containers for OpenSSH target, SFTP paths, SSH host keys, tmux, relay, Postgres, Temporal, agent runner mock ACP, auth/approval service. Verify no cross-host/user leakage. Provider API mocks for Proxmox/AWS, real test accounts when approved. Mock time for retry and approvals.

## E2E
Playwright desktop and mobile PWA: onboarding, SSH only, connector install dry-run/approval, multi-tab terminal, split, SFTP browser, agent creation, session list/attach, permission request, approve/reject, notification preferences and recovery actions.

## Security / adversarial tests
Reject unknown host keys; mixed-up tenant IDs; replayed enrollment token; forged device certificate; package signature mismatch; changed plan after approval; lost privilege before execution; duplicate queue delivery; symlink/path traversal; terminal escape spoofing; WSS hijacking; revoked attachment; tool prompt injection; plugin supply-chain compromise. Production-mode C2 must never be bypassed from an agent message.

## Fault/chaos
Disconnect browser but keep tmux running; 30-minute simulated outage while agent continues; 24-hour outage + retry, restore same session ID; reverse relay reconnect; Postgres restart; broker failover; connector service restart; host reboot (display honest process-lost/native resume outcome); concurrent device takeover, log cursor replay, reconnect after auth token expiry, approval during outage, temporary DNS failure. Validate zero duplicate side effects for idempotent operations.

## Acceptance gates
**G0:** product and licenses vetted, live prototype selected. **G1:** auth/RBAC and test harness complete. **G2:** terminal reattach shown under real process/network test. **G3:** signed connector install, revocation and rollback tests. **G4:** ACP agent resume and session registry tests. **G5:** mobile approval + runtime enforcement, no bypass. **G6:** VM and MCP integrations scoped. **G7:** chaos/security audit, backup restore, full CI green. **G8:** human-approved staging-to-production release.

A failing or untested feature must remain blocked in Paperclip; agent summaries are not test evidence by themselves. Paperclip task review C1/C2 and Nexus operation approvals are two different gates.

## V3.1 OS acceptance
See `compat/COMPATIBILITY_TEST_MATRIX.md`. Add macOS arm64 and Intel launchd, pkg notarization/Gatekeeper, Mac zsh and sleep-wake, Linux amd64/arm64 Debian/RPM family systemd/SELinux/AppArmor, signature rollback, old glibc Paperclip runner fallback, SFTP virtual filesystem, role revocation on each reconnect. Missing execution evidence means **unverified**, not supported.
