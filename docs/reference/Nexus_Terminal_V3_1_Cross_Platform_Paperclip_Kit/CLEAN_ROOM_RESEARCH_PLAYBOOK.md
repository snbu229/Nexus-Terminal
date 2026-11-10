# Capability research / clean-room reverse-engineering playbook

Purpose: study existing products' **publicly documented behavior and permitted open-source implementations** to design an interoperable independent Nexus Terminal. This is not a request to copy protected private code or circumvent software licenses, authorization, authentication or DRM.

## Research source priority
1. Official docs, changelogs, release notes and publicly published specs.
2. Legally available open-source code, with version/tag and full license compliance.
3. Authorized black-box behavior measurements in your own licensed instances or demo systems. Only use normal user-level actions and public APIs.
4. Standards and protocols: SSH/OpenSSH, shell OSC 133 markers, PTY, xterm, GitHub OAuth, OpenID Connect, MCP, ACP, tmux, WebSocket, Tailscale/Headscale.

## Clean-room process
**Research group** (A1 + A7 + A8): inventory feature, citation URL, screenshots if allowed, test input/observed output, supported version, license, dependency risk. Do not copy code from proprietary applications, bypass access checks, extract hidden keys, access unauthorized servers, or disassemble binaries against license/permission constraints. Record unresolved questions and stop on restrictions.

**Specification group** (A1): independently express requirements as functional acceptance tests. Distinguish factual behavior from inference; flag capabilities not verified. Create interface/contracts; never paste proprietary source or assets into build prompts.

**Implementation group** (A2/A3/A4/A7/A8): build from public standards or legally reusable open-source source with required attribution, notices, source-availability obligations and dependency scanning. Use neutral design system and original branding; avoid cloning exact Warp/Teleport screen or branded icon set.

**Independent QA** (A5): run black-box tests against authorized deployments/official demos and against Nexus implementation, compare behavior not code; check license/SBOM and security; report differences.

## Required output for each evaluated tool
`study_id`, product/version, function, reason to adopt or reimplement, supported platform, published URL/evidence, license and restrictions, API/protocol surface, clean-room acceptance tests, integration risks, security concerns, decision (`adopt`, `integrate`, `implement`, `defer`) and ADR.

## Tools to investigate
- Warp: editing UX & blocks; proprietary behavior only, never copy internal implementation.
- Wave Terminal, Tabby, Ghostty, WezTerm, xterm.js, CodeMirror: open-source candidates with license checks.
- Teleport: server CA, RBAC, GitHub identity mapping, OpenSSH enrollment, audit, JIT edition distinctions.
- Apache Guacamole: browser remote desktop; optional only.
- Termix, Herdr, Happier, HAPI, Hermes, OpenCode, ACP, MCP, Paperclip: harness/terminal/sessions/approvals, verify naming, active maintenance and licenses.
- tmux, systemd, Temporal, Keycloak, Headscale/WireGuard, Prometheus, Grafana, ntfy, Gotify: infrastructure layers.

## Red lines
- No hidden endpoints, stolen credentials, proprietary asset copying, product impersonation or security-bypass techniques.
- No recording/sending employee private terminal contents or secrets to AI providers without explicit policy and consent.
- Open source licenses are not interchangeable: record AGPL/GPL source distribution triggers, Apache notice, MIT attribution and license compatibility before code reuse.
- Reverse engineering of security behavior should validate **defenses**: write threat models, policy contracts and safe negative tests only against controlled fixtures.
