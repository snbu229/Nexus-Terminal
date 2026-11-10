# Create and configure the Paperclip agents (Claude)

## Recommended organization — seven agents
| ID | Paperclip job title | Claude model ID | Effort | Scope |
|---|---|---|---|---|
| A0 | CEO / Product Orchestrator | `claude-opus-5-5` | medium | Goal and stage acceptance, planning, budgets, no production shell |
| A1 | CTO / Research Architect | `claude-opus-5-5` | high | OSS evaluations, standards, architecture, dependency decisions; optionally test Fable 5.2 for difficult research |
| A2 | Core Platform Engineer | `claude-sonnet-5-5` | high | Backend API, SSH gateway, signed connector, relay, tests in dev only |
| A3 | Agent Harness Engineer | `claude-sonnet-5-5` | high | ACP/MCP, session manager, multi-agent runtime, durable workflows |
| A4 | Frontend & Mobile Engineer | `claude-sonnet-5-5` | medium/high | Browser terminal, dashboards, mobile PWA, approvals UX |
| A5 | QA & Security Reviewer | `claude-opus-5-5` | high | Independent CI/security review and negative testing, no unilateral prod writes |
| A6 | Server Management & SRE | `claude-sonnet-5-5` | high | Fleet policy, signed deployment, observability, backups, staging runbooks; prod read-only initially |

Possible low-cost optional A7: Notification/Triage/Docs assistant `claude-haiku-5-5` for event classification, first-line incident summaries and docs only (no privileged tools). You can start with A0/A1/A2/A5 and assign the A3/A4/A6 tasks only after hiring the specialist agents; the included seeder expects all seven, so use it after final setup.

Anthropic's current public model IDs as of 2026-11-10: Opus 5.5, Sonnet 5.5, Haiku 5.5 and Fable 5.2 (`claude-fable-5-2`). Choose Opus for complex architecture and critical reviews, Sonnet for bulk coding, Haiku for cheap triage. Claude models and the Claude Code CLI are not open source. Verify selected model appears under your provider/region/plan before saving. See https://platform.claude.com/docs/en/models/overview.

## Configuration steps in Paperclip
1. Install Paperclip at a secured internal hostname and create `Nexus Platform Engineering` company, a `Nexus Terminal` goal, a Git-linked `Nexus Terminal V2` project. Protect the default branch; configure CI.
2. The first Paperclip agent becomes CEO. Name it `A0 Product Orchestrator`. Create A1 CTO reporting to CEO. A2/A3/A4/A5/A6 report to CTO; A5's independent reviews do not report to the executor for decision authority.
3. Use **Claude Code / Paperclip Runner (ACP Claude)** where supported. Configure a separate sandbox/OS user and dedicated checkout/worktree per build agent; connect via supported secret-backed Anthropic credentials. Test runtime with `Test Environment` before assigning tasks. For a legacy `claude_local` agent specify `cwd`, model and `engine: "acp"` only when ACP prerequisites met.
4. Paperclip's *new* Claude adapters may run full-auto by default (`dangerouslySkipPermissions: true`). **Do not** connect production secrets, raw root SSH, host hypervisor keys or privileged MCP tools to such agents. Use isolated dev workspaces, host-scoped MCP proxy and hard server-side action policy; a prompt alone cannot prevent bypass.
5. In Settings → Experimental, optionally enable **Environments**, add an **SSH** environment pointing to dedicated DEV BUILD VM only, click Test, and override environment for A2/A3/A4. Optional isolated workspaces/worktrees per issue. Do not assume this environment feature is production-stable; evaluate first.
6. Paste the seven `agents/A*.md` instruction texts in their Paperclip agent Instructions/AGENTS.md. Give research web access to A1, source/repo + sandbox to A2/A3/A4, CI test/audit tools to A5, scoped staging inventory to A6.
7. Import reviewed skills and configure MCP servers per supported harness; tool gateway restrictions should be enforced outside the model prompt. Add project issues using supplied dry-run seeder or Paperclip UI.
8. Configure normal tasks: C1 QA/Security (A5), C2 CTO (A1) or CEO (A0 if CTO authored). For sensitive tasks C2 is a **human user**. Avoid self review. Set max review rounds 3 and require evidence comments.
9. Set budgets per agent, default Wake-on-Demand enabled and periodic heartbeats off unless real polling is needed. Paperclip heartbeats execute finite work; Nexus persistent sessions run separately under its own supervisor.
10. After phase gates pass, authorize staging deployment, run E2E/chaos tests and manually approve release. Never permit a trusted-looking agent to invent its own production approval.

## Representative Claude agent adapter config (illustrative, not a command to install)
```json
{
  "adapterType": "claude_local",
  "adapterConfig": {
    "cwd": "/srv/nexus-dev/worktrees/platform",
    "engine": "acp",
    "model": "claude-sonnet-5-5",
    "effort": "high",
    "timeoutSec": 0,
    "dangerouslySkipPermissions": false
  }
}
```
The adapter may fail headlessly when a tool requests interactive approval and `dangerouslySkipPermissions` is false. Prefer **permission isolation at the OS/sandbox + independent MCP policy**; configure invocation permission mode per runtime after testing. `timeoutSec: 0` disables the local/SSH *adapter wall-time cap* but does not create immortal process or bypass platform limits; in sandboxes it has different default behavior (read official doc). In production, use safe bounded *agent heartbeat budgets* even though terminal sessions have no inactivity expiry.

## Authoritative references
- https://docs.paperclip.ing/guides/getting-started/your-first-agent/
- https://docs.paperclip.ing/reference/adapters/claude-code/
- https://docs.paperclip.ing/experimental/environments/
- https://docs.paperclip.ing/guides/power/execution-policy/
- https://docs.paperclip.ing/guides/org/team-catalog/
- https://docs.paperclip.ing/how-to/add-mcp-server-to-agent/
- https://docs.paperclip.ing/guides/projects-workflow/routines/
