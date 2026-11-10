#!/usr/bin/env python3
"""Merge decisions.json (judgement) with evidence.json (facts) into the ledger CSV and the
markdown summary table in docs/research/license-ledger.md (between the ledger-table markers).

Usage: python3 tools/license-ledger/build_ledger.py
"""
import csv
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
DECISIONS = os.path.join(HERE, "decisions.json")
EVIDENCE = os.path.join(ROOT, "docs", "research", "license-evidence", "evidence.json")
CSV_PATH = os.path.join(ROOT, "docs", "research", "license-ledger.csv")
MD_PATH = os.path.join(ROOT, "docs", "research", "license-ledger.md")
START, END = "<!-- ledger-table:start -->", "<!-- ledger-table:end -->"

COLUMNS = [
    "component_id", "component", "role_in_nexus", "upstream_repo", "pinned_ref", "pinned_commit",
    "head_commit_at_check", "primary_license_file", "primary_license_url", "primary_license_sha256",
    "license_files_found", "spdx_expression", "binary_distribution_terms", "notice_obligations",
    "network_copyleft_trigger", "redistribution_limits", "recommendation", "alternatives",
    "upstream_archived", "verified_utc", "notes",
]


def main():
    with open(DECISIONS) as f:
        decisions = json.load(f)["rows"]
    with open(EVIDENCE) as f:
        ev = json.load(f)["components"]
    rows = []
    for d in decisions:
        e = ev[d["component_id"]]
        files = {x["path"]: x for x in e["license_files"]}
        prim = files.get(d["primary_license_file"], {})
        rows.append({
            **d,
            "upstream_repo": e["repo"],
            "pinned_ref": e["pinned_ref"],
            "pinned_commit": e["pinned_commit"],
            "head_commit_at_check": e["head_commit"],
            "primary_license_url": prim.get("url", ""),
            "primary_license_sha256": prim.get("sha256", ""),
            "license_files_found": "; ".join(
                "%s=%s" % (x["path"], "+".join(x["detected_spdx"]) or "unclassified")
                for x in e["license_files"]),
            "upstream_archived": e["archived"] or "no",
            "verified_utc": e["fetched_at_utc"],
        })
    with open(CSV_PATH, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in COLUMNS})

    lines = [
        "| ID | SPDX | Pinned ref @ commit | Network copyleft | Recommendation |",
        "|---|---|---|---|---|",
    ]
    for r in rows:
        ref = "`%s` @ [`%s`](%s)" % (r["pinned_ref"], r["pinned_commit"][:12], r["primary_license_url"])
        net = r["network_copyleft_trigger"].split(" - ")[0]
        lines.append("| %s | `%s` | %s | %s | **%s** |" % (
            r["component_id"], r["spdx_expression"], ref, net, r["recommendation"]))
    with open(MD_PATH) as f:
        md = f.read()
    head, rest = md.split(START, 1)
    _, tail = rest.split(END, 1)
    with open(MD_PATH, "w") as f:
        f.write(head + START + "\n" + "\n".join(lines) + "\n" + END + tail)
    print("wrote %d rows" % len(rows))


if __name__ == "__main__":
    main()
