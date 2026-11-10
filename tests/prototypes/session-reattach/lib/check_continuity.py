#!/usr/bin/env python3
"""Output-continuity analysis for the NX2-002 reattach prototype.

Extracts `SEQ <n>` markers from any of the captured formats and compares them
with the producer's ground-truth file:

* plain text (truth file, tmux pipe-pane log, capture-pane / pane read output)
* tmux control mode (`%output %<pane> <octal-escaped bytes>`)
* Herdr observer NDJSON (`terminal.frame` records carrying base64 ANSI bytes)
* gateway capture files, where each line is `<recv_ms>\t<raw line>`

Usage:
  check_continuity.py summary  FILE
  check_continuity.py coverage TRUTH OBSERVED [--from N] [--to M]
Both print one JSON object.
"""
import argparse
import base64
import binascii
import json
import re
import sys

# A marker counts only with its full 13-digit ms timestamp, so a line cut at
# the right edge of a rendered screen is not mistaken for a delivered line.
SEQ_RE = re.compile(r"SEQ (\d+) \d{13}")
OCTAL_RE = re.compile(r"\\([0-7]{3})")
ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(\x07|\x1b\\)|\x1b[@-_]")


def _strip_gateway_prefix(line: str) -> str:
    head, sep, rest = line.partition("\t")
    return rest if sep and head.isdigit() else line


def _decode_tmux_control(line: str) -> str:
    # `%output %3 SEQ 1 17\015\012` -> pane bytes. Escapes are octal per byte.
    parts = line.split(" ", 2)
    payload = parts[2] if len(parts) == 3 else ""
    return OCTAL_RE.sub(lambda m: chr(int(m.group(1), 8)), payload)


def _json_strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _json_strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _json_strings(v)


def _decode_json_frame(line: str) -> str:
    """Decode every base64-looking string in an NDJSON record.

    The Herdr docs name the record type and say the bytes are base64 but do not
    pin the field name, so all string values are tried.
    """
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        return line
    out = []
    for s in _json_strings(obj):
        if len(s) >= 8:
            try:
                out.append(base64.b64decode(s, validate=True).decode("utf-8", "replace"))
                continue
            except (binascii.Error, ValueError):
                pass
        out.append(s)
    return "\n".join(out)


def decode_line(line: str) -> str:
    line = _strip_gateway_prefix(line.rstrip("\n"))
    if line.startswith("%output "):
        text = _decode_tmux_control(line)
    elif line.startswith("{"):
        text = _decode_json_frame(line)
    else:
        text = line
    return ANSI_RE.sub("", text)


def extract(lines):
    """Return SEQ numbers in order of appearance (duplicates kept)."""
    seqs = []
    for line in lines:
        for m in SEQ_RE.finditer(decode_line(line)):
            seqs.append(int(m.group(1)))
    return seqs


def analyze(seqs):
    uniq = sorted(set(seqs))
    gaps = []
    for a, b in zip(uniq, uniq[1:]):
        if b - a > 1:
            gaps.append([a + 1, b - 1])
    out_of_order = sum(1 for a, b in zip(seqs, seqs[1:]) if b < a)
    return {
        "count": len(seqs),
        "unique": len(uniq),
        "first": uniq[0] if uniq else None,
        "last": uniq[-1] if uniq else None,
        "missing": sum(g[1] - g[0] + 1 for g in gaps),
        "gaps": gaps[:50],
        "duplicates": len(seqs) - len(uniq),
        "out_of_order": out_of_order,
    }


def coverage(truth, observed, lo=None, hi=None):
    t = set(truth)
    if lo is not None:
        t = {s for s in t if s >= lo}
    if hi is not None:
        t = {s for s in t if s <= hi}
    seen = t & set(observed)
    missing = sorted(t - seen)
    return {
        "window": [lo, hi],
        "truth_lines": len(t),
        "observed_lines": len(seen),
        "coverage": round(len(seen) / len(t), 6) if t else None,
        "first_missing": missing[:20],
        "spurious": len(set(observed) - set(truth)),
    }


def first_after(lines, start_line):
    """First gateway-capture line at index >= start_line that carries a marker.

    Returns its receive time, used for time-to-first-output after a reattach.
    """
    for i in range(start_line, len(lines)):
        if extract([lines[i]]):
            head = lines[i].split("\t", 1)[0]
            return {"line": i, "recv_ms": int(head) if head.isdigit() else None}
    return {"line": None, "recv_ms": None}


def _read(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.readlines()


def main(argv=None):
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("summary")
    s.add_argument("file")
    c = sub.add_parser("coverage")
    c.add_argument("truth")
    c.add_argument("observed")
    c.add_argument("--from", dest="lo", type=int)
    c.add_argument("--to", dest="hi", type=int)
    f = sub.add_parser("first-after")
    f.add_argument("file")
    f.add_argument("--line", type=int, default=0)
    a = p.parse_args(argv)
    if a.cmd == "summary":
        print(json.dumps(analyze(extract(_read(a.file)))))
    elif a.cmd == "first-after":
        print(json.dumps(first_after(_read(a.file), a.line)))
    else:
        print(json.dumps(coverage(extract(_read(a.truth)), extract(_read(a.observed)), a.lo, a.hi)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
