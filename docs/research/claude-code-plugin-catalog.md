# Claude Code plugin and marketplace catalog (SK-3)

- Issue: EZF-67 (SK-3), epic EZF-64 (E-SK) plan §5. Parent: EZF-2.
- Author: A1 Nexus CTO. C1: QA & Security Reviewer (supply-chain focus). C2: Nexus CEO.
- Date: 2026-11-10. Status: **DRAFT for review. Research only. Not an ADR, not an install approval.**
- Licence of this document: same as the repository. No plugin code is copied into Nexus.

## 0. What was and was not done

| Item | State |
|---|---|
| Read the official Claude Code plugin docs (§1) | Done. Raw markdown fetched over HTTPS, hashes in §7. |
| Shallow `git clone` of 7 repositories into a temp dir, read-only inspection | Done. Run with `core.hooksPath=/dev/null` and `--no-recurse-submodules`. Pinned SHAs in §2. |
| Read 2 remote plugins (Semgrep, Chrome DevTools MCP) at their marketplace-pinned SHAs | Done, through `raw.githubusercontent.com`, only the manifest, hook and licence files. |
| **Install any plugin, add any marketplace, run any install script, hook, MCP server or plugin script** | **Not done, by design.** No `claude plugin …` command was run. No `npx`, `uvx`, `pip`, `docker` or plugin script was run. |
| Full line-by-line audit of every file of every candidate | **Not done.** §3 lists what was read. A file not read is **unreviewed**, and that blocks install of it (`third-party-skill-audit`, item 11). |
| Transitive dependency resolution (npm/PyPI lock trees) | **Not done.** Recorded as **[unverified]** where it applies. Resolving a tree requires fetching packages, which is an install-adjacent action. |

Claims are marked **[doc]** (stated in an official page fetched on 2026-11-10), **[src]** (read in the pinned source), **[inferred]** (my reading, not verified), or **[unverified]** (needs a lab check).

## 1. How Claude Code plugins and marketplaces work

Sources: §7. All accessed 2026-11-10.

### 1.1 `plugin.json` and `marketplace.json`

- A plugin is a directory of components, usually with a manifest at `.claude-plugin/plugin.json`. The manifest gives the name and can add `version`, description and metadata **[doc: plugins]**. The manifest can also declare components inline: `commands`, `hooks`, `mcpServers`, `lspServers`, `monitors`, `dependencies`, `userConfig`, `defaultEnabled` **[doc: plugins-reference]**.
- A marketplace is a repository or directory with `.claude-plugin/marketplace.json`. It needs `name`, `owner` and a `plugins` array, and each entry needs `name` and `source`. "It's a catalog, not a hosted store." **[doc: plugins, plugin-marketplaces]**
- Unknown keys are ignored rather than rejected, so a typo loads silently. `claude plugin validate` warns about them **[doc: marketplace-reference]**.
- If `version` is set in both `plugin.json` and the marketplace entry, the `plugin.json` value wins without warning **[doc: host-marketplace]**.

### 1.2 `/plugin marketplace add` and `/plugin install`

- `/plugin marketplace add <owner>/<repo>` (or `claude plugin marketplace add`) registers a marketplace in user settings. The input can be `owner/repo`, `owner/repo@ref`, `owner/repo#ref`, a git URL, a URL to a `marketplace.json`, a local file or a directory **[doc: marketplace-reference, "Marketplace sources"]**.
- `/plugin install <plugin>@<marketplace>` opens the plugin's details in the `/plugin` panel. Nothing installs until you pick a scope and confirm. `claude plugin install` from the shell installs directly **[doc: plugin-marketplaces, anthropic-marketplaces]**.
- Install scopes: **user** (all your projects), **project** (committed `.claude/settings.json`, so everyone in the repo), **local** (you, this repo only) **[doc: plugins]**.
- Claude Code adds `claude-plugins-official` on the first interactive terminal session unless managed policy or `CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL` blocks it **[doc: anthropic-marketplaces]**. This matters for Nexus agent hosts (§5).
- The `claude-code-plugins` marketplace in `anthropics/claude-code` is **deprecated** **[doc: anthropic-marketplaces]**.

### 1.3 What a plugin can contain

