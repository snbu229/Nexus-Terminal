#!/usr/bin/env python3
"""Validate docs/research/license-ledger.csv against fetched evidence and Nexus license rules.

Checks
  1. every component in the NX2-005 scope (plan §5.1) has a row;
  2. required columns are non-empty and the recommendation is in the allowed set;
  3. pinned commit/ref and primary license sha256 match evidence.json;
  4. every SPDX identifier in the row's expression was detected in an upstream license file;
  5. policy: copyleft-network / source-available / proprietary licenses are never `adopt`,
     archived upstreams are never `adopt`, and the plan's fixed decisions hold
     (Teleport external-service-only, MinIO/Redis reject, Valkey adopt, HAPI no reuse).

Usage: python3 tools/license-ledger/check_ledger.py [--selftest]
Exit 0 = ledger consistent; non-zero = list of violations printed.
"""
import copy
import csv
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CSV_PATH = os.path.join(ROOT, "docs", "research", "license-ledger.csv")
EVIDENCE = os.path.join(ROOT, "docs", "research", "license-evidence", "evidence.json")

SCOPE = [
    "teleport", "termix", "herdr", "happier", "hapi", "hermes-agent", "opencode", "codex-cli",
    "codex-acp", "acp-spec", "toolhive", "temporal", "minio", "seaweedfs", "garage", "rustfs",
    "versitygw", "ceph", "valkey", "redis", "grafana", "ntfy", "gotify", "headscale", "xtermjs",
    "codemirror-view", "codemirror-state", "codemirror-dev-archived", "tauri", "keycloak",
    "step-ca", "guacamole-server", "guacamole-client", "meshcentral", "paperclip", "waveterm",
    "tabby", "wezterm", "ghostty", "warp", "claude-code",
]
REQUIRED = [
    "component_id", "component", "upstream_repo", "pinned_ref", "pinned_commit",
    "primary_license_file", "primary_license_sha256", "spdx_expression", "notice_obligations",
    "network_copyleft_trigger", "redistribution_limits", "recommendation", "verified_utc",
]
RECOMMENDATIONS = {"adopt", "external-service-only", "reject"}
NEVER_ADOPT = re.compile(r"AGPL|SSPL|RSAL|BUSL|LicenseRef-")
FIXED = {
    "teleport": "external-service-only",
    "minio": "reject",
    "redis": "reject",
    "valkey": "adopt",
    "hapi": "reject",
    "codemirror-dev-archived": "reject",
}


def load():
    with open(CSV_PATH, newline="") as f:
        rows = list(csv.DictReader(f))
    with open(EVIDENCE) as f:
        ev = json.load(f)["components"]
    return rows, ev


def spdx_ids(expr):
    ids = re.findall(r"[A-Za-z0-9.+-]+", expr)
    out = []
    for i in ids:
        if i in ("AND", "OR", "WITH"):
            continue
        out.append(re.sub(r"-(only|or-later)$", "", i).rstrip("+"))
    return out


def check(rows, ev):
    errs = []
    by_id = {}
    for r in rows:
        cid = r.get("component_id", "")
        if cid in by_id:
            errs.append("%s: duplicate row" % cid)
        by_id[cid] = r
    for cid in SCOPE:
        if cid not in by_id:
            errs.append("%s: missing from ledger" % cid)
    for cid in ev:
        if cid not in by_id:
            errs.append("%s: evidence fetched but no ledger row" % cid)
    for cid, r in by_id.items():
        for col in REQUIRED:
            if not (r.get(col) or "").strip():
                errs.append("%s: empty column %s" % (cid, col))
        rec = r.get("recommendation", "")
        if rec not in RECOMMENDATIONS:
            errs.append("%s: recommendation %r not in %s" % (cid, rec, sorted(RECOMMENDATIONS)))
        e = ev.get(cid)
        if e is None:
            errs.append("%s: no evidence record" % cid)
            continue
        if r["pinned_commit"] != e["pinned_commit"]:
            errs.append("%s: pinned_commit %s != evidence %s" % (cid, r["pinned_commit"], e["pinned_commit"]))
        if r["pinned_ref"] != e["pinned_ref"]:
            errs.append("%s: pinned_ref %s != evidence %s" % (cid, r["pinned_ref"], e["pinned_ref"]))
        files = {f["path"]: f for f in e["license_files"]}
        prim = files.get(r["primary_license_file"])
        if prim is None:
            errs.append("%s: primary_license_file %s not found upstream" % (cid, r["primary_license_file"]))
        elif prim["sha256"] != r["primary_license_sha256"]:
            errs.append("%s: primary license sha256 mismatch" % cid)
        detected = {re.sub(r"-(only|or-later)$", "", d) for f in e["license_files"] for d in f["detected_spdx"]}
        expr = r["spdx_expression"]
        for sid in spdx_ids(expr):
            if sid not in detected:
                errs.append("%s: SPDX %s not detected in upstream license files %s" % (cid, sid, sorted(detected)))
        # adopt needs at least one OR-branch free of network-copyleft/source-available/proprietary terms
        if rec == "adopt" and all(NEVER_ADOPT.search(b) for b in expr.split(" OR ")):
            errs.append("%s: %s may not be 'adopt'" % (cid, expr))
        if rec == "adopt" and e.get("archived") not in (None, "n/a"):
            errs.append("%s: archived upstream may not be 'adopt'" % cid)
        want = FIXED.get(cid)
        if want and rec != want:
            errs.append("%s: plan decision requires %s, ledger says %s" % (cid, want, rec))
    return errs


def selftest(rows, ev):
    """Each mutation must be caught; proves the gate is not vacuous."""
    def mutate(cid, **kw):
        rs = copy.deepcopy(rows)
        for r in rs:
            if r["component_id"] == cid:
                r.update(kw)
        return rs
    cases = {
        "teleport adopted": mutate("teleport", recommendation="adopt"),
        "grafana (AGPL) adopted": mutate("grafana", recommendation="adopt"),
        "wrong commit": mutate("xtermjs", pinned_commit="0" * 40),
        "wrong spdx": mutate("xtermjs", spdx_expression="Apache-2.0"),
        "redis adopted": mutate("redis", recommendation="adopt"),
        "garage adopted": mutate("garage", recommendation="adopt"),
        "claude-code adopted": mutate("claude-code", recommendation="adopt"),
        "bad recommendation": mutate("tmux", recommendation="maybe"),
        "license sha tampered": mutate("valkey", primary_license_sha256="0" * 64),
        "archived adopted": mutate("codemirror-dev-archived", recommendation="adopt"),
        "row removed": [r for r in rows if r["component_id"] != "valkey"],
        "empty notice": mutate("tauri", notice_obligations=""),
    }
    failed = [name for name, rs in cases.items() if not check(rs, ev)]
    for name in cases:
        print("selftest %-26s %s" % (name, "NOT CAUGHT" if name in failed else "caught"))
    return failed


def main():
    rows, ev = load()
    errs = check(rows, ev)
    for e in errs:
        print("FAIL", e)
    print("%d rows, %d evidence records, %d violations" % (len(rows), len(ev), len(errs)))
    if "--selftest" in sys.argv:
        if selftest(rows, ev):
            return 2
    return 1 if errs else 0


if __name__ == "__main__":
    raise SystemExit(main())
