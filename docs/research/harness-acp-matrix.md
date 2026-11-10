# Harness ACP support matrix: Codex, Claude Code, OpenCode, Hermes Agent

- Issue: EZF-11 (NX2-004), epic E00 / M0 (P00). Risk: normal. C1: A5. C2: A0.
- Author: A0 Nexus CTO. Date: 2026-11-10. Status: **DRAFT for review. Not an ADR.** Rev 2 (2026-11-10): addresses C1 R-1, N-1, N-2 (permission option kinds, fail-closed behaviour, Codex `bwrap`).
- Feeds: P04 agent manager (ACP harness broker), G4 "ACP agent resume and session registry tests", `SESSION_PERSISTENCE.md` §AI agent, `PLUGIN_AND_AGENT_CATALOG.md` harness adapter contract, NX4-157 (Codex required).
- Clean-room: public docs, public source at pinned tags, and black-box runs of CLIs that were already installed on the runner. No code was copied into Nexus. Nothing was installed.

## 0. Read this first: what was and was not done

| Item | State |
|---|---|
| ACP spec status of every lifecycle method, at a pinned schema release | Done (§2). Source: `agentclientprotocol/agent-client-protocol` tag `schema-v1.30.0`. |
| Capability matrix for all four harnesses at pinned versions | Done (§3). Each cell is tagged with how it was established. |
| **Black-box resume probe, OpenCode 1.19.5 (`opencode acp`)** | **Done, passed.** Included a cold process restart. §5.1, raw transcript in `harness-probes/results/2026-11-10/opencode-1.19.5.json`. |
| **Black-box resume probe, Codex 0.167.0 native `codex app-server`** | **Done, with a finding.** A thread with zero turns cannot be resumed. §5.2, raw transcript in `.../codex-0.167.0.json`. |
| Black-box probe of `codex-acp`, `claude-agent-acp`, `hermes acp` | **NOT done.** They are not installed on the runner, and the task forbids installing packages on shared hosts. Their rows come from source at pinned tags only. Follow-up: §8 F-1. |
| Resume of a session **that has completed a model turn** | **NOT done for any harness.** A turn needs provider credentials. None were used, and the probes never send `session/prompt` or `turn/start`. Follow-up: §8 F-2. |
| Permission prompt and cost reporting *observed on the wire* | **NOT done.** Both need a model turn. The cells cite source code only. |
| macOS | **NOT tested.** The runner is Linux x86_64 only. See §7. |

Evidence tags used below:

- **[probe]**: observed in this run's black-box probe. Raw JSON is committed.
- **[src]**: read in the harness's public source at the pinned tag or commit.
- **[doc]**: stated in official docs or release notes.
- **[unverified]**: inferred and not checked; do not build on it.

Most [src] facts come from a research sub-agent that read the pinned tags. I re-read three load-bearing claims myself through the GitHub API: ACP v1 `meta.json` at `schema-v1.30.0`, codex-acp `sessionCapabilities` at v2.6.0, and Hermes `session_capabilities` at v0.23.1. All three matched. C1 should spot-check others before relying on them.

## 1. Pinned versions (as of 2026-11-10)

