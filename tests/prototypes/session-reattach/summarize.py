#!/usr/bin/env python3
"""Turn one run.sh results directory into summary.json and summary.md.

Verdict labels follow SESSION_PERSISTENCE.md: a reattach only counts as
REATTACHED_ORIGINAL when the same producer PID is still running. A live
session with a different process is RESTORED_NEW_PROCESS, never "reattached".
"""
import glob
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
import check_continuity as cc  # noqa: E402
import probe  # noqa: E402

NODES = ["node1", "node2"]
MUXES = ["tmux", "herdr"]
OWNER_UID = 2001
ATTACH_ENDS = ("E1_browser_close_begin", "E2_gateway_restart_begin", "E3_outage_begin", "E5_done")
OWNERSHIP_PHASES = ["baseline", "E1", "E2", "E3"]
DETACH_EVENTS = [
    ("E1", "E1_browser_close_begin", "E1_reattach"),
    ("E2", "E2_gateway_restart_begin", "E2_reattach"),
    ("E3", "E3_outage_begin", "E3_reattach"),
]


def load_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def read_lines(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.readlines()
    except OSError:
        return []


def parse_truth(lines):
    """-> (list of (seq, ms), list of burst dicts, list of START dicts)"""
    seqs, bursts, starts = [], [], []
    for line in lines:
        parts = line.split()
        if len(parts) == 3 and parts[0] == "SEQ":
            seqs.append((int(parts[1]), int(parts[2])))
        elif parts and parts[0] in ("BURST", "START"):
            kv = dict(p.split("=", 1) for p in parts[1:] if "=" in p)
            (bursts if parts[0] == "BURST" else starts).append({k: int(v) for k, v in kv.items()})
    return seqs, bursts, starts


def seqs_in(truth, lo_ms, hi_ms, exclude=()):
    ex = set(exclude)
    return [s for s, ms in truth if lo_ms <= ms <= hi_ms and s not in ex]


def pct(cov):
    return None if cov is None else round(100 * cov, 2)


def classify(base, after):
    if not after or after.get("error") or after.get("alive") is None:
        return "UNKNOWN"
    bp = (base or {}).get("producer") or {}
    ap = after.get("producer") or {}
    if after.get("alive") and ap.get("pid") and ap.get("pid") == bp.get("pid") and ap.get("started") == bp.get("started"):
        return "REATTACHED_ORIGINAL"
    if after.get("alive"):
        return "RESTORED_NEW_PROCESS" if ap.get("pid") else "RESTORED_NO_PROCESS"
    return "REMOTE_PROCESS_EXITED"


def ownership(st):
    if not st or st.get("error"):
        return {"ok": False, "reason": "no status"}
    checks = {
        "producer_uid": (st.get("producer") or {}).get("uid") == OWNER_UID,
        "server_uid": (st.get("server") or {}).get("uid") == OWNER_UID,
        "socket_owner": (st.get("socket") or {}).get("owner_uid") == OWNER_UID,
        "socket_not_world_accessible": str((st.get("socket") or {}).get("mode", "7"))[-1:] == "0",
        "socket_dir_owner_only": str((st.get("socket_dir") or {}).get("mode", "")).endswith("00"),
    }
    return {"ok": all(checks.values()), "checks": checks,
            "socket": st.get("socket"), "socket_dir": st.get("socket_dir"), "log": st.get("log")}


def summarize(run_dir):
    raw = os.path.join(run_dir, "raw")
    events = [json.loads(l) for l in read_lines(os.path.join(run_dir, "events.jsonl")) if l.strip()]
    ev_ms = {}
    for e in events:
        ev_ms.setdefault(e["event"], e["ms"])
    out = {"run": os.path.basename(run_dir.rstrip("/")),
           "environment": load_json(os.path.join(run_dir, "environment.json"), {}), "results": {}}

    for node in NODES:
        for mux in MUXES:
            key = f"{node}/{mux}"
            r = {"started": any(e["event"] == "start_ok" and (e.get("detail") or {}).get("node") == node
                                and e["detail"].get("mux") == mux for e in events)}
            truth, bursts, starts = parse_truth(read_lines(os.path.join(raw, f"truth-pre_reboot-{node}-{mux}.txt")))
            burst_seqs = set()
            for b in bursts:
                burst_seqs.update(range(b["start"], b["start"] + b["count"]))
            t_an = cc.analyze([s for s, _ in truth])
            gaps_ms = [b - a for (_, a), (_, b) in zip(truth, truth[1:])]
            r["producer"] = {"lines": t_an["unique"], "missing_in_truth": t_an["missing"],
                             "restarts": max(0, len(starts) - 1),
                             "max_interval_ms": max(gaps_ms) if gaps_ms else None}

            base = load_json(os.path.join(raw, f"status-baseline-{node}-{mux}.json"))
            by_phase = {ph: ownership(base if ph == "baseline" else
                                      load_json(os.path.join(raw, f"status-{ph}-{node}-{mux}.json")))
                        for ph in OWNERSHIP_PHASES}
            r["ownership"] = dict(by_phase["baseline"], ok=all(o["ok"] for o in by_phase.values()),
                                  failed_phases=[ph for ph, o in by_phase.items() if not o["ok"]])
            log_lines = read_lines(os.path.join(raw, f"log-pre_reboot-{node}-{mux}.txt"))
            log_seqs = cc.extract(log_lines)
            stream_lines = read_lines(os.path.join(raw, "capture", f"{node}-{mux}.stream"))
            attaches = [e for e in events if e["event"] == "attach"
                        and e["detail"]["node"] == node and e["detail"]["mux"] == mux]

            # E1..E3: survival, backfill and log coverage of the detached window, time to first output.
            r["events"] = {}
            for name, begin, reattach in DETACH_EVENTS:
                if begin not in ev_ms or reattach not in ev_ms:
                    continue
                window = seqs_in(truth, ev_ms[begin], ev_ms[reattach], burst_seqs)
                backfill = cc.extract(read_lines(os.path.join(raw, f"backfill-{name}-{node}-{mux}.txt")))
                att = next((a for a in attaches if a["ms"] >= ev_ms[reattach]), None)
                ttfo = None
                if att:
                    fa = cc.first_after(stream_lines, att["detail"]["from_line"])
                    ttfo = fa["recv_ms"] - att["ms"] if fa["recv_ms"] else None
                r["events"][name] = {
                    "verdict": classify(base, load_json(os.path.join(raw, f"status-{name}-{node}-{mux}.json"))),
                    "detached_ms": ev_ms[reattach] - ev_ms[begin],
                    "lines_while_detached": len(window),
                    "backfill_coverage_pct": pct(cc.coverage(window, backfill)["coverage"]),
                    "durable_log_coverage_pct": pct(cc.coverage(window, log_seqs)["coverage"]) if log_lines else None,
                    "time_to_first_output_ms": ttfo,
                }

            # Live stream completeness while attached (excluding the burst).
            stream_seqs = cc.extract(stream_lines)
            attached = []
            for a in attaches:
                end = min((ev_ms[x] for x in ATTACH_ENDS if x in ev_ms and ev_ms[x] > a["ms"]), default=None)
                if end:
                    attached += seqs_in(truth, a["ms"] + 1500, end - 500, burst_seqs)
            r["stream_steady_coverage_pct"] = pct(cc.coverage(attached, stream_seqs)["coverage"])

            bl = sorted(burst_seqs)
            r["burst"] = {
                "lines": len(bl),
                "stream_coverage_pct": pct(cc.coverage(bl, stream_seqs)["coverage"]),
                "backfill_coverage_pct": pct(cc.coverage(bl, cc.extract(read_lines(os.path.join(raw, f"backfill-E4-{node}-{mux}.txt"))))["coverage"]),
                "durable_log_coverage_pct": pct(cc.coverage(bl, log_seqs)["coverage"]) if log_lines else None,
            }
            r["durable_log"] = "present" if log_lines else "none"
            r["second_user"] = {}
            for layer in ("outer", "server"):
                p = os.path.join(raw, f"probe-{layer}-{node}-{mux}")
                g = probe.grade(layer, load_json(p + "-alice.json"), load_json(p + "-bob.json"),
                                load_json(p + "-target-pre.json"))
                g["foreign_output"] = (load_json(p + "-bob.json") or {}).get("output")
                r["second_user"][layer] = g
            # E6 is a container restart: new PID namespace, filesystem kept, no logind shutdown.
            r["container_restart"] = {
                "after_restart": classify(base, load_json(os.path.join(raw, f"status-E6-{node}-{mux}.json"))),
                "after_server_restart": classify(base, load_json(os.path.join(raw, f"status-E6_herdr_restarted-{node}-{mux}.json"))),
            }
            out["results"][key] = r
    return out


def fmt(v):
    return "–" if v is None else str(v)


def to_markdown(s):
    L = [f"# NX2-002 reattach run {s['run']}", "", "```json", json.dumps(s.get("environment", {}), indent=1), "```", ""]
    keys = list(s["results"])
    L += ["## Survival and continuity", "",
          "| node/mux | event | verdict | detached ms | lines while detached | backfill % | durable log % | first output ms |",
          "|---|---|---|---|---|---|---|---|"]
    for k in keys:
        for name, e in s["results"][k]["events"].items():
            L.append(f"| {k} | {name} | {e['verdict']} | {fmt(e['detached_ms'])} | {fmt(e['lines_while_detached'])} | "
                     f"{fmt(e['backfill_coverage_pct'])} | {fmt(e['durable_log_coverage_pct'])} | {fmt(e['time_to_first_output_ms'])} |")
    L += ["", "## Stream, burst, logging, ownership", "",
          "| node/mux | started | producer missing / max gap ms | stream steady % | burst stream % | burst backfill % | burst log % | durable log | ownership ok (baseline–E3) | 2nd user: outer | 2nd user: server | E6 container restart | after server restart |",
          "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for k in keys:
        r = s["results"][k]
        L.append(f"| {k} | {r['started']} | {fmt(r['producer']['missing_in_truth'])} / {fmt(r['producer']['max_interval_ms'])} | "
                 f"{fmt(r['stream_steady_coverage_pct'])} | {fmt(r['burst']['stream_coverage_pct'])} | {fmt(r['burst']['backfill_coverage_pct'])} | "
                 f"{fmt(r['burst']['durable_log_coverage_pct'])} | {r['durable_log']} | {r['ownership']['ok']} | "
                 f"{r['second_user']['outer']['verdict']} | {r['second_user']['server']['verdict']} | "
                 f"{r['container_restart']['after_restart']} | {r['container_restart']['after_server_restart']} |")
    L += ["", "Ownership details:", ""]
    for k in keys:
        L.append(f"- `{k}`: {json.dumps(s['results'][k]['ownership'])}")
    L += ["", "Second-user probes (verdict, owner control, foreign attempt, reason):", ""]
    for k in keys:
        for layer, g in s["results"][k]["second_user"].items():
            L.append(f"- `{k}` {layer}: {g['verdict']}; control={g['control']}; foreign={g['foreign']}; {g['reason']}; "
                     f"output={json.dumps((g.get('foreign_output') or '')[:160])}")
    return "\n".join(L) + "\n"


def main():
    run_dir = sys.argv[1]
    s = summarize(run_dir)
    with open(os.path.join(run_dir, "summary.json"), "w") as f:
        json.dump(s, f, indent=1)
    with open(os.path.join(run_dir, "summary.md"), "w") as f:
        f.write(to_markdown(s))
    return 0


if __name__ == "__main__":
    sys.exit(main())
