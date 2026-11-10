#!/usr/bin/env python3
"""Pin upstream commits and fetch license files for the Nexus license ledger (NX2-005).

For every component in COMPONENTS this script:
  1. resolves HEAD and the newest stable release tag with `git ls-remote` (no API quota);
  2. pins the release-tag commit (or HEAD when there is no stable tag);
  3. probes the root for license/notice files at the pinned commit and fetches them;
  4. hashes each file and detects SPDX identifiers from well-known license phrases;
  5. re-fetches the primary license file at HEAD to detect relicensing drift.

Output: docs/research/license-evidence/evidence.json (deterministic key order).
Usage:  python3 tools/license-ledger/fetch_evidence.py [--only id1,id2]
Network access to github.com, raw.githubusercontent.com and code.haverbeke.berlin
is required. No credentials are used.
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "docs", "research", "license-evidence", "evidence.json")
GIT = "/usr/bin/git" if os.path.exists("/usr/bin/git") else "git"

# id, git URL, optional tag regex (group 1 = version), extra paths to fetch
GH = "https://github.com/"
CM = "https://code.haverbeke.berlin/codemirror/"
COMPONENTS = [
    ("teleport", GH + "gravitational/teleport", None, ["api/LICENSE", "build.assets/LICENSE-community"]),
    ("termix", GH + "Termix-SSH/Termix", None, []),
    ("herdr", GH + "herdrdev/herdr", None, []),
    ("happier", GH + "happier-dev/happier", None, []),
    ("hapi", GH + "tiann/hapi", None, []),
    ("hermes-agent", GH + "NousResearch/hermes-agent", None, []),
    ("opencode", GH + "anomalyco/opencode", None, []),
    ("codex-cli", GH + "openai/codex", r"^rust-v(\d+\.\d+\.\d+)$", []),
    ("codex-acp", GH + "agentclientprotocol/codex-acp", None, []),
    ("codex-acp-zed-archived", GH + "zed-industries/codex-acp", None, []),
    ("acp-spec", GH + "agentclientprotocol/agent-client-protocol", None, []),
    ("mcp-spec", GH + "modelcontextprotocol/modelcontextprotocol", None, []),
    ("toolhive", GH + "stacklok/toolhive", None, []),
    ("temporal", GH + "temporalio/temporal", None, []),
    ("minio", GH + "minio/minio", r"^(RELEASE\.\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ)$", []),
    ("seaweedfs", GH + "seaweedfs/seaweedfs", None, []),
    ("garage", GH + "deuxfleurs-org/garage", None, []),
    ("rustfs", GH + "rustfs/rustfs", None, []),
    ("versitygw", GH + "versity/versitygw", None, []),
    ("ceph", GH + "ceph/ceph", None, ["COPYING-LGPL2.1", "COPYING-LGPL3"]),
    ("valkey", GH + "valkey-io/valkey", None, []),
    ("redis", GH + "redis/redis", None, []),
    ("grafana", GH + "grafana/grafana", None, []),
    ("prometheus", GH + "prometheus/prometheus", None, []),
    ("ntfy", GH + "binwiederhier/ntfy", None, []),
    ("gotify", GH + "gotify/server", None, []),
    ("headscale", GH + "juanfont/headscale", None, []),
    ("xtermjs", GH + "xtermjs/xterm.js", None, []),
    ("codemirror-view", CM + "view.git", None, []),
    ("codemirror-state", CM + "state.git", None, []),
    ("codemirror-dev-archived", GH + "codemirror/dev", r"^$", []),  # archived: pin final HEAD
    ("tauri", GH + "tauri-apps/tauri", r"^tauri-v(\d+\.\d+\.\d+)$",
     ["LICENSE-APACHE-2.0", "LICENSE.spdx"]),
    ("keycloak", GH + "keycloak/keycloak", None, []),
    ("step-ca", GH + "smallstep/certificates", None, []),
    ("guacamole-server", GH + "apache/guacamole-server", None, []),
    ("guacamole-client", GH + "apache/guacamole-client", None, []),
    ("meshcentral", GH + "Ylianst/MeshCentral", None, []),
    ("paperclip", GH + "paperclipai/paperclip", None, []),
    ("tmux", GH + "tmux/tmux", r"^(\d+\.\d+[a-z]?)$", []),
    ("openssh-portable", GH + "openssh/openssh-portable", r"^V_(\d+_\d+_P\d+)$", []),
    ("zellij", GH + "zellij-org/zellij", None, []),
    ("waveterm", GH + "wavetermdev/waveterm", None, []),
    ("tabby", GH + "Eugeny/tabby", None, []),
    ("wezterm", GH + "wezterm/wezterm", r"^(\d{8}-\d{6}-[0-9a-f]+)$", []),
    ("ghostty", GH + "ghostty-org/ghostty", None, []),
    ("warp", GH + "warpdotdev/warp", None, []),
    ("claude-code", GH + "anthropics/claude-code", None, []),
]

DEFAULT_TAG = r"^v?(\d+\.\d+(?:\.\d+)?)$"
CANDIDATES = [
    "LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "LICENSE.rst", "COPYING", "COPYING.md",
    "LICENSE-APACHE", "LICENSE-MIT", "LICENSE_APACHE-2.0", "LICENSE_MIT", "LICENSE.GPLv2",
    "LICENSE-AGPL", "LICENSING.md", "NOTICE", "NOTICE.md", "NOTICE.txt", "COPYRIGHT",
]

# (spdx, all phrases must appear; matched case-insensitively on whitespace-normalised text)
PATTERNS = [
    ("AGPL-3.0", ["gnu affero general public license", "version 3"]),
    ("LGPL-2.1", ["gnu lesser general public license", "version 2.1"]),
    ("LGPL-3.0", ["gnu lesser general public license", "version 3"]),
    ("GPL-2.0", ["gnu general public license", "version 2, june 1991"]),
    ("GPL-3.0", ["gnu general public license", "version 3, 29 june 2007"]),
    ("Apache-2.0", ["apache license", "version 2.0"]),
    ("Apache-2.0", ["licensed under apache-2.0"]),  # SPDX-id prose, e.g. Grafana LICENSING.md
    ("MIT", ["permission is hereby granted, free of charge"]),
    ("BSD-3-Clause", ["redistribution and use in source and binary forms", "neither the name"]),
    ("BSD-2-Clause", ["redistribution and use in source and binary forms"]),
    ("ISC", ["permission to use, copy, modify, and", "distribute this software for any purpose with or without fee is hereby granted"]),
    ("SSH-OpenSSH", ["this file is part of the openssh software"]),
    ("CC-BY-4.0", ["cc-by-4.0"]),
    ("LicenseRef-Anthropic-Commercial-Terms", ["anthropic pbc. all rights reserved"]),
    ("MPL-2.0", ["mozilla public license", "2.0"]),
    ("LicenseRef-Teleport-CE", ["teleport community edition license"]),
    ("SSPL-1.0", ["server side public license"]),
    ("RSALv2", ["redis source available license"]),
    ("BUSL-1.1", ["business source license"]),
    ("Elastic-2.0", ["elastic license 2.0"]),
    ("OFL-1.1", ["sil open font license"]),
]


def git_refs(url):
    out = subprocess.run([GIT, "ls-remote", url, "HEAD", "refs/tags/*"], capture_output=True,
                         text=True, timeout=180, check=True).stdout
    head, tags = None, {}
    for line in out.splitlines():
        sha, ref = line.split("\t")
        if ref == "HEAD":
            head = sha
        elif ref.startswith("refs/tags/"):
            name = ref[len("refs/tags/"):]
            if name.endswith("^{}"):
                tags[name[:-3]] = sha  # peeled commit wins over tag object
            else:
                tags.setdefault(name, sha)
    return head, tags


def vkey(v):
    return [int(p) if p.isdigit() else p for p in re.findall(r"\d+|[a-z]+", v)]


def newest_tag(tags, regex):
    rx = re.compile(regex or DEFAULT_TAG)
    best = None
    for name, sha in tags.items():
        m = rx.match(name)
        if m and (best is None or vkey(m.group(1)) > vkey(best[1])):
            best = (name, m.group(1), sha)
    return best


def raw_url(url, sha, path):
    if url.startswith(GH):
        return "https://raw.githubusercontent.com/%s/%s/%s" % (url[len(GH):], sha, path)
    return "%s/raw/commit/%s/%s" % (url[:-4], sha, path)


def fetch(u):
    req = urllib.request.Request(u, headers={"User-Agent": "nexus-license-ledger"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def detect(data):
    t = " ".join(data.decode("utf-8", "replace").lower().split())
    found = list(dict.fromkeys(spdx for spdx, phrases in PATTERNS if all(p in t for p in phrases)))
    if "BSD-3-Clause" in found:
        found.remove("BSD-2-Clause")
    if "LGPL-2.1" in found or "LGPL-3.0" in found:
        found = [f for f in found if not f.startswith("GPL")]
    return found


def file_record(url, sha, path, data):
    text = data.decode("utf-8", "replace")
    return {
        "path": path,
        "url": raw_url(url, sha, path),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "detected_spdx": detect(data),
        "first_line": next((ln.strip() for ln in text.splitlines() if ln.strip()), "")[:160],
    }


def archived(url):
    """Return the GitHub archive banner text, None if not archived, or 'n/a' off GitHub."""
    if not url.startswith(GH):
        return "n/a"
    page = (fetch(url) or b"").decode("utf-8", "replace")
    m = re.search(r"This repository was archived by the owner on [A-Za-z]+ \d+, \d{4}", page)
    return m.group(0) if m else None


def process(comp):
    cid, url, tag_rx, extras = comp
    head, tags = git_refs(url)
    tag = newest_tag(tags, tag_rx)
    pin = tag[2] if tag else head
    paths = CANDIDATES + extras
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        blobs = list(ex.map(lambda p: fetch(raw_url(url, pin, p)), paths))
    files = [file_record(url, pin, p, d) for p, d in zip(paths, blobs) if d is not None]
    primary = next((f for f in files if f["detected_spdx"]), files[0] if files else None)
    drift = None
    if primary and head != pin:
        data = fetch(raw_url(url, head, primary["path"]))
        drift = {
            "head_path_exists": data is not None,
            "head_sha256": hashlib.sha256(data).hexdigest() if data is not None else None,
            "changed_since_pin": data is None or hashlib.sha256(data).hexdigest() != primary["sha256"],
        }
    return cid, {
        "repo": url,
        "head_commit": head,
        "release_tag": tag[0] if tag else None,
        "release_version": tag[1] if tag else None,
        "pinned_commit": pin,
        "pinned_ref": tag[0] if tag else "HEAD",
        "license_files": files,
        "primary_license_path": primary["path"] if primary else None,
        "head_drift": drift,
        "archived": archived(url),
        "fetched_at_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated component ids")
    args = ap.parse_args()
    comps = COMPONENTS
    if args.only:
        keep = set(args.only.split(","))
        comps = [c for c in COMPONENTS if c[0] in keep]
    existing = {}
    if args.only and os.path.exists(OUT):
        with open(OUT) as f:
            existing = json.load(f).get("components", {})
    results, errors = dict(existing), {}
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(process, c): c[0] for c in comps}
        for fut in cf.as_completed(futs):
            cid = futs[fut]
            try:
                results[cid] = fut.result()[1]
                print("ok  ", cid, results[cid]["pinned_ref"], results[cid]["primary_license_path"])
            except Exception as e:  # record and keep going; check_ledger fails on missing ids
                errors[cid] = repr(e)
                print("FAIL", cid, e)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump({
            "generated_at_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "generator": "tools/license-ledger/fetch_evidence.py",
            "components": dict(sorted(results.items())),
            "errors": errors,
        }, f, indent=2, sort_keys=False)
        f.write("\n")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
