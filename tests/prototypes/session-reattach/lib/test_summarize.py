#!/usr/bin/env python3
"""Fixture test for summarize.py: a synthetic results directory with known answers.

Run: python3 -m unittest -v test_summarize   (from this directory)
"""
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import summarize  # noqa: E402

T0 = 1762760000000  # 13-digit epoch ms


def ms(i):
    return T0 + 100 * i


def seq_line(i):
    return f"SEQ {i} {ms(i)}"


class SummarizeFixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = self.tmp.name
        raw = os.path.join(d, "raw")
        os.makedirs(os.path.join(raw, "capture"))

        def w(name, text):
            with open(os.path.join(raw, name), "w") as f:
                f.write(text)

        events = [
            {"ms": T0, "event": "start_ok", "detail": {"node": "node1", "mux": "tmux"}},
            {"ms": T0, "event": "start_ok", "detail": {"node": "node1", "mux": "herdr"}},
            {"ms": ms(10), "event": "attach", "detail": {"node": "node1", "mux": "tmux", "from_line": 0}},
            {"ms": ms(10), "event": "attach", "detail": {"node": "node1", "mux": "herdr", "from_line": 0}},
            {"ms": ms(100), "event": "E1_browser_close_begin", "detail": None},
            {"ms": ms(200), "event": "E1_reattach", "detail": None},
            {"ms": ms(200), "event": "attach", "detail": {"node": "node1", "mux": "tmux", "from_line": 1000}},
            {"ms": ms(200), "event": "attach", "detail": {"node": "node1", "mux": "herdr", "from_line": 1000}},
            {"ms": ms(300), "event": "E5_done", "detail": None},
        ]
        with open(os.path.join(d, "events.jsonl"), "w") as f:
            f.write("\n".join(json.dumps(e) for e in events) + "\n")

        truth = "START pid=10 uid=2001 ms=0\n" + "\n".join(seq_line(i) for i in range(1, 301)) + "\n"
        status = {"alive": True, "server": {"pid": 5, "uid": 2001}, "producer": {"pid": 10, "uid": 2001, "started": "A"},
                  "socket": {"owner_uid": 2001, "mode": "600"}, "socket_dir": {"owner_uid": 2001, "mode": "700"}}
        for mux in ("tmux", "herdr"):
            w(f"truth-pre_reboot-node1-{mux}.txt", truth)
            w(f"status-baseline-node1-{mux}.json", json.dumps(status))
        w("status-E1-node1-tmux.json", json.dumps(status))
        w("status-E1-node1-herdr.json", json.dumps(dict(status, producer={"pid": 99, "uid": 2001, "started": "B"})))
        w("status-E6-node1-tmux.json", json.dumps({"alive": False, "producer": None}))
        w("log-pre_reboot-node1-tmux.txt", truth)
        w("backfill-E1-node1-tmux.txt", truth)
        w("backfill-E1-node1-herdr.txt", "")
        w("foreign-node1-tmux.json", json.dumps({"denied": True}))

        # tmux stream: every line while attached, padded so the 2nd attach starts at line 1000.
        first = [f"{ms(i)}\t%output %0 {seq_line(i)}\\015\\012\n" for i in range(10, 100)]
        pad = [f"{ms(100)}\t%exit\n"] * (1000 - len(first))
        second = [f"{ms(i) + 40}\t%output %0 {seq_line(i)}\\015\\012\n" for i in range(200, 300)]
        w("capture/node1-tmux.stream", "".join(first + pad + second))
        self.s = summarize.summarize(d)

    def tearDown(self):
        self.tmp.cleanup()

    def test_tmux_original_process_and_full_coverage(self):
        r = self.s["results"]["node1/tmux"]
        e1 = r["events"]["E1"]
        self.assertEqual(e1["verdict"], "REATTACHED_ORIGINAL")
        self.assertEqual(e1["lines_while_detached"], 101)
        self.assertEqual(e1["backfill_coverage_pct"], 100.0)
        self.assertEqual(e1["durable_log_coverage_pct"], 100.0)
        self.assertEqual(e1["time_to_first_output_ms"], 40)
        self.assertEqual(r["stream_steady_coverage_pct"], 100.0)
        self.assertTrue(r["ownership"]["ok"])
        self.assertTrue(r["second_user"]["denied"])
        self.assertEqual(r["host_reboot"]["after_reboot"], "REMOTE_PROCESS_EXITED")
        self.assertEqual(r["producer"]["missing_in_truth"], 0)
        self.assertEqual(r["producer"]["max_interval_ms"], 100)

    def test_new_pid_is_never_called_reattached(self):
        r = self.s["results"]["node1/herdr"]
        self.assertEqual(r["events"]["E1"]["verdict"], "RESTORED_NEW_PROCESS")
        self.assertEqual(r["events"]["E1"]["backfill_coverage_pct"], 0.0)
        self.assertIsNone(r["events"]["E1"]["durable_log_coverage_pct"])
        self.assertEqual(r["durable_log"], "none")
        self.assertEqual(r["stream_steady_coverage_pct"], 0.0)

    def test_missing_node_is_reported_not_invented(self):
        r = self.s["results"]["node2/tmux"]
        self.assertFalse(r["started"])
        self.assertEqual(r["events"]["E1"]["verdict"], "UNKNOWN")
        self.assertFalse(r["ownership"]["ok"])

    def test_markdown_renders(self):
        md = summarize.to_markdown(self.s)
        self.assertIn("| node1/tmux | E1 | REATTACHED_ORIGINAL |", md)


if __name__ == "__main__":
    unittest.main()
