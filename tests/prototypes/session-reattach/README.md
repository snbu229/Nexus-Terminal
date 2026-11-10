# NX2-002 session-reattach prototype (tmux vs Herdr)

Repeatable 2-node test of live-session reattach. Findings, pass criteria and
sources: [`docs/research/session-reattach-prototype.md`](../../../docs/research/session-reattach-prototype.md).

## Requirements

A **disposable** machine with Docker Engine + compose v2, `ssh-keygen` and
`python3`. Do not run it on a shared host or the Paperclip host. Images pull
`debian:trixie-slim` and `ubuntu:24.04` by digest, Debian/Ubuntu `tmux` and
`openssh-server` packages inside the containers, and the Herdr v0.9.5 release
binary, which is checked against its sha256. Nothing is installed on the host
and no host ports are published.

## Run

```bash
./run.sh --self-test          # unit tests for the analysers (no Docker needed)
./run.sh                      # full run, about 4 minutes
DETACH_SECS=10 OUTAGE_SECS=40 BURST_LINES=5000 ./run.sh   # defaults shown
KEEP=1 ./run.sh               # leave containers up for inspection
```

Output goes to `results/<UTC timestamp>/`:

| File | Content |
|---|---|
| `summary.md`, `summary.json` | verdicts and coverage per node × multiplexer |
| `environment.json` | OS, kernel, tmux, Herdr and OpenSSH versions, run parameters |
| `events.jsonl` | timeline of every injected event (epoch ms) |
| `raw/` | status snapshots, truth files, logs, backfills, gateway captures, sshd log |

The throwaway SSH keys in `results/<ts>/keys/` are deleted at the end
(unless `KEEP=1`) and are git-ignored.

## Layout

| Path | Role |
|---|---|
| `compose.yaml`, `node.Dockerfile`, `node-entrypoint.sh` | `node1` (Debian 13), `node2` (Ubuntu 24.04), `gateway` |
| `lib/producer.py` | writes `SEQ <n> <ms>` to the pane **and** to a truth file |
| `lib/remote.sh` | node-side start/stream/backfill/log/status/probe commands |
| `lib/gateway.py` | simulated gateway attach over SSH, timestamps every received line |
| `lib/check_continuity.py` | extracts markers from text, tmux control mode and Herdr NDJSON frames |
| `lib/probe.py` | grades E5 second-user probes (owner positive control, permission refusal only, two layers) |
| `summarize.py` | produces verdicts (`REATTACHED_ORIGINAL`, `RESTORED_NEW_PROCESS`, …) |
| `lib/test_*.py` | unit and fixture tests (`./run.sh --self-test`) |

## Limits

E6 is a **container restart** (simulated reboot): new PID namespace, but `/tmp`
and `~/.config` survive and no systemd-logind shutdown runs. E3 removes the
network interface (fast failure), which is not a silent-drop WAN outage. The
30-minute and 24-hour outages from `TEST_STRATEGY.md` are not covered. See §3.2
of the research doc.
