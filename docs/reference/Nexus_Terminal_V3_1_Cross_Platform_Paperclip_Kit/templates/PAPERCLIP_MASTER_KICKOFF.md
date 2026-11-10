# Paperclip master project kickoff — Nexus Terminal V3.1
**Paste as new Paperclip project goal / kickoff issue** (and attach the ZIP plus source documents; use repo as canonical copy).

**Mission:** Build an owner-controlled, open-source-first self-hosted SSH/VM/agent orchestration platform with modern Warp-style editor; multi-host session retention and ACP agent session control; mobile approval inbox; Teleport-backed GitHub employee RBAC; secure optional signed connector for macOS/Linux; deployable on Mac or Linux. Operate on owned/authorized infrastructure only.

**Governance:** A0 CEO coordinates; A1 CTO owns architecture, OSS evaluation and technical C2 for ordinary work; A5 independent C1; A8 owns identity; A7 owns terminal UX; A6 owns connectors and cross-platform packaging; A2 core API/SSH; A3 agent harness/MCP; A4 dashboard/mobile. No agent is authorized to use production root, alter RBAC or install a connector without human-approved immutable action plan. Research/integration must be clean-room and license-compliant.

**Canonical docs:** `MASTER_BUILD_PLAN_V3.md`, `CROSS_PLATFORM_PRODUCT_CONTRACT.md`, `WARP_STYLE_EDITOR_SPEC.md`, `TELEPORT_IDENTITY_ACCESS.md`, `CLEAN_ROOM_RESEARCH_PLAYBOOK.md`, `PAPERCLIP_AGENT_CONFIGURATION_V3.md`, `PAPERCLIP_DOCUMENT_ATTACHMENTS.md`, `SECURITY_GATES_V3.md`, `TEST_STRATEGY.md`, `compat/supported-platforms.yaml`, and platform deployment runbooks. Also consult issue-scoped docs and agent-role instructions.

**No-skip development chain:** OSS/licensing/behavioral evaluation -> product UX and threat model -> ADR architecture + OS support table -> tests/contracts -> implement against isolated VMs -> verify CI/platform matrix -> independent C1 -> independent C2 or human production approval -> integration/chaos -> staging -> final human sign-off -> production rollout. Agent output always linked to Paperclip issue and Git PR; failed tests cause rework.

**Early demo (must be measured):** Nexus hosted on Mac and Linux; connect to one Linux and one Mac host using SSH; maintain `cd` and tmux session through browser close; correct a command in the middle of a multiline draft; enable read-only employee access using GitHub team role; install **only** an approved and verified connector on disposable VMs; show phone approval flow without executing production actions.

**Acceptance:** Must pass OS/arch support matrix, tests for loss/reconnect, identity revocation, connector supply chain and mobile approval replay protection. On host crash or reboot clearly label native agent resumption versus original process reattachment. Provide installer, reverse-connect mode, docs, SBOM, rollback, audited operations, alerting and operator handover.

**Status:** This is a build request and task plan, not authorization to connect to production systems or deploy automatically.