| Component | Version | Tag / commit | Released | License | How it speaks ACP |
|---|---|---|---|---|---|
| ACP spec (schema) | protocolVersion **1**; schema release `schema-v1.30.0` | `759775f6b0a2369886c378d1f64e900175041120` | 2026-11-09 | Apache-2.0 | — (v2 is `2.0.0-alpha.14`; not targeted) |
| ACP agent registry | `v2026.11.10-efdf647` | `efdf6476f7634c8573baec2739965d1576aae2ac` | 2026-11-10 | Apache-2.0 | Lists claude-acp, codex-acp, opencode. **No Hermes entry.** |
| OpenAI Codex CLI (`@openai/codex`) | **0.167.0** | `rust-v0.167.0` = `086ccc833bc9cf01024ad2dd6af7dbd421b6bf9a` | 2026-11-06 | Apache-2.0 | **No native ACP** [src][probe]. Native protocol is `codex app-server` (JSON-RPC, marked experimental). |
| codex-acp (`@agentclientprotocol/codex-acp`) | **2.6.0** | `f3208913693bd4d5171d6c6b9be5ec1ff96c6431` | 2026-11-08 | Apache-2.0 (© JetBrains) | Adapter that wraps `codex app-server`. Depends on `@openai/codex ^0.166.0`. |
| ~~`zed-industries/codex-acp`~~ | 0.16.0 (archived) | `bb590500e8646f6daf879b8b3c6a659fbd29017d` | 2026-06-08 | Apache-2.0 | **Deprecated. Do not use.** It pinned Codex `rust-v0.137.0`. |
| Claude Code (`@anthropic-ai/claude-code`) | **2.1.322** | npm only | 2026-11-10 | **Proprietary** (Anthropic Commercial ToS) | No native ACP. |
| claude-agent-acp (`@agentclientprotocol/claude-agent-acp`) | **0.103.0** | `a1d83c60310f33cbc3cd78f6b6133278e754efd5` | 2026-11-10 | Repo: Apache-2.0. **Registry lists it as "proprietary"** (§6 L-2). | Adapter over `@anthropic-ai/claude-agent-sdk` 0.3.321. Replaces deprecated `@zed-industries/claude-code-acp`. |
| OpenCode 1.x (`opencode-ai`) | **1.19.5** | `v1.19.5` = `810c0eba1a7348036f8bdf61e6632d0c36c6876c` | 2026-10-28 | MIT | Native `opencode acp`. This is the build probed here. |
| OpenCode 2.x (`@opencode/cli`) | **2.2.6** | `v2.2.6` = `dc2ffcf8bf26f9e669b6aa22b95f50e12be15e06` | 2026-11-06 | MIT | Native `opencode acp`. The registry's default build. npm `opencode-ai@latest` still points at 1.x. |
| Hermes Agent (NousResearch) | **0.23.1** | `v0.23.1` = `3b421578588243f920886e6fe79a6faa87ea026e` | 2026-11-10 | MIT | Native `hermes acp` (Python, `agent-client-protocol==0.9.0`, optional `acp` extra). PyPI `hermes-agent` is stale (0.19.0): install from the tag, not PyPI. |

**Name collision:** "Hermes" in this document always means **Hermes Agent**, the harness at `github.com/NousResearch/hermes-agent`. It does not mean Nous Research's Hermes model family. Hermes Agent can drive any provider.

Local binaries probed (Linux x86_64; digests in `harness-probes/results/2026-11-10/binary-sha256.txt`):
`codex` native musl binary `cdcb45aa…bbda`, `opencode.exe` `7df4e413…802c`, `claude.exe` `bfb3703a…c478`.

## 2. ACP v1 baseline (schema-v1.30.0)

This baseline is what a Nexus client can rely on. Anything outside it must be feature-detected and isolated.

| Method | Spec status | How an agent advertises it |
|---|---|---|
| `session/new`, `session/prompt`, `session/cancel`, `session/update` | Stable, mandatory | (always) |
| `session/load` (replays history via `session/update`, then responds) | Stable | `agentCapabilities.loadSession: true` |
| `session/list` | Stable | `sessionCapabilities.list` |
| `session/resume` (reattaches without history replay) | Stable | `sessionCapabilities.resume` |
| `session/close` (frees agent-side resources) | Stable | `sessionCapabilities.close` |
| `session/delete` | Stable | `sessionCapabilities.delete` |
| `session/fork` | **Unstable** (only in `schema.unstable.json`) | `sessionCapabilities.fork` |
| `session/set_config_option` (model, mode, …) | Stable | `configOptions` in the session response |
| `session/set_mode` | Stable but slated for removal | `modes` in the session response |
| `session/set_model` | **Removed** from the protocol artifacts | — |
| `session/request_permission` (agent → client) | Stable | — |
| `usage_update` session update `{used, size, cost?: {amount, currency}}` | Stable | — |
| `PromptResponse.usage` (token breakdown per turn) | **Unstable** | — |