| Component | Runs code? | Notes |
|---|---|---|
| Skills (`skills/*/SKILL.md`) | Indirectly | Enter Claude's context as instructions. A `` !`cmd` `` line is **dynamic context injection**: Claude Code runs the command when the skill or command is invoked, before Claude sees the text **[doc: skills]**. `allowed-tools` frontmatter pre-approves tools for that turn **[doc: skills]**. |
| Commands (`commands/*.md`) | Indirectly | Same as skills, including `` !`cmd` `` and `allowed-tools`. |
| Agents (`agents/*.md`) | No (instructions) | Subagent definitions. |
| Hooks (`hooks/hooks.json` or inline) | **Yes** | Shell commands at lifecycle events, with full user permissions, **outside the sandbox** **[doc: security]**. Also `prompt`-type hooks, which run a model check instead of a shell command **[src: trailofbits fp-check]**. |
| Monitors | **Yes** | Background shell commands started on session start, plugin reload or first use of a named skill **[doc: security]**. |
| Mods (hooks module) | **Yes** | JavaScript inside Claude Code with your permissions **[doc: plugins, security]**. |
| MCP servers (`.mcp.json` or inline) | **Yes** (stdio) / network (http) | stdio servers are processes Claude Code starts, outside the sandbox. HTTP servers are remote endpoints. Calls to their tools are tool calls, so permission rules apply to the calls but not to the server process **[doc: security]**. |
| LSP servers | **Yes** | Claude Code starts the declared language servers **[doc: security]**. |
| `bin/` | **Yes** | Added to the Bash tool's `PATH` while the plugin is enabled **[doc: security]**. |

An enabled plugin is part of **every** session: skill and agent descriptions cost context on every turn, its MCP servers run, and its hooks fire **[doc: plugins]**. Installing a plugin also enables it unless `defaultEnabled: false` **[doc: security]**.

### 1.4 How versions and refs are pinned

- **Plugin sources** (`marketplace.json` entry `source`): relative path, `github` (`repo`, `ref`, `sha`), `url` (`url`, `ref`, `sha`), `git-subdir` (`url`, `path`, `ref`, `sha`), `npm` (`package`, `version`, `registry`), `archive` (`url`, `sha256`), `command` (`command`, `timeout`, `mode`) **[doc: marketplace-reference]**.
- `sha` is a full 40-character commit SHA. If `ref` and `sha` are both set, Claude Code checks out `sha` **[doc: marketplace-reference]**.
- `archive` sources can be pinned by `sha256`, and a mismatch makes Claude Code refuse the install **[doc: security]**.
- `npm` sources run no install scripts during the fetch, but if the package ships a lockfile, Claude Code then installs its dependencies in a separate step, also with scripts disabled **[doc: marketplace-reference]**. That is a transitive network fetch.
- `command` sources run a shell command on the installing machine, on install, on update, and once per session **[doc: marketplace-reference]**.
- **Marketplace sources** (what you `marketplace add` or put in `extraKnownMarketplaces`) take `ref` = **branch or tag only**. There is no `sha` field for a marketplace source **[doc: marketplace-reference, "Fields by type"]**. So adding `anthropics/claude-plugins-official` tracks a moving branch, and every relative-path plugin inside it (§2.1) moves with it.
- **Version:** an install gets a new copy only when the computed version changes. That version comes from `plugin.json` first, then from the marketplace entry. If `version` is omitted everywhere, the commit SHA is used, so users track commits **[doc: host-marketplace]**.
- **Auto-update:** with auto-update on, Claude Code updates plugins in the background, "so the files you reviewed can change on disk" **[doc: security]**. It defaults to **on** for `claude-plugins-official` and most official Anthropic marketplaces, and off for third-party ones **[doc: settings-reference, `extraKnownMarketplaces`]**.
- The `claude-community` catalog pins nearly every entry to a commit SHA, and Claude Code refuses to install a different commit **[doc: security]**.

### 1.5 Trust and permission model

- "Whatever the tier, a plugin you install can run code with your user privileges." **[doc: plugins]**
- Tiers: **official** (reserved names such as `claude-plugins-official`), **community** (`claude-community`, `claude-plugins-community`, `healthcare`), **third-party** (everything else). Official and community names are accepted only from `github.com/anthropics/` repositories. Otherwise Claude Code refuses the marketplace ("registered from an untrusted source") **[doc: security]**.
- The tier is about **naming and provenance**, not code review: "Anthropic does not control what MCP servers, files, or other software are included in plugins and cannot verify that they will work as intended or that they won't change." That's the install trust warning **[doc: security]**. Most of the official catalog is from partners, not Anthropic **[doc: anthropic-marketplaces]**.
- Permission rules and the sandbox cover Claude's tool calls only. Hooks, monitors, MCP/LSP servers and mod processes run **outside** the sandbox **[doc: security]**.
- The `/plugin` details pane shows *that* a hook exists, not *what* it runs. Read `hooks/hooks.json`, `.mcp.json` and `bin/` yourself **[doc: security]**.
- Uninstalled plugin files stay in `~/.claude/plugins/cache/` for 14 days **[doc: security]**.
- **Org controls (managed settings):** `strictKnownMarketplaces` (allowlist, enforced before any network operation; an empty array blocks everything including the official marketplace), `blockedMarketplaces`, `allowManagedHooksOnly`, `enabledPlugins: false` in managed settings (blocks at every scope), turning off `--plugin-dir`/`--plugin-url`, `pluginTrustMessage` **[doc: settings-reference, security]**.

### 1.6 Project-level settings

