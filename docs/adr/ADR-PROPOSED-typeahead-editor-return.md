# ADR (proposed): returning the smart editor after typed-ahead input

Status: **Proposed – not in R1.** Owner: **A1 (CTO)**. Author of the record: A7. Origin: NX3-104 command-editor behaviour spec (docs/research/command-editor-behaviour-spec.md), BR-16; C1 re-reviews 7 and 8 (EZF-32, EZF-34 B8/B9/N14/N15); board R1 scope cut on EZF-2 (answered 2026-11-10 10:06 UTC); EZF-38.
Supersedes: `ADR-PROPOSED-typeahead-restricted-enter-clear.md` (removed; its content is option 2 below). No other file describes restricted Enter as a separate live option.

## Context
R1 (spec rev 9) latches the typed-ahead flag per shell session. Once any raw byte is forwarded during PENDING, RUNNING, UNKNOWN or the typed-ahead state, the smart editor stays off until the user opens a new shell (new PTY, fresh BR-12 nonce handshake). No event clears the latch: not Ctrl+C, Enter, `A`/`B`/`C`/`D`, a prompt with an empty queue or an alt-screen exit; reconnect, reload, tmux reattach, nested shells, `exec bash` and integration re-init do not reset it. Cost: after vim, less, apt Y/n or a stray key the user opens a new tab.

This ADR records the ways to bring the editor back inside the same session. None may ship until every row under "Requirements before enabling" has passed.

## Options and known residuals
### Option 1 – rev 8 rule: Ctrl+C only
A `B` whose sequence number is greater than `clear_mark` clears the flag when the last raw byte forwarded was `0x03` (not in the alternate screen), nothing was forwarded after it, and `clear_mark` is the highest event sequence number the connector had seen when the `0x03` was forwarded. A raw Enter never clears. Premise `[INFERENCE]`: on a POSIX tty, INTR with `ISIG` set and `NOFLSH` clear flushes the input queue, so a `B` after `0x03` is a prompt with an empty queue.
**Known residual (B9, C1 re-review 8, bash 5.2.37 probe with a stand-in event log):** `clear_mark` comes from the connector's lagging view of the event log. A `B` written before the `0x03` reached the tty but read after it still has seq > `clear_mark`, so the flag clears on a stale `B` while a program started by the typeahead is in the foreground. With 500 ms lag, typeahead `bash --norc --noprofile -i\r` or `python3 -q\r` behind `sleep 1.5` and a Ctrl+C when that program's prompt appears sent the next draft to the inner shell or to python3 (SyntaxError).
**Residual (b): programs that survive the Ctrl+C.** `ssh` (raw mode, not alternate screen: the `ssh prod⏎` case), raw-mode REPLs and programs that catch SIGINT and keep reading stdin (`sudo -s`/`su` root shells, `python3`, `psql`, `mysql`): `^C` flushes the queue but does not end the program, so a later `B` is not proof that the local shell is in the foreground. A foreground program that turns `ISIG` off (`stty -isig`) outside the alternate screen reads `0x03` as data. Per-shell behaviour of the flush is `[INFERENCE]`; a shell that does not flush stays latched.
**Other:** if a shell draws no new `B` after `^C` at an empty prompt (zsh `precmd`, fish prompt events: `[INFERENCE]`), nothing returns the editor; recovery is `sleep 100`, Enter, Ctrl+C.

### Option 2 – restricted Enter (folded in from the removed ADR)
A raw `\r` counts as a clearing key only if all hold: it is forwarded in the typed-ahead state at a prompt the connector has already seen (a `B` with seq > `submit_seq` and no later `C`); the span since the last INPUT holds no other `\r` or `\n`; a `\r` forwarded in PENDING, RUNNING or UNKNOWN never qualifies. The clearing `B` rules (seq > `clear_mark`, nothing typed after) are unchanged.
**Known residual:** a `B` after a `\r` forwarded while a command runs (`cat⏎`, `ssh prod⏎`, `sudo -s⏎`) can arrive before the shell reads the queued line (C1 probe EZF-32). The "prompt already seen" condition uses the same lagging event-log view as option 1 and inherits B9 (N15). An incomplete typed-ahead line (`ESC`, `C-x`, `C-v`) may make Enter an editing key and not a submission.

### Option 3 – queue depth at `B` (A5 direction 1 for B9)
The shell integration reports at `B` whether the tty input queue is non-empty (`FIONREAD`/`TIOCINQ`, read by the helper before the line editor reads). A `B` that reports queued bytes never clears.
**Residual:** bytes still in flight from the connector when the hook runs; the report goes through the advisory, forgeable event log (it can only make a clear less likely to be safe if forged "empty", so the ADR must say why that is acceptable or fail closed when the field is missing); needs a per-shell helper.