Rule for Nexus: **`load` and `resume` are different operations.** `load` gives the client the full transcript. `resume` reattaches to agent state and expects the client to hold its own transcript. The UI must mark which one happened, per the "mark resumed vs reattached correctly" checklist item in P04.

## 3. Feature / ACP support matrix

Columns are the four required harnesses at the §1 versions. "Codex" means Codex through codex-acp 2.6.0, the only ACP path for Codex.

| Capability | Codex (codex-acp 2.6.0 → codex 0.166+) | Claude Code (claude-agent-acp 0.103.0) | OpenCode 1.19.5 / 2.2.6 | Hermes Agent 0.23.1 |
|---|---|---|---|---|
| ACP entry point | `codex-acp` (npx or binary). **Not** `codex acp` [src][probe]. | `claude-agent-acp` (npx) [src] | `opencode acp` [probe] | `hermes acp` / `hermes-acp` [src][doc] |
| ACP protocolVersion | 1 [src] | 1 [src] | 1 [probe] | 1 [unverified: Python SDK 0.9.0 default] |
| In ACP registry | yes [src] | yes [src] | yes [src] | **no** [src] |
| `session/load` | yes [src] | yes [src] | yes [probe] | yes [src] |
| `session/resume` | yes [src] | yes [src] | yes [probe], including after a process restart [probe] | yes [src] |
| `session/list` | yes [src] | yes [src] | yes [probe] | yes [src] |
| `session/close` | yes [src] | yes [src] | yes [probe]. After close, `resume` still works: close is not delete [probe]. | **no**, not advertised [src] |
| `session/delete` | yes [src] | yes [src] | 2.2.6 yes [src]; 1.19.5 no [probe] | no [src] |
| `session/fork` (unstable) | yes [src] | yes [src] | yes [probe][src] | yes [src] |
| Model / mode selection | config options [src] | modes: default, acceptEdits, plan, auto, bypassPermissions [src] | `configOptions` ids `model`, `mode` [probe] | set_session_model, set_session_mode, set_config_option [src] |
| Permission prompts → `session/request_permission` | yes [src: `src/permissions/options.ts`, `option-ids.ts`, `mcp.ts`]. Option id → kind. **Command:** `allow_once`→allow_once; `allow_for_session`→**allow_always**; `decline`, `cancel`→reject_once; `accept_execpolicy_amendment`→**allow_always** (**changes Codex exec policy**: "don't ask again for commands that start with …"); `apply_network_policy_amendment:<n>`→**allow_always** or **reject_always**, depending on the amendment action (**changes Codex network policy**: allow or block a host "in the future"). **File change:** `allow_once`, `allow_for_session`→**allow_always**, `cancel`. **Permission profile:** `allow_permissions_turn`, `allow_permissions_turn_strict_auto_review`→allow_once; `allow_permissions_session`→**allow_always**; `reject_permissions`→reject_once. **MCP tool / elicitation:** `allow_once` (or `accept`)→allow_once; `allow_session`→**allow_always** (persist session); `allow_always`→allow_always (persist always); `decline`, `cancel`→reject_once. Kind does not tell session scope from a policy change. | yes. SDK `canUseTool` → `requestPermission` [src] | yes. Ids `once`→allow_once, `always`→allow_always, `reject`→reject_once. The reply is mapped **by option id**. Rejects when the client has no `requestPermission`, when the request throws (e.g. the connection drops), or when the outcome is not `selected` with id `once`/`always`. **No timeout found** [src: `src/acp/permission.ts`] | yes. `allow_once`→allow_once; `allow_session`→**allow_always** (the code says "ACP has no session-scoped kind"); `allow_always`→allow_always (only when the gate allows permanent grants); `deny`→reject_once; `deny_always`→reject_always. **Auto-denies after `approvals.timeout`** [src: `acp_adapter/permissions.py`] |
| Usage over ACP (`usage_update`) | tokens/context only, **no cost** [src]. Rate-limit and quota in `_meta` [src]. | yes, **with USD cost** (`total_cost_usd`) [src] | yes, **with USD cost** [src] | tokens/context only, **no cost** [src]. Native DB has estimated and actual USD [src]. |
| Turn token breakdown (`PromptResponse.usage`, unstable) | [unverified] | yes [src] | 1.x yes [src] | gateway server only [src] |
| MCP transports passed by the client | http [src] | http, sse [src] | 1.19.5: http, sse [probe]. 2.2.6: http [src]. | [unverified] |
| Auth methods | chat-gpt, chat-gpt-device-code, api-key (`CODEX_API_KEY`/`OPENAI_API_KEY`), gateway [src] | Anthropic credentials through the SDK [src] | `opencode-login` [probe]. Free "zen" models answered `session/new` without auth [probe]. | provider config in Hermes [doc] |
| Native worktree support | No worktree method in the app-server schema [probe]. Nexus must create it. | `claude -w/--worktree [name]` → `<repo>/.claude/worktrees/<name>` [doc][probe: help] | `opencode run -w` (2.2.6; not combinable with `--continue`/`--session`) [doc]. HTTP `/experimental/worktree` [src]. | `hermes -w/--worktree` [src] |
| Worktree over ACP | none of the four exposes worktree creation as an ACP method. Nexus creates the worktree and passes it as `cwd` (plus `additionalDirectories` where advertised). | ← | ← | ← |
| Default safety posture | `codex app-server` thread defaults observed: `approvalPolicy: on-request`, sandbox `readOnly`, network off [probe] | per `--permission-mode` / adapter mode | per agent config | [unverified] |
| Supported OS (vendor claim) | macOS, Linux (Windows experimental) [unverified for this version] | macOS, Linux, Windows [unverified for this version] | macOS, Linux, Windows [unverified] | Linux, macOS, WSL2, native Windows [doc: README only] |

