# ADR (proposed): connector-sent line-kill/reset prefix for typed-ahead input

Status: **Proposed – needs design and the TC-04 matrix before it can be enabled**
Origin: NX3-104 command-editor behaviour spec, BR-16 (docs/research/command-editor-behaviour-spec.md); EZF-31 (B7).

## Context
R1 uses the fallback only: any raw byte forwarded since the last INPUT puts the session in the raw "typed-ahead" state until the user presses Enter/Ctrl+C and a new `B` arrives. No byte is ever sent by the connector to clean the shell line. UX cost: the smart editor does not return after any raw keystroke (vim, less, apt Y/n, sudo password, stray Esc) until the user clears the line.

## Question
Can the connector send a prefix (e.g. `0x05 0x15`) before a submission so the editor returns immediately, without executing or expanding any typed-ahead byte?

## Known failure (C1 probe, bash 5.2.37, EZF-30)
After raw-forwarded typeahead, the prefix is read in the line editor's current state: `ESC`+`0x05` = M-C-e `shell-expand-line` (a `$(…)` ran); `C-x`+`0x05` = `edit-and-execute-command` (typeahead line executed); vi command mode: `o DRAFT_Xc` executed instead of the draft. User `inputrc`/`bindkey` rebinding of `C-e`/`C-u` is `[INFERENCE]`. zsh and fish were not probed.

## Requirements before enabling
- Eligibility: either an allow-list of raw bytes since the last INPUT (printable text, `0x7f`/`0x08`, complete CSI cursor sequences; everything else, at least `ESC` outside a complete sequence, `C-x`, `C-v`, `C-r`/`C-s`, `M-<digit>`, mode changes, falls back) or a verified per-shell reset step that starts the prefix (abort plus forced insert mode for vi). Count all raw bytes since the last INPUT.
- Binding check reported at `B` in the event log (advisory, forgeable, never authorizes anything; a forged value can only leak the user's own typeahead). Sessions without an event log always use the fallback.
- TC-04/TC-07b matrix per shell and edit mode (bash emacs/vi, zsh emacs/vi, fish): lone `ESC`, `C-x`, `C-v`, `M-5`, unfinished `C-r`, vi `ESC`, rebound `C-u`, and a `$(touch /tmp/ta-canary)` row asserting the canary does not exist. No row may execute or expand any typed-ahead byte.
- Kill-ring residual: readline/zle save killed text for `C-y` `[INFERENCE]`; a connector-sent kill makes this unconditional and must be addressed.

## Decision
None yet.