### Option 4 – hard ordering signal, fail closed (A5 direction 2)
A mechanism that orders the PTY channel against the event log (for example a token carried on both), used only to veto a clear. If the order cannot be shown, the session stays typed-ahead.
**Residual:** the PTY stream is forgeable by the foreground program (BR-12), so a token in the PTY channel can only veto, never authorise; the mechanism needs its own nonce handling and bounded latency.

### Option 5 – explicit user action
An explicit "re-enable editor" control (button, command) after a typed-ahead state. **Not in R1.** Safe only if the user's claim is checked against a signal from options 1–4 (a bare button reopens B9: the user cannot know which program holds the tty). A design choice for the CTO.

## Requirements before enabling
Every row is an unexecuted `[UNVERIFIED-LOCAL]` release gate. All run per shell and edit mode (bash emacs/vi, zsh emacs/vi, fish) with 500 ms op-1 latency injected and the draft `echo X` submitted the instant the editor returns, unless stated. A draft byte reaching a program that the typeahead started fails the row; a row passes if the editor stays off or `echo X` runs in the outer shell (history and event-log `cmdline`).

- **B5:** the shell line is never imported into the draft; a typed-ahead canary (`S3cr3t-CANARY`) matches 0 times in the draft store, history, logs, redaction input, the event log and AI buffers (TC-07b sudo rows).
- **B6:** `true` plus `cd src` typed within 100 ms of Enter, then `echo X`: executed command is `echo X`, `cd src` in no executed command, history or `cmdline`.
- **B7 matrix** (TC-07b): (1) plain `cd src`; (2) lone `ESC`; (3) `C-x`; (4) `C-v`; (5) `M-5`; (6) unfinished `C-r`; (7) vi command mode; (8) rc rebinding `C-u`/`C-e`/`C-g`; (9) `$(touch /tmp/ta-canary)` with each ending; `/tmp/ta-canary` must not exist; no connector-originated byte on the PTY.
- **B8 queued-line rows:** (Q1) `sleep 1.5` + `cat\r`; (Q2) `sleep 1.5` + `sleep 1\rcat\r`; (Q3) `read -r x` consuming `y\r`; (Q4) `stty -isig; sleep 1.5` + `cat\r` then `0x03` (records which outcome occurs; a draft read by the typeahead program blocks the option); each of Q1–Q3 followed by a raw Ctrl+C and a new `B`.
- **B9 latency rows:** typeahead during `sleep 1.5` of (L1) an interactive shell (stand-in for `sudo -s` with cached credentials), (L2) `python3 -q`, (L3) `ssh` to the TC-09 sshd container, each followed by Ctrl+C sent as soon as that program's prompt appears in the PTY output, before the connector has read the event-log `B` of the prompt that started it; plus the same with a 500 ms op-1 lag on the Ctrl+C when the program's prompt appears, in every shell and edit mode.
- **TC-10 `D A B … C` case:** a `0x03` forwarded at `clear_mark` = k, then the stream `D A B` (seq > k) and then a `C`; the specified outcome of the chosen option must hold (stale `B` before the `0x03` reached the tty never clears; with `C` after it the flag stays set).
- **N14 queued-`^C` rows:** send `^C` while `cat\r` and again while `sleep 1\rcat\r` are still queued behind `sleep 1.5`; `cat` must never run (absent from history and `cmdline`). This is the test of the flush premise and was moved here from R1; it no longer gates R1 safety.
- **N15:** all B9 rows above also run against option 2's "prompt already seen" condition.
- **N10:** manual row recording whether `C-y` yanks typed-ahead text killed by the user's Ctrl+U/Ctrl+K from the shell kill ring (reported, not assumed).
- **N11/N13:** after any clear, `echo X` executes as `echo X`; per shell record whether a new `B` follows `^C` at an empty prompt; in-band sessions (no event log) must meet the same bound or stay latched.
- **Alt-screen:** a `0x03` forwarded in the alternate screen is not a clearing key.
- **Persistence:** reconnect, reload, tmux reattach, nested shell, `exec bash` and integration re-init must each leave the state (latched or cleared) exactly as it was.
- The R1 latch rows (spec TC-07b, TC-10, TC-26) keep passing when the option is disabled.

## Decision
None yet. Not in R1. Owner A1 (CTO); A5 re-reviews against the rows above before it can ship.