## 4. Native (non-ACP) resume and automation surfaces

These are the fallbacks for when the ACP adapter breaks, and the CLI-PTY path from `PLUGIN_AND_AGENT_CATALOG.md`.

| Harness | Native resume | Headless / machine protocol | Cost |
|---|---|---|---|
| Codex 0.167.0 | `codex resume [--last]`, `codex fork`, `codex archive/delete` [probe: help]. App-server: `thread/start`, `thread/resume`, `thread/fork`, `thread/list`, `thread/read`, `thread/unsubscribe`, `thread/archive`, `turn/start`, `turn/interrupt`, `turn/steer` [probe: schema] | `codex app-server` JSON-RPC (stdio). 106 client methods, 10 server→client requests (approvals), 86 notifications [probe]. `codex exec` for one-shot. | `thread/tokenUsage/updated` gives **tokens only**. No USD; Nexus must price it. |
| Claude Code 2.1.322 | `-r/--resume <id or name>`, `-c/--continue`, `--session-id <uuid>`, `--fork-session`, `--no-session-persistence`, `--bg` + `claude attach` [probe: help][doc] | `-p --output-format stream-json --input-format stream-json`. `--permission-prompt-tool mcp__<server>__<tool>` or `--permission-prompts host\|none`, `--permission-mode` [probe: help][doc] | `total_cost_usd` in the result message (the docs call it a client-side estimate). `--max-budget-usd` (print mode) [doc] |
| OpenCode | `opencode run -c/--continue`, `-s/--session`, `--fork`. `opencode session`, `opencode export/import` [probe: help][doc] | `opencode serve`: HTTP + OpenAPI at `/doc`. `OPENCODE_SERVER_PASSWORD` enables basic auth [doc]. | `opencode stats` [probe: help] |
| Hermes Agent | `-r/--resume <id\|title\|latest>`, `-c/--continue`. SQLite `state.db` [src] | CLI. ACP gateway server [src]. | `estimated_cost_usd` / `actual_cost_usd` in `state.db` [src] |

## 5. Native resume capability checks (black-box, this run)

Harness: `docs/research/harness-probes/acp_probe.py` (ACP) and `codex_app_server_probe.py` (Codex native). Both:

