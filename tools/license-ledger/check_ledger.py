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
  4c. an `adopt` row whose expression has an OR branch with a copyleft / source-available /
      proprietary licence must record a `license_election` in decisions.json: the elected
      (unrestricted) branch, the upstream file and line that grant the choice, that file's sha256
      and a reason. Bound to the file sha256 and the recommendation like a carve-out; stale
      elections fail. Without this, writing OR where upstream means AND would pass rule 5;
  5. policy: copyleft-network / source-available / proprietary licenses are never `adopt`,
     archived upstreams are never `adopt`, and the plan's fixed decisions hold
     (Teleport/Grafana external-service-only, MinIO/Redis/Warp reject, Valkey adopt, HAPI no reuse).

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
    "grafana": "external-service-only",  # governance: no AGPL code reuse
    "warp": "reject",  # clean-room rule; ledger F1
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
        decisions = json.load(f)["rows"]
    carveouts = {d["component_id"]: d["license_carveouts"] for d in decisions if d.get("license_carveouts")}
    elections = {d["component_id"]: d["license_election"] for d in decisions if d.get("license_election")}
    return rows, ev, carveouts, elections


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


def or_branches(expr):
    return [b.strip("() ") for b in expr.split(" OR ")]


def check_election(cid, r, e, el):
    """Rule 4c: an adopt row may rely on an OR choice only if upstream grants it and the election is recorded."""
    branches = or_branches(r["spdx_expression"])
    restricted = [b for b in branches if MUST_DECLARE.search(b)] if len(branches) > 1 else []
    if el is None:
        if r["recommendation"] == "adopt" and restricted:
            return ["%s: adopt relies on an OR choice over %s but decisions.json records no license_election"
                    % (cid, ", ".join(restricted))]
        return []
    errs = []
    if not restricted:
        errs.append("%s: stale license_election (expression has no restricted OR branch)" % cid)
    if el.get("recommendation") != r["recommendation"]:
        errs.append("%s: license_election was reviewed for recommendation %r, row says %r; re-review"
                    % (cid, el.get("recommendation"), r["recommendation"]))
    elected = el.get("elected")
    if elected not in branches:
        errs.append("%s: license_election elects %r, which is not an OR branch of %r"
                    % (cid, elected, r["spdx_expression"]))
    elif MUST_DECLARE.search(elected):
        errs.append("%s: license_election elects restricted branch %r" % (cid, elected))
    f = next((x for x in e["license_files"] if x["path"] == el.get("file")), None)
    if f is None:
        errs.append("%s: license_election grant file %r not in upstream evidence" % (cid, el.get("file")))
    elif el.get("file_sha256") != f["sha256"]:
        errs.append("%s: license_election grant file %s was reviewed for a different file version; re-review"
                    % (cid, el.get("file")))
    if not str(el.get("line") or "").strip():
        errs.append("%s: license_election has no grant line" % cid)
    if not (el.get("reason") or "").strip():
        errs.append("%s: license_election has no reason" % cid)
    return errs


def check(rows, ev, carveouts, elections):
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
        errs += check_election(cid, r, e, elections.get(cid))
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
    for cid in elections:
        if cid not in by_id:
            errs.append("%s: license_election for a component with no ledger row" % cid)
    return errs


def selftest(rows, ev, carveouts, elections):
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

    def mutate_election(cid, **kw):
        es = copy.deepcopy(elections)
        es[cid].update(kw)
        return es

    no_ceph_carveout = {k: v for k, v in carveouts.items() if k != "ceph"}
    no_ntfy_election = {k: v for k, v in elections.items() if k != "ntfy"}
    # name: (rows, carveouts[, elections], substring the violation must contain)
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
        # rule 4c: an OR choice must be granted upstream and recorded, not just written
        "warp AND->OR + adopt": (mutate("warp", spdx_expression="AGPL-3.0-only OR MIT", recommendation="adopt"),
                                 carveouts, "warp: adopt relies on an OR choice over AGPL-3.0-only"),
        "grafana AND->OR + adopt": (mutate("grafana", spdx_expression="AGPL-3.0-only OR Apache-2.0",
                                           recommendation="adopt"),
                                    carveouts, "grafana: adopt relies on an OR choice over AGPL-3.0-only"),
        "ntfy election removed": (rows, carveouts, no_ntfy_election,
                                  "ntfy: adopt relies on an OR choice over GPL-2.0-only"),
        "ntfy election file changed": (rows, carveouts, mutate_election("ntfy", file_sha256="0" * 64),
                                       "ntfy: license_election grant file README.md was reviewed for a different"),
        "ntfy elects GPL branch": (rows, carveouts, mutate_election("ntfy", elected="GPL-2.0-only"),
                                   "ntfy: license_election elects restricted branch"),
        "ntfy election no grant line": (rows, carveouts, mutate_election("ntfy", line=""),
                                        "ntfy: license_election has no grant line"),
        "ntfy rejected, election kept": (mutate("ntfy", recommendation="reject"), carveouts,
                                         "ntfy: license_election was reviewed for recommendation"),
        "stale election": (rows, carveouts, dict(elections, tauri=dict(elections["ntfy"], elected="MIT")),
                           "tauri: stale license_election"),
    }
    failed = []
    for name, case in cases.items():
        rs, cs, es, want = case if len(case) == 4 else (case[0], case[1], elections, case[2])
        errs = check(rs, ev, cs, es)
        ok = any(want in e for e in errs)
        if not ok:
            failed.append(name)
        print("selftest %-29s %s" % (name, "caught" if ok else "NOT CAUGHT %r" % errs))
    print("selftest: %d/%d mutations caught for the intended reason" % (len(cases) - len(failed), len(cases)))
    return failed


def main():
    rows, ev, carveouts, elections = load()
    errs = check(rows, ev, carveouts, elections)
    for e in errs:
        print("FAIL", e)
    print("%d rows, %d evidence records, %d violations" % (len(rows), len(ev), len(errs)))
    if "--selftest" in sys.argv:
        if selftest(rows, ev, carveouts, elections):
            return 2
    return 1 if errs else 0


if __name__ == "__main__":
    raise SystemExit(main())
