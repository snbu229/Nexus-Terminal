# Agent templates, skills and plugin marketplace architecture

## Prebuilt user-facing Nexus agent templates
`Backend Developer`, `Frontend UI Developer`, `QA Test Engineer`, `Security Reviewer`, `DevOps/SRE`, `Linux Host Administrator`, `Database Engineer`, `AWS EC2 Administrator`, `Proxmox VM Administrator`, `Incident Responder`, `MCP Integration Engineer`, `Release Manager`, `Documentation Researcher`, `Automation/Workflow Designer`, `Cloud Cost Analyst`.

Each template defines description, model/provider choice, allowed host groups, tool/mcp allowlist, workspace permissions, required skills, prompt file version, memory policy, artifacts/expected outputs, budgets and default approval routing. **Read-only by default**. Installed agents must never inherit full administrator identity automatically.

## Framework
- Treat **Skill** as a reviewed instruction/procedure package with `SKILL.md`, version, authorship, tests, permitted paths and role assignments.
- Treat **Plugin** as executable code/binary exposing signed manifest/permission scopes, versioned API, test fixtures, health, uninstall and rollback. Never equate a markdown skill with a safe plugin.
- Treat **MCP server** as external tool provider exposed via isolated process/HTTP with narrow grants and tool request policy, not as arbitrary sudo channel.
- Treat **Harness** as an agent runtime (Claude Code, OpenCode, Codex, Hermes); ACP capability negotiation is per-harness/version and session restore must be feature-detected.

## Marketplace governance
`DISCOVERED -> METADATA_REVIEWED -> LICENSE_CHECKED -> SECURITY_SCANNED -> APPROVAL_REQUIRED -> SANDBOX_TESTED -> ENABLED -> (SUSPENDED / UPGRADED / REMOVED)`.

Require signed manifests, source pin, dependency SBOM, no embedded secrets, explicit network egress, capabilities UI, installation history, quarantine mode, user approval when adding powers, rollback/uninstall path. Third-party plugin code cannot run with control-plane root privileges. First-party built-in skills appear in `skills/` as drafts.

## Helpful integration families
- Tools: SSH read inventory, SFTP browse, Docker read metrics, Kubernetes read (later), filesystem scoped to workspace, Proxmox/AWS API read inventory, Git/GitHub repo tasks.
- Execution: separate approved capability for package install, service restart, git write, VM lifecycle; use operation plans not raw unrestricted arbitrary commands.
- Harness providers: ACP native; fallback CLI PTY; own adapter contract with `start`, `attach`, `resume`, `interrupt`, `terminate`, `get_status`, `get_usage`, `get_events`, `request_permission`.

## Catalog UI
Search/filters for server, development, cloud, operations; template preview; explicit 'Deploy agent' wizard; model selector; host/workspace scoping; permissions diff; skills list; version pin; Test Environment button; Audit log. Capabilities must be disabled if unsupported by underlying harness.
