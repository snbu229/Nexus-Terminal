# Session reattach prototype: tmux vs Herdr

- Issue: EZF-10 (NX2-002), epic E00 / M0. Risk: normal.
- Author: A1 Nexus CTO. C1: A5 QA & Security Reviewer. C2: A0 Nexus CEO.
- Date: 2026-11-10. Status: **DRAFT. Harness ready; 2-node run not executed. Not an ADR and not a decision.**
- Both projects are open source (tmux: ISC, Herdr: Apache-2.0), so reading their source is allowed. No code from either project is copied into Nexus.

## 0. Read this first: what was and was not done

| Item | State |
|---|---|
| Desk research on tmux 3.5a and Herdr v0.9.5 (docs + source at pinned commits) | Done (§2). Sources are in §8. |
| Repeatable 2-node harness: `tests/prototypes/session-reattach/` | Done (§3). Images pinned by digest, Herdr pinned by sha256. |
| Harness analysers: unit and fixture tests | Done. `./run.sh --self-test`: **20 tests, all pass** (§6). |
| **2-node run: reattach, continuity, ownership and logging results** | **NOT done.** This runner has no docker or podman, `unshare` is not permitted, and tmux and Herdr are not installed. The task forbids package installs on shared hosts. §5 holds placeholders, not results. |
| Acceptance criterion "repeatable output/logging and ownership results on 2 test nodes" | **Unmet.** Board decision requested on EZF-10: where the run happens (§7). |
| macOS | **Unverified** (D7: no Mac hardware). Desk notes only (§2.4). |

Claims are marked **[src]** (read in source at the pinned commit), **[doc]** (official docs at the pinned commit), **[inferred]** (my reading, not tested), or **[hypothesis]** (the run in §3 will confirm or refute it). Every file was fetched raw from GitHub, not through a summarizing fetcher.

## 1. Question and what the spec needs

NX2-002 decides whether Nexus terminal persistence should be built on remote `tmux`, on Herdr, or on both. The requirements come from the spec kit:

- Closing a browser tab, losing the network, or restarting the gateway must **not kill** the remote process. Reconnect must target the **same host and the same multiplexer session name**. (`SESSION_PERSISTENCE.md`)
- "Reattached to the original process" and "resumed from a checkpoint" must be labelled differently. A rebooted host never claims the same PID. (EZF-2 plan, invariant 4; `CROSS_PLATFORM_PRODUCT_CONTRACT.md`)
- `nexus_session_id` maps to `(host_id, remote_uid, multiplexer_type, remote_session_name)`. Reattach is authorised for the same principal only. There is one active writer per pane unless takeover is explicit. (`ARCHITECTURE.md`)
- Reconnect uses a log resume cursor (sequence number), so the user sees the last known output, and new output exactly once. (`SESSION_PERSISTENCE.md`)
- The agentless SSH path needs `tmux`. If tmux is missing, Nexus offers a consent-based install or a non-persistent shell that is clearly marked. (`CROSS_PLATFORM_PRODUCT_CONTRACT.md`)

So tmux is already required for the agentless path. The real question is whether Herdr adds enough to be an **optional provider**, and whether either tool fails a requirement.

## 2. Desk findings

### 2.1 Side-by-side