- run the agent with `HOME`, `XDG_*` and `CODEX_HOME` in a throwaway temp directory, with an environment of only `PATH`, so no operator config, session or credential is read;
- never send `session/prompt` / `turn/start`, so no model call is made and nothing is billed;
- refuse any agent→client request;
- write the full JSON-RPC transcript.

### 5.1 OpenCode 1.19.5: `opencode acp`, 2026-11-10 ~10:02 UTC

| # | Step | Result |
|---|---|---|
| 0 | `initialize` (pv 1) | ok. `loadSession: true`, `sessionCapabilities: {close, fork, list, resume}` |
| 1 | `session/new` | ok. `ses_…` id, `configOptions` [model, mode] |
| 2 | `session/list` | ok, lists the new session with cwd, title, updatedAt |
| 3–4 | `session/load`, `session/resume` | ok, ok |
| 5–6 | `session/close`, then `session/resume` | ok, ok (close only frees resources; the session is still resumable) |
| 7 | `session/load` with an unknown id | **error -32603 "Internal error: OpenCode service failure"** |
| 8 | *kill agent, start a new process with the same HOME* | — |
| 9–12 | `initialize`, `session/list`, `session/resume`, `session/load` on the old id | ok. The session survives a cold restart. |

**Verdict:** OpenCode meets the `SESSION_PERSISTENCE.md` requirement ("persist native ACP session identity, feature-detect resume") at protocol level, for a zero-turn session. Caveat: an unknown session returns a generic internal error, not a "not found" error. Nexus cannot tell a missing session from a transient failure by error code. It must call `session/list` first.

### 5.2 Codex 0.167.0: `codex app-server` (native; codex-acp builds on it)

| # | Step | Result |
|---|---|---|
| 0 | `initialize` | ok |
| 1 | `thread/start` | ok. Thread id `01a1c4e9-…`. Defaults: approvalPolicy `on-request`, sandbox `readOnly`, network off. |
| 2 | `thread/list` | ok but **empty**: the new thread is not listed |
| 3 | `thread/loaded/list` | ok, contains the thread (in memory) |
| 4 | `thread/resume` on that thread | **error -32600 "no rollout found for thread id …"** |
| 5–6 | `thread/read`, `thread/unsubscribe` | ok, ok |
| 7 | `thread/resume` with an unknown id | error -32600 "no rollout found" |
| 8–14 | *cold restart*, then list / resume / read | list empty. resume → "no rollout found". read → "thread not loaded". |

**Verdict:** Codex does not persist a thread until it has a rollout, which in practice means after the first turn [inferred from the error text; confirming it needs a turn, F-2]. **A Codex session cannot survive a restart before its first turn completes.** Nexus must:

- treat Codex sessions as non-resumable until the first `turn/completed`, or until `session/list` shows the session;
- show "Session stopped — start new" instead of a fake resume (`SESSION_PERSISTENCE.md`).

Unlike OpenCode, an unknown id and a not-yet-persisted id give the same error, so the two cannot be told apart.

## 6. Implications for the Nexus harness adapter (input to P04 and NX2-007 ADRs)

1. **ACP is the primary adapter for all four harnesses.** Codex reaches ACP only through codex-acp, so pin `@agentclientprotocol/codex-acp` together with the `@openai/codex` version it resolves. That pair is one supply-chain unit: record both digests. Never install the archived `zed-industries` packages.
2. **Capability detection, not harness names.** Build the session registry's capability declaration (`resume`, `load`, `list`, `close`, `fork`, `cost`, `worktree`, `session id`) from the `initialize` response at runtime, and store it with the session record. The matrix above is an expectation to test against, not a hardcoded table. Treat `fork` as unstable everywhere.
3. **Resume algorithm (proposal):**
   - On reconnect, if `resume` is advertised and `session/list` contains the id, call `session/resume` and mark the session **reattached**.
   - Otherwise, if `loadSession` is advertised, call `session/load`, rebuild the transcript and mark it **resumed from history**.
   - Otherwise, offer a new session with the saved transcript as context, with user consent, and never with the same id.
   - Do not interpret error codes across harnesses (§5.1, §5.2).
