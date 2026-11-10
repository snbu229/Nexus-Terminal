# Paperclip V3 agent setup, Claude models, permissions, and coordination

**Model IDs verified from https://platform.claude.com/docs/en/models/overview on 2026-11-10.** Model availability/billing depend on your Anthropic account and runtime support; verify each selection in Paperclip. Model list is not a promise of account entitlements.

| ID | Agent and Paperclip title | Claude model ID | Effort | Job | Recommended skills | Live privileges |
|---|---|---|---|---|---|---|
| A0 | CEO / Product Orchestrator | `claude-opus-5-5` | medium | Prioritize scope, assign issues, budgets, acceptance, escalations | paperclip workflow | Board planning only |
| A1 | CTO / Research & Architecture | `claude-opus-5-5` | high | Product research, OSS compliance, ADRs, architecture, design review | ethical-reverse-engineering, third-party-skill-audit | Public docs/repos; no production shell |
| A2 | Core Platform Engineer | `claude-sonnet-5-5` | high | SSH gateway, API, signed connector, sessions, database | ssh-host-onboarding, signed-connector-bootstrap | Disposable dev VMs, PRs |
| A3 | Agent Harness Engineer | `claude-sonnet-5-5` | high | ACP, runtimes, MCP, agent sessions, workflow state | acp-agent-resume, mcp-tool-security | Dev agent sandbox only |
| A4 | Frontend & Mobile Engineer | `claude-sonnet-5-5` | high | Fleet UI, phone approvals, settings, audit, dashboard | mobile-notification-relay | UI dev/test only |
| A5 | QA & Security Reviewer | `claude-opus-5-5` | high | Independent test design, threat model, C1 security, release evidence | qa-chaos-and-release, third-party-skill-audit | CI/staging read-only; test fixtures |
| A6 | Server Management & SRE Engineer | `claude-sonnet-5-5` | high | Dev/stage environments, signed packaging, observability, VM adapters | signed-connector-bootstrap, ssh-host-onboarding | Stage-only scoped automation; prod observe-only |
| A7 | Terminal Interaction Engineer | `claude-sonnet-5-5` | high | Warp-like command editor, PTY/TUI mode, blocks and keyboard UX | warp-command-editor, tmux-session-resume | Dev terminal fixtures |
| A8 | Identity & Zero-Trust Engineer | `claude-opus-5-5` | high | Teleport integration, employee RBAC, GitHub SSO, SSH certs, JIT requests | teleport-rbac-identity, ethical-reverse-engineering | Identity lab only |

For especially difficult evaluation or security architecture, A1 may test `claude-fable-5-2` on a small benchmark set and return to Opus if value is poor. Do not automatically use the highest-cost model for simple coding. Optional Haiku 5.5 (`claude-haiku-5-5`) for unprivileged docs/triage, not production admin.

## Hiring order
1. A0 first (Paperclip's first agent becomes CEO). Configure its board-level policies and budget.
2. A1, A5; configure A1 report to A0; A5 reports for management but has independent C1 reviewer role.
3. A2, A3, A4 and A6; separate workspaces and spend limits.
4. A7 and A8; their phase tickets become assigned by V3 seeder.

## What to paste
Agent Instructions: corresponding `agents/A*.md`, including A7/A8 added for V3. For A0-A6, retain base V2 prompt and add this exact first paragraph:

> Nexus Terminal V3 is the governing specification. Before proposing code, read `MASTER_BUILD_PLAN_V3.md`, `WARP_STYLE_EDITOR_SPEC.md`, `TELEPORT_IDENTITY_ACCESS.md`, `CLEAN_ROOM_RESEARCH_PLAYBOOK.md`, `PAPERCLIP_DOCUMENT_ATTACHMENTS.md`, and `SECURITY_GATES_V3.md`, plus your assigned phase-specific docs. Warp-like editor and Teleport-style employee access are mandatory acceptance criteria, not optional enhancements. Never give human GitHub repository access the meaning of SSH role authorization; never grant autonomous agents production root access. Cite test evidence and obey independent C1/C2 gates.

Copy that paragraph manually to each A0-A6 prompt, OR use `agents-v3/` once the agent prompts are patched there by this kit.

## Operations policy
- No agent works as root or with production SSH private keys. If Claude Code adapter runs tools with bypass mode, enforce restrictions at OS/container, VPN, identity broker and MCP gateway layers, not merely prompts.
- CI branch protection, 2-person production human approval where applicable, deployment rollback, isolated test VMs, and secrets vault are required before starting.
- `timeoutSec` in Paperclip controls agent task execution; DO NOT equate it to user terminal idle timeout. Paperclip workers run finite tasks; long-lived remote PTYs run in independent session manager and tmux.
- Execution policy: ordinary tasks C1 A5 and C2 A1 (or A0 if A1 author). Identity/security/production changes get explicit human approval in addition; no writer reviews own work. Apply policies in Paperclip UI or in reviewed seed script.
- Set budgets for agents and maximum concurrent tasks. Research gate first; engineering can parallelize within blocker graph only.

## Proof before setting live
Run each Claude adapter using an isolated test instruction; verify repository checkout, tool permissions, cost visibility, timeout behavior, and that no direct production route exists. Verify required model ID accepted in that runtime. Run dry-run issue seeder before `--apply`.

## V3.1 role ownership additions
- A6 is accountable for macOS local hosting, Linux container/native hosting, signed `.pkg`/`.deb`/`.rpm`, `launchd`/`systemd`, OS compatibility probes and CI hardware matrix.
- A7 is **assigned tasks in the V3.1 backlog**, including Warp-style smart input editing and macOS zsh / Linux bash raw-TUI correctness.
- A8 is **assigned tasks in the V3.1 backlog**, including Teleport GitHub-team claims, host labels, short-lived credentials and reconnect revocation.
- A5 owns evidence-based OS release assertions; if Intel Mac hardware is unavailable, mark that compatibility path pending rather than shipping it as tested.
- Paperclip Runner on macOS Intel/Apple Silicon is eligible; native Linux Runner requires glibc >=2.39 and other constraints. Older glibc/ARM variants must run tested Legacy adapters or be marked unsupported for that runner. Consult https://docs.paperclip.ing/reference/adapters/paperclip-runner/
- `seed_paperclip_v3_1.py` requires all nine role IDs and two flags for apply: `--apply --confirm-create-issues`. It does not create agents or upload docs.