| Property | tmux 3.5a | Herdr v0.9.5 |
|---|---|---|
| Model | A server per user and socket. Clients attach to it. **[doc]** | A background server per named session. TUI client, CLI and NDJSON socket API. **[doc]** |
| Survives client detach / browser close | Yes. The server is daemonised and only the client exits. **[doc]** | Yes: "panes and agents keep running". **[doc]** |
| Survives SSH hangup | The client receives SIGHUP and exits. The server is unaffected. **[doc]** | The server ignores SIGHUP on Linux/macOS (new since 0.9.3 docs). **[doc]** |
| Survives multiplexer server restart | No. Processes die. | No. **Snapshot restore** brings back layout and cwd as **new shells**. Some agents are re-launched with their native resume command. **[doc]** |
| Survives host reboot | No. | No. Layout is restored. On Linux with systemd-logind, Herdr saves state during a delayed shutdown. **[doc]** |
| Live process handoff across upgrade | No. | Experimental `--handoff`, best effort. In-flight API streams may be interrupted. **[doc]** |
| Gateway-friendly output stream | Control mode `tmux -C`: `%output <pane> <bytes>`, octal-escaped. **These are the raw pane bytes.** **[doc]** | `herdr terminal session observe`: NDJSON `terminal.frame` records holding base64 ANSI of the **rendered terminal state**. **[doc]** |
| Is the stream lossless under bursts? | A slow control client is paused (`pause-after`) or disconnected ("too far behind"). **[doc]** **[hypothesis H3]** lossless until that limit. | Frames are rendered snapshots, so lines that scroll past between frames may never be sent. **[hypothesis H4]** |
| Read-only viewer | `attach -r`, `-f read-only`. Other users can be given read-only access with `server-access -r`. **[doc]** | `terminal session observe` is read-only. Many observers are allowed. **[doc]** |
| Single writer and takeover | No single-writer rule by default. Nexus must enforce it in the gateway. **[inferred]** | One writable controller per terminal; `--takeover` replaces it. **[doc]** This matches the spec. |
| Scrollback backfill after reattach | `capture-pane -S -N`, bounded by `history-limit`. **[doc]** | `pane read --source recent-unwrapped --lines N`. **[doc]** The bound is unknown. **[hypothesis H5]** |
| Durable per-pane output log (resume cursor) | `pipe-pane` appends every byte of pane output to a file the user owns. **[doc]** | **None documented.** `pane_history` is experimental, off by default (secrets risk), and only replayed after a restart. **[doc]** |
| Diagnostic logs | None by default (`-v` writes debug logs). | `~/.config/herdr/herdr.log`, `herdr-server.log`, `herdr-client.log`, with rotation. **[doc]** **[src]** `logging.rs` |
| Socket location | `$TMUX_TMPDIR` or `/tmp/tmux-<uid>/default`. **[doc]** | `~/.config/herdr/sessions/<name>/herdr.sock`. `HERDR_SOCKET_PATH` overrides it. **[doc]** |
| Socket protection | The directory is created `0700`. tmux **refuses to use it** if the owner differs or other users have any access. **[src]** `tmux.c:209-225`. The server ACL also checks the peer uid on every client. Only the owner and root are allowed by default. **[src]** `server.c:395`, **[doc]** `server-access` | The socket file is `chmod 0600`. **[src]** `api/server.rs:29,91`; `server/socket_paths.rs:12`. No peer-uid check was found in `api/server.rs` or `server/client_accept.rs`. **[inferred]** File mode is the only barrier. **[hypothesis H6]** |
| Privilege | User space; no root. | User space; no root. |
| Remote install behaviour | None. | `herdr --remote` can install itself to `~/.local/bin` on the remote host after an interactive prompt. Non-interactive runs fail instead. **[doc]** Nexus must never trigger this path; its own connector policy governs installs. |
| Supply chain | Distro packages (signed apt/rpm repos); Homebrew on macOS. | Release binaries with sha256 values in `https://herdr.dev/latest.json`. The values match the GitHub assets (re-hashed on 2026-11-10). **No signatures.** The installer is `curl \| sh`. Homebrew, mise and Nix are also available. |
| License | ISC (per-file headers; `COPYING`). | Apache-2.0 (`LICENSE`; GitHub license API). This answers the "check forks for AGPL" note in `OSS_RESEARCH.md` for `herdrdev/herdr`. |
| Maturity | Stable for more than 15 years. | 0.9.x. Very active (last push 2026-11-07). Wire protocol 22, endpoint generation 1. **Fast-moving API.** |

### 2.2 What this means for Nexus (provisional, before the run)

