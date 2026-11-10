# Command editor behaviour spec (clean-room) — NX3-104 / EZF-8

Status: DRAFT for C1 (A5) / C2 (A1). Author: A7. Research date: 2026-11-10.
Clean-room statement: built only from public docs, standards and open-source project documentation listed below. No Warp code, assets, screenshots, private APIs or binaries were used; no Warp instance was run. All Warp behaviour here is **documented-only** (not black-box measured). Items tagged `[INFERENCE]` or `[UNVERIFIED]` are not confirmed by a source.

## 1. Sources (fetched 2026-11-10)
| id | source | used for | licence/notes |
|---|---|---|---|
| S1 | https://docs.warp.dev/terminal/editor | editor behaviours | proprietary docs, behaviour only |
| S2 | https://docs.warp.dev/terminal/blocks | block concept/actions | proprietary docs, behaviour only |
| S3 | https://www.warp.dev/blog/how-warp-works | block detection via shell hooks (precmd/preexec) | behaviour only; Warp uses a custom DCS — Nexus will NOT copy it, use OSC 133 |
| S4 | https://sw.kovidgoyal.net/kitty/shell-integration/ | OSC 133 A/C/D, options | kitty GPLv3 — docs read, no code |
| S5 | https://wezterm.org/shell-integration.html (repo docs/shell-integration.md) | semantic zones Prompt/Input/Output | MIT; page only links to the spec |
| S6 | https://ghostty.org/docs/features/shell-integration | prompt jump, click-to-move, bar cursor at prompt, shells | MIT |
| S7 | https://github.com/wavetermdev/waveterm | "command blocks" feature; Apache-2.0 | no implementation read yet |
| S8 | freedesktop semantic-prompts proposal (gitlab.freedesktop.org/Per_Bothner/specifications) | normative OSC 133 | **fetch blocked (Anubis); [UNVERIFIED] — C1/A1 must read directly** |
| S9 | Nexus kit: WARP_STYLE_EDITOR_SPEC.md, SESSION_PERSISTENCE.md, CLEAN_ROOM_RESEARCH_PLAYBOOK.md | requirements | internal |

Not yet studied: Tabby source, Wave/WezTerm/Ghostty source (docs only), Warp Vim mode and block-filter pages. Follow-up study tickets needed before ADR sign-off.

## 2. Study records (playbook format)
| study_id | product | function | decision | licence | notes |
|---|---|---|---|---|---|
| ST-104-1 | Warp | click-to-edit input + blocks | implement (independent) | proprietary | behaviour only; no trade dress |
| ST-104-2 | CodeMirror 6 | draft editor | adopt | MIT | confirm in licence ledger |
| ST-104-3 | xterm.js | PTY render + TUI | adopt | MIT | confirm in ledger |
| ST-104-4 | OSC 133 | block boundaries | implement per standard | open standard | S8 unread — blocker for ADR |
| ST-104-5 | Wave/Tabby/WezTerm/Ghostty | prior art | defer code study | Apache/MIT | docs-level only so far |
Decision ADR: to be drafted (`docs/adr/`) after S8 is read.

## 3. Documented behaviours to reproduce (functional)
Warp-documented (S1,S2): click-to-place cursor; multi-line editing with soft wrap; copy/cut/paste; select by char/word/line/all; word and line-boundary movement (Home/End, Ctrl+A/E); delete word/line/to cursor; optional auto-pair of quotes/brackets; Esc closes suggestion/history menu; triple-click selects logical (not visual) line; Vim keybindings optional; works over SSH. Blocks group each command+output; copy command/output separately; jump to output start; re-input a prior command; bookmark; find/filter in blocks; sticky command header.
Nexus-specific additions come from kit spec (S9): Shift+Enter newline, Run button for multiline/privileged, undo/redo, find/replace in draft, paste review, a11y, 1.3x scaling.

## 4. Behaviour requirements (BR)
- BR-1 Click anywhere in a draft (incl. 300+ chars, soft-wrapped) places the caret there. Clicking never executes or modifies submitted blocks.
- BR-2 Enter submits when safe; Shift+Enter newline (configurable); multiline/elevated drafts require explicit Run/confirm.
- BR-3 Editor undo/redo are draft-local and do not touch the PTY.
- BR-4 Soft wrap is visual only; the submitted text has no inserted newlines.
- BR-5 Paste: strip/reject C0/C1 control and ESC sequences except \n and \t; show raw preview with escapes visible; never auto-run.
- BR-6 Submission uses bracketed paste if the PTY advertises DECSET 2004; otherwise send line-by-line with confirmation. No `sh -c` wrapper, no quoting changes: bytes sent == draft bytes (after BR-5) + final newline.
- BR-7 One long-lived PTY; `cd`/exports persist across submissions.
- BR-8 Block = {id, command, cwd, host/user, start, end, exit code, output cursor}. Block boundaries come only from verified OSC 133 markers emitted by Nexus's opt-in integration; output text can't forge them (see BR-12).
- BR-9 Block actions: Copy command, Copy output, Edit as draft (never auto-run), Rerun (confirm if destructive or cross-host), Share redacted, attach to issue.
- BR-10 Unknown shell / no markers → block grouping disabled, editor falls back to raw PTY with manual toggle.
- BR-11 Unsent draft survives disconnect/refresh and is never auto-submitted after reconnect.
- BR-12 Marker authentication: integration emits a per-session random nonce in OSC 133 params `[INFERENCE: standard has no nonce; Nexus extension]`; parser drops markers lacking it, bounds buffers, rejects unknown OSC from untrusted output for HTML/links.
- BR-13 Redaction before preview/notification/LLM; no terminal text to AI without explicit policy+consent.

