---
name: warp-command-editor
version: 0.1.0
summary: Implement safe IDE-like command editing with PTY fallback, output blocks and session recovery.
---
# Warp-style input behavior, independently implemented

Read `WARP_STYLE_EDITOR_SPEC.md` and `SESSION_PERSISTENCE.md` before coding. Do not copy Warp internals, assets or UI appearance. Prefer CodeMirror 6 for draft input and xterm.js for PTY output; validate licenses. Smart mode must use same live PTY as raw mode so shell state persists. Detect shell prompt markers only where supported, tolerate unknown shells, escape untrusted OSC/ANSI, never repeat a command on reconnect. Full-screen TUI apps and password prompts must get raw input and keyboard/mouse. Write Playwright tests for mid-word editing, multiline undo/redo, command block metadata, replay prevention and revoked-user attach denial. Require C1 QA and no direct production host access.
