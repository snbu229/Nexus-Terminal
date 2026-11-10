# @nexus/terminal-sandbox (dev only)

`TerminalProvider` implementations for the M-D1 demo: `local-sandbox` and `ssh-dev`. **Not a security boundary**: both run a shell as the current user.

## PTY choice

A Python-stdlib `pty` bridge (`src/pty_bridge.py`) rather than `node-pty`. `node-pty` ships Linux prebuilds only for some versions and otherwise compiles with node-gyp, and the agent runtime has no compiler. The bridge uses stdin/stdout for data and a third fd for `resize COLS ROWS` lines, and needs only `python3`.

## local-sandbox

`bash --noprofile --rcfile <our integration file> -i` (the rcfile replaces `~/.bashrc`, so this equals `--norc` plus the markers; `sh -i` if bash is missing, without markers). Environment allowlist: `PATH`, `TERM`, `LANG`, `HOME`, `SHELL`. HOME and cwd are a fresh temp dir, deleted on close. The integration emits OSC 133 `A/B/C/D` as unauthenticated dev markers.

## ssh-dev

`ssh2` client against `startSshTestServer()`: an in-process server on 127.0.0.1 with ephemeral ed25519 host and client keys held in memory. The client pins the SHA-256 of the host key blob; an unknown, changed or empty pin aborts before authentication. The server accepts only the one client key, shell sessions only (no exec, subsystems or forwarding), and each shell is a local-sandbox shell.
