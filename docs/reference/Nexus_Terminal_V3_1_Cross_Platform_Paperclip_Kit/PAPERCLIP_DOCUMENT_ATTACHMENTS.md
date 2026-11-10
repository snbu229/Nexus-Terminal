# Paperclip — exact document / attachment / skill placement

This is a copy-paste checklist for the board operator. **No Paperclip workspace has yet been modified.** Names and menu placement may differ across installed versions; issue Documents/Artifacts and agent Instructions are supported surfaces. Do not attach secrets or SSH keys.

## Structure to create
Company: `Nexus Platform Engineering`
Goal: `Build a self-hosted zero-trust terminal, fleet and AI agent orchestration product`
Project: `Nexus Terminal V3`
Epics: `E00 Product & Research`, `E01 Identity & Security`, `E02 Terminal & SSH`, `E03 Connector & Relay`, `E04 Agent Harness`, `E05 Approvals & Notifications`, `E06 Fleet/VM`, `E07 MCP Skills`, `E08 Dashboard`, `E09 QA`, `E10 Release`.

## What to attach where
| File | Paperclip location | Document key or action | Owner | Why |
|---|---|---|---|---|
| `MASTER_BUILD_PLAN_V3.md` | Master kickoff issue | Issue Document `plan` | A0 | Canonical staged plan |
| `PRODUCT.md` | Kickoff issue | Issue Document `product` | A0 | Requirements inherited from V2 |
| `WARP_STYLE_EDITOR_SPEC.md` | Terminal epic planning issue | Issue Document `terminal-editor` | A7 | Warp-style UX contract |
| `TELEPORT_IDENTITY_ACCESS.md` | Identity epic planning issue | Issue Document `identity-access` | A8 | Role, SSO, SSH cert and employee policies |
| `CLEAN_ROOM_RESEARCH_PLAYBOOK.md` | Research epic planning issue | Issue Document `reverse-engineering` | A1 | Legal public research method |
| `ARCHITECTURE.md` | Architecture issue | Issue Document `base-architecture` | A1 | V2 platform base architecture |
| `SESSION_PERSISTENCE.md` | SSH/agent epic planning issue | Issue Document `session-persistence` | A3 | Same-session recovery |
| `CONNECTOR_INSTALL_APPROVAL.md` | Connector epic planning issue | Issue Document `connector-install` | A6 | Signed installer governance |
| `SECURITY_APPROVAL.md`, `SECURITY_GATES_V3.md` | Security planning issue | Issue Docs `base-security` and `security-gates` | A5 | C1/C2, JIT and production safety |
| `NOTIFICATIONS.md` | Approvals epic | Issue Doc `notifications` | A4 | Retry, mobile relay |
| `OSS_RESEARCH.md` | Research epic | Issue Doc `oss-candidates` | A1 | Reference comparison; validate current licenses |
| `PLUGIN_AND_AGENT_CATALOG.md` | MCP/skills epic | Issue Doc `catalog` | A3 | Reusable runtime roles |
| `TEST_STRATEGY.md` | QA epic | Issue Doc `test-plan` | A5 | Automated test matrix |
| `PAPERCLIP_AGENT_CONFIGURATION_V3.md` | Kickoff issue | Issue Doc `agent-configuration` | A0 | Exact agents, model selection, scopes |
| `BACKLOG.csv` & `BACKLOG.json` | Kickoff issue | **Attachments/Artifacts** | A0 | Machine-readable task graph for dry-run seeder |
| `Nexus_Terminal_V3_1_Paperclip_Implementation_Kit.zip` | Kickoff issue | **Single ZIP attachment** | Board | Complete reference archive |
| `agents/*.md` | Each corresponding Paperclip **Agent -> Instructions** | `AGENTS.md` equivalent | Board | Persistent role rules, not issue attachment alone |
| `skills/*/SKILL.md` | Paperclip company **Skills** library after audit | Install skill then assign to selected agents | A1/A5 | Skills are active instructions, not just PDFs |
| `config/nexus.defaults.yaml` | Versioned Git repository `deploy/` | Commit file, not runtime Paperclip config | A6 | Example Nexus settings, not credentials |
| All source docs and tests | GitHub source repo `/docs`, `/tests` etc. | Version-control source of truth | Engineers | Agents use local files, reviewable PRs |

