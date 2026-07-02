import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import engine


class TestValidators(unittest.TestCase):
    # -- email ---------------------------------------------------------
    def test_email_valid_lowercased(self):
        self.assertEqual(engine.validate_email("HELLO@Studioverve.IN"), ("ok", "hello@studioverve.in"))

    def test_email_missing_tld_invalid(self):
        self.assertEqual(engine.validate_email("info@casabella")[0], "invalid")

    def test_email_na_placeholder_is_blank(self):
        self.assertEqual(engine.validate_email("n/a"), ("blank", ""))

    def test_email_empty_is_blank(self):
        self.assertEqual(engine.validate_email("")[0], "blank")

    # -- phone ---------------------------------------------------------
    def test_phone_plus91_spaced(self):
        self.assertEqual(engine.validate_phone_in("+91 98410 12345"), ("ok", "+91 98410 12345"))

    def test_phone_bare_10_digit(self):
        self.assertEqual(engine.validate_phone_in("9841012345"), ("ok", "+91 98410 12345"))

    def test_phone_91_prefix_no_plus(self):
        self.assertEqual(engine.validate_phone_in("91 76040 55667"), ("ok", "+91 76040 55667"))

    def test_phone_zero_prefixed_mobile(self):
        self.assertEqual(engine.validate_phone_in("098400 11223"), ("ok", "+91 98400 11223"))

    def test_phone_landline_with_std(self):
        self.assertEqual(engine.validate_phone_in("044-2461 1234"), ("ok", "044-24611234"))

    def test_phone_too_short_invalid(self):
        self.assertEqual(engine.validate_phone_in("12345")[0], "invalid")

    def test_phone_10_digits_bad_leading_digit_invalid(self):
        self.assertEqual(engine.validate_phone_in("1234567890")[0], "invalid")

    # -- url -----------------------------------------------------------
    def test_url_scheme_added(self):
        self.assertEqual(engine.validate_url("studioverve.in"), ("ok", "https://studioverve.in"))

    def test_url_existing_scheme_kept_canonical(self):
        self.assertEqual(engine.validate_url("https://dezigncraft.com"), ("ok", "https://dezigncraft.com"))

    def test_url_www_prefix_ok(self):
        self.assertEqual(engine.validate_url("www.studioverve.in"), ("ok", "https://www.studioverve.in"))

    def test_url_with_space_invalid(self):
        self.assertEqual(engine.validate_url("not a website")[0], "invalid")

    # -- number --------------------------------------------------------
    def test_number_rupee_and_commas(self):
        self.assertEqual(engine.validate_number("₹1,099"), ("ok", "1099"))

    def test_number_indian_lakh_grouping(self):
        self.assertEqual(engine.validate_number("₹1,04,990"), ("ok", "104990"))

    def test_number_decimal_kept(self):
        self.assertEqual(engine.validate_number("4.8"), ("ok", "4.8"))

    def test_number_dash_placeholder_blank(self):
        self.assertEqual(engine.validate_number("—")[0], "blank")

    def test_number_garbage_invalid(self):
        self.assertEqual(engine.validate_number("call for price")[0], "invalid")

    # -- string --------------------------------------------------------
    def test_string_whitespace_collapsed(self):
        self.assertEqual(engine.validate_string("Studio  Verve   Interiors"),
                         ("ok", "Studio Verve Interiors"))


SPEC = {
    "fields": [
        {"name": "name", "type": "string", "required": True},
        {"name": "phone", "type": "phone_in", "required": True},
        {"name": "email", "type": "email", "required": False},
    ],
    "dedupe_keys": ["name", "phone"],
}


class TestProcess(unittest.TestCase):
    def test_reject_on_missing_required(self):
        r = engine.process([{"name": "X", "phone": "", "email": ""}], SPEC)
        self.assertEqual(r["qa"]["rejected"], 1)
        self.assertEqual(r["qa"]["rows_out"], 0)

    def test_reject_on_invalid_required(self):
        r = engine.process([{"name": "X", "phone": "12345", "email": ""}], SPEC)
        self.assertEqual(r["qa"]["rejected"], 1)
        self.assertEqual(r["qa"]["issues"][0]["problem"], "invalid_phone_in")

    def test_invalid_optional_blanked_not_rejected(self):
        r = engine.process([{"name": "X", "phone": "9841012345", "email": "bad@bad"}], SPEC)
        self.assertEqual(r["qa"]["rejected"], 0)
        self.assertEqual(r["rows"][0]["email"], "")
        self.assertEqual(r["qa"]["issues"][0]["action"], "blanked")

    def test_dedupe_normalized_key(self):
        rows = [
            {"name": "Studio Verve", "phone": "+91 98410 12345", "email": ""},
            {"name": "studio  verve", "phone": "9841012345", "email": ""},
        ]
        r = engine.process(rows, SPEC)
        self.assertEqual(r["qa"]["dupes_removed"], 1)
        self.assertEqual(r["qa"]["rows_out"], 1)

    def test_dedupe_keeps_first_occurrence(self):
        rows = [
            {"name": "A", "phone": "9841012345", "email": "first@a.in"},
            {"name": "A", "phone": "9841012345", "email": "second@a.in"},
        ]
        r = engine.process(rows, SPEC)
        self.assertEqual(r["rows"][0]["email"], "first@a.in")

    def test_completeness_math(self):
        rows = [
            {"name": "A", "phone": "9841012345", "email": "a@a.in"},
            {"name": "B", "phone": "9841012346", "email": ""},
        ]
        r = engine.process(rows, SPEC)
        self.assertEqual(r["qa"]["field_completeness"]["email"], 0.5)
        self.assertEqual(r["qa"]["field_completeness"]["phone"], 1.0)

    def test_empty_input_grades_c_without_crashing(self):
        r = engine.process([], SPEC)
        self.assertEqual(r["qa"]["rows_out"], 0)
        self.assertEqual(r["qa"]["grade"], "C")

    def test_unknown_field_type_raises(self):
        with self.assertRaises(ValueError):
            engine.process([{"x": "1"}], {"fields": [{"name": "x", "type": "money"}]})

    def test_determinism_same_input_same_output(self):
        rows = [{"name": "A", "phone": "9841012345", "email": "a@a.in"}] * 3
        self.assertEqual(engine.process(rows, SPEC), engine.process(rows, SPEC))


class TestGrade(unittest.TestCase):
    def test_grade_a(self):
        self.assertEqual(engine.grade(0.05, 0.90), "A")

    def test_grade_b_on_completeness(self):
        self.assertEqual(engine.grade(0.05, 0.89), "B")

    def test_grade_b_on_rejects(self):
        self.assertEqual(engine.grade(0.10, 0.95), "B")

    def test_grade_c(self):
        self.assertEqual(engine.grade(0.20, 0.95), "C")


if __name__ == "__main__":
    unittest.main()