4. **Close semantics:** `session/close` is a resource release, not revocation (OpenCode resumes after close). Revoking a user or job must kill the harness process and its OS account/container. Do not rely on `close`. Hermes has no `close` at all.
5. **Permissions.** `PermissionOption.kind` (`allow_once | allow_always | reject_once | reject_always`) does **not** say how long a grant lasts or what it changes. At the pinned versions, `allow_always` is used for at least three different things: a session-scoped grant (codex-acp `allow_for_session`, `allow_permissions_session`, MCP `allow_session`; Hermes `allow_session`), a permanent grant (OpenCode `always`, Hermes and codex-acp MCP `allow_always`), and a **change to the harness's standing policy** (codex-acp `accept_execpolicy_amendment`, `apply_network_policy_amendment:<n>`). See the §3 permission row. Rules:
   - (a) **Default policy:** offer only `allow_once`-kind and `reject_once`-kind options. Treat every `allow_always`-kind and `reject_always`-kind option as a standing grant and filter it out, so that a phone approval never silently becomes a standing grant or block.
   - (b) **Never offer policy-changing options** in a remote or phone approval, whatever their kind. This covers codex-acp `accept_execpolicy_amendment` and `apply_network_policy_amendment:*` today. Policy changes to a harness go through Nexus admin configuration, with audit, not through an approval prompt.
   - (c) **Narrower scopes need an allowlist.** To show a scope such as "for this session", Nexus needs a per-harness option-id allowlist pinned to the adapter version (for example, codex-acp 2.6.0: `allow_for_session`; Hermes 0.23.1: `allow_session`). Nexus must not infer scope from `kind`, and an adapter upgrade must fail closed (fall back to rule (a)) until the allowlist has been re-checked for that version.
   - (d) **Unknown options are dropped.** An option whose kind is not in the ACP v1 enum, or whose id matches a policy-amendment pattern, is never shown.
   - (e) **Waiting on a phone approval.** Each harness fails closed differently. OpenCode rejects when the client has no `requestPermission`, when the request throws (for example, the ACP connection drops), or when the outcome is anything but `once`/`always`. It has no timeout, so the request waits as long as the connection lives. Hermes auto-denies after its `approvals.timeout`. Nexus must keep the ACP connection alive while an approval waits on a phone, and must surface the harness's own timeout (where there is one) in the approval UI. Fail-closed is correct, but it is a UX issue.
   - **G4 fixture (required):** a fake ACP agent that sends `session/request_permission` with (1) an `allow_always`-kind option whose id looks session-scoped (e.g. `allow_session`), (2) a policy-amendment option (`accept_execpolicy_amendment` and `apply_network_policy_amendment:0`, each with `allow_always` kind), (3) an `allow_once` and a `reject_once` option. Under default policy, Nexus must show only (3) and drop (1) and (2). With a codex-acp 2.6.0 allowlist that enables `allow_for_session`, Nexus must still drop (2). A test also checks that the selected option id sent back is exactly one of the ids the agent offered.
6. **Cost:** only Claude (via the SDK) and OpenCode send USD in `usage_update.cost`. Codex and Hermes send tokens only. Nexus needs its own per-model price table, labelled "estimate", for budget enforcement. Never trust agent-reported cost as a hard budget stop. Even Claude's figure is documented as a client-side estimate.
7. **Worktrees:** no harness exposes worktree creation over ACP. Nexus creates the per-job git worktree and OS account itself and passes it as `cwd`. Native `-w` flags are only for the CLI-PTY fallback.
8. **Safety:** the adapter's allowlist must block these modes and flags:
   - claude-agent-acp's `bypassPermissions` mode, and Claude's `--dangerously-skip-permissions` / `--allow-dangerously-skip-permissions`;
   - Codex's `danger-full-access` sandbox and `--dangerously-bypass-approvals-and-sandbox` [probe: help].

   The containment itself is enforced at OS/container level, not by prompt (`PAPERCLIP_AGENT_CONFIGURATION_V3.md`).
