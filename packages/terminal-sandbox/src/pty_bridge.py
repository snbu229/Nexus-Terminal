#!/usr/bin/env python3
"""PTY bridge for the dev local-sandbox (Python stdlib only; no compiler needed).

usage: pty_bridge.py COLS ROWS PROGRAM [ARGS...]

fd 0  : bytes written to the PTY master (terminal input)
fd 1  : bytes read from the PTY master (terminal output)
fd 3  : control channel, newline-terminated lines: "resize COLS ROWS"
The child runs with this process's environment (the parent already scrubbed it).
Exit status is the child's exit status (128+signal when signalled).
"""
import errno
import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios


def set_size(fd, cols, rows):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


def main():
    cols, rows, prog, args = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[3:]
    pid, master = pty.fork()
    if pid == 0:
        try:
            os.execvp(prog, args)
        finally:
            os._exit(127)
    set_size(master, cols, rows)

    def forward(signum, _frame):
        try:
            os.kill(pid, signal.SIGHUP)
        except ProcessLookupError:
            pass

    signal.signal(signal.SIGTERM, forward)
    ctl_buf = b""
    stdin_open = True
    ctl_open = True
    while True:
        rlist = [master]
        if stdin_open:
            rlist.append(0)
        if ctl_open:
            rlist.append(3)
        try:
            ready, _, _ = select.select(rlist, [], [])
        except InterruptedError:
            continue
        if master in ready:
            try:
                data = os.read(master, 65536)
            except OSError as e:
                if e.errno == errno.EIO:
                    break
                raise
            if not data:
                break
            os.write(1, data)
        if 0 in ready:
            data = os.read(0, 65536)
            if not data:
                # parent went away: hang up the shell
                forward(None, None)
                stdin_open = False
            else:
                while data:
                    n = os.write(master, data)
                    data = data[n:]
        if 3 in ready:
            data = os.read(3, 4096)
            if not data:
                ctl_open = False
            ctl_buf += data
            while b"\n" in ctl_buf:
                line, ctl_buf = ctl_buf.split(b"\n", 1)
                parts = line.split()
                if len(parts) == 3 and parts[0] == b"resize":
                    try:
                        set_size(master, int(parts[1]), int(parts[2]))
                    except (ValueError, OSError):
                        pass
    _, status = os.waitpid(pid, 0)
    if os.WIFEXITED(status):
        sys.exit(os.WEXITSTATUS(status))
    sys.exit(128 + os.WTERMSIG(status))


main()
