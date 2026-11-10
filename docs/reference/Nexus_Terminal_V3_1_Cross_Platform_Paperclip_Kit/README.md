# Nexus Terminal V3.1 — Mac + Linux Paperclip Implementation Kit

**Status:** full project specification and tooling, **not completed software**, verified Paperclip board, installed skills, or operational connector. Dated 2026-11-10.

## Quick start (do not skip)
1. Read `templates/PAPERCLIP_MASTER_KICKOFF.md` and `MASTER_BUILD_PLAN_V3.md`; use the kickoff content as the new Paperclip project goal/issue.
2. Read the mandatory `CROSS_PLATFORM_PRODUCT_CONTRACT.md`, `WARP_STYLE_EDITOR_SPEC.md`, `TELEPORT_IDENTITY_ACCESS.md`, `CLEAN_ROOM_RESEARCH_PLAYBOOK.md`, `SECURITY_GATES_V3.md` and `compat/supported-platforms.yaml`.
3. Use `PAPERCLIP_DOCUMENT_ATTACHMENTS.md` to attach documents to the correct issue/project. Commit this entire kit into a private code repository (not including secrets).
4. Configure **nine** agents using `PAPERCLIP_AGENT_CONFIGURATION_V3.md` and `agents/A0_*` to `agents/A8_*`. Verify Anthropic model access; run dev tasks in isolated workspaces and no production root access.
5. Review skills with A5 before installing or attaching to agents; `skills/ethical-reverse-engineering/SKILL.md` uses clean-room observation only, not copying proprietary source.
6. Run `python3 seed_paperclip_v3_1.py` as a no-network dry run; inspect `BACKLOG.csv` / `BACKLOG.json` and policies. To create issues only after explicit authorization, supply IDs and run `python3 seed_paperclip_v3_1.py --apply --confirm-create-issues`. This tool **does not** create agents, upload documents, or access VMs.
7. Execute 145 dependency-linked issues behind phase gates and CI. System is only complete when actual macOS and Linux hosting, SSH/PTY, connectors, Warp-like editing, GitHub/Teleport RBAC, approvals, agent persistence and negative tests have passed.

## Where documents go
- Paperclip project: master roadmap, cross-platform contract, security boundaries, roles.
- Paperclip issue attachments/documents: each epic's functional spec, relevant OS runbook, evidence and ADR.
- Paperclip agent instructions: only that `agents/A*.md` plus scoped skills, not entire ZIP pasted into every prompt.
- Source code repo: **canonical versioned documents** and tests. All PRs reference an issue and CI.

## New Mac/Linux assets
- `CROSS_PLATFORM_PRODUCT_CONTRACT.md`: supported OS behaviors and no-all-versions caveat
- `deploy/DEPLOY_ON_MACOS.md`: local Mac mini/native/container hosting and remote Mac enrollment
- `deploy/DEPLOY_ON_LINUX.md`: Linux hosting and signed Linux connector operations
- `deploy/HOST_CONNECTOR_INSTALLER_STRATEGY.md`: signed OS-specific installer/security approval
- `compat/supported-platforms.yaml` + `compat/COMPATIBILITY_TEST_MATRIX.md`: support tiers and test ledger
- `skills/macos-linux-platform/SKILL.md`: original reusable Paperclip skill draft
- `templates/PAPERCLIP_MASTER_KICKOFF.md`: text to paste into project kickoff issue
- `seed_paperclip_v3_1.py`: dry-run issue creation script with nine agent mappings
- `PAPERCLIP_PROJECT_EXECUTION_CHECKLIST.md`: exact project setup + document-attachment checklist
- `templates/PAPERCLIP_AGENT_IDS.env.example`: placeholders for agent IDs (never commit real tokens)

Everything is a proposed implementation until verified on your infrastructure. No bundled file contains a production credential or a working remote connector.