- `extraKnownMarketplaces`: object of marketplace name → `{ source, autoUpdate? }`. Claude Code registers each marketplace it doesn't know. **In a repository's `.claude/settings.json` it applies only after the user accepts the workspace trust dialog**, and in an untrusted folder (including `-p` runs) it is ignored without a message **[doc: settings-reference]**. When two files define the same name, the higher-precedence entry wins whole (since v2.1.228), so one file can't graft a credential header onto another file's URL **[doc: settings-reference]**.
- `enabledPlugins`: `"plugin@marketplace": true|false`. In project settings it enables plugins for everyone but **does not install them**. Project settings beat user settings, so to opt out locally you set `false` in `.claude/settings.local.json`. `false` in managed settings blocks install everywhere **[doc: settings-reference]**.
- A `settings`-type marketplace source declares an inline catalog inside the settings file itself, with no hosted repo. Each item's `source` must be an object, which can be a SHA-pinned `github`/`git-subdir` source **[doc: marketplace-reference]**. **[inferred]** That is the only documented way to pin both the catalog and each plugin to exact commits from a committed project file.

## 2. Sources inspected (pins)

| # | Repository | Commit SHA (HEAD at clone) | Commit date | Licence (SPDX, from) | Owner / activity (GitHub API, 2026-11-10) |
|---|---|---|---|---|---|
| R1 | `anthropics/claude-plugins-official` | `dceb15d50832e6adf380bedc26dde03d251324b9` | 2026-11-09 | Apache-2.0 (root `LICENSE`); **per-plugin `LICENSE` differs**, see §3 | Anthropic org; 46.7k stars, 1286 open issues, pushed 2026-11-10 |
| R2 | `anthropics/claude-plugins-community` | `163301d1904c0a994539f5226ce0fcd65b8652bf` | 2026-11-05 | Apache-2.0 (root `LICENSE`) for the catalog only | Anthropic org; 4.8k stars, 769 open issues |
| R3 | `anthropics/skills` | `2c5958ecac7cee2b583967a2c4981d0f4a75c579` | 2026-11-06 | **No root licence.** Per-skill `LICENSE.txt` = Apache-2.0 for the skills checked; `doc-coauthoring` has **no licence file** | Anthropic org; 191.7k stars |
| R4 | `anthropics/claude-code` | `ce6cb8ee39759afb5d8bf2e3fd26582f575e9095` | 2026-11-10 | **Proprietary** (`LICENSE.md`: "All rights reserved… Commercial Terms of Service") | Anthropic org |
| R5 | `obra/superpowers` | `22f0b463e7a5e579904dd6211a520321035526f7` | 2026-11-03 | MIT (`LICENSE`) | Individual (Jesse Vincent); 315k stars, 335 open issues |
| R6 | `wshobson/agents` | `9c61ab243def98f72da12abd41cfcf5bcd91af9d` | 2026-11-08 | MIT (`LICENSE`) | Individual (Seth Hobson); 42k stars, 11 open issues |
| R7 | `trailofbits/skills` | `e4dd0bb5b15535f7c5a0834187dffba6ac37e4ff` | 2026-11-06 | **CC-BY-SA-4.0** (`LICENSE`) | Trail of Bits org; 8.1k stars, 154 open issues |
| R8 | `semgrep/mcp-marketplace` (path `plugin`) | `b58f407c6ac0f5fe47dee8301602f2e290a8ecfb` (pinned by R1) | – | **None found** (`LICENSE`, `LICENSE.md` at root and `plugin/`: HTTP 404; API reports no licence) | Semgrep org |
| R9 | `ChromeDevTools/chrome-devtools-mcp` | `a878bcad39584337e055778353246820deafa7c0` (pinned by R1) | – | Apache-2.0 (`LICENSE`) | `ChromeDevTools` GitHub org |

**Catalog facts [src]:**

- R1 lists **317** plugins: 54 relative-path (inside R1, so pinned only by whatever R1 commit you hold), 163 `url`, 99 `git-subdir`, 1 `command` (`xcode`: `xcrun agent plugin path --plugin-format claude`, **no SHA**). Every `url`/`git-subdir` entry carries a `sha`.
- R2 (`claude-community`) lists **2283** third-party plugins: 2273 SHA-pinned, 7 relative-path. Anthropic's catalog review is a submission check, not our audit **[inferred]**.
- R1 pins `superpowers` at `bb92a77741419a4ab5f06e711a283343f1ada0c3`, which **differs** from R5 HEAD. `git diff --stat bb92a77 22f0b46 -- hooks .claude-plugin` changes 5 files, including `hooks/session-start` and `hooks/run-hook.cmd`. I reviewed R5 HEAD, not the R1-pinned commit.
- R4's deprecated marketplace (`claude-code-plugins`) lists 12 plugins that now update from R1 **[doc: anthropic-marketplaces]**.

## 3. Candidates

Verdicts, as defined by the issue:

- **reference only**: read for ideas and behaviour. Not proposed for install. No code copied.
- **install after authorization**: proposed for install, and only after board approval of the exact SHA. Anything with hooks, MCP servers, executables, credentials or elevated access lands here or in rejected. Per company rules, *every* skill or plugin install also needs human approval through Paperclip, including markdown-only ones.
- **rejected**: not to be installed. Reason given. Also listed in §4.

