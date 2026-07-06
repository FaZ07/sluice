import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent.parent))

import sluice

ROOT = Path(__file__).parent.parent
FIXTURE = "fixtures/client_messy_crm.csv"


class TestReadCsvRows(unittest.TestCase):
    def test_reads_client_fixture(self):
        rows = sluice.read_csv_rows(FIXTURE)
        self.assertEqual(len(rows), 16)
        self.assertEqual(
            set(rows[0]), {"business_name", "contact_phone", "email", "website", "city"})

    def test_absolute_path_and_excel_bom(self):
        # Excel saves "CSV UTF-8" with a BOM; utf-8-sig must eat it so the
        # first header doesn't become "﻿name".
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "client.csv"
            p.write_bytes(b"\xef\xbb\xbfname,phone\nAcme,9841012345\n")
            rows = sluice.read_csv_rows(str(p))
        self.assertEqual(rows, [{"name": "Acme", "phone": "9841012345"}])

    def test_list_of_files_merged_in_order(self):
        with tempfile.TemporaryDirectory() as td:
            a, b = Path(td) / "a.csv", Path(td) / "b.csv"
            a.write_text("name,phone\nFirst,1\n", encoding="utf-8")
            b.write_text("name,phone\nSecond,2\n", encoding="utf-8")
            rows = sluice.read_csv_rows([str(a), str(b)])
        self.assertEqual([r["name"] for r in rows], ["First", "Second"])


class TestCleanJobEndToEnd(unittest.TestCase):
    def _run_demo_clean(self, out_dir: str) -> dict:
        job = json.loads((ROOT / "jobs" / "demo_clean_csv.json").read_text(encoding="utf-8"))
        job["output_dir"] = out_dir  # absolute path wins over ROOT join
        with tempfile.NamedTemporaryFile(
                "w", suffix=".json", dir=out_dir, delete=False, encoding="utf-8") as fh:
            json.dump(job, fh)
            job_path = fh.name
        return sluice.run_job(Path(job_path))

    def test_demo_clean_job_qa_numbers(self):
        with tempfile.TemporaryDirectory() as td:
            package = self._run_demo_clean(td)
            manifest = json.loads(
                (Path(package["dir"]) / "manifest.json").read_text(encoding="utf-8"))
        qa = manifest["qa"]
        self.assertEqual(qa["rows_in"], 16)
        self.assertEqual(qa["rows_out"], 11)
        self.assertEqual(qa["rejected"], 2)      # bad phone + missing name
        self.assertEqual(qa["dupes_removed"], 3)  # case/spacing/format variants
        self.assertEqual(qa["grade"], "B")

    def test_csv_jobs_never_touch_wire(self):
        # Cleaning gigs must burn zero credits even in live mode.
        with tempfile.TemporaryDirectory() as td:
            with mock.patch.object(sluice.wire, "fetch",
                                   side_effect=AssertionError("wire called")):
                package = self._run_demo_clean(td)
            self.assertIn("data.csv", package["files"])


if __name__ == "__main__":
    unittest.main()
