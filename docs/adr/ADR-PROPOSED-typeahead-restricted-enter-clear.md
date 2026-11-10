# ADR-PROPOSED: restricted Enter as a typeahead-flag clearing key

Status: Proposed (not part of R1). Author: A7. Origin: C1 re-review 7 (EZF-32) B8 option 2, EZF-33.

## Context
BR-16 (rev 8) clears the typeahead flag only on a `B` after a raw `0x03`. A raw Enter never clears it, because a `B` after a `\r` forwarded while a command runs can precede the shell reading the queued line. Cost: apt Y/n and similar need one extra Ctrl+C.

## Proposal
A raw `\r` counts as a clearing key only if all hold:
- it is forwarded in the typed-ahead state at a prompt the connector has already seen (a `B` with seq > `submit_seq` and no later `C`);
- the span since the last INPUT holds no other `\r` or `\n`;
- a `\r` forwarded in PENDING, RUNNING or UNKNOWN never qualifies.
The clearing `B` rules (seq > `clear_mark`, nothing typed after) are unchanged.

## Requirements before enabling
- Pass the TC-07b queued-line rows per shell and edit mode with no draft reaching a typeahead-started program.
- Show in-band sessions (arrival-order numbering) meet the same bound.
- Re-check pending-key cases (`ESC`, `C-x`, `C-v`): an incomplete typed-ahead line may make Enter an editing key, not a submission.

## Decision
Deferred. R1 uses Ctrl+C only.
