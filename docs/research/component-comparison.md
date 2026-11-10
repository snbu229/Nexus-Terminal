# Component comparison: Termix, Herdr, Happier, HAPI and alternative OSS platform components

- Issue: EZF-13 (NX3-106), epic E00 / M0 (P00). Also covers NX2-001 (Termix benchmark) and NX2-003 (Happier/HAPI cross-device agent control), which were folded in by kickoff rev 2.
- Author: A1 Nexus CTO / Research Architect. C1: A5 QA & Security. C2: A0 Nexus CEO.
- Date: 2026-11-10. Status: **DRAFT for review.** Every decision below is *proposed*. The ADRs are in `docs/adr/ADR-PROPOSED-*.md` (§9).
- Rev 2 (2026-11-10) addresses C1 review on head `b432e16`:
  - B1: Herdr finding D-1 and the restated adapter condition (§5), plus the P-3 cases.
  - B2: SeaweedFS hardening conditions (§7.3), plus the P-5 negative cases.
  - N1: Hermes tag schemes (§1.1).
  - N2: evidence JSON covers every §1 HEAD.
  - N3: acceptance gating (§8).
- Clean-room: the sources are public READMEs, public docs and GitHub API metadata only. HAPI is AGPL-3.0-only, so only its **documentation** was read, never its source. No code from any project was copied into this repo.

## 0. Read this first: what was and was not done

| Item | State |
|---|---|
| Upstream version, licence, activity and HEAD commit for every component | Done (§1). Fetched via the GitHub REST API on 2026-11-10. |
| Feature and behaviour research from public docs | Done (§2 to §7). Sources are in §10. |
| Termix design benchmark, 8+ comparisons (NX2-001) | Done (§3): 12 comparisons. |
| Happier/HAPI approval flow and mobile compatibility (NX2-003) | Done from docs (§4). **Not** black-box tested on a phone. |
| Build/adopt/reject decision per component | Done (§8). All decisions are proposed, pending C1/C2. |
| **Short prototypes** (ToolHive, S3 object lock, Herdr socket, outbox) | **NOT done.** The run host has no docker, podman or tmux, and the task forbids package installs on shared hosts. §11 is an executable lab plan (P-1 to P-6), not results. Decisions that depend on a prototype say so. |

Claims are marked **[doc]** (stated in a fetched README or doc page), **[api]** (GitHub API metadata), **[inferred]** (my reading, not verified) or **[unverified]** (needs a lab test).

