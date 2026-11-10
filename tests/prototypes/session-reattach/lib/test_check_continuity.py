#!/usr/bin/env python3
"""Unit tests for check_continuity.py. Run: python3 -m unittest -v test_check_continuity"""
import base64
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_continuity as cc  # noqa: E402


def seq(n):
    return f"SEQ {n} 1762760000{n:03d}"


class Extract(unittest.TestCase):
    def test_plain_and_truth_lines(self):
        lines = ["START pid=1 uid=2001 ms=1\n", seq(1) + "\n", seq(2) + "\n"]
        self.assertEqual(cc.extract(lines), [1, 2])

    def test_tmux_control_mode_octal_escapes(self):
        line = "%output %0 " + seq(7) + "\\015\\012" + seq(8) + "\\015\\012\n"
        self.assertEqual(cc.extract([line]), [7, 8])

    def test_tmux_control_mode_ignores_notifications(self):
        self.assertEqual(cc.extract(["%begin 1 2 0\n", "%session-changed $0 nx\n"]), [])

    def test_herdr_frame_base64(self):
        payload = base64.b64encode(("\x1b[2J\x1b[H" + seq(3) + "\r\n" + seq(4)).encode()).decode()
        rec = json.dumps({"type": "terminal.frame", "data": payload})
        self.assertEqual(cc.extract([rec]), [3, 4])

    def test_herdr_frame_unknown_field_name(self):
        payload = base64.b64encode((seq(5) + "\r\n").encode()).decode()
        rec = json.dumps({"type": "terminal.frame", "frame": {"bytes_b64": payload, "cols": 120}})
        self.assertEqual(cc.extract([rec]), [5])

    def test_gateway_timestamp_prefix(self):
        self.assertEqual(cc.extract(["1762760000123\t" + seq(9) + "\n"]), [9])

    def test_ansi_colour_codes_do_not_hide_markers(self):
        self.assertEqual(cc.extract(["\x1b[32m" + seq(11) + "\x1b[0m\n"]), [11])

    def test_truncated_marker_without_timestamp_is_not_counted(self):
        # A line cut at the right edge of the screen must not count as seen.
        self.assertEqual(cc.extract(["SEQ 12\n"]), [])


class Analyze(unittest.TestCase):
    def test_contiguous(self):
        r = cc.analyze([1, 2, 3, 4])
        self.assertEqual((r["missing"], r["gaps"], r["duplicates"], r["out_of_order"]), (0, [], 0, 0))

    def test_gap_dup_and_reorder(self):
        r = cc.analyze([1, 2, 2, 6, 5, 9])
        self.assertEqual(r["gaps"], [[3, 4], [7, 8]])
        self.assertEqual(r["missing"], 4)
        self.assertEqual(r["duplicates"], 1)
        self.assertEqual(r["out_of_order"], 1)
        self.assertEqual((r["first"], r["last"]), (1, 9))

    def test_empty(self):
        r = cc.analyze([])
        self.assertEqual((r["count"], r["first"], r["last"]), (0, None, None))


class Coverage(unittest.TestCase):
    def test_full_and_partial_window(self):
        truth = list(range(1, 101))
        observed = list(range(1, 51)) + list(range(61, 101))
        full = cc.coverage(truth, observed)
        self.assertEqual(full["coverage"], 0.9)
        self.assertEqual(full["first_missing"][:2], [51, 52])
        win = cc.coverage(truth, observed, 61, 100)
        self.assertEqual(win["coverage"], 1.0)

    def test_spurious_markers_reported(self):
        self.assertEqual(cc.coverage([1, 2], [1, 2, 99])["spurious"], 1)

    def test_empty_window(self):
        self.assertIsNone(cc.coverage([1, 2], [1], 50, 60)["coverage"])


class FirstAfter(unittest.TestCase):
    def test_skips_lines_before_offset_and_non_marker_lines(self):
        lines = [
            "100\t" + seq(1) + "\n",
            "200\t#GATEWAY-ATTACH node=node1 mux=tmux id=nx\n",
            "250\t%begin 1 2 0\n",
            "300\t%output %0 " + seq(2) + "\\015\\012\n",
        ]
        self.assertEqual(cc.first_after(lines, 1), {"line": 3, "recv_ms": 300})

    def test_none_when_no_output(self):
        self.assertEqual(cc.first_after(["1\t#GATEWAY-DETACH rc=255\n"], 0), {"line": None, "recv_ms": None})


if __name__ == "__main__":
    unittest.main()
