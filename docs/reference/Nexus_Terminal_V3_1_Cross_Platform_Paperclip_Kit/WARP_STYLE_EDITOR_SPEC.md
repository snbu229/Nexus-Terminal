# Nexus Command Studio — Warp-style intelligent terminal UX

Status: product specification. Reproduce publicly described **behavior**, not Warp source, assets, branding, private APIs or trade dress. Research lead must verify public documentation and supported interfaces.

## User contract
- Command input is an editable surface. Mouse-click to position cursor mid-command, Home/End, arrows, Alt/Option+word, Ctrl/Cmd+A, multiline editing, undo/redo, find/replace in draft, spelling-correction suggestions, syntax highlighting, pasted command review, accessible screen-reader labels, 1.3x text scaling.
- Enter executes the drafted command when safe; Shift+Enter inserts newline (configurable); explicit Run button for long/privileged multiline commands. Insert/click never alters or replays a command already executed without a fresh Run action.
- Select any historic **command block** to Copy, Edit as Draft, Rerun (with confirmation for destructive or cross-host targets), Share redacted output, attach output to Paperclip issue.
- Terminal output grouped into command blocks containing: draft/submitted command, identity/host/workdir, timestamps, exit status, output stream, optional command classification and agent correlation ID. History is user- and host-scoped.
- Shell launchers: Bash, Zsh, Fish (feature support matrix); local/SSH/Teleport/Pty and agent sessions. Configurable theming, icons, search, pin tabs, shortcuts, command palette, AI explain/fix suggestions with permission-aware model access. Never send terminal contents to a model without explicit data policy and user control.

## Architecture: separate **command editor** from PTY rendering
- Browser: CodeMirror 6 (or independently evaluated editor) for the draft; xterm.js for PTY output and full-screen interactive apps; state machine `SMART_INPUT -> INTERACTIVE_PTY -> SMART_INPUT`.
- The remote shell remains **one long-lived PTY**, not a new `ssh exec` command for each line, so `cd`, environment exports and shell functions persist.
- Use opt-in per-shell prompt integration to emit OSC 133 / appropriate supported markers; parser maintains command ID and shell prompt boundaries. Escape-sequence filtering, buffer limits, control-char validation and a fallback that disables block grouping on unknown shells.
- On submission, normalize multiline text safely and send using PTY paste mechanisms; never synthesize an unsafe `sh -c` wrapper or silently modify quoting. Detect bracketed paste support; show confirmation for elevated/multiline commands. Prevent paste injection by rejecting unexpected terminal-control characters, stripping unintended terminal escapes, and retaining a raw user-confirmed preview.
- For `vim`, `nano`, `top`, nested `ssh`, password prompts, TUI, shell debugging, and programs that do raw input, switch to raw PTY mode. Do **not** steal keystrokes or misinterpret mouse events. Allow explicit manual mode switch and recovery when prompt detection fails.
- Input draft persisted locally encrypted/at-rest according to workspace policy; actual process output and command history stored only when permitted by per-org retention policy. Redact secrets prior to preview, notifications and LLM context; include user-controlled private mode.
- Remote output is authoritative. One input lease/writer at a time; spectators read-only. Takeover is approved and audited. On network drop editor retains unsent draft; queued typed text is NOT replayed automatically after reconnect. After auth is rechecked, reattach same remote mux session, fetch output cursor, ask to submit unsent draft.

## Core APIs and state
`terminal_session(id, owner_id, host_id, tmux_id, workdir, transport, status, last_output_cursor)`
`command_block(id, session_id, command_text_encrypted, started_at, ended_at, exit_code, output_cursor)`
`input_lease(session_id, user_id, epoch, expires_at)` [lease expires even though background session itself does not]
`draft(session_id, user_id, client_draft_id, content, version)`
`GET /api/terminal-sessions/:id/blocks`, `POST /api/terminal-sessions/:id/commands` (idempotency key), `POST /api/terminal-sessions/:id/attach`, `POST /api/terminal-sessions/:id/lease`.

## UX modes
1. **Smart Command**: IDE-like editor, suggestions, completion, command blocks.
2. **Raw Terminal**: fully compliant PTY keyboard + mouse + ANSI for interactive apps.
3. **Agent Pane**: agent control messages, tool calls, permissions, logs, resumable sessions.
4. **Remote File**: read/write file through SFTP, explicit save/version conflict checks.

## Tests and acceptance
- Cursor can be clicked anywhere in 300-character command including in SSH connection; selection, word-navigation and undo test with Playwright.
- 100-line Bash script edits and executes as expected without shell quoting alterations; no unreviewed execution.
- `cd` persists between smart command submissions in same PTY; `sudo` prompts reliably use raw mode.
- `vim`, `top`, nested SSH and remote TUI receive keyboard/mouse and resize correctly; no editor capture.
- ANSI/OSC malicious payload cannot inject HTML/JS, forge a command block, steal cookies or execute draft text.
- Browser refresh, central gateway restart and 30min offline resume same session if remote tmux still exists, with no duplicate command execution.
- Terminate/break connectivity while a draft is unsent: draft preserved, command NOT sent after reconnection until intentional submit.
- Privilege/repo-role revoked while session remains running: interactive client loses access immediately on next policy check, and server-side streams are detached.
- Use accessible contrast, tab focus, screen reader cues, mobile keyboard behaviors and large text testing.

## Research references
- https://docs.warp.dev/terminal/editor
- https://github.com/wavetermdev/waveterm
- https://xtermjs.org/ ; https://codemirror.net/ ; https://ghostty.org/
