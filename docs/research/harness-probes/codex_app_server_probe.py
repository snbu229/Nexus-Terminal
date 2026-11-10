#!/usr/bin/env python3
"""Black-box probe of Codex's native `codex app-server` thread lifecycle (NX2-004).

Codex CLI has no native ACP endpoint; ACP is only available through the
separate `codex-acp` adapter. This probe checks the native protocol that both
`codex-acp` and a direct Nexus adapter would build on: `thread/start`,
`thread/list`, `thread/resume`, `thread/unsubscribe`, and resume after a cold
process restart. It never calls `turn/start`, so no model call is made.

Runs with HOME and CODEX_HOME in a throwaway directory.

Usage:
    codex_app_server_probe.py --out result.json [-- codex app-server]
"""

import argparse
import json
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from acp_probe import Agent  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("agent", nargs=argparse.REMAINDER)
    args = ap.parse_args()
    argv = args.agent[1:] if args.agent and args.agent[0] == "--" else args.agent
    argv = argv or ["codex", "app-server"]

    sandbox = tempfile.mkdtemp(prefix="codex-probe-")
    home = os.path.join(sandbox, "home")
    work = os.path.join(sandbox, "work")
    os.makedirs(os.path.join(home, ".codex"))
    os.makedirs(work)
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": home,
        "CODEX_HOME": os.path.join(home, ".codex"),
        "TMPDIR": sandbox,
    }
    steps = []

    def run_phase(label, thread_id=None):
        agent = Agent(argv, env, work)

        def call(method, params):
            t0 = time.monotonic()
            resp = agent.request(method, params)
            steps.append({"phase": label, "method": method, "params": params,
                          "response": resp, "ms": round((time.monotonic() - t0) * 1000)})
            return resp

        call("initialize", {"clientInfo": {"name": "nexus-codex-probe", "version": "0.1.0"}})
        agent._send({"jsonrpc": "2.0", "method": "initialized"})
        if thread_id is None:
            started = call("thread/start", {"cwd": work})
            thread_id = ((started.get("result") or {}).get("thread") or {}).get("id")
        call("thread/list", {"cwd": work})
        call("thread/loaded/list", {})
        if thread_id:
            call("thread/resume", {"threadId": thread_id, "cwd": work})
            call("thread/read", {"threadId": thread_id})
            call("thread/unsubscribe", {"threadId": thread_id})
        call("thread/resume", {"threadId": "00000000-0000-0000-0000-000000000000", "cwd": work})
        notes = agent.notifications
        stderr = agent.close()
        return thread_id, notes, stderr

    tid, notes1, err1 = run_phase("first")
    _, notes2, err2 = run_phase("after-restart", tid) if tid else (None, [], "")

    def outcome(r):
        if "result" in r:
            return "ok"
        if r.get("timeout"):
            return "timeout"
        return f"error {r['error'].get('code')}: {str(r['error'].get('message'))[:160]}"

    report = {
        "probe": "nexus-codex-probe 0.1.0",
        "argv": argv,
        "utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "thread_id": tid,
        "method_outcomes": {f"{i}:{s['phase']}:{s['method']}": outcome(s["response"])
                            for i, s in enumerate(steps)},
        "notification_methods": sorted({n.get("method") for n in notes1 + notes2}),
        "steps": steps,
        "stderr_tail": (err1 + "\n--- restart ---\n" + err2)[-4000:],
    }
    with open(args.out, "w") as f:
        json.dump(report, f, indent=2, sort_keys=True)
    print(json.dumps({k: report[k] for k in ("thread_id", "method_outcomes",
                                             "notification_methods")}, indent=2))
    return 0 if tid else 1


if __name__ == "__main__":
    sys.exit(main())