## 5. OSC 133 marker model (S4; S8 to confirm)
`A` prompt start → `B` prompt end/input start → `C` output start (command executing) → `D;<exit>` command end. kitty options: `aid`, `cl`, `k=s` (secondary prompt/PS2), `cmdline`/`cmdline_url` (S4). State machine: `PROMPT(A) → INPUT(B) → RUNNING(C) → PROMPT(D→A)`. Missing B (common) ⇒ treat A…C as prompt+input. Duplicate/out-of-order markers ⇒ reset to UNKNOWN and drop grouping for that block. Shells: bash (via PROMPT_COMMAND/DEBUG trap — Warp notes bash needs preexec shim, S3), zsh (precmd/preexec), fish (events). Support matrix to be proven in tests.

## 6. Mode switching: SMART_INPUT ↔ INTERACTIVE_PTY
Enter INTERACTIVE_PTY when ANY: (a) DECSET 1049/1047/47 alt-screen set; (b) DECSET 1000–1006 mouse reporting on; (c) no prompt marker (`A`/`B`) seen within N ms after a command is `RUNNING` and PTY in non-canonical mode `[INFERENCE: needs probe via remote stty/ tcgetattr not available over plain PTY — use output heuristics]`; (d) prompt matches password heuristic (`[Pp]assword.*:` / `passphrase`, sudo) — raw mode, input not echoed to draft or stored; (e) user manual toggle (e.g. Ctrl+Shift+T, configurable).
Return to SMART_INPUT when: alt-screen reset AND next `A/B` marker; or user toggle; or recovery action "Reset prompt detection".
In INTERACTIVE_PTY: all keys incl. Esc, Ctrl combos, mouse and resize (SIGWINCH via PTY resize) go to xterm.js untouched; editor hidden or inert. Nested `ssh`, vim, nano, top, less, tmux-in-tmux, `bash -x` debugging: raw. Failure mode: if detection wrong, the toggle must always be reachable and never be captured by the app.
Note: nested ssh prints no OSC 133 from the inner shell ⇒ stays raw by rule (c) unless inner integration installed.

## 7. Threat model / negative tests (controlled fixtures only)
Forged OSC 133/OSC 8/OSC 52 from `cat evil.txt`; HTML/JS in output; title-set sequences; over-long OSC; CSI cursor-report injection into draft; paste containing ESC[201~ (bracketed-paste breakout) — strip `\e[201~` from drafts.

## 8. Executable test-case list
Format: ID | layer | steps → expected. Layers: PW=Playwright, PTY=pty-fixture (local container), UNIT.
| ID | layer | case |
|---|---|---|
| TC-01 | PW | 300-char draft, click at char 150 and type X → X at index 150; no execution |
| TC-02 | PW | Home/End/Alt+←/→/Ctrl+A/word select behave; triple-click selects logical line across soft wrap |
| TC-03 | PW | undo/redo over 20 edits restores exact text |
| TC-04 | PTY | 100-line bash script w/ quotes, heredoc, `$()` → output byte-identical to running file; sent bytes == draft |
| TC-05 | PTY | multiline draft requires Run; Enter doesn't execute it |
| TC-06 | PTY | `cd /tmp` then `pwd` in two submissions → /tmp |
| TC-07 | PTY | `sudo -k; sudo true` → mode RAW on prompt; password never in draft/history/logs |
| TC-08 | PTY | vim/nano/top: alt-screen → RAW; keys, mouse, resize delivered; Esc not captured |
| TC-09 | PTY | nested `ssh` to local sshd container → RAW, exit returns to SMART after marker |
| TC-10 | UNIT | OSC 133 parser: A/B/C/D sequences, missing B, out-of-order, oversize, split across chunks |
| TC-11 | PTY | bash, zsh, fish integration emit correct block (cmd, exit, cwd); unknown shell (dash) → grouping off |
| TC-12 | PTY | `cat` of file containing forged 133 and nonce guess → no block created |
| TC-13 | PW | output with `<script>`/OSC 8 javascript: URL → no DOM injection, no navigation |
| TC-14 | UNIT | paste with ESC, \e[201~, NUL, C1 → rejected/stripped, preview shows raw |
| TC-15 | PW | Edit-as-draft on block puts text in editor, no run; Rerun destructive (`rm -rf`) asks confirm |
| TC-16 | PW+PTY | drop network with unsent draft → draft preserved; after reconnect not sent until Run |
| TC-17 | PTY | refresh / gateway restart with tmux alive → same session, no duplicate execution (idempotency key) |
| TC-18 | PW | manual raw toggle reachable inside vim; recovery when prompt detection fails (simulate dropped markers) |
| TC-19 | PW | axe a11y: labels, focus order, 1.3x scaling, screen-reader live-region for block completion |
| TC-20 | PW | second client is spectator (read-only) until approved lease takeover; audit event emitted |

## 9. Platform / compatibility declaration
Browser UI: Chromium/Firefox/WebKit latest via Playwright. Remote hosts: Linux and macOS with bash≥4 (macOS /bin/bash 3.2 untested ⇒ expect fallback; zsh native), zsh, fish. SSH-only fallback (no integration) = raw PTY. Windows shells out of scope (contract is macOS/Linux).

## 10. Open items / blockers
1. S8 (freedesktop OSC 133) unread — A1/C1 to review or provide a mirror before ADR.
2. Nonce extension (BR-12) is Nexus invention; verify it doesn't break kitty/WezTerm/Ghostty if the integration is also used locally.
3. Heuristic (c) in §6 is inference; needs prototype measurement.
4. Spec inconsistencies I-1..I-7 from EZF-2 not re-read here; none obviously touched, A1 to confirm.
5. Tabby and open-source implementation code not studied (docs-level only).
Rollback: doc-only change, revert commit. Performance: n/a.
