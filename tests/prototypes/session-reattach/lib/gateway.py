#!/usr/bin/env python3
"""Simulated Nexus gateway attach for the NX2-002 prototype.

Opens one SSH channel to a node, runs `remote.sh stream <mux> <id>` there and
appends every received line to OUT as `<recv_epoch_ms>\t<line>`. The capture
file stands in for the browser's WebSocket feed. Killing this process is the
"browser closed" event; restarting the gateway container kills it abruptly.

Usage: gateway.py <node> <tmux|herdr> <id> <out-file>
"""
import os
import signal
import subprocess
import sys
import time

SSH_OPTS = [
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "UserKnownHostsFile=/home/gw/.ssh/known_hosts",
    "-o", "ServerAliveInterval=2",
    "-o", "ServerAliveCountMax=3",
    "-o", "ConnectTimeout=5",
    "-i", "/home/gw/.ssh/alice",
]


def main() -> int:
    node, mux, sid, out = sys.argv[1:5]
    cmd = ["ssh", *SSH_OPTS, f"alice@{node}", "/opt/nx/remote.sh", "stream", mux, sid]
    started = int(time.time() * 1000)
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.PIPE)

    def forward(signum, _frame):
        proc.send_signal(signum)

    signal.signal(signal.SIGTERM, forward)
    with open(out, "a", buffering=1, encoding="utf-8", errors="replace") as f:
        f.write(f"{started}\t#GATEWAY-ATTACH node={node} mux={mux} id={sid} pid={os.getpid()}\n")
        for raw in proc.stdout:
            f.write(f"{int(time.time() * 1000)}\t{raw.decode('utf-8', 'replace').rstrip()}\n")
        rc = proc.wait()
        err = proc.stderr.read().decode("utf-8", "replace").strip().replace("\n", " | ")
        f.write(f"{int(time.time() * 1000)}\t#GATEWAY-DETACH rc={rc} stderr={err[:300]}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
