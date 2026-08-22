import unittest

from market_intelligence import CAREER_TO_BLS_TITLE, CAREER_TO_ONET_TITLE, parse_bls_oews_table


class MarketIntelligenceTests(unittest.TestCase):
    def test_parse_bls_oews_table(self):
        sample = """
        <pre>
          Data scientists...................................................................     262,440    $60.96    $126,800       $57.80
          Electrical engineers.............................................................     198,750    $60.15    $125,100       $58.00
          Registered nurses.................................................................   3,379,720    $48.76    $101,420       $46.90
          Industrial engineers..............................................................    351,520    $51.20    $106,500       $49.90
        </pre>
        """
        records = parse_bls_oews_table(sample)
        self.assertEqual(records["data scientists"]["mean_annual_wage"], 126800)
        self.assertEqual(records["electrical engineers"]["employment"], 198750)
        self.assertEqual(records["registered nurses"]["median_hourly_wage"], 46.90)
        self.assertEqual(records["industrial engineers"]["employment"], 351520)

    def test_parser_keeps_backward_compatibility_without_currency_symbols(self):
        sample = """
        <pre>
          Industrial engineers..............................................................    351,520    51.20    106,500       49.90
        </pre>
        """
        records = parse_bls_oews_table(sample)
        self.assertEqual(records["industrial engineers"]["mean_annual_wage"], 106500)

    def test_key_student_paths_have_explicit_bls_mappings(self):
        expected = {
            "electrical engineer",
            "registered nurse",
            "software developer",
            "cybersecurity analyst",
            "data scientist",
            "accountant",
            "financial analyst",
            "project manager",
            "industrial engineer",
            "manufacturing engineer",
            "mechanical engineer",
            "mechanical design engineer",
            "hvac engineer",
            "business process analyst",
            "management analyst consultant",
            "operations analyst",
        }
        self.assertTrue(expected.issubset(set(CAREER_TO_BLS_TITLE)))

    def test_new_paths_have_explicit_onet_mappings(self):
        expected = {
            "industrial engineer",
            "manufacturing engineer",
            "mechanical design engineer",
            "hvac engineer",
            "business process analyst",
            "management analyst consultant",
            "operations analyst",
            "business intelligence analyst",
        }
        self.assertTrue(expected.issubset(set(CAREER_TO_ONET_TITLE)))


if __name__ == "__main__":
    unittest.main()
