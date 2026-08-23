import unittest

from market_intelligence import (
    CAREER_TO_BLS_TITLE,
    CAREER_TO_ONET_TITLE,
    _build_crosswalk,
    _soc_from_bls_code,
    parse_bls_oews_table,
)


class MarketIntelligenceTests(unittest.TestCase):
    def test_parse_bls_oews_table(self):
        sample = """
        <pre>
          Data scientists...................................................................     262,440    $60.96    $126,800       $57.80
          Electrical engineers.............................................................     198,750    $60.15    $125,100       $58.00
          Registered nurses.................................................................   3,379,720    $48.76    $101,420       $46.90
          Industrial engineers..............................................................    365,740    $52.84    $109,900       $49.25
        </pre>
        """
        records = parse_bls_oews_table(sample)
        self.assertEqual(records["data scientists"]["mean_annual_wage"], 126800)
        self.assertEqual(records["electrical engineers"]["employment"], 198750)
        self.assertEqual(records["registered nurses"]["median_hourly_wage"], 46.90)
        self.assertEqual(records["industrial engineers"]["employment"], 365740)
        self.assertEqual(records["industrial engineers"]["mean_annual_wage"], 109900)

    def test_parser_accepts_current_bls_plain_numeric_rows(self):
        sample = """
        <pre>
          Industrial engineers.............................................................     365,740    52.84    109,900       49.25
          Mechanical engineers..............................................................     296,810    54.62    113,610       50.05
        </pre>
        """
        records = parse_bls_oews_table(sample)
        self.assertEqual(records["industrial engineers"]["mean_annual_wage"], 109900)
        self.assertEqual(records["mechanical engineers"]["employment"], 296810)

    def test_parser_preserves_row_boundaries_when_markup_changes(self):
        sample = """
        <div>Industrial engineers............................................................. 365,740 52.84 109,900 49.25</div>
        <div>Mechanical engineers.............................................................. 296,810 54.62 113,610 50.05</div>
        """
        records = parse_bls_oews_table(sample)
        self.assertEqual(records["industrial engineers"]["employment"], 365740)
        self.assertEqual(records["mechanical engineers"]["mean_annual_wage"], 113610)

    def test_key_student_paths_have_explicit_bls_mappings(self):
        expected = {
            "electrical engineer", "registered nurse", "software developer",
            "cybersecurity analyst", "data scientist", "accountant", "financial analyst",
            "project manager", "industrial engineer", "manufacturing engineer",
            "mechanical engineer", "mechanical design engineer", "hvac engineer",
            "business process analyst", "management analyst consultant", "operations analyst",
        }
        self.assertTrue(expected.issubset(set(CAREER_TO_BLS_TITLE)))

    def test_new_paths_have_explicit_onet_mappings(self):
        expected = {
            "industrial engineer", "manufacturing engineer", "mechanical design engineer",
            "hvac engineer", "business process analyst", "management analyst consultant",
            "operations analyst", "business intelligence analyst",
        }
        self.assertTrue(expected.issubset(set(CAREER_TO_ONET_TITLE)))

    def test_bls_code_is_exposed_as_standard_soc(self):
        self.assertEqual(_soc_from_bls_code("172112"), "17-2112")
        self.assertEqual(_soc_from_bls_code("291141"), "29-1141")

    def test_crosswalk_marks_same_soc_family_without_forcing_same_title(self):
        bls = {"available": True, "occupation_title": "Industrial engineers", "soc_code": "17-2112"}
        onet = {"available": True, "occupation_title": "Manufacturing Engineers", "onet_soc_code": "17-2112.03", "base_soc_code": "17-2112"}
        result = _build_crosswalk("Manufacturing Engineer", bls, onet)
        self.assertEqual(result["relationship"], "same_soc_family_different_detail")
        self.assertTrue(result["same_soc_family"])
        self.assertEqual(result["bls_occupation_title"], "Industrial engineers")
        self.assertEqual(result["onet_occupation_title"], "Manufacturing Engineers")

    def test_crosswalk_marks_matching_titles(self):
        bls = {"available": True, "occupation_title": "Industrial engineers", "soc_code": "17-2112"}
        onet = {"available": True, "occupation_title": "Industrial Engineers", "onet_soc_code": "17-2112.00", "base_soc_code": "17-2112"}
        result = _build_crosswalk("Industrial Engineer", bls, onet)
        self.assertEqual(result["relationship"], "same_occupation_title")
        self.assertTrue(result["same_soc_family"])


if __name__ == "__main__":
    unittest.main()
