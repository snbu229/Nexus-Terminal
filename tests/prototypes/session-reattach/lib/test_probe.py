#!/usr/bin/env python3
"""Tests for probe.py: E5 second-user grading must not pass on unrelated failures.

Run: python3 -m unittest -v test_probe   (from this directory)
"""
import unittest

import probe

TMUX_EXPECT = "NXPROBE nx-tmux"
OK = {"rc": 0, "expect": TMUX_EXPECT, "output": "NXPROBE nx-tmux", "prober_servers_after": []}
EXPOSED = {"socket": {"exists": True, "mode": "666"}, "socket_dir": {"exists": True, "mode": "755"}}


def foreign(rc, output, **kw):
    return dict({"rc": rc, "expect": TMUX_EXPECT, "output": output, "prober_servers_after": []}, **kw)


class OuterLayer(unittest.TestCase):
    def test_permission_refusal_with_passing_control_is_denied(self):
        g = probe.grade("outer", OK, foreign(1, "error connecting to /tmp/tmux-2001/default (Permission denied)"))
        self.assertEqual(g["verdict"], "DENIED")
        self.assertTrue(probe.passed(g))

    def test_unrelated_error_is_inconclusive(self):
        for out in ("no server running on /tmp/tmux-2001/default",
                    "can't find session: nx-tmux",
                    "error: unknown command 'pane'",
                    "Error: No such file or directory (os error 2)"):
            g = probe.grade("outer", OK, foreign(1, out))
            self.assertEqual(g["verdict"], "INCONCLUSIVE", out)
            self.assertFalse(probe.passed(g))

    def test_missing_control_never_passes(self):
        refused = foreign(1, "Permission denied (os error 13)")
        for control in (None, {"error": "probe failed to run"}, {}):
            self.assertEqual(probe.grade("outer", control, refused)["verdict"], "INCONCLUSIVE")

    def test_failed_control_never_passes(self):
        bad = foreign(1, "no server running on /tmp/tmux-2001/default")
        g = probe.grade("outer", bad, foreign(1, "Permission denied"))
        self.assertEqual(g["verdict"], "INCONCLUSIVE")
        self.assertIn("control", g["reason"])

    def test_control_rc0_without_expected_token_is_not_success(self):
        g = probe.grade("outer", dict(OK, output=""), foreign(1, "Permission denied"))
        self.assertEqual(g["verdict"], "INCONCLUSIVE")

    def test_foreign_success_is_allowed(self):
        self.assertEqual(probe.grade("outer", OK, foreign(0, "NXPROBE nx-tmux"))["verdict"], "ALLOWED")

    def test_missing_foreign_result_is_inconclusive(self):
        self.assertEqual(probe.grade("outer", OK, None)["verdict"], "INCONCLUSIVE")

    def test_probe_that_started_its_own_server_proves_nothing(self):
        g = probe.grade("outer", OK, foreign(0, "NXPROBE nx-tmux", prober_servers_after=["4242"]))
        self.assertEqual(g["verdict"], "INCONCLUSIVE")


class ServerLayer(unittest.TestCase):
    def test_tmux_acl_refusal_with_rc0_is_denied_by_server(self):
        # tmux sends the ACL exit message with retval 0, so rc alone is not evidence.
        g = probe.grade("server", OK, foreign(0, "access not allowed"), EXPOSED)
        self.assertEqual(g["verdict"], "DENIED_BY_SERVER")

    def test_foreign_success_on_exposed_socket_is_allowed(self):
        self.assertEqual(probe.grade("server", OK, foreign(0, "NXPROBE nx-tmux"), EXPOSED)["verdict"], "ALLOWED")

    def test_filesystem_refusal_means_layer_not_isolated(self):
        g = probe.grade("server", OK, foreign(1, "error connecting to /tmp/nx-exposed-tmux/tmux.sock (Permission denied)"), EXPOSED)
        self.assertEqual(g["verdict"], "INCONCLUSIVE")

    def test_socket_not_exposed_is_inconclusive(self):
        for st in (None,
                   {"socket": {"exists": True, "mode": "600"}, "socket_dir": {"mode": "755"}},
                   {"socket": {"exists": True, "mode": "666"}, "socket_dir": {"mode": "700"}},
                   {"socket": {"exists": False}, "socket_dir": {"mode": "755"}}):
            self.assertEqual(probe.grade("server", OK, foreign(0, "access not allowed"), st)["verdict"], "INCONCLUSIVE", st)

    def test_unknown_failure_is_inconclusive(self):
        g = probe.grade("server", OK, foreign(1, "Error: connection reset by peer"), EXPOSED)
        self.assertEqual(g["verdict"], "INCONCLUSIVE")


if __name__ == "__main__":
    unittest.main()