1. **tmux meets every spec requirement on its own**, provided the gateway adds single-writer enforcement. Control mode gives a byte-exact feed, and `pipe-pane` gives a durable, user-owned log. Together they implement the spec's "log resume cursor / sequence number" directly: the cursor is a byte offset in the pipe log. **[inferred]**
2. **Herdr is strong on agent semantics** (working/blocked/idle detection, native agent resume, single-writer takeover). **It is weaker as a byte-exact transport**: its stream is rendered frames, and it has no durable per-pane log. A Nexus gateway on Herdr alone could not promise "new output exactly once" after reconnect. **[inferred; H4, H5 to test]**
3. Herdr's **snapshot restore** is a resume-from-checkpoint, not a reattach. If Nexus integrates Herdr, the UI must show it as `REMOTE_PROCESS_EXITED` followed by a new process, never as the same session. The harness verdicts enforce this (§3.3).
4. Herdr's socket relies on `0600` file mode and the protection of `$HOME/.config`. tmux has defence in depth (directory check plus peer-uid ACL). This is acceptable for single-user hosts, but C1 should note it for shared hosts. **[inferred; H6 to test]**

**Provisional recommendation (to confirm or reject from §5):** use tmux as the required baseline provider for terminal sessions (agentless and connector paths). Consider Herdr only as an **optional, feature-flagged provider for AI-agent panes**, behind the existing `multiplexer_type` field. Nexus must not trigger Herdr's remote self-install, and must pin its version because the protocol changes quickly. This feeds ADR work in EZF-15 (NX2-007) and the component comparison in EZF-13 (NX3-106). It is not a decision.

### 2.3 Hypotheses the run will test

| ID | Hypothesis |
|---|---|
| H1 | E1–E3 (browser close, gateway SIGKILL, 40 s network outage) leave the original producer PID running under both tools on both nodes. |
| H2 | No tool stalls the producer while no client is attached: the truth file has no gaps and no interval above 1 s. |
| H3 | The tmux control-mode stream delivers 100% of steady-state lines and at least 99.9% of a 5000-line burst, or disconnects visibly ("too far behind"). It never drops lines silently. |
| H4 | The Herdr observer stream delivers 100% of steady-state lines (10 lines/s) but **under 100% of a 5000-line burst**. |
| H5 | Backfill after reattach covers the whole detached window for both tools. The tmux pipe log covers 100% of all windows, including the burst. |
| H6 | uid 2002 cannot list or attach to uid 2001's session with either tool. All server and producer processes run as uid 2001. |
| H7 | After a host reboot, both tools report `REMOTE_PROCESS_EXITED`. Herdr after a server restart reports `RESTORED_NO_PROCESS` or `RESTORED_NEW_PROCESS`, never `REATTACHED_ORIGINAL`. |

### 2.4 macOS (unverified, D7)

Both tools ship macOS builds (tmux via Homebrew; Herdr `macos-x86_64` and `macos-aarch64` binaries). Herdr documents that a server started over SSH or from a background job may lack interactive Keychain access, and that auto-started servers use a per-user service context. **[doc]** A remote tmux on a Mac also dies on reboot, and Mac sleep interrupts networking (`CROSS_PLATFORM_PRODUCT_CONTRACT.md`). None of this has been tested. All Mac rows stay *unverified* until hardware exists.

## 3. Harness

### 3.1 Topology

`docker compose` with three containers on one bridge network and no published ports:

- `node1`: Debian 13 (`debian:trixie-slim@sha256:a72b4433…b6b2`); tmux and OpenSSH from Debian.
- `node2`: Ubuntu 24.04 (`ubuntu:24.04@sha256:fe815609…f852`); tmux and OpenSSH from Ubuntu.
- `gateway`: Debian 13. It runs as unprivileged `gw` (uid 1999) and SSHes to the nodes like a Nexus gateway would.
- Herdr v0.9.5 is fetched at build time and checked against its sha256 (x86_64 and aarch64).
- Test users: `alice` (uid 2001) owns the sessions and `bob` (uid 2002) is the second user. Root is used only by sshd inside the throwaway containers. Each run generates fresh throwaway SSH keys and deletes them afterwards.

