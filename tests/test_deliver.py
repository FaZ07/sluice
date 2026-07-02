import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import deliver
import engine

JOB = {
    "job_id": "t-001",
    "client": "Test Client",
    "title": "Test dataset",
    "fields": [
        {"name": "name", "type": "string", "required": True},
        {"name": "phone", "type": "phone_in", "required": True},
    ],
    "dedupe_keys": ["name"],
}
ROWS = [
    {"name": "Aikya Interiors", "phone": "9841012345"},
    {"name": "Casa Bella", "phone": "12345"},          # rejected
    {"name": "aikya interiors", "phone": "9841012345"},  # dupe
]


def _result():
    return engine.process(ROWS, JOB)


class TestCsv(unittest.TestCase):
    def test_bom_prefix_for_excel(self):
        data = deliver.csv_bytes([{"name": "₹ test", "phone": "x"}], ["name", "phone"])
        self.assertTrue(data.startswith(b"\xef\xbb\xbf"))

    def test_header_order_matches_spec(self):
        data = deliver.csv_bytes([], ["b", "a"])
        self.assertEqual(data.decode("utf-8-sig").splitlines()[0], "b,a")


class TestDeliver(unittest.TestCase):
    def test_package_files_written(self):
        with tempfile.TemporaryDirectory() as tmp:
            pkg = deliver.deliver(JOB, _result(), tmp, now="2026-07-02 12:00 UTC")
            out = Path(pkg["dir"])
            for f in ("data.csv", "report.html", "manifest.json"):
                self.assertTrue((out / f).exists(), f)

    def test_manifest_sha_matches_csv(self):
        with tempfile.TemporaryDirectory() as tmp:
            pkg = deliver.deliver(JOB, _result(), tmp, now="2026-07-02 12:00 UTC")
            out = Path(pkg["dir"])
            manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
            actual = hashlib.sha256((out / "data.csv").read_bytes()).hexdigest()
            self.assertEqual(manifest["csv_sha256"], actual)
            self.assertEqual(pkg["csv_sha256"], actual)

    def test_deterministic_with_fixed_clock(self):
        with tempfile.TemporaryDirectory() as t1, tempfile.TemporaryDirectory() as t2:
            p1 = deliver.deliver(JOB, _result(), t1, now="2026-07-02 12:00 UTC")
            p2 = deliver.deliver(JOB, _result(), t2, now="2026-07-02 12:00 UTC")
            for f in ("data.csv", "report.html", "manifest.json"):
                self.assertEqual((Path(p1["dir"]) / f).read_bytes(),
                                 (Path(p2["dir"]) / f).read_bytes(), f)

    def test_report_contains_grade_title_client(self):
        result = _result()
        html_text = deliver.render_html(JOB, result["qa"], result["rows"], "2026-07-02 12:00 UTC")
        self.assertIn("Test dataset", html_text)
        self.assertIn("Test Client", html_text)
        self.assertIn(f"<b>{result['qa']['grade']}</b>", html_text)

    def test_report_escapes_html_in_data(self):
        qa = _result()["qa"]
        rows = [{"name": "<script>alert(1)</script>", "phone": "+91 98410 12345"}]
        html_text = deliver.render_html(JOB, qa, rows, "2026-07-02 12:00 UTC")
        self.assertNotIn("<script>alert", html_text)
        self.assertIn("&lt;script&gt;", html_text)

    def test_report_blank_cells_render_as_dash(self):
        job = {**JOB, "fields": JOB["fields"] + [{"name": "email", "type": "email"}]}
        rows = [{"name": "A", "phone": "+91 98410 12345", "email": ""}]
        html_text = deliver.render_html(job, _result()["qa"], rows, "x")
        self.assertIn("<td>—</td>", html_text)


if __name__ == "__main__":
    unittest.main()
