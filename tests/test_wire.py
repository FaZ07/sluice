import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent.parent))

import wire


class TestUnwrap(unittest.TestCase):
    def test_triple_nested_data(self):
        self.assertEqual(wire.unwrap({"data": {"data": {"data": [1, 2]}}}), [1, 2])

    def test_bare_list(self):
        self.assertEqual(wire.unwrap([{"a": 1}]), [{"a": 1}])

    def test_results_key(self):
        self.assertEqual(wire.unwrap({"results": [3]}), [3])

    def test_no_list_raises(self):
        with self.assertRaises(wire.WireError):
            wire.unwrap({"status": "ok"})

    def test_scalar_raises(self):
        with self.assertRaises(wire.WireError):
            wire.unwrap(42)


class TestMockMode(unittest.TestCase):
    def setUp(self):
        os.environ["MODE"] = "mock"

    def tearDown(self):
        os.environ.pop("MODE", None)

    def test_fixture_rows_returned(self):
        rows = wire.fetch("gmaps_leads", {})
        self.assertEqual(len(rows), 18)
        self.assertIn("business_name", rows[0])

    def test_unknown_action_clean_error(self):
        with self.assertRaises(wire.WireError):
            wire.fetch("no_such_action", {})

    def test_mock_is_default_mode(self):
        os.environ.pop("MODE", None)
        rows = wire.fetch("amazon_search", {})
        self.assertEqual(len(rows), 12)


class TestLiveGuards(unittest.TestCase):
    def test_live_without_key_fails_fast(self):
        with mock.patch.dict(os.environ, {"MODE": "live", "WIRE_API_KEY": ""}):
            with self.assertRaises(wire.WireError):
                wire.fetch("gmaps_leads", {})

    def test_live_submit_and_poll(self):
        responses = [
            {"job_id": "j1"},
            {"status": "running"},
            {"status": "completed", "data": {"data": {"data": [{"x": 1}]}}},
        ]
        with mock.patch.dict(os.environ, {"MODE": "live", "WIRE_API_KEY": "k"}), \
             mock.patch.object(wire, "_request", side_effect=responses), \
             mock.patch.object(wire.time, "sleep"):
            self.assertEqual(wire.fetch("gmaps_leads", {}), [{"x": 1}])

    def test_live_job_failure_raises(self):
        responses = [{"job_id": "j1"}, {"status": "failed", "error": "blocked"}]
        with mock.patch.dict(os.environ, {"MODE": "live", "WIRE_API_KEY": "k"}), \
             mock.patch.object(wire, "_request", side_effect=responses), \
             mock.patch.object(wire.time, "sleep"):
            with self.assertRaises(wire.WireError):
                wire.fetch("gmaps_leads", {})

    def test_live_no_job_id_raises(self):
        with mock.patch.dict(os.environ, {"MODE": "live", "WIRE_API_KEY": "k"}), \
             mock.patch.object(wire, "_request", return_value={"oops": True}):
            with self.assertRaises(wire.WireError):
                wire.fetch("gmaps_leads", {})


if __name__ == "__main__":
    unittest.main()