Each node runs one tmux and one Herdr session, both as `alice`. Each session runs `producer.py`, which prints `SEQ <n> <epoch_ms>` 10 times a second and appends the same line to a truth file outside the multiplexer. The truth file is the ground truth for continuity, so the tool under test never grades itself.

### 3.2 Events (all four sessions at once)

| Event | Injection | Measures |
|---|---|---|
| E1 browser close | SIGTERM to the gateway attach (clean SSH channel close); 10 s detached | survival, backfill and log coverage of the gap, time to first output |
| E2 gateway restart | `docker compose kill -s SIGKILL gateway`, then start | same |
| E3 network outage | `docker network disconnect` of both nodes for 40 s (beyond sshd `ClientAlive` 10 s and ssh `ServerAlive` 6 s, so both ends drop the connection) | same |
| E4 burst | 5000 lines at once while attached | stream / backfill / log coverage |
| E5 second user | `bob` connects to `alice`'s socket | denial |
| E6 host reboot | `docker compose restart node1 node2`; then Herdr server restart | honest `REMOTE_PROCESS_EXITED` and restore labelling |

Ownership is recorded throughout: process uids, socket and socket-directory owner and mode, and log owner and mode.

### 3.3 Verdict labels (`summarize.py`)

- `REATTACHED_ORIGINAL`: the session is alive and the producer has the **same PID and start time** as at baseline.
- `RESTORED_NEW_PROCESS` / `RESTORED_NO_PROCESS`: the session is alive but the original process is gone.
- `REMOTE_PROCESS_EXITED`: no session.
- `UNKNOWN`: no status could be collected. This is never counted as a pass.

### 3.4 Pre-registered pass criteria (fixed before any run)

| Criterion | Pass if |
|---|---|
| Live reattach | E1, E2 and E3 are `REATTACHED_ORIGINAL` on both nodes |
| No backpressure stall | truth `missing = 0` and `max_interval_ms < 1000` |
| Steady stream | `stream_steady_coverage_pct ≥ 99.9` |
| Durable log | ≥ 100% of each detached window and of the burst (tmux); for Herdr, record "none" |
| Ownership | all checks `true`: processes are uid 2001, the socket is owned by 2001 and not world-accessible, and the socket directory is owner-only |
| Second user | `denied = true` |
| Honest reboot | E6 is never `REATTACHED_ORIGINAL` |

A tool can pass the persistence criteria and still be rejected as the primary transport because of H4/H5. That would be a design finding, not a test failure.

## 4. How to reproduce

```bash
cd tests/prototypes/session-reattach
./run.sh --self-test   # analysers only
./run.sh               # full run on a disposable Docker host; about 3 to 4 minutes
```

Results go to `results/<UTC>/summary.md` with raw evidence under `raw/`. See the harness README for parameters.

## 5. Results

**Not run.** See §0. Each cell below is filled from `summary.md` of an attached run. Nothing is claimed until then.

| node / mux | E1 | E2 | E3 | stream steady % | burst stream % | durable log | ownership | 2nd user denied | reboot label |
|---|---|---|---|---|---|---|---|---|---|
| node1 (Debian 13) / tmux | not run | not run | not run | not run | not run | not run | not run | not run | not run |
| node1 (Debian 13) / Herdr | not run | not run | not run | not run | not run | not run | not run | not run | not run |
| node2 (Ubuntu 24.04) / tmux | not run | not run | not run | not run | not run | not run | not run | not run | not run |
| node2 (Ubuntu 24.04) / Herdr | not run | not run | not run | not run | not run | not run | not run | not run | not run |
| macOS (either) | unverified (D7) | | | | | | | | |

## 6. Verification done in this run

