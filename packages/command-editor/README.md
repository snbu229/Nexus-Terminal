# @nexus/command-editor

Framework-free command editor model for Nexus Command Studio (M-D1, D1-04). Written from `docs/research/command-editor-behaviour-spec.md` (EZF-8 branch, rev 10). No Warp code or assets. No UI here: wiring is D1-07.

Markers are **unauthenticated dev markers** (BR-12 nonce not implemented in M-D1); every block carries that label.

| Module       | Content                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `draft.ts`   | cursor/word/line movement, selection, insert/delete anywhere, multiline, undo/redo (draft-local)                    |
| `paste.ts`   | `sanitizePaste`: strip ESC/C0/C1, CRLF and lone CR to `\n`, flag bidi/zero-width/homoglyph, preview; never auto-run |
| `history.ts` | per-session, deduplicated, prefix search, up/down that stashes the current draft                                    |
| `blocks.ts`  | `BlockBuilder` from A/B/C/D events; `unknown` for missing exit/duration/command/cwd                                 |
| `encode.ts`  | BR-6 framing; `isComplete` (Enter submits only a complete draft)                                                    |
| `session.ts` | `EditorSession`: state machine, SMART_INPUT/INTERACTIVE_PTY, BR-16 latch, key routing                               |

## Spec test-case coverage (this package is UNIT layer only)

Executed here (model level): TC-01, TC-02, TC-03 (model parts), TC-05 (sends nothing on Enter, framed on Run), TC-10 (state-machine part: PENDING rules, `submit_seq`, late/duplicate B, A to B with no C/D, in-band B without A, latch set by raw byte in PROMPT/INPUT-under-INTERACTIVE_PTY/PENDING/RUNNING/UNKNOWN, never cleared), TC-14, TC-18 (model: toggle/reset and the N16 negative), TC-22 (routing part: raw `0x03`/`0x04`/`0x1a` in PENDING/RUNNING/UNKNOWN), TC-25 (model: bracketed-paste reports outside INPUT ignored), TC-26 (model), TC-07b (model: keys right after Enter are raw, never drafted; no keystroke text in the snapshot).

Not executed (need PTY, browser, tmux, real shells or other components): TC-04, TC-06, TC-07, TC-08, TC-09, TC-11, TC-12, TC-13, TC-15, TC-16, TC-17, TC-19, TC-20, TC-21, TC-23, TC-24; TC-10 byte-level parts (marker byte parsing, 4 KiB OSC cap, split at every offset, nonce handling: no byte parser or nonce in this package); TC-01/02/03/18 Playwright layers.

## Notes and limits

- Positions are UTF-16 indexes; character movement/deletion is by grapheme (`Intl.Segmenter`).
- `isComplete` handles quotes, `$(`, backticks, trailing backslash and here-docs. Shell keyword blocks (`if`, `do`) are left to the shell's PS2.
- Bracketed paste `unknown` is treated as off (multiline sends one confirmed line at a time). The caller sends frames one at a time and re-confirms each.
- Sequence gaps drop the state to UNKNOWN (recoverable on the next A then B); duplicates/reordering are ignored and recorded in `anomalies`.
- Snapshot/restore keep state and the latch only; draft text and keystrokes are never stored.