9. **Language (I-1):** all three JS adapters use `@agentclientprotocol/sdk` (TypeScript). Hermes uses the Python SDK. A TS agent manager can reuse the official SDK directly. This is evidence for NX2-007, not a decision.

### Licensing notes for the ledger

| # | Component | Note |
|---|---|---|
| L-1 | Codex CLI, codex-acp, OpenCode, Hermes Agent, ACP spec/SDK, ACP registry | Apache-2.0 or MIT. Fine to depend on. Record each in the license ledger. Nexus should **not bundle** harness binaries. Treat them as operator-installed, pinned dependencies like Teleport, so updates stay the operator's choice. |
| L-2 | Claude Code CLI and `@anthropic-ai/claude-agent-sdk` | **Proprietary.** claude-agent-acp's own code is Apache-2.0, but it pulls the proprietary SDK, which is likely why the ACP registry labels the entry "proprietary" [inferred]. Nexus must never redistribute it. The Claude harness is "bring your own Anthropic account" and cannot be part of a fully offline/OSS claim (`OSS_RESEARCH.md`). |
| L-3 | HAPI | AGPL. Not used here; no code reuse (unchanged rule). |

## 7. OS / arch compatibility declaration (per `CROSS_PLATFORM_PRODUCT_CONTRACT.md`)

| Claim | linux-x86_64 | linux-arm64 | macOS arm64 / x86_64 |
|---|---|---|---|
| OpenCode 1.19.5 ACP resume (zero-turn, cold restart) | **tested** (this run) | not tested | not tested |
| Codex 0.167.0 app-server lifecycle | **tested** (this run) | not tested | not tested |
| codex-acp, claude-agent-acp, Hermes ACP | not tested | not tested | not tested |

**Codex Linux sandbox prerequisite.** The Codex probe's stderr (both before and after the restart) says: "Codex could not find bubblewrap on PATH. Install bubblewrap with your OS package manager … Codex will use the bundled bubblewrap in the meantime" [probe; see https://developers.openai.com/codex/concepts/sandboxing#prerequisites]. The runner has no system `bwrap`. So on Linux, Codex expects a system `bwrap` for its sandbox. Whether Nexus makes `bubblewrap` a host prerequisite (a `Depends:`/`Requires:` in the `.deb`/`.rpm`, checked by the systemd unit's preflight) or deliberately accepts the bundled copy is a packaging decision for the systemd/`.deb`/`.rpm` work, and needs an ADR. Either way, the Codex sandbox is defence in depth only; containment stays at the OS-account/container level (§6 rule 8). Not checked: whether user-namespace or AppArmor restrictions on a given distro stop `bwrap` from working. macOS uses Seatbelt instead and was not tested.

No claim is made for any untested cell. SSH-only fallback: all four harnesses have a CLI that runs inside a remote `tmux` pane (§4). That is the degraded mode when ACP is unavailable on a host.

## 8. Open items and follow-ups

| # | Item | Needs |
|---|---|---|
| F-1 | Run `acp_probe.py` against `codex-acp@2.6.0`, `claude-agent-acp@0.103.0`, `hermes acp@v0.23.1`, and OpenCode 2.2.6 in a **local disposable container**. | A container runtime. The runner has no docker or podman, the same blocker EZF-7 hit. Proposed as a P04/G4 task, not done here. The container image must decide about system `bwrap` for Codex (§7) and record which choice was tested. |
| F-2 | Resume **after a real turn**, including permission prompts and `usage_update` cost, for each harness. | Test-only provider credentials with a spend cap, approved by the board. OpenCode's free zen models may allow an OpenCode run at USD 0; that needs confirmation and a policy check before use. |
| F-3 | macOS (launchd-supervised) run of F-1. | macOS test host. |
| F-4 | Re-check this matrix when ACP v2 leaves alpha. v2 drops `session/load` and `set_mode`, which changes rule 3. | Watch `schema-v2.*` releases. |

## 9. How to reproduce §5