## Exact user-facing workflow
1. Create a **Master Kickoff** issue in the project, give it to A0 and add all source links and ZIP in Artifacts. Put `MASTER_BUILD_PLAN_V3.md` in the issue's `plan` document, if the Paperclip UI has Documents.
2. Create Research/Identity/Terminal/Agent/QA planning issues or use the issue seeder to generate those concrete issues. Add the relevant named Markdown document on each issue, not every file on every task.
3. Add a Git repository and commit full `docs/` corpus to it. Set each Paperclip agent's working directory to its own checkout/worktree. In its instructions, tell it which documents in repo are canonical and to open them before coding.
4. For each agent, paste ONLY its `agents/A*.md` in its Instructions. Do not paste entire ZIP into every agent instruction; this causes context overhead and inconsistencies.
5. Review `skills/` for exfiltration/command execution and licensing, install selected skills at company scope and assign only as relevant. A1 `ethical-reverse-engineering`; A7 `warp-command-editor`; A8 `teleport-rbac-identity`.
6. Create project tasks using `seed_paperclip_v3_1.py` **dry-run first**. It does not attach documents or create agents; link docs manually or build an explicitly reviewed docs uploader later.
7. Require agent output to appear on its issue as PR, CI artifacts or uploaded work products. Approvals and architecture decisions become revisioned issue documents and PR-reviewed `docs/adr/` files.

## Optional Paperclip CLI document/attachment commands
- See version-specific CLI help first. The documented pattern for an issue attachment is `paperclipai issue attachment:upload ISSUE_ID -C COMPANY_ID --file ./WARP_STYLE_EDITOR_SPEC.md`.
- Document REST interface: `PUT /api/issues/{issueId}/documents/{key}` accepts `title`, `format:"markdown"`, `body` and `changeSummary`; updating an existing doc requires `baseRevisionId`.
- File upload REST interface: `POST /api/companies/{companyId}/issues/{issueId}/attachments` with multipart `file`. Both need authenticated, authorized requests.
- `BACKLOG.json` is for the dry-run issue seeder, **not** a native Paperclip board export. Running `--apply` modifies board state and can wake agents; pause agents while creating tasks.

## Don't attach
Production SSH private keys, GitHub OAuth secrets, API tokens, customer data, `.env`, root passwords, signing keys, unredacted audit dumps. Store secrets in approved secret vault; agents should never see privileged production credentials.

## Verification references
https://github.com/paperclipai/paperclip-docs/blob/main/docs/reference/api/issues.md
https://github.com/paperclipai/paperclip-docs/blob/main/docs/reference/skills.md
https://github.com/paperclipai/paperclip-docs/blob/main/docs/reference/cli/issue.md

## V3.1 must-attach additions
| File | Paperclip placement | Assign to |
|---|---|---|
| `CROSS_PLATFORM_PRODUCT_CONTRACT.md` | **Project document** and kickoff issue `platform-contract` | A0, A1, A5, A6 |
| `compat/supported-platforms.yaml` | Git repository `compat/` and host-platform planning issue attachment | A1, A6, A5 |
| `compat/COMPATIBILITY_TEST_MATRIX.md` | QA epic Issue Document `os-matrix` | A5 |
| `deploy/DEPLOY_ON_MACOS.md` | Mac self-hosting epic document; commit to `docs/deploy/` | A6 |
| `deploy/DEPLOY_ON_LINUX.md` | Linux self-hosting epic document; commit to `docs/deploy/` | A6 |
| `deploy/HOST_CONNECTOR_INSTALLER_STRATEGY.md` | Connector epic doc `os-installer` | A2, A6, A8, A5 |
| `templates/PAPERCLIP_MASTER_KICKOFF.md` | Main kickoff issue description | A0 |
| `skills/macos-linux-platform/SKILL.md` | Audit then install as Paperclip skill | A1, A2, A5, A6 |
| `BACKLOG.json` / `BACKLOG.csv` | Kickoff issue attachments | A0 |
| `seed_paperclip_v3_1.py` | Internal operator/repository script, reviewed; not a skill | Board |

**Never add secrets, private keys, Apple signing certificates, raw credentials or production network maps in issue attachments.** 

Review `PAPERCLIP_PROJECT_EXECUTION_CHECKLIST.md` for the exact checkboxes and `templates/PAPERCLIP_AGENT_IDS.env.example` for all nine agent ID variable names.