This document makes **architecture** decisions (build, adopt, integrate, reference, reject). It does not replace the licence ledger (NX2-005, `docs/research/license-ledger.md` on PR #4, not merged yet). A ledger value of `adopt` only means "licence-compatible". Licence outcomes here match the ledger. Version discrepancies are listed in §1.1.

## 1. Upstream pins (observed 2026-11-10)

"Release" is the newest non-prerelease GitHub release. "HEAD" is the default-branch commit at fetch time. Both come from the GitHub REST API. Garage comes from its Forgejo API.

| Component | Repo | SPDX | Release (date) | HEAD (default branch) | Notes |
|---|---|---|---|---|---|
| Termix | Termix-SSH/Termix | Apache-2.0 | v26.11.1 (2026-11-09) | `4061229760e8` main | Plugins live in their own repos. The 7 checked are all Apache-2.0 **[api]** |
| Herdr | herdrdev/herdr | Apache-2.0 | v0.9.5 (2026-10-14) | `ee5bfb5041bb` master | Pre-1.0. Plan text said "check AGPL". The licence is Apache-2.0 **[api][doc]** |
| Happier | happier-dev/happier | MIT (`LICENCE`) | No stable tag. Prerelease tags only: `cli-v0.2.20-dev.9`, `server-v0.2.20-dev.7` (2026-11-09) | `7b37d65ca75e` dev | `apps/cli` and `apps/server` declare MIT. The other apps declare no licence field **[api]** |
| Happy (Happier's upstream) | slopus/happy | MIT | n/a | active 2026-11-10 | Reference only |
| HAPI | tiann/hapi | AGPL-3.0(-only per FAQ) | v0.34.5 (2026-11-10) | `1432a71bd106` main | **Behaviour reference only. No code reuse.** |
| Paperclip | paperclipai/paperclip | MIT | v2026.1106.0 (2026-11-06) | `37808f2a4ea1` master | |
| Hermes Agent | NousResearch/hermes-agent | MIT | v0.23.1 (2026-11-10) | `3dbee74d0e24` main | |
| OpenCode | anomalyco/opencode (moved from sst/opencode) | MIT | v2.2.7 (2026-11-10) | `8aa00e805e1b` dev | The API's `releases/latest` still returns v1.19.5. Use the release list instead |
| ACP spec | agentclientprotocol/agent-client-protocol (moved from zed-industries) | Apache-2.0 | v1.16.0 / `schema-v1.30.0` (2026-11-09) | `3961af94fa62` main | `schema-v2.0.0-alpha.14` is in prerelease **[api]** |
| MCP spec | modelcontextprotocol/modelcontextprotocol | Apache-2.0 AND MIT AND CC-BY-4.0 (relicensing in progress) | spec `2026-07-28` | `632a0c9a65c9` main | **[doc]** LICENSE preamble |
| ToolHive | stacklok/toolhive | Apache-2.0 | v0.63.0 (2026-11-06) | `b36d370ce446` main | Pre-1.0. Enterprise edition sold separately **[doc]** |
| Valkey | valkey-io/valkey | BSD-3-Clause | 9.1.3 (2026-10-26) | `7ec927fd1fa9` unstable | |
| Temporal | temporalio/temporal | MIT | v1.32.2 (2026-11-02) | `862b2db4c869` main | |
| Headscale | juanfont/headscale | BSD-3-Clause | v0.29.7 (2026-10-30) | `48416ce0894e` main | |
| SeaweedFS | seaweedfs/seaweedfs | Apache-2.0 | 4.53 (2026-11-08) | `3f5b07475dc3` master | |
| Versity S3 Gateway | versity/versitygw | Apache-2.0 | v1.11.0 (2026-11-06) | `5cf674f79f2f` main | |
| RustFS | rustfs/rustfs | Apache-2.0 | 1.0.4 (2026-10-25) | `3a2312210447` main | |
| Garage | Deuxfleurs/garage (git.deuxfleurs.fr) | AGPL-3.0 | v2.5.0 (2026-10-24) | branch `main-v2`, updated 2026-11-07 | LICENSE header checked |
| MinIO | minio/minio | AGPL-3.0 | RELEASE.2025-10-15T17-29-55Z | `7aac2a2c5b7c`, **archived** | Excluded by the licence rules |
| Ceph | ceph/ceph | NOASSERTION (LGPL mix per ledger) | n/a | `3c026fd31d6c` main | |
| tmux | tmux/tmux | ISC | 3.8 (2026-09-09) | `399d53b1579d` master | |
| Zellij | zellij-org/zellij | MIT | v0.45.1 (2026-08-28) | `7e2425ef4b5d` main | |
| xterm.js | xtermjs/xterm.js | MIT | 6.0.0 (2025-12-22) | `f70764dd3da0` master | |
| ntfy | binwiederhier/ntfy | Apache-2.0 (dual GPL-2.0, ledger F9) | v2.37.2 (2026-11-04) | `59f9931f0f36` main | |
| Gotify | gotify/server | MIT (LICENSE file; API says NOASSERTION) | v3.1.1 (2026-09-15) | `01086b95a8b6` master | |

### 1.1 Discrepancies with the licence ledger (for NX2-005, not fixed here)

| Component | Ledger (PR #4) | Observed here | Action |
|---|---|---|---|
| Hermes Agent | `v2026.9.24` | The ledger pin is **valid**: `v2026.9.24` is a non-prerelease GitHub release (commit `f97608f178d1`, 2026-09-24). The repo also publishes a second scheme, `v0.x`, and `v0.23.1` (commit `3b4215785882`, 2026-11-10) is newer by publish date **[api]** | Not a wrong pin. The NX2-005 owner should decide **which tag scheme to pin** and record it. Evidence: `hermes_tag_schemes` in the evidence JSON |
| All rows | pinned commits from an earlier run | HEADs have moved (HAPI moved twice on 2026-11-10) | This is expected (ledger F11). Pin by tag at adoption time |

Licence outcomes agree with the ledger in every row. HAPI and MinIO are `reject`. Garage and Ceph are `external-service-only`.

## 2. Products at a glance

| | Termix | Herdr | Happier | HAPI |
|---|---|---|---|---|
| What it is | Self-hosted server-management platform built on plugins ("free, self-hosted Termius") **[doc]** | Terminal multiplexer for coding agents, single Rust binary **[doc]** | Multi-device control room for coding agents with an E2EE relay **[doc]** | Remote control of local agent sessions through a self-run hub **[doc]** |
| Stack | Node/Express, `ssh2`, `node-pty`, Electron, drizzle (SQLite default; Postgres and MySQL also supported) **[api: package.json, README]** | Rust. Server/client, Unix socket API **[doc]** | TS monorepo. Server: Fastify, Prisma (Postgres) or PGlite, ioredis, socket.io, `minio` JS client, tweetnacl **[api: apps/server/package.json]** | Bun. Hub with SQLite, Socket.IO to CLI, REST and SSE to clients **[doc]** |
| Persistence model | Server-side host/credential DB; SSH sessions via plugin | A background server keeps PTYs alive across detach. A restart restores the layout and native agent sessions; **processes do not survive** **[doc]** | A daemon on each machine manages agent processes. The relay syncs encrypted session content **[doc]** | CLI wraps the agent. The hub stores sessions and messages in SQLite **[doc]** |
| Identity | Local accounts, sessions, trusted devices, API keys, audit log. TOTP, passkeys and OIDC/GitHub/Google SSO via plugins **[doc]** | None of its own. It relies on the OS user and OpenSSH **[doc]** | Account per user. Session sharing (view, edit, public read-only link) **[doc]** | **One shared 256-bit `CLI_API_TOKEN`** for the CLI, web, native apps and Telegram. Namespaces are a `:suffix` on the token **[doc]** |
| Clients | Web/PWA, Electron (Win/Linux/macOS 12+), iOS 15.1+, Android 7+ **[doc]** | Native TUI in any terminal | iOS, Android, desktop, web, CLI **[doc]** | Web/PWA (free), native iOS/Android (paid), Telegram Mini App **[doc]** |
| Licence | Apache-2.0 | Apache-2.0 | MIT | AGPL-3.0-only |
| Proposed decision | **Benchmark only.** Reject as base (§3) | **Integrate later** as an optional session provider. tmux is the default (§5) | **Reference**, optional integration deferred (§4) | **Behaviour reference only** (§4) |

## 3. Termix benchmark: 12 design comparisons (NX2-001)

Termix is the closest open-source analogue to the Nexus host and terminal plane. It is Apache-2.0, so ideas and even code are reusable with NOTICE. It is still not a suitable base, because its trust model differs from the Nexus V3 contract in comparisons 1, 3 and 4 below.

| # | Design area | Termix (evidence) | Nexus requirement (spec) | Verdict |
|---|---|---|---|---|
| 1 | Core vs plugin boundary | The core holds hosts, credentials, users, sharing and sessions. **The SSH terminal itself is a plugin**, and admins can remove it **[doc]** | The terminal, session registry, approval and policy engine are security boundaries (ARCHITECTURE layers, SECURITY_GATES_V3) | **Differ.** Security-critical paths stay in Nexus core. Only optional features (Docker view, metrics, remote desktop) may be plugins |
| 2 | Plugin distribution | Each plugin has its own repo. Admins install, update or remove them from a Plugins tab. A default image and a `-full` image add 54 more plugins **[doc]**. The README makes no claim about plugin signing or provenance **[unverified]** | Signed manifest, declared permissions, digest checks, install state machine (EZF-69 marketplace) | **Adopt the UX** (one Plugins tab, per-plugin repos). **Require** signatures and permission manifests, which Termix does not document |
| 3 | Credential storage | Passwords and keys are stored server-side, encrypted per user. The DB can be encrypted on disk. Host defaults apply per server, user or folder **[doc]** | No long-lived private keys in Postgres. Short-lived SSH certs from the access provider. Nexus stores only credential *references* (ARCHITECTURE; EZF-7) | **Reject** the stored-key model for production hosts. A "credential reference" vocabulary is fine |
| 4 | Sharing and roles | Hosts, credentials and folders are shared with users or roles at four levels: connect, view, edit, manage **[doc]** | Authorize user × role × host label × action × risk. Holding GitHub repo access never means SSH authorization | **Adopt** the four-level UI vocabulary. Enforcement comes from the access provider and the Nexus policy engine, not ACLs on stored keys |
| 5 | Approvals | The Operations Center plugin can "run, roll out, approve and track every plugin action across your hosts" **[doc]** | Approval bound to an immutable plan hash. No self-approval. Two humans for production. Never accept a caller-supplied `approved: true` | **Benchmark the UX** (per-host page plus cross-host tables). The binding semantics must be Nexus-built. Termix's approval semantics were not inspected **[unverified]** |
| 6 | Terminal persistence | The SSH Terminal plugin offers tabs, split screen, history and macros **[doc]**. Whether sessions survive a server restart was not tested **[unverified]** | The remote PTY lives in `tmux`. A WebSocket is only an attachment. The logical session ID is not the socket ID (SESSION_PERSISTENCE) | **Differ.** Nexus keeps the remote tmux model. Test Termix's behaviour as a benchmark in P-6 |
| 7 | Clients | Web/PWA, Electron desktop, iOS and Android apps. The desktop "can link to a Termix server to keep an offline copy of your account" **[doc]** | Web/PWA first. Native desktop in R3 (I-4/D6) | **Reject** offline copies of account secrets on endpoints. Treat as a benchmark for desktop parity later |
| 8 | Tunnels and networking | Auto-reconnecting SSH port forwarding, plus "WireGuard gateways that publish private services" **[doc]** | No blind public port forwarding. Overlay (Headscale) or outbound mTLS connector with scoped routes (ARCHITECTURE §B) | **Differ.** Publishing services is out of scope. Overlay decision in §7.5 |
| 9 | Telemetry | The Usage Statistics plugin ships in the **default image** and sends an anonymous daily report **[doc]** | No sending of terminal contents. Privacy by default | **Nexus default: no telemetry.** Any metrics must be opt-in and documented |
| 10 | Multi-host commands | Snippets run on many hosts "in one click" **[doc]** | Warp-style editor. Multi-host or risky commands need a plan and approval | **Adopt** snippets as editor input. Multi-host execution goes through the plan → approval → execute path |
| 11 | Storage | SQLite by default, plus Postgres and MySQL via drizzle **[doc][api]** | Postgres is the durable store. Valkey is ephemeral only | **Differ.** Single DB engine for Nexus |
| 12 | Remote desktop | RDP, VNC, ARD, RustDesk and Telnet in the browser, with recording **[doc]** | Optional desktop access (Guacamole) behind a separate security boundary. Not in R1 | **Defer.** Benchmark for R3 |

**Decision (ADR-PROPOSED-termix-benchmark-not-base):** do not fork or embed Termix. Use it as the UX and feature benchmark. Apache-2.0 code reuse is *allowed* but not planned. Any reuse needs a ledger row, NOTICE and C1 review. Clean-room rules still apply to Termix's branding and assets.

## 4. Cross-device agent control: Happier and HAPI (NX2-003)

### 4.1 Approval flow

| Step | HAPI (docs only, AGPL) | Happier (docs) | Nexus requirement |
|---|---|---|---|
| Request origin | The agent asks for tool permission. The CLI forwards it to the hub over Socket.IO **[doc]** | Permission requests and agent questions collect in an "attention center" across sessions and machines **[doc]** | An ACP `session/request_permission` (or CLI equivalent) becomes a `pending_prompts` row tied to the agent run, host and worktree |
| Storage | Hub SQLite **[doc]** | Relay stores content E2E-encrypted. The server sees only routing metadata **[doc]** | Postgres `approvals`, bound to the plan hash, the requester and the risk class |
| Notify | SSE plus configured notifications (Telegram, FCM/APNs push) **[doc]** | A push notification opens the exact session that asked **[doc]** | ntfy/Gotify/Web Push with **no sensitive content** in the payload (NOTIFICATIONS.md). The payload never carries an executable action |
| Approver authentication | **Any holder of the shared `CLI_API_TOKEN`** (web login, native pairing, Telegram binding) **[doc]** | Signed-in account on the device **[doc]**. MFA was not checked **[unverified]** | SSO plus MFA. Production approvals need re-authentication (step-up) |
| Decision binding | The hub relays approve or deny to the CLI **[doc]**. No mention of nonce or plan binding **[unverified]** | Not documented **[unverified]** | The decision is bound to `(approval_id, plan_hash, nonce)`. Replay is rejected. No self-approval |
| Multiple approvers | Not documented | Not documented | Two distinct humans for production (EZF-7 §3) |
| Voice approvals | "Approve permissions by voice" **[doc]** | The voice assistant "answers permission requests for you" **[doc]** | **Reject** for anything above low risk. An LLM voice agent approving on the user's behalf is an approval bypass |
| Audit | Not described | Not described | Every decision goes to `audit_events` through the outbox (§7.4) |

**Security findings from the docs (for the threat model, NX2-008):**

- **H-1 (HAPI):** one bearer token authenticates *every* client type. Anyone who has it can approve any tool call. Nexus must use per-user identity and per-device sessions. **[doc]**
- **H-2 (HAPI):** namespaces are the shared base token plus `:<name>`. Every namespace user must know the base token, so any of them can reach any namespace by changing the suffix. That is isolation, not authorization. **[inferred]** from namespace.md
- **H-3 (HAPI):** MCP peer tools (`spawn_peer`, `ping_peer`) let an agent create or wake other agent sessions on the hub. They are on by default and only disabled by `HAPI_DISABLE_PEER_TOOLS=1` **[doc]**. Nexus rule: agents never spawn agents outside their run scope without policy. Herdr has the same class of issue: see D-1 in §5.
- **P-1 (Happier):** "account pools" switch sessions between several model-provider accounts when one hits a usage limit **[doc]**. This may conflict with provider terms **[inferred]**. Nexus will not implement it.
- **P-2 (Happier):** E2EE means the relay **cannot** read approvals or tool calls **[doc]**. Nexus policy, audit and plan binding need server-side visibility of the plan and the decision. E2EE of transcripts is compatible. E2EE of approvals is not. **[inferred]**
- **P-3 (Happier):** a public read-only session link exists **[doc]**. Nexus default: no public links. Sharing goes through RBAC.

### 4.2 Mobile compatibility

| | HAPI | Happier | Nexus R1 (proposed) |
|---|---|---|---|
| Web/PWA | Yes, free, with push **[doc]** | Web app **[doc]** | **PWA first** (PRODUCT R1) |
| Native iOS/Android | Paid store apps. SwiftUI and Kotlin Compose. Terminal and voice stay web-only **[doc]** | Store apps plus a direct APK **[doc]** | None in R1. Store apps need signing accounts, which are a board/budget decision |
| Push transport | FCM/APNs with a "native push contract" **[doc]** | Push that deep-links to the session **[doc]** | ntfy (self-host). iOS Web Push needs the PWA installed to the home screen, iOS 16.4+ **[inferred]**. Lab test P-4 |
| Remote terminal on phone | Web only **[doc]** | Embedded terminal **[doc]** | xterm.js in the PWA. Approvals must work without the terminal |

**Decision (ADR-PROPOSED-cross-device-agent-control):** **build** the Nexus approval inbox and agent session view natively on ACP plus the Nexus policy engine. Use Happier (MIT) as the primary UX reference. It is the best-documented multi-machine and mobile design. A Happier *integration* (Happier as an optional agent-session front end for personal, non-production use) is **deferred** to R2. HAPI is **behaviour reference only**. Neither project's identity or approval model satisfies Nexus V3 (findings H-1, H-2, P-2).

## 5. Terminal and agent session layer: Herdr vs tmux

| | tmux 3.8 | Herdr 0.9.5 |
|---|---|---|
| Licence | ISC | Apache-2.0 |
| Distribution | In every target distro and Homebrew **[inferred]** | `curl \| sh`, Homebrew, mise, GitHub binaries **[doc]** |
| Survives client detach / SSH drop | Yes | Yes **[doc]** |
| Survives server restart | No | No. The layout and *native agent sessions* are restored, but the original processes are gone **[doc]** |
| Agent awareness | None | Each pane is marked working, blocked or idle. `agent wait --until done` **[doc]** |
| Control API | `tmux` CLI and control mode | Unix socket API with a bundled JSON Schema (`herdr api schema --json`). It covers workspaces, tabs, panes, `pane.send_input`, events and worktrees **[doc]** |
| Multi-machine | n/a (Nexus handles hosts) | Saved SSH machines. "Interactive setup can install or update the complete remote package after confirmation" **[doc]** |
| Hosts | Linux, macOS | Linux and macOS servers on x86_64/aarch64. Windows server on x86_64 **[doc]** |
| Shutdown | n/a | On Linux with systemd-logind it delays shutdown briefly to snapshot **[doc]** |

**Decision (ADR-PROPOSED-session-persistence-tmux-default-herdr-optional):**

- **tmux stays the default** PTY backend on Linux and macOS hosts. It is mature, packaged by distros, has a stable surface and satisfies the identity invariants in ARCHITECTURE.
- **Herdr is a candidate optional `SessionProvider` adapter** (R2) because of its agent-state detection. Nexus could consume "blocked" as a `pending_prompts` signal.
- Conditions: (a) Nexus must **disable Herdr's remote self-install**. Installs go only through the signed install plan. (b) **Agent isolation from the Herdr socket** (see D-1 below). Nexus-launched agents run under a **separate UID** from the Herdr server, and that UID has no access to the Herdr socket or config directory. Stripping `HERDR_*` from the environment is defence in depth only, because it does not close the gap on its own. If the agent-UID split cannot be met on a host, Nexus agents **never run inside Herdr-managed panes** on that host, and tmux is used for them. Both variants need lab test P-3 **[unverified]**. (c) Pin by tag. It is pre-1.0 and its API may change.
- Zellij stays deferred (as in OSS_RESEARCH).

**Security finding (for the threat model, NX2-008), added after C1 review:**

- **D-1 (Herdr):** every process in a Herdr pane can control every other pane under the same UID, by default.
  - Herdr "injects `HERDR_SOCKET_PATH`, `HERDR_ENV=1`, `HERDR_WORKSPACE_ID`, `HERDR_TAB_ID`, and `HERDR_PANE_ID` into managed pane processes" **[doc: socket-api]**.
  - The README calls Herdr "agent-native: agents drive herdr through the cli and socket api: they can spawn panes, prompt each other" **[doc]**.
  - So an agent in a pane can call `pane.send_input` on, or spawn, any sibling pane, including a human's shell.
  - The socket also lives at a fixed default path, `~/.config/herdr/herdr.sock`, which any same-UID process can find without the env variable **[doc: socket-api, "Socket paths"]**. This is why stripping `HERDR_*` is not enough on its own.
  - The socket-api page documents no per-pane scoping, per-caller authentication or option to turn off injection **[doc, absence; re-check at adoption]**.
  - This is the same cross-session control class as HAPI H-3 (§4.1). Nexus rule: an agent must not be able to send input to a session outside its run scope.

## 6. Agent harness and governance components

| Component | Pin | Decision | Reason |
|---|---|---|---|
| ACP | v1.16.0 / schema 1.30.0 | **Adopt** as the first-class agent protocol | Spec decision already made. **New risk:** `schema-v2.0.0-alpha.14` is in prerelease **[api]**. The broker must negotiate the version and pin v1 until v2 is stable |
| MCP | spec 2026-07-28 | **Adopt** spec. Gateway decision in §7.1 | |
| OpenCode | v2.2.7 (`anomalyco/opencode`) | **Adopt** as the first OSS harness (spec) | The repo moved from `sst/opencode`. Update all references and pin the new org |
| Hermes Agent | v0.23.1 | **Integrate (optional adapter, R2)** | MIT. Re-check auth adapters at adoption |
| Paperclip | v2026.1106.0 | **Use to build Nexus.** Optional external connector deferred | It is not a terminal daemon (spec) |

## 7. Infrastructure components

### 7.1 MCP gateway: ToolHive vs custom

| Criterion | ToolHive v0.63.0 | Custom Nexus gateway |
|---|---|---|
| Isolation | Runs each MCP server in a container with a minimal permission file **[doc]** | None by itself. It would need a separate sandbox |
| Runtime dependency | Docker or Podman locally, or Kubernetes with its operator **[doc]** | None beyond Nexus |
| AuthZ | Cedar policies, default-deny, checked per request "when configured with an authentication source". OIDC/OAuth **[doc]**. RBAC-to-Cedar compilation is **Enterprise-only** **[doc]** | Nexus policy engine, the same PDP as every other mutating action |
| Approval binding to a plan hash | Not documented **[unverified]** | Native |
| Audit | OTel, Prometheus, audit logs **[doc]** | Nexus `audit_events` via outbox |
| Maturity | Pre-1.0, fast release cadence **[api]** | Ours to build and maintain |

**Analysis.** The MCP gateway must enforce per-agent scope tokens, approval binding and "no agent may change its own policy" (MASTER §7). Running ToolHive as the *gateway* would create a **second policy engine** (Cedar) next to the Nexus one, so there would be two sources of truth for authorization. It also adds a container-runtime dependency to the control plane, which conflicts with the V3.1 rule that the API must not rely on a host-only `docker.sock`. ToolHive's real strength is **container isolation of untrusted third-party MCP servers**, which Nexus would otherwise have to build.

**Decision (ADR-PROPOSED-mcp-gateway-build-toolhive-runtime-deferred):** **build** a thin Nexus MCP gateway as the policy enforcement point (authn, scope tokens, tool allowlist, approval binding, audit). **Defer** ToolHive as an *optional isolation runtime* for third-party MCP servers on Linux runners that already have a container runtime. NX2-072 owns that evaluation and prototype P-1. The decision flips if P-1 shows ToolHive can delegate authorization to an external PDP and the integration takes less code than our sandbox.

### 7.2 Ephemeral cache and pub/sub: Valkey

- Valkey 9.1.3, BSD-3-Clause **[api]**. Redis is rejected because of its RSALv2/SSPL/AGPL tri-licence (ledger). Valkey speaks the Redis protocol, so standard clients work **[inferred]**. The client library choice needs its own ledger row.
- **Decision (ADR-PROPOSED-valkey-ephemeral-only):** **adopt** Valkey for pub/sub fan-out, rate limits, short-lived attach-token nonces and caches. **Nothing durable lives in Valkey.** Approvals, sessions and audit stay in Postgres. Losing Valkey must lose no committed state. ARCHITECTURE's "Redis" wording should be corrected to Valkey.

### 7.3 S3-compatible store (replacing MinIO)

| | SeaweedFS 4.53 | Versity S3 Gateway v1.11.0 | RustFS 1.0.4 | Garage v2.5.0 | Ceph RGW |
|---|---|---|---|---|---|
| Licence | Apache-2.0 | Apache-2.0 | Apache-2.0 | **AGPL-3.0** | LGPL mix |
| Ledger | adopt | adopt | adopt | external-service-only | external-service-only |
| Single node | `weed mini`, "fine for single-node production" **[doc]** | Gateway over a POSIX directory **[doc]** | Single-node mode **[doc]** | Yes **[inferred]** | Heavy **[inferred]** |
| Object Lock / WORM | Yes, with retention and legal hold **[doc]** | Not checked **[unverified]** | Yes **[doc]** | n/a | n/a |
| Versioning | Yes **[doc]** | Yes (`--versioning-dir`) **[doc]** | Yes **[doc]** | | |
| Maturity signal | Long-lived project. Helm chart and multi-node guide **[doc]** | "Battle-tested and production-ready", by the vendor's own claim **[doc]** | Reached 1.0 recently **[api]**. Production KMS needs Vault or AWS KMS **[doc]** | | |

**Decision (ADR-PROPOSED-object-store-seaweedfs-default):** Nexus code talks **only the generic S3 API**, so operators may bring any S3 endpoint, including AWS S3, Garage or Ceph run as separate services. The **bundled default for the Compose pilot is SeaweedFS** (`weed mini`), because Object Lock lets audit archives be WORM. **Fallback:** Versity S3 Gateway, the simplest option, if P-5 shows SeaweedFS is too heavy for the pilot or Object Lock is not needed. **Defer** RustFS and re-evaluate after six more months of releases. **Reject** MinIO. Garage and Ceph are **external-service-only** and never bundled.

**Hardening conditions for the bundled default (added after C1 review).** The store holds WORM audit archives, so it gets the same treatment as Valkey (internal bind, auth required). The SeaweedFS README at `3f5b07475dc3` documents the exposure points these conditions close:

- "Drop the AWS keys to run without authentication for development" **[doc]**. The S3 endpoint is unauthenticated unless credentials are configured.
- Without `WEED_ADMIN_PASSWORD` or `https.admin` mTLS, `weed mini` binds the Admin UI/API and the worker gRPC control plane to loopback. "`-admin.allowInsecureBind` restores the legacy unauthenticated network bind" **[doc]**.
- "The same process also runs the master, a volume server, the filer, WebDAV, the Iceberg REST catalog, and the Admin UI" **[doc]**. Each of these is a listener.

Conditions for the bundled default to ship:

1. **S3 credentials are always required.** Anonymous S3 access is off.
2. **The Nexus service account is not an admin.** It may write objects and read audit objects. It has no `BypassGovernanceRetention`, no bucket-policy or Object Lock configuration rights, and no Admin UI/API access. The quick-start `admin` identity is not used at runtime.
3. **Admin auth is required.** Use `WEED_ADMIN_PASSWORD` or, preferably, `https.admin` mTLS. **`-admin.allowInsecureBind` is never used.** Remote workers (multi-node only) use `grpc.admin` mTLS.
4. **Internal network only.** Every listener (S3, master, volume, filer, WebDAV, Iceberg, Admin) binds to the Compose internal network or loopback. No host-published ports except through the Nexus API. Listeners Nexus does not use (WebDAV, Iceberg) are disabled if `weed mini` supports it; otherwise they are firewalled **[unverified]**.
5. **The audit bucket uses Object Lock in compliance mode** with a fixed default retention, set at bucket creation.
6. **WORM must hold below the S3 layer too.** The filer and volume HTTP APIs could delete or overwrite chunks without going through S3 Object Lock **[inferred]**. They must be unreachable from anything except the SeaweedFS process itself. P-5 tests this.

### 7.4 Workflow durability: Temporal vs DB outbox (resolves plan I-2)

| | Postgres transactional outbox | Temporal v1.32.2 |
|---|---|---|
| New services | None | Temporal server (frontend, history, matching, worker services **[inferred]**) plus persistence and visibility schemas. Postgres 12+, MySQL 8.0.17+ or SQLite are supported for visibility. OpenSearch is "recommended for any setup that spawns more than a few Workflow Executions" **[doc]** |
| Long waits (approval, timers) | State machine rows plus a `due_at` scanner | Native signals and durable timers |
| Retries and idempotency | Our code: idempotency keys, `FOR UPDATE SKIP LOCKED` workers, dead letters (NOTIFICATIONS.md already specifies this) | Native |
| Ops burden for a USD 300/month company | Low | Medium to high **[inferred]** |
| Lock-in | None | SDK programming model |

**Decision (ADR-PROPOSED-workflow-db-outbox-r1):** **build** on the Postgres outbox for R1 (NX2-016 already owns the outbox). Write side-effecting steps as **idempotent activities behind an interface**, so a later Temporal migration rewrites orchestration, not activities. Revisit Temporal when any trigger fires: (a) more than 3 workflow types need multi-step compensation, (b) the timer scanner misses its SLO in the soak test, or (c) a human-in-the-loop flow needs more than 2 chained waits. Retitle NX2-054 ("via Temporal") as the plan proposed.

### 7.5 Overlay network: Headscale

- Headscale v0.29.7, BSD-3-Clause. It implements a **single tailnet**, aimed at self-hosters and small organisations **[doc]**. Supported: OIDC registration, ACLs and grants, subnet routers, exit nodes, embedded DERP and **Tailscale SSH** **[doc]**. Limitation: **"OIDC groups cannot be used in ACLs"** **[doc]**. The maintainers "do not support nor encourage the use of reverse proxies and container to run Headscale" **[doc]**.
- Clients are Tailscale clients. Headscale lists support on Linux, macOS, iOS, Android and Windows **[doc]**. Its README says the GUI clients for macOS, Windows and iOS are not open source **[doc]**. On macOS hosts, the open-source `tailscaled` CLI build would be needed to avoid a proprietary dependency **[inferred]**. It needs a ledger row and test P-6.
- **Decision (ADR-PROPOSED-headscale-optional-overlay):** **integrate as an optional, operator-run** overlay for network placement B. It is not bundled in the Nexus Compose stack, which matches the maintainers' guidance against containers. Nexus treats the overlay address as just another `host_route`. **Tailscale SSH must be disabled by policy**, because it would bypass Teleport/Nexus SSH authorization and audit. P-6 adds a negative test for that. The Nexus outbound mTLS connector remains the first-party path for NAT'd hosts. Group-to-role mapping stays in the access provider, never in Headscale ACLs.

## 8. Decision summary

| Component | Decision | ADR | Blocking prototype |
|---|---|---|---|
| Termix | **Reject as base. Benchmark only** | termix-benchmark-not-base | none |
| Herdr | **Integrate (optional SessionProvider, R2)** | session-persistence-tmux-default-herdr-optional | P-3 |
| tmux | **Adopt** (default PTY backend) | same | none |
| Zellij | Defer | same | none |
| Happier | **Reference. Optional integration deferred to R2** | cross-device-agent-control | P-4 (UX benchmark) |
| HAPI | **Reject (code). Behaviour reference only** | cross-device-agent-control | none |
| Nexus approval inbox and agent view | **Build** | cross-device-agent-control | P-4 |
| ACP / MCP specs | **Adopt** (pin ACP v1, negotiate) | (NX2-007 owns protocol ADRs) | none |
| OpenCode | **Adopt** (first OSS harness) | (NX2-007) | none |
| Hermes Agent | Integrate (optional, R2) | (NX2-007) | none |
| Paperclip | Use for building only | n/a | none |
| MCP gateway | **Build** (thin PEP) | mcp-gateway-build-toolhive-runtime-deferred | P-1 |
| ToolHive | **Defer** (optional isolation runtime, NX2-072) | same | P-1 |
| Valkey | **Adopt** (ephemeral only) | valkey-ephemeral-only | P-2 |
| Redis | Reject | ledger | none |
| SeaweedFS | **Adopt** (bundled default S3) | object-store-seaweedfs-default | P-5 |
| Versity S3 Gateway | Fallback | same | P-5 |
| RustFS | Defer | same | none |
| Garage, Ceph | External-service-only | same | none |
| MinIO | Reject | same | none |
| Postgres outbox | **Build** (R1) | workflow-db-outbox-r1 | P-2 |
| Temporal | **Defer** (explicit triggers) | same | none |
| Headscale | **Integrate (optional, operator-run)** | headscale-optional-overlay | P-6 |

**Acceptance gating.** If an ADR's decision depends on a blocking prototype, the ADR stays **Proposed** until that prototype's lab results (image digests, commands, raw output) are attached to its issue, even after C1/C2 approve this research. This covers the MCP gateway (only the ToolHive flip condition, P-1), Herdr (P-3), SeaweedFS (P-5) and Headscale (P-6). P-2 and P-4 confirm the Valkey, outbox and inbox decisions. They do not gate them.

## 9. ADRs written for this issue

All are in `docs/adr/` with status **Proposed**. They follow the existing `ADR-PROPOSED-<slug>.md` convention. NX2-007 owns protocol-level ADRs (deployment, network, session, plugin and agent protocols) and may supersede the session and overlay ADRs here.

1. `ADR-PROPOSED-termix-benchmark-not-base.md`
2. `ADR-PROPOSED-session-persistence-tmux-default-herdr-optional.md`
3. `ADR-PROPOSED-cross-device-agent-control.md`
4. `ADR-PROPOSED-mcp-gateway-build-toolhive-runtime-deferred.md`
5. `ADR-PROPOSED-valkey-ephemeral-only.md`
6. `ADR-PROPOSED-object-store-seaweedfs-default.md`
7. `ADR-PROPOSED-workflow-db-outbox-r1.md`
8. `ADR-PROPOSED-headscale-optional-overlay.md`

## 10. Sources (all fetched 2026-11-10)

GitHub REST API (`repos/{repo}`, `releases`, `commits/{default_branch}`) for every row in §1. The raw metadata with full 40-character SHAs is in `docs/research/component-comparison-evidence.json`. READMEs at the HEAD commits listed there:

- Termix: <https://github.com/Termix-SSH/Termix> README and `package.json` @ `4061229760e8`. Plugin repos `Termix-SSH/Plugin-{SSH-Terminal,Operations-Center,SSO,Telemetry,File-Manager,Tunnels,Remote-Desktop}` (licence API).
- Herdr: <https://github.com/herdrdev/herdr> README @ `ee5bfb5041bb`. <https://herdr.dev/docs/socket-api/>, <https://herdr.dev/docs/session-state/>, <https://herdr.dev/docs/persistence-remote/>, <https://herdr.dev/docs/connecting-machines/>.
- Happier: <https://github.com/happier-dev/happier> README, `LICENCE`, `apps/*/package.json` @ `7b37d65ca75e`. <https://github.com/slopus/happy> (licence API).
- HAPI (docs only): <https://github.com/tiann/hapi> README; `docs/guide/how-it-works.md`, `why-hapi.md`, `namespace.md`, `faq.md` on `main` (~`1432a71bd106`).
- ToolHive: <https://github.com/stacklok/toolhive> README @ `b36d370ce446`; <https://docs.stacklok.com/toolhive/concepts/cedar-policies>.
- Headscale: <https://github.com/juanfont/headscale> README @ `48416ce0894e`; <https://headscale.net/stable/about/features/>; <https://headscale.net/stable/about/clients/>.
- Temporal: <https://docs.temporal.io/self-hosted-guide/visibility>.
- S3 stores: READMEs of seaweedfs @ `3f5b07475dc3`, versitygw @ `5cf674f79f2f`, rustfs @ `3a2312210447`; Garage `LICENSE` and README at <https://git.deuxfleurs.fr/Deuxfleurs/garage> branch `main-v2`.
- MCP licence preamble: <https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/LICENSE> @ `632a0c9a65c9`.
- Licence ledger cross-check: branch `EZF-5-nx2-005-create-complete-license-and-dependency-compatibility-ledger`, `docs/research/license-ledger.md` (PR #4, unmerged).

The doc fetcher strips HTML locally. Quotes are verbatim from the fetched text, but C1 should re-read them on the live pages, because these projects release several times a week.

## 11. Prototype and lab plan (not executed; needs a lab issue)

Run in disposable local containers only. Every test records the image digest, the command and raw output.

| ID | Question | Method | Pass criterion |
|---|---|---|---|
| P-1 | Can ToolHive delegate authZ to an external PDP and isolate a third-party MCP server with less code than our sandbox? | `thv run` a fixture MCP server; call it through a Nexus gateway stub with a deny-by-default token. Try to reach the host network and filesystem from the server | Container escape attempts fail. External PDP hook exists or does not (record which). LoC estimate for both paths |
| P-2 | Outbox and Valkey loss | Postgres plus Valkey Compose. Enqueue 10k outbox rows, kill Valkey and a worker mid-run | Zero lost or duplicated side effects (idempotency key check). No committed state lost |
| P-3 | Herdr socket privilege (D-1) | Run Herdr as user A. (i) Try the socket API from user B and from a container sharing `/tmp`. (ii) **Same-UID pane:** from a process in pane 1, call `pane.send_input` and spawn against sibling pane 2, first with the injected `HERDR_SOCKET_PATH` and then with `HERDR_*` stripped, using the default `~/.config/herdr/herdr.sock`. (iii) **Adapter layout:** launch a fixture agent in a pane under agent UID C, as the adapter would. Repeat (ii) from C | (i) B is refused. (ii) Record the result. Success here is expected and confirms D-1. (iii) C cannot connect to the socket or read the Herdr config directory, so `send_input` to pane 2 fails. Record socket mode, owner and directory modes. If (iii) fails, the fallback applies: no Nexus agents in Herdr panes |
| P-4 | Mobile approval UX benchmark | Self-host a Happier relay in a container. Approve a fixture permission from a test phone. Repeat with the Nexus PWA stub and ntfy | Time to approve, payload contents (no secrets), deep-link correctness. iOS PWA push behaviour recorded |
| P-5 | S3 Object Lock and store hardening | `weed mini` and versitygw, configured per the §7.3 hardening conditions. (i) Create a bucket with Object Lock in compliance mode. Try to delete or overwrite inside retention, as the Nexus service account and as the admin identity, including with `x-amz-bypass-governance-retention`. (ii) **Negative:** call the Admin UI/API with no credentials, from loopback and from another container on the network. (iii) **Negative:** call S3 with no credentials. (iv) **Negative:** from another container, reach the filer, volume, master and WebDAV ports and try to delete a locked object's file through the filer HTTP API | (i) Delete and overwrite are denied for both identities. (ii) Unauthenticated admin requests are refused, or the port is unreachable. (iii) Anonymous S3 is refused. (iv) Internal ports are unreachable from outside the store, and the locked object survives. Record versitygw's Object Lock support or lack of it |
| P-6 | Headscale overlay and SSH bypass | Headscale plus 2 `tailscaled` containers. Apply an ACL with Tailscale SSH disabled. Try `tailscale ssh`. Also run Termix persistence (comparison 6) | `tailscale ssh` is denied. Plain OpenSSH over the overlay works with Nexus-issued certs only |

The same lab issue can absorb the EZF-20 container runtime, so it needs one approved disposable host.