Risk tier: **L** markdown only. **M** runs local code or a local CLI, no runtime fetch. **H** runtime network fetch, credentials, third-party egress, or opaque binaries.

### 3.1 Development and code review (R1, Anthropic-maintained, Apache-2.0 per plugin `LICENSE`, sha256 prefix `cfc7749b96f6`)

| Plugin (R1 path) | Version | Components [src] | Hooks / MCP / LSP commands [src] | Network | Deps | Risk | Verdict |
|---|---|---|---|---|---|---|---|
| `code-review` (`plugins/code-review`) | 1.0.1 | 1 command | None. `allowed-tools` pre-approves `gh issue view/list`, `gh search`, `gh pr comment/diff/view/list`, `mcp__github_inline_comment__create_inline_comment` | Via `gh` (GitHub API) when used | `gh` CLI on host (not supplied) | L | **install after authorization.** Useful for C1 pre-review. Condition: run only with the Paperclip-brokered GitHub token. `--comment` posts to the PR, which is an outward action. |
| `pr-review-toolkit` (`plugins/pr-review-toolkit`) | 1.0.1 | 1 command, 6 agents | None | None of its own | None | L | **install after authorization.** Review agents (tests, types, comments, silent failures). Lowest-risk useful candidate. |
| `feature-dev` (`plugins/feature-dev`) | 1.0.1 | 1 command, 3 agents | None | None | None | L | **install after authorization.** Explorer/architect/reviewer agents. |
| `code-simplifier` (`plugins/code-simplifier`) | 1.0.0 | 1 agent | None | None | None | L | **reference only.** Duplicates the built-in `simplify` skill already in our sessions. |
| `commit-commands` (`plugins/commit-commands`) | 1.0.1 | 3 commands | None. `` !`git status` `` etc. run at invocation. `commit-push-pr` pre-approves `git push:*`, `gh pr create:*`, `git checkout --branch:*`. `clean_gone` deletes `[gone]` branches **and their worktrees** | GitHub via `git push`/`gh` | `git`, `gh` | M | **reference only.** Pre-approved `git push:*` weakens the PR-only workflow (the pre-push hook still blocks `main`). `clean_gone` can delete other agents' Paperclip worktrees. Our `nexus-pr-workflow` skill covers this. |
| `agent-sdk-dev` (`plugins/agent-sdk-dev`) | 1.0.1 | 1 command, 2 agents | None | None | None | L | **reference only.** Relevant to harness-adapter work (MK-4, EZF-11). Read when needed. No standing install. |
| `mcp-server-dev` (`plugins/mcp-server-dev`) | none (tracks commits) | 3 skills | None | None | None | L | **reference only.** For MK-5 (MCP gateway). No `version`, so it tracks commits. |
| `plugin-dev` (`plugins/plugin-dev`) | 0.1.1 | 1 command, 3 agents, 7 skills | No hooks. Ships shell scripts Claude may run via Bash: `validate-agent.sh`, `hook-linter.sh`, `test-hook.sh`, `validate-hook-schema.sh`, `parse-frontmatter.sh`, `validate-settings.sh`, plus example hooks | None seen | `bash`, `jq` [inferred] | M | **reference only.** Useful reading for the Nexus marketplace (MK-1). Scripts not audited. |
| `skill-creator` (`plugins/skill-creator`) | none | 1 skill | No hooks. Python scripts: `run_eval.py`, `run_loop.py`, `improve_description.py`, `package_skill.py`, etc. | **[unverified]** eval scripts likely invoke a model | Python | M | **reference only.** SK-2 already authored our skills. Scripts not audited. |
| `claude-md-management` (`plugins/claude-md-management`) | 1.0.0 | 1 command, 1 skill | None | None | None | L | **reference only.** |
| `session-report` (`plugins/session-report`) | none | 1 skill | No hooks. `analyze-sessions.mjs` reads local session transcripts | None seen [unverified] | Node | M | **reference only.** Reads transcripts that can contain secrets from tool output. Not for shared agent hosts. |
| `typescript-lsp` (`plugins/typescript-lsp`) | 1.0.0 | LSP server | **LSP:** `typescript-language-server --stdio` (from `PATH`; the plugin doesn't ship it) | None of its own | `typescript-language-server` + `typescript` must be on the host. Pin them as monorepo devDependencies and record them in `docs/LICENSE_LEDGER.md` | M | **install after authorization.** Nexus is a TypeScript monorepo. Condition: the binary comes from the repo's pinned `node_modules/.bin`, not a global npm install. |

### 3.2 Security review

| Plugin | Pin | Licence | Components [src] | Hooks / MCP commands [src] | Network / deps | Risk | Verdict |
|---|---|---|---|---|---|---|---|
| `security-guidance` (R1 `plugins/security-guidance`) | R1 SHA; v2.0.19; author David Dworken (Anthropic) | Apache-2.0 | Hooks only, 81 files (including tests) | `SessionStart`: `bash sg-python.sh ensure_agent_sdk.py`. `UserPromptSubmit`, `PostToolUse[Edit\|Write\|MultiEdit\|NotebookEdit]`, `PostToolUse[Bash]`: `bash sg-python.sh security_reminder_hook.py` | **At SessionStart it `pip install --target … --upgrade claude-agent-sdk`, unpinned, from PyPI** into `~/.claude/security/…` when the SDK isn't importable (`ensure_agent_sdk.py` l.552–558). Calls `https://api.anthropic.com` (or `ANTHROPIC_BASE_URL`) for LLM review (`llm.py` l.241–247). Emits plugin metrics. Transitive PyPI tree **[unverified]** | H | **install after authorization**, with conditions: (1) pre-provision a pinned, hash-locked `claude-agent-sdk` so the bootstrap is a no-op, and verify that by test; (2) approve the API egress and which credential it uses; (3) audit the remaining hook modules (only the bootstrap, `llm.py` endpoint code and `hooks.json` were read); (4) a disposable host first. Value: an inline security reminder on edits. |
| `claude-security` (R1 `plugins/claude-security`) | R1 SHA; v0.12.0 | **Proprietary** (`LICENSE`: "may not… use the Plugin… to develop any non-Anthropic product or service") | 9 agents, 1 skill, hooks, Python scripts | `PostToolUse[Bash]`: `sh hooks.sh metrics`, `tip push`, `tip pr`. `PostToolUseFailure[Bash]`: `metrics`. `PermissionRequest[AskUserQuestion]`: `unanswered`. `UserPromptExpansion`: `banner` | Metrics on every Bash call [src]; destination not traced **[unverified]** | H | **rejected.** The licence forbids using it to develop a non-Anthropic product, which Nexus is. Also metrics hooks on every Bash call. |
| Trail of Bits security skills (R7): `differential-review`, `insecure-defaults`, `sharp-edges`, `supply-chain-risk-auditor`, `agentic-actions-auditor`, `variant-analysis`, `property-based-testing`, `static-analysis` | R7 SHA | CC-BY-SA-4.0 | Skills (markdown). `static-analysis` ships JS workflows (`semgrep-scan.js`, `codeql-build.js`) and test harnesses. `supply-chain-risk-auditor` ships a Python package (`pyproject.toml`, `uv.lock`) | None in these 8 plugins [src: no `hooks.json`/`.mcp.json`] | `static-analysis` expects `semgrep`, `codeql`, `jq` on the host. `supply-chain-risk-auditor` resolves through `uv.lock` **[unverified]** | L (markdown) / M (scripts) | **reference only.** Highest-quality security review material found, and directly relevant to C1 and to `third-party-skill-audit`. CC-BY-SA-4.0 is share-alike, so **don't copy text into Nexus skills** (Apache-2.0 proposed outbound, EZF-24). Cite and re-derive. A future install of the markdown-only ones needs approval. |
| ToB `gh-cli` (R7) | R7 SHA | CC-BY-SA-4.0 | Hooks | `SessionStart`: `persist-session-id.sh`, `setup-shims.sh`. `PreToolUse[WebFetch\|mcp__.*fetch…]`: `intercept-github-fetch.sh`. `PreToolUse[Bash]`: `intercept-github-curl.sh`. `SessionEnd`: `cleanup-clones.sh` | Installs PATH shims; rewrites GitHub fetches to `gh` | H | **rejected.** It intercepts every Bash call and shims PATH on the agent host, which clashes with the Paperclip GitHub broker and its auth mode. |
| `semgrep` (R1 entry → R8) | R8 SHA; v2.7.0 ("Semgrep Guardian") | **No licence file found** | Hooks + MCP | `PreToolUse[Write\|Edit\|Bash\|apply_patch]`: `scripts/hook auto PreToolUse`. `PostToolUse[…]`: `scripts/hook auto PostToolUse --async`. **MCP:** `${CLAUDE_PLUGIN_ROOT}/scripts/hook claude mcp`. `scripts/hook` is a POSIX dispatcher that `exec`s a **prebuilt committed binary** (`hook-linux-amd64`, `hook-darwin-arm64`, …) | Not traced (opaque binary) | H | **rejected.** No licence, and an opaque prebuilt binary runs on every edit and Bash call. Revisit only with a licence and a source-built, reproducible artifact. |

### 3.3 Infrastructure, debugging and testing (R1 entries)

| Plugin | Pin | Licence | Hook / MCP command [src] | Network / credentials | Risk | Verdict |
|---|---|---|---|---|---|---|
| `chrome-devtools-mcp` (→ R9) | R9 SHA; v1.11.0 | Apache-2.0 | **MCP:** `npx chrome-devtools-mcp@1.11.0` (inline in `plugin.json`) | `npx` fetches from npm at runtime. Top-level pinned, transitive tree resolved at run time **[unverified]**. Starts Chrome via Puppeteer | H | **install after authorization**, for frontend debugging (EZF-48 dashboard). Conditions: replace `npx` with a repo-pinned devDependency (lockfile and integrity hashes), run in a disposable sandbox with no logged-in browser profile. |
| `playwright` (R1 `external_plugins/playwright`) | R1 SHA | none in plugin dir (author: Microsoft) **[unverified]** | **MCP:** `npx @playwright/mcp@latest` | **Unpinned `@latest`** fetched at every start | H | **rejected as published.** `@latest` is unpinned. The repo already uses vitest; any Playwright use goes in as a pinned devDependency through the normal ledger. |
| `terraform` (R1 `external_plugins/terraform`) | R1 SHA | none in plugin dir (author: HashiCorp) **[unverified]** | **MCP:** `docker run -i --rm -e TFE_TOKEN=${TFE_TOKEN} hashicorp/terraform-mcp-server:0.4.0` | Image pulled by **tag, not digest**. Passes a Terraform Cloud token | H | **reference only.** Not needed until infra work. Docker isn't available on the run host. Would need a digest pin and a scoped token, so authorization later. |
| `github` (R1 `external_plugins/github`) | R1 SHA | none in plugin dir **[unverified]** | **MCP (http):** `https://api.githubcopilot.com/mcp/` with `Authorization: Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}` | Third-party endpoint; long-lived PAT | H | **rejected.** Needs an unbounded long-lived PAT in the environment, and duplicates the Paperclip-brokered GitHub connection, which is scoped and audited. |
| `context7` (R1 `external_plugins/context7`, Upstash) | R1 SHA | none in plugin dir **[unverified]** | **MCP (http):** `https://mcp.context7.com/mcp?client=claude-code-plugin` | Sends queries (library names, code context) to a third-party SaaS | H | **rejected for now.** Unapproved third-party egress of code context, and no account approved. Use the official docs via WebFetch instead. |
| `serena` (R1 `external_plugins/serena`; same server in ToB `zeroize-audit`) | R1 SHA | none in plugin dir **[unverified]** | **MCP:** `uvx --from git+https://github.com/oraios/serena serena start-mcp-server` | **Fetches and runs the git default branch HEAD (unpinned) on every start** | H | **rejected.** Unpinned remote code execution. |

### 3.4 Agent orchestration and workflow

| Plugin | Pin | Licence | Components / hooks [src] | Risk | Verdict |
|---|---|---|---|---|---|
| `superpowers` (R5; also R1 entry pinned at `bb92a77…`) | R5 SHA `22f0b46…`, v7.0.2 | MIT | 15 skills. **Hook:** `SessionStart[startup\|clear\|compact]`: `run-hook.cmd session-start`, which reads `skills/using-superpowers/SKILL.md` and injects it as `additionalContext` wrapped in `<EXTREMELY_IMPORTANT>You have superpowers…`. No network or package deps [src: `package.json` has none] | M | **reference only.** The hook makes a third-party workflow override session instructions on every start, which competes with Nexus governance (AGENTS.md, C1/C2 gates). Its `finishing-a-development-branch` skill offers "Merge Locally" (`git merge`) and force-deleting branches, which conflicts with the PR-only, no-agent-merge policy. Its TDD and debugging skills are good reading. |
| `ralph-loop` (R1 `plugins/ralph-loop`) | R1 SHA; v1.0.1 | Apache-2.0 | 3 commands. **Hook:** `Stop`: `bash stop-hook.sh` (blocks session exit to keep looping; reads the transcript via `jq`; `rm`s its state file). `scripts/setup-ralph-loop.sh` | M | **rejected.** An autonomous loop that blocks Stop, which works against the per-agent budget caps (USD 300/month company) and the requirement that agents stop at review gates. |
| `hookify` (R1 `plugins/hookify`) | R1 SHA; v0.1.1 | Apache-2.0 | 4 commands, 1 agent, 1 skill. **Hooks:** `PreToolUse`, `PostToolUse`, `Stop`, `UserPromptSubmit`: `python3 hooks/<event>.py` on every event (rule engine reading local rule files) | M | **reference only.** Interesting model for user-authored guard rules (MK-6 extension ideas), but Nexus hooks policy belongs in reviewed settings, not a generic rule engine. |
| `wshobson/agents` (R6, marketplace `claude-code-workflows`, 94 plugins) | R6 SHA | MIT | Mostly markdown agents, commands and skills. Only 2 plugins have hooks: `protect-mcp` and `review-agent-governance`, both `PreToolUse[.*]`: `hooks/evaluate.sh`, `PostToolUse[.*]`: `hooks/sign.sh`. `evaluate.sh` runs **`npx protect-mcp@0.32.4 evaluate`** on every tool call. No `.mcp.json`, no inline `mcpServers` | L (markdown plugins) / H (the 2 hook plugins) | **reference only** for the markdown plugins (`agent-orchestration`, `full-stack-orchestration`, `debugging-toolkit`, `security-scanning`, `kubernetes-operations`). Individual maintainer, broad scope, fast churn. **Rejected:** `protect-mcp`, `review-agent-governance` (runtime `npx` fetch of a third-party package in the hook path of every tool call). |
| `anthropics/skills` (R3, marketplace `anthropic-agent-skills`) | R3 SHA | Per skill. Apache-2.0 for the 18 with `LICENSE.txt`; **`doc-coauthoring` has none** | Skills. `mcp-builder` ships Python scripts with `requirements.txt` = `anthropic>=0.39.0`, `mcp>=1.1.0` (ranges, unpinned). `webapp-testing` ships Playwright helper scripts | L / M | **reference only.** `mcp-builder` and `claude-api` are useful reading for MK-5 and harness work. `claude-api` is already available as a built-in skill. |

### 3.5 Marketplaces as a whole

| Marketplace | Verdict | Reason |
|---|---|---|
| `claude-plugins-official` (R1) | **reference only as a catalog**. Individual plugins per §3.1–3.4. | It's auto-added and auto-updated by default (§1.2, §1.4), and a marketplace source can't be SHA-pinned. Most of its 317 entries are partner plugins Anthropic doesn't control ("cannot verify… that they won't change"). |
| `claude-community` (R2) | **reference only.** Don't add. | 2283 third-party plugins. SHA pinning helps, but each plugin needs its own audit. |
| `claude-code-plugins` (R4) | **rejected.** | Deprecated by Anthropic. Repo licence is proprietary. |
| `anthropic-agent-skills` (R3) | **reference only.** | See §3.4. |
| `claude-code-workflows` (R6), `trailofbits` (R7), `superpowers` (R5) | **reference only.** | Third-party tier, not reviewed by Anthropic **[doc: anthropic-marketplaces]**. See the rows above. |

## 4. Rejected sources

| Source | Pin | Reason |
|---|---|---|
| `claude-security` (R1) | `dceb15d…` | Proprietary licence forbids use to develop non-Anthropic products. Metrics hooks on every Bash call. |
| `semgrep` / Semgrep Guardian (R8) | `b58f407…` | No licence file. Opaque prebuilt binaries run as hooks on every Write/Edit/Bash and as an MCP server. |
| `serena` (R1 entry; ToB `zeroize-audit` `.mcp.json`) | `dceb15d…` / `e4dd0bb…` | `uvx --from git+https://github.com/oraios/serena`: unpinned HEAD executed on every start. |
| `playwright` (R1 entry) | `dceb15d…` | `npx @playwright/mcp@latest`: unpinned. |
| `github` (R1 entry) | `dceb15d…` | Long-lived PAT in env; duplicates the brokered Paperclip GitHub connection. |
| `context7` (R1 entry) | `dceb15d…` | Unapproved third-party SaaS egress of code context. |
| `ralph-loop` (R1) | `dceb15d…` | Stop-blocking autonomous loop vs budget caps and review gates. |
| ToB `gh-cli` (R7) | `e4dd0bb…` | PATH shims plus interception of every Bash/WebFetch call on agent hosts. |
| wshobson `protect-mcp`, `review-agent-governance` (R6) | `9c61ab2…` | `npx protect-mcp@0.32.4` fetched and run in the hook path of every tool call. |
| `claude-code-plugins` marketplace (R4) | `ce6cb8e…` | Deprecated. Proprietary repo licence. |
| `xcode` (R1 entry) | – (no SHA possible) | `command` source runs `xcrun` on the host on every session. Not relevant (Nexus isn't an Apple-platform app project). |
| Grafana plugins (`grafana-assistant`, `grafana-cloud-mcp`, `grafana-mcp`; R1 entries) | R1-pinned SHAs (`6c28ba1…` for `grafana-mcp`) | Not audited. Excluded pending a licence read under the Nexus AGPL rule (Grafana). The `grafana-cloud-*` entries need a cloud account, which needs board approval. |
| `redis-development` (R1 entry) | `a84871d…` | Not audited. Nexus uses Valkey, not Redis. |
| Paid-SaaS integrations (Sentry, Datadog, PagerDuty, etc.; R1 entries) | R1-pinned SHAs | Not audited. Need paid accounts and credentials without board approval. |

## 5. Recommendations (for C2 and the board, not decided here)

1. **Agent hosts:** set `CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL` (or a managed `strictKnownMarketplaces`) so Paperclip agent sessions don't silently register an auto-updating marketplace **[doc-based; inferred fit]**. This is an infrastructure/policy change, so it needs its own approval and rollback plan.
2. **If anything from §3 is approved,** don't add `anthropics/claude-plugins-official` as a marketplace. Declare a Nexus-owned `settings`-type marketplace in `.claude/settings.json` whose entries are `git-subdir` sources of `anthropics/claude-plugins-official` pinned to `sha: dceb15d50832e6adf380bedc26dde03d251324b9`, with `autoUpdate: false` **[inferred from doc; untested]**. That pins catalog and plugin together. It needs an ADR (`docs/adr/`), because it changes project settings for every agent.
3. **Lowest-risk first wave:** `pr-review-toolkit`, `feature-dev`, `code-review` (all L). Then `typescript-lsp` (M), once the server is a pinned devDependency.
4. **Security tooling:** read the Trail of Bits skills and re-derive what we need in our own words (licence). Defer `security-guidance` until its SDK bootstrap is pre-pinned and tested on a disposable host.
5. Feed the §1 findings into MK-1 (Nexus Marketplace manifest): require `sha` for git sources, `sha256` for archives, forbid `command` sources, `@latest`/unpinned `npx`/`uvx`, and runtime package fetches in hooks.
6. Before any install: rerun `third-party-skill-audit` on the exact SHA, with full file inventory and per-file hashes. Nothing in this document is an approval.

## 6. Open items and unknowns

- Transitive npm/PyPI trees for `chrome-devtools-mcp`, `security-guidance` (`claude-agent-sdk`) and ToB `supply-chain-risk-auditor`: **[unverified]**. Resolving them needs a sandboxed fetch.
- Licence of the R1 `external_plugins/*` directories (playwright, terraform, github, context7, serena): there's no `LICENSE` in the plugin directory. The R1 root licence is Apache-2.0, but whether it covers vendor-contributed directories is **[unverified]**.
- Whether `security-guidance` metrics leave the host, and where `claude-security` metrics go: **[unverified]**.
- R1-pinned `superpowers` (`bb92a77…`) was not reviewed. Only R5 HEAD was.
- `claude plugin details` (the docs' recommended inventory check) was **not run**, because it needs the Claude Code CLI against a cloned plugin dir and the task forbids plugin tooling actions. The inventory here comes from reading files directly.

## 7. Sources (accessed 2026-11-10, raw markdown over HTTPS)

| Short name | URL | sha256 of fetched file |
|---|---|---|
| plugins | https://code.claude.com/docs/en/plugins.md | `9124d73faba1ae251d9f4229d03e19bd9fc0cd811a43aefc014c75a9d34e64ad` |
| plugins-reference | https://code.claude.com/docs/en/plugins-reference.md | `e5b1637e31d580160fce53125e56900800e55a5b6f089a34c4407648cef48443` |
| plugin-marketplaces | https://code.claude.com/docs/en/plugin-marketplaces.md | `09ca4f45324f12bfae726823b14c7b3c5bdd8f31261afe74c93691d2d21b4e1c` |
| discover-plugins | https://code.claude.com/docs/en/discover-plugins.md | `041d060043a23273eba6c4679dc3ac22d01afccb51db65f8d82d231a338e187e` |
| security | https://code.claude.com/docs/en/plugins/security.md | `9f9b2279ca0b2c2f8d147496189faebe1c4739e1e4c54f98da101f3491d98678` |
| marketplace-reference | https://code.claude.com/docs/en/plugins/marketplace-reference.md | `09409ea3e40a1764e56f11d0a85e91e58c0a3a05754977086c2cbdba2eacadd2` |
| host-marketplace | https://code.claude.com/docs/en/plugins/host-marketplace.md | `52787e3decc5e4d2169f611ce8cf87a34d1b4ec5748ff8264a05e4d1a6149a0e` |
| anthropic-marketplaces | https://code.claude.com/docs/en/plugins/anthropic-marketplaces.md | `75565171504d7a6620d14d0b0ddcd9a08b8d6991b56951605fbdab5f75b632df` |
| org | https://code.claude.com/docs/en/plugins/org.md | `ed45e79d6f9f850f9f4a906dc8944c5152e5e620673996a6c160903f803127d6` |
| components | https://code.claude.com/docs/en/plugins/components.md | `4e824b70bbe00db2d487ab5aeac1c63575fdc151b0d0a3eff573f461ce6f6d4b` |
| settings-reference | https://code.claude.com/docs/en/settings-reference.md | `d4b85c13504f0ef24d39e0ba9a5f32c969929a86670a686ec55de7d8ee37bdfd` |
| skills | https://code.claude.com/docs/en/skills.md | `50c0f7621b93db9b7d7d4db4bb079341354915aa5f33533950d3dbad8b124ff9` |

The doc pages are live and change often. Hashes record exactly what was read. C1 should re-read the quoted sentences on the live pages.

### Reproduce the source inspection (read-only)

```sh
git -c core.hooksPath=/dev/null clone --depth 1 --no-recurse-submodules https://github.com/<owner>/<repo> /tmp/x
git -C /tmp/x fetch --depth 1 origin <sha> && git -C /tmp/x checkout <sha>
# then read .claude-plugin/*.json, hooks/hooks.json, .mcp.json, bin/, and every non-markdown file
```

Don't run `claude plugin …`, `npx`, `uvx`, `pip`, `docker` or any plugin script as part of reproduction.
