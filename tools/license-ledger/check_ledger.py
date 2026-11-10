#!/usr/bin/env python3
"""Validate docs/research/license-ledger.csv against fetched evidence and Nexus license rules.

Checks
  1. every component in the NX2-005 scope (plan §5.1) has a row;
  2. required columns are non-empty and the recommendation is in the allowed set;
  3. pinned commit/ref and primary license sha256 match evidence.json;
  4. every SPDX identifier in the row's expression was detected in an upstream license file;
  4b. the reverse: every copyleft / source-available / proprietary licence detected in any upstream
      license file appears in the expression, or decisions.json records a carve-out for that
      licence + file with a reason. A carve-out is bound to the file's sha256 and to the row's
      recommendation; if either changes the carve-out must be re-reviewed;
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
DECISIONS = os.path.join(ROOT, "tools", "license-ledger", "decisions.json")

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
# detected upstream => must be in the expression or carry a reviewed carve-out (rule 4b)
MUST_DECLARE = re.compile(r"GPL|SSPL|RSAL|BUSL|LicenseRef-")
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
    with open(DECISIONS) as f:
        carveouts = {d["component_id"]: d["license_carveouts"]
                     for d in json.load(f)["rows"] if d.get("license_carveouts")}
    return rows, ev, carveouts


def norm(sid):
    return re.sub(r"-(only|or-later)$", "", sid).rstrip("+")


def spdx_ids(expr):
    return [norm(i) for i in re.findall(r"[A-Za-z0-9.+-]+", expr) if i not in ("AND", "OR", "WITH")]


def check_undeclared(cid, r, e, carveouts):
    """Rule 4b: restricted licences found upstream may not be silently left out of the expression."""
    errs = []
    declared = set(spdx_ids(r["spdx_expression"]))
    unused = list(carveouts)
    for f in e["license_files"]:
        for d in f["detected_spdx"]:
            if not MUST_DECLARE.search(d) or norm(d) in declared:
                continue
            co = next((c for c in carveouts if c.get("license") == d and c.get("file") == f["path"]), None)
            if co is None:
                errs.append("%s: %s detected in %s but missing from spdx_expression and no carve-out in "
                            "decisions.json" % (cid, d, f["path"]))
                continue
            unused.remove(co)
            if not (co.get("reason") or "").strip():
                errs.append("%s: carve-out for %s in %s has no reason" % (cid, d, f["path"]))
            if co.get("file_sha256") != f["sha256"]:
                errs.append("%s: carve-out for %s in %s was reviewed for a different file version; "
                            "re-review" % (cid, d, f["path"]))
            if co.get("recommendation") != r["recommendation"]:
                errs.append("%s: carve-out for %s in %s was reviewed for recommendation %r, row says %r; "
                            "re-review" % (cid, d, f["path"], co.get("recommendation"), r["recommendation"]))
    for co in unused:
        errs.append("%s: stale carve-out for %s in %s (not detected there, or already declared)"
                    % (cid, co.get("license"), co.get("file")))
    return errs


def check(rows, ev, carveouts):
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
        detected = {norm(d) for f in e["license_files"] for d in f["detected_spdx"]}
        expr = r["spdx_expression"]
        for sid in spdx_ids(expr):
            if sid not in detected:
                errs.append("%s: SPDX %s not detected in upstream license files %s" % (cid, sid, sorted(detected)))
        errs += check_undeclared(cid, r, e, carveouts.get(cid, []))
        # adopt needs at least one OR-branch free of network-copyleft/source-available/proprietary terms
        if rec == "adopt" and all(NEVER_ADOPT.search(b) for b in expr.split(" OR ")):
            errs.append("%s: %s may not be 'adopt'" % (cid, expr))
        if rec == "adopt" and e.get("archived") not in (None, "n/a"):
            errs.append("%s: archived upstream may not be 'adopt'" % cid)
        want = FIXED.get(cid)
        if want and rec != want:
            errs.append("%s: plan decision requires %s, ledger says %s" % (cid, want, rec))
    for cid in carveouts:
        if cid not in by_id:
            errs.append("%s: carve-out for a component with no ledger row" % cid)
    return errs


def selftest(rows, ev, carveouts):
    """Each mutation must be caught for the intended reason; proves the gate is not vacuous."""
    def mutate(cid, **kw):
        rs = copy.deepcopy(rows)
        for r in rs:
            if r["component_id"] == cid:
                r.update(kw)
        return rs

    def mutate_carveout(cid, **kw):
        cs = copy.deepcopy(carveouts)
        for c in cs.get(cid, []):
            c.update(kw)
        return cs

    no_ceph_carveout = {k: v for k, v in carveouts.items() if k != "ceph"}
    # name: (rows, carveouts, substring the violation must contain)
    cases = {
        "teleport adopted": (mutate("teleport", recommendation="adopt"), carveouts, "teleport: AGPL"),
        "grafana (AGPL) adopted": (mutate("grafana", recommendation="adopt"), carveouts, "grafana: AGPL"),
        "wrong commit": (mutate("xtermjs", pinned_commit="0" * 40), carveouts, "xtermjs: pinned_commit"),
        "wrong spdx": (mutate("xtermjs", spdx_expression="Apache-2.0"), carveouts,
                       "xtermjs: SPDX Apache-2.0 not detected"),
        "redis adopted": (mutate("redis", recommendation="adopt"), carveouts, "redis: LicenseRef-RSALv2"),
        "garage adopted": (mutate("garage", recommendation="adopt"), carveouts, "garage: AGPL"),
        "claude-code adopted": (mutate("claude-code", recommendation="adopt"), carveouts,
                                "claude-code: LicenseRef-"),
        "bad recommendation": (mutate("tmux", recommendation="maybe"), carveouts, "tmux: recommendation"),
        "license sha tampered": (mutate("valkey", primary_license_sha256="0" * 64), carveouts,
                                 "valkey: primary license sha256"),
        "archived adopted": (mutate("codex-acp-zed-archived", recommendation="adopt"), carveouts,
                             "codex-acp-zed-archived: archived upstream"),
        "row removed": ([r for r in rows if r["component_id"] != "valkey"], carveouts,
                        "valkey: missing from ledger"),
        "empty notice": (mutate("tauri", notice_obligations=""), carveouts, "tauri: empty column notice"),
        # rule 4b: risky licences detected upstream but omitted from a hand-written expression
        "warp relabelled MIT+adopt": (mutate("warp", spdx_expression="MIT", recommendation="adopt"),
                                      carveouts, "warp: AGPL-3.0 detected in LICENSE-AGPL"),
        "ntfy GPL branch dropped": (mutate("ntfy", spdx_expression="Apache-2.0"), carveouts,
                                    "ntfy: GPL-2.0 detected in LICENSE.GPLv2"),
        "ceph carve-out removed": (rows, no_ceph_carveout, "ceph: AGPL-3.0 detected in COPYING"),
        "ceph adopted": (mutate("ceph", recommendation="adopt"), carveouts,
                         "ceph: carve-out for AGPL-3.0 in COPYING was reviewed for recommendation"),
        "carve-out file changed": (rows, mutate_carveout("ceph", file_sha256="0" * 64),
                                   "ceph: carve-out for AGPL-3.0 in COPYING was reviewed for a different"),
        "carve-out no reason": (rows, mutate_carveout("ceph", reason=" "),
                                "ceph: carve-out for AGPL-3.0 in COPYING has no reason"),
        "stale carve-out": (rows, dict(carveouts, valkey=[{"license": "AGPL-3.0", "file": "COPYING",
                                                          "reason": "x"}]), "valkey: stale carve-out"),
    }
    failed = []
    for name, (rs, cs, want) in cases.items():
        errs = check(rs, ev, cs)
        ok = any(want in e for e in errs)
        if not ok:
            failed.append(name)
        print("selftest %-26s %s" % (name, "caught" if ok else "NOT CAUGHT %r" % errs))
    print("selftest: %d/%d mutations caught for the intended reason" % (len(cases) - len(failed), len(cases)))
    return failed


def main():
    rows, ev, carveouts = load()
    errs = check(rows, ev, carveouts)
    for e in errs:
        print("FAIL", e)
    print("%d rows, %d evidence records, %d violations" % (len(rows), len(ev), len(errs)))
    if "--selftest" in sys.argv:
        if selftest(rows, ev, carveouts):
            return 2
    return 1 if errs else 0


if __name__ == "__main__":
    raise SystemExit(main())
