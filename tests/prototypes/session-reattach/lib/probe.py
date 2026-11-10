#!/usr/bin/env python3
"""Grading of the E5 second-user probes for the NX2-002 prototype.

A probe is one CLI call against a socket path, run once by the owner (positive
control) and once by the foreign user, with the identical command and target.
A foreign failure only counts as DENIED when the output shows a permission
refusal *and* the owner's control call succeeded in the same phase. Any other
failure is INCONCLUSIVE, which never counts as a pass.

Two layers are probed (review item 3):

- outer:  the default socket location (tmux `/tmp/tmux-<uid>/default`, Herdr
          `~/.config/herdr/sessions/<id>/herdr.sock`). Directory and file modes
          and the multiplexer server can all refuse.
- server: a socket the owner deliberately placed in a traversable directory
          with a world-writable mode. Only the server itself can refuse here,
          so a filesystem EACCES means the layer was not isolated.
"""
import re

# Kernel/libc refusals surfaced by the tmux client ("error connecting to X
# (Permission denied)") or a Rust client ("Permission denied (os error 13)").
FS_REFUSAL = re.compile(r"permission denied|operation not permitted|os error 13\b|os error 1\b|\beacces\b|\beperm\b", re.I)
# Refusals sent by a running server after accept(). tmux: server.c
# `exit_message = "access not allowed"` (3.4 and 3.5a). Herdr: none documented,
# so anything else stays INCONCLUSIVE and is reported raw.
SERVER_REFUSAL = re.compile(r"access not allowed|not authori[sz]ed|unauthori[sz]ed|forbidden", re.I)


def attempt(res):
    """One probe result dict -> SUCCEEDED | FS_REFUSED | SERVER_REFUSED | FAILED_OTHER | MISSING.

    SUCCEEDED needs positive evidence: rc 0 *and* the expected token (session
    name or pane id) in the output. tmux exits 0 with the ACL message, so rc
    alone is not evidence either way.
    """
    if not res or res.get("error") or "rc" not in res:
        return "MISSING"
    out = res.get("output") or ""
    if res.get("prober_servers_after"):
        return "FAILED_OTHER"  # the probe started its own server; it proves nothing about the target
    if SERVER_REFUSAL.search(out):
        return "SERVER_REFUSED"
    if FS_REFUSAL.search(out):
        return "FS_REFUSED"
    expect = res.get("expect") or ""
    if res["rc"] == 0 and expect and expect in out:
        return "SUCCEEDED"
    return "FAILED_OTHER"


def _others_can(mode, bit):
    try:
        return bool(int(str(mode), 8) & bit)
    except (TypeError, ValueError):
        return False


def server_layer_isolated(target_status):
    """Owner-side stat of the exposed socket and its directory, taken before the probes."""
    st = target_status or {}
    sock, d = st.get("socket") or {}, st.get("socket_dir") or {}
    return bool(sock.get("exists")) and _others_can(sock.get("mode"), 0o2) and _others_can(d.get("mode"), 0o1)


def grade(layer, control, foreign, target_status=None):
    """-> {"verdict", "reason", "control", "foreign"}

    verdicts: DENIED (outer), DENIED_BY_SERVER (server), ALLOWED (the foreign
    uid reached the session: isolation failed), INCONCLUSIVE.
    """
    c, f = attempt(control), attempt(foreign)
    r = {"layer": layer, "control": c, "foreign": f}
    if c != "SUCCEEDED":
        return dict(r, verdict="INCONCLUSIVE", reason="owner positive control did not succeed")
    if layer == "server" and not server_layer_isolated(target_status):
        return dict(r, verdict="INCONCLUSIVE", reason="exposed socket was not traversable/writable by others")
    if f == "SUCCEEDED":
        return dict(r, verdict="ALLOWED", reason="foreign uid got the owner's session data")
    if layer == "outer" and f in ("FS_REFUSED", "SERVER_REFUSED"):
        return dict(r, verdict="DENIED", reason=f.lower())
    if layer == "server" and f == "SERVER_REFUSED":
        return dict(r, verdict="DENIED_BY_SERVER", reason="server rejected the peer uid")
    if layer == "server" and f == "FS_REFUSED":
        return dict(r, verdict="INCONCLUSIVE", reason="filesystem refused although the socket was exposed")
    return dict(r, verdict="INCONCLUSIVE", reason="foreign call failed without a permission refusal")


def passed(g):
    return g.get("verdict") in ("DENIED", "DENIED_BY_SERVER")
