#!/usr/bin/env python3
"""Deterministic output source for the reattach prototype.

Prints `SEQ <n> <epoch_ms>` lines to the terminal and appends the same line to
a ground-truth file that does not depend on any multiplexer. Comparing what a
multiplexer (or a gateway stream) shows against the truth file gives output
continuity without trusting the system under test.

A burst is requested by writing a line count to `<truth>.burst`; the producer
emits that many lines with no delay, then deletes the control file.

SIGHUP keeps its default action (terminate), so a multiplexer that hangs up its
pane on detach is detected as a dead producer rather than hidden.
"""
import os
import sys
import time


def main() -> int:
    truth_path = sys.argv[1]
    interval = float(sys.argv[2]) if len(sys.argv) > 2 else 0.1
    burst_path = truth_path + ".burst"
    n = 0
    with open(truth_path, "a", buffering=1) as truth:
        truth.write(f"START pid={os.getpid()} uid={os.getuid()} ms={int(time.time() * 1000)}\n")
        while True:
            count = 1
            if os.path.exists(burst_path):
                try:
                    with open(burst_path) as f:
                        count = max(1, int(f.read().strip() or "1"))
                finally:
                    os.unlink(burst_path)
                truth.write(f"BURST start={n + 1} count={count} ms={int(time.time() * 1000)}\n")
            for _ in range(count):
                n += 1
                line = f"SEQ {n} {int(time.time() * 1000)}"
                sys.stdout.write(line + "\n")
                sys.stdout.flush()
                truth.write(line + "\n")
            time.sleep(interval)


if __name__ == "__main__":
    sys.exit(main())
