#!/usr/bin/env python3
"""Black-box ACP capability probe for harness agents (NX2-004 / EZF-11).

Spawns an ACP agent over stdio, sends `initialize`, then exercises the session
lifecycle methods that Nexus needs for resume (`session/new`, `session/list`,
`session/load`, `session/resume`, `session/close`). It never sends
`session/prompt`, so no model call is made and no credentials are needed
beyond whatever the agent requires for `session/new`.

The agent runs with HOME/XDG_* pointed at a throwaway directory so the probe
cannot read or modify the operator's real harness config or sessions.

Usage:
    acp_probe.py --out result.json -- opencode acp
    acp_probe.py --out result.json -- codex-acp

Output is a JSON transcript of every request and response (or error), plus a
derived capability summary. Exit code is 0 if `initialize` succeeded.
"""

import argparse
import json
import os
import select
import subprocess
import sys
import tempfile
import time

PROTOCOL_VERSION = 1
TIMEOUT_S = 30


class Agent:
    def __init__(self, argv, env, cwd):
        self.proc = subprocess.Popen(
            argv,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            cwd=cwd,
        )
        self.next_id = 1
        self.buf = b""
        self.notifications = []

    def request(self, method, params):
        req_id = self.next_id
        self.next_id += 1
        msg = {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}
        self.proc.stdin.write((json.dumps(msg) + "\n").encode())
        self.proc.stdin.flush()
        deadline = time.monotonic() + TIMEOUT_S
        while time.monotonic() < deadline:
            line = self._readline(deadline)
            if line is None:
                break
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if obj.get("id") == req_id and ("result" in obj or "error" in obj):
                return obj
            if "method" in obj and "id" in obj:
                # Agent -> client request (e.g. fs/*, session/request_permission).
                # The probe never prompts, so refuse anything that arrives.
                self._send({"jsonrpc": "2.0", "id": obj["id"],
                            "error": {"code": -32601, "message": "probe: not supported"}})
            elif "method" in obj:
                self.notifications.append(obj)
        return {"timeout": True, "after_s": TIMEOUT_S}

    def _send(self, obj):
        self.proc.stdin.write((json.dumps(obj) + "\n").encode())
        self.proc.stdin.flush()

    def _readline(self, deadline):
        while b"\n" not in self.buf:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return None
            ready, _, _ = select.select([self.proc.stdout], [], [], remaining)
            if not ready:
                return None
            chunk = os.read(self.proc.stdout.fileno(), 65536)
            if not chunk:
                return None
            self.buf += chunk
        line, self.buf = self.buf.split(b"\n", 1)
        return line.decode(errors="replace")

    def close(self):
        try:
            self.proc.stdin.close()
            self.proc.wait(timeout=5)
        except Exception:
            self.proc.kill()
        return self.proc.stderr.read().decode(errors="replace")[-4000:]


def summarize(init_result):
    caps = (init_result or {}).get("agentCapabilities", {}) or {}
    sess = caps.get("sessionCapabilities", {}) or {}
    return {
        "protocolVersion": (init_result or {}).get("protocolVersion"),
        "agentInfo": (init_result or {}).get("agentInfo"),
        "loadSession": caps.get("loadSession", False),
        "sessionCapabilities": sess,
        "promptCapabilities": caps.get("promptCapabilities"),
        "mcpCapabilities": caps.get("mcpCapabilities"),
        "authMethods": [m.get("id") for m in (init_result or {}).get("authMethods", []) or []],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("agent", nargs=argparse.REMAINDER)
    args = ap.parse_args()
    argv = args.agent[1:] if args.agent and args.agent[0] == "--" else args.agent
    if not argv:
        ap.error("agent command required after --")

    sandbox = tempfile.mkdtemp(prefix="acp-probe-")
    home = os.path.join(sandbox, "home")
    work = os.path.join(sandbox, "work")
    os.makedirs(home)
    os.makedirs(work)
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": home,
        "XDG_CONFIG_HOME": os.path.join(home, ".config"),
        "XDG_DATA_HOME": os.path.join(home, ".local/share"),
        "XDG_STATE_HOME": os.path.join(home, ".local/state"),
        "XDG_CACHE_HOME": os.path.join(home, ".cache"),
        "TMPDIR": sandbox,
    }

    agent = Agent(argv, env, work)
    steps = []

    def call(method, params):
        t0 = time.monotonic()
        resp = agent.request(method, params)
        steps.append({"method": method, "params": params, "response": resp,
                      "ms": round((time.monotonic() - t0) * 1000)})
        return resp

    init_params = {
        "protocolVersion": PROTOCOL_VERSION,
        "clientCapabilities": {"fs": {"readTextFile": False, "writeTextFile": False},
                               "terminal": False},
        "clientInfo": {"name": "nexus-acp-probe", "version": "0.1.0"},
    }
    init = call("initialize", init_params)
    init_result = init.get("result")
    new = call("session/new", {"cwd": work, "mcpServers": []})
    sid = (new.get("result") or {}).get("sessionId")
    call("session/list", {"cwd": work})
    if sid:
        call("session/load", {"sessionId": sid, "cwd": work, "mcpServers": []})
        call("session/resume", {"sessionId": sid, "cwd": work, "mcpServers": []})
        call("session/close", {"sessionId": sid})
        # After close, a resume should either fail or reopen from storage; record which.
        call("session/resume", {"sessionId": sid, "cwd": work, "mcpServers": []})
    call("session/load", {"sessionId": "nexus-probe-nonexistent", "cwd": work, "mcpServers": []})
    stderr_tail = agent.close()

    # Phase 2: cold restart. A new agent process with the same HOME must find
    # the session created by phase 1. This is the case Nexus needs after a
    # supervisor or host restart (SESSION_PERSISTENCE.md).
    if sid:
        agent = Agent(argv, env, work)
        steps.append({"method": "--- process restart ---", "params": None,
                      "response": {"result": None}, "ms": 0})
        call("initialize", init_params)
        call("session/list", {"cwd": work})
        call("session/resume", {"sessionId": sid, "cwd": work, "mcpServers": []})
        call("session/load", {"sessionId": sid, "cwd": work, "mcpServers": []})
        stderr_tail += "\n--- restart ---\n" + agent.close()

    report = {
        "probe": "nexus-acp-probe 0.1.0",
        "argv": argv,
        "utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "summary": summarize(init_result),
        "method_outcomes": {
            f"{i}:{s['method']}": ("ok" if "result" in s["response"]
                                   else "timeout" if s["response"].get("timeout")
                                   else f"error {s['response']['error'].get('code')}: "
                                        f"{str(s['response']['error'].get('message'))[:160]}")
            for i, s in enumerate(steps)
        },
        "steps": steps,
        "notifications": agent.notifications[:50],
        "stderr_tail": stderr_tail,
    }
    with open(args.out, "w") as f:
        json.dump(report, f, indent=2, sort_keys=True)
    print(json.dumps({"summary": report["summary"],
                      "method_outcomes": report["method_outcomes"]}, indent=2))
    return 0 if init_result else 1


if __name__ == "__main__":
    sys.exit(main())