```sh
# From the repo root, with the harness CLIs already on PATH (do not install on shared hosts).
python3 docs/research/harness-probes/acp_probe.py --out /tmp/opencode.json -- opencode acp
python3 docs/research/harness-probes/codex_app_server_probe.py --out /tmp/codex.json
# The same ACP probe works for any ACP agent, e.g.:
#   acp_probe.py --out x.json -- codex-acp
#   acp_probe.py --out x.json -- hermes acp
```

Committed raw output: `docs/research/harness-probes/results/2026-11-10/`. It contains both probe transcripts, `--help` captures for the three CLIs, the Codex app-server method list extracted from `codex app-server generate-json-schema`, global npm versions, and binary SHA-256 digests.

## 10. Sources (all fetched 2026-11-10, 10:01–10:20 UTC)

ACP:
- Spec repo and releases, tag `schema-v1.30.0` @ `759775f6`: https://github.com/agentclientprotocol/agent-client-protocol, https://api.github.com/repos/agentclientprotocol/agent-client-protocol/releases. Files: `schema/v1/meta.json`, `schema/v1/schema.json`, `schema/v1/schema.unstable.json`, `docs/rfds/updates.mdx`.
- Session setup docs: https://agentclientprotocol.com/protocol/v1/session-setup
- Registry @ `efdf6476`: https://github.com/agentclientprotocol/registry, https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json

Codex:
- https://github.com/openai/codex at `rust-v0.167.0` @ `086ccc83`: `codex-rs/cli/src/main.rs` (no `acp` subcommand), `codex-rs/app-server/README.md`, `codex-rs/app-server-protocol/src/protocol/common.rs`
- https://github.com/agentclientprotocol/codex-acp at `v2.6.0` @ `f3208913`: `src/CodexAcpServer.ts`, `src/permissions/CodexApprovalHandler.ts`, `src/permissions/options.ts`, `src/permissions/option-ids.ts`, `src/permissions/mcp.ts`, `src/CodexEventHandler.ts`, `src/CodexAuthMethod.ts`
- https://github.com/zed-industries/codex-acp (archived) at `v0.16.0` @ `bb590500`
- https://registry.npmjs.org/@openai/codex, https://registry.npmjs.org/@agentclientprotocol/codex-acp, https://registry.npmjs.org/@zed-industries/codex-acp

Claude Code:
- https://github.com/agentclientprotocol/claude-agent-acp at `v0.103.0` @ `a1d83c60`: `src/v1/acp-agent.ts`, `package.json`
- https://code.claude.com/docs/en/cli-reference.md, https://code.claude.com/docs/en/headless.md, https://code.claude.com/docs/en/agent-sdk/cost-tracking.md
- https://raw.githubusercontent.com/anthropics/claude-code/main/LICENSE.md
- https://registry.npmjs.org/@anthropic-ai/claude-code, https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk, https://registry.npmjs.org/@agentclientprotocol/claude-agent-acp, https://registry.npmjs.org/@zed-industries/claude-code-acp

OpenCode:
- https://github.com/anomalyco/opencode (redirect from sst/opencode) at `v1.19.5` @ `810c0eba` (`packages/opencode/src/acp/service.ts`, `agent.ts`, `src/acp/permission.ts`, `src/worktree/index.ts`) and `v2.2.6` @ `dc2ffcf8` (`packages/cli/src/acp/service.ts`, release notes)
- https://opencode.ai/docs/acp/
- https://registry.npmjs.org/opencode-ai, https://registry.npmjs.org/@opencode/cli

Hermes Agent:
- https://github.com/NousResearch/hermes-agent at `v0.23.1` @ `3b421578`: `acp_adapter/server.py`, `acp_adapter/permissions.py`, `acp_adapter/gateway_server.py`, `acp_adapter/entry.py`, `hermes_cli/_parser.py`, `pyproject.toml`, `website/docs/user-guide/features/acp.md`, `README.md`
- https://pypi.org/pypi/hermes-agent/json

Local black-box (this run): `opencode` 1.19.5, `codex-cli` 0.167.0, `claude` 2.1.322 on the Paperclip runner (Linux 5.15, x86_64). Transcripts in `harness-probes/results/2026-11-10/`.