- `./run.sh --self-test` → `Ran 20 tests … OK` (Python 3 on Debian 13 runner). It covers marker extraction from plain text, tmux control mode (octal escapes), Herdr NDJSON base64 frames (field name unknown, so every string is tried), and gateway timestamps. It covers gap, duplicate and reorder analysis, windowed coverage, and time to first output. A fixture run checks that a new PID is never labelled `REATTACHED_ORIGINAL`, and that a missing node is reported as `UNKNOWN` and `started=false` instead of being invented.
- The first test run caught a real bug: a marker truncated at the screen edge was counted as delivered. The regex now requires the full 13-digit timestamp.
- `bash -n` passes for `run.sh` and `lib/remote.sh`; `sh -n` passes for `node-entrypoint.sh`.
- **Not verified:** the compose file and Dockerfile have not been built (no Docker here). The Herdr CLI calls in `remote.sh` (`herdr server`, `workspace create`, `pane list`/`run`/`read`, `terminal session observe`) follow the v0.9.5 docs but have **not been executed**. The pane-ID lookup and the observer frame field name are the most likely things to need a fix on the first run. The script records failures as `start_failed` / `UNKNOWN` instead of hiding them.

## 7. Decision needed and next steps

1. **Board: where the run happens** (question on EZF-10). Options: (A) a human runs `./run.sh` on a disposable Docker machine and attaches `results/<ts>/`; (B) the board provides a disposable container host for agents, which EZF-20 also needs; (C) split the run into a follow-up issue, as was done for EZF-7.
2. After the run: fill in §5, settle H1–H7, and turn §2.2 into an ADR input for EZF-15 (NX2-007).
3. Optional follow-ups if Herdr stays in scope: compare the ACP agent resume path with Herdr native resume (EZF-11); run a Herdr `--handoff` upgrade test; run the Mac matrix once hardware exists.

**Rollout / rollback / audit impact:** none. This is test-only code that runs in disposable containers, with no production hosts, credentials or packages.

**OS/arch declaration for the harness:** Linux amd64 (target). Linux arm64 (supported by the image and the Herdr aarch64 hash; untested). macOS: not applicable to the harness; product behaviour is unverified (D7).

## 8. Sources (fetched 2026-11-10)

| Source | Pin |
|---|---|
| Herdr repo, license, releases: https://github.com/herdrdev/herdr | tag `v0.9.5` → commit `2ecf19a92fc3a7fff75b6ce3655ef04f4625ec01` (released 2026-10-14) |
| Herdr docs: `docs/next/website/src/content/docs/{persistence-remote,session-state,socket-api,troubleshooting,how-to-work,concepts,connecting-machines}.mdx` | same commit; diffed against `docs/versions/0.9.3/…` (the SIGHUP note is new) |
| Herdr source: `src/ipc.rs`, `src/session.rs`, `src/api/server.rs`, `src/server/socket_paths.rs`, `src/server/client_accept.rs`, `src/logging.rs`, `src/cli.rs`, `src/cli/server.rs` | same commit |
| Herdr checksums: https://herdr.dev/latest.json | v0.9.5 entry; matches GitHub assets re-hashed locally (binaries hashed only, never executed) |
| tmux manual: https://github.com/tmux/tmux/blob/3.5a/tmux.1 (`-L`/`TMUX_TMPDIR`, `server-access`, `pipe-pane`, `history-limit`, CONTROL MODE, client flags `pause-after`/`read-only`, exit reasons) | tag `3.5a` (tag object `201478321a4623df80bb864884e8a8f536d3d53f`) |
| tmux source: `tmux.c` (socket dir checks), `server.c` (umask, ACL join), `COPYING` | tag `3.5a` |
| Base images | `debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2`, `ubuntu:24.04@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852` (registry-1.docker.io index digests) |
| Spec kit | `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/`: `SESSION_PERSISTENCE.md`, `ARCHITECTURE.md`, `CROSS_PLATFORM_PRODUCT_CONTRACT.md`, `TEST_STRATEGY.md`, `OSS_RESEARCH.md` |

### License ledger rows (for EZF-5)

| Component | Version | License | Use in Nexus | Notes |
|---|---|---|---|---|
| tmux | distro package; exact versions are recorded in the run's `environment.json` (docs reviewed at 3.5a) | ISC | Required on remote hosts; invoked, not bundled | |
| Herdr | 0.9.5 | Apache-2.0 | Candidate optional provider; test harness only today | Unsigned binaries; pin sha256; never auto-install on hosts |
