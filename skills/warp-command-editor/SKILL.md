---
name: warp-command-editor
description: Use when building or testing the Nexus Warp-style command editor, terminal view, PTY input routing, OSC 133 command blocks or escape-sequence handling. Covers the R1 BR-16 typed-ahead latch, paste and escape safety, and the M-D1 dev-marker limits.
---

# Warp-style command editor (independently implemented)

## Use when

A task touches `packages/command-editor`, the terminal view in `apps/web`, PTY input or output handling, command blocks, or paste.

Read first:

- `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/WARP_STYLE_EDITOR_SPEC.md` and `docs/reference/Nexus_Terminal_V3_1_Cross_Platform_Paperclip_Kit/SESSION_PERSISTENCE.md`.
- The behaviour spec `docs/research/command-editor-behaviour-spec.md` (rev 10, BR-1 to BR-16, §5 state machine, §6 mode switching, §7 threat model). _Pending:_ it is on branch `research/ezf-8-command-editor-spec` until merged. If it is missing from your worktree, read it from that branch; don't recreate it.
- The M-D1 plan (EZF-43 `plan` document, §5 dev safety rules).

Don't copy Warp internals, assets or UI appearance. Use OSC 133, never Warp's custom DCS.

## PTY model

- One long-lived PTY per shell session. Smart mode and raw mode write to the same PTY, so `cd` and exports persist (BR-7).
- Framing is byte-exact (BR-6): a single-line draft is the draft bytes + `\r`. A multiline draft with bracketed paste on is `ESC[200~` + draft + `ESC[201~` + `\r`. Multiline or elevated drafts need explicit Run/confirm (BR-2).
- Full-screen TUIs (alt-screen), mouse reporting, password prompts and nested `ssh` get raw input with keyboard and mouse untouched (§6). Resize goes to the PTY as SIGWINCH.
- Never repeat a command on reconnect. An unsent draft survives a refresh but is never auto-submitted (BR-11).

## BR-16 typed-ahead latch (R1, mandatory)

- Draft capture happens **only** in the INPUT state (after `B`, before submission). On Enter or Run the editor goes to PENDING at once and treats it like RUNNING.
- **Once any byte other than a confirmed draft's framing reaches the PTY, the smart editor stays off for that session.** This applies in every state and mode. The only exception is the empty-draft `0x03`/`0x04` sent from SMART INPUT.
- No event clears the latch: not Ctrl+C, Enter, any `A`/`B`/`C`/`D`, alt-screen exit, the toggle, "Reset prompt detection", reconnect or tmux reattach. Only a **new shell session** turns the editor back on. R1 has no re-enable button.
- Show the persistent one-line "smart editor is off for this shell" indicator. Never store typed-ahead bytes in the draft, history, logs or AI context.
- Automatic return is only a proposal: `docs/adr/ADR-PROPOSED-typeahead-editor-return.md` (_pending_, same branch; EZF-40). Don't implement it.

## OSC 133 and escape safety

- In M-D1, command blocks come from a dev-only shell integration that emits OSC 133 `A/B/C/D` in the sandbox. They are **unauthenticated dev markers**: label them that way, and never base a security or approval decision on them. BR-12 (nonce) and the boundary ADR (EZF-27) are open.
- Unknown shell or no markers: block grouping off, raw PTY with a manual toggle (BR-10).
- Paste (BR-5): strip or reject C0/C1 and ESC except `\n` and `\t`; normalise `\r\n` and lone `\r` to `\n`; flag bidi, zero-width and homoglyph characters; show a raw preview; never auto-run.
- Terminal responses (BR-14): deny OSC 52 read; OSC 52 write is off by default; query responses are generated only by the terminal core and never echo stream bytes into PTY input; don't answer `CSI 21 t`; strip and cap titles.
- Render output as text. No HTML from output; links only from validated, allowed sequences.

## Required tests (vitest for the model, Playwright for the view)

Mid-word caret placement in a long soft-wrapped draft; multiline undo and redo; block metadata; no replay on reconnect; the latch is set by raw bytes in each state and is not cleared by Ctrl+C, Enter or a new `B`; the empty-draft `0x03` exception; forged OSC 133 from `cat evil.txt`; bracketed-paste breakout `ESC[201~` in a paste; OSC 52 read denied; revoked-user attach denied.

## Licences and review

Record CodeMirror 6 and `@xterm/xterm` in the licence ledger (see `nexus-oss-research`). C1 by QA Security (A5) and C2 by CTO (A1) on the exact head SHA; the author never approves their own work; a new commit needs re-review. No direct production host access.

Never treat this instruction document as permission to access production hosts or install executable third-party code.
