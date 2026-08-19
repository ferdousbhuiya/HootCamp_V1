import unittest

from market_intelligence import CAREER_TO_BLS_TITLE, parse_bls_oews_table


class MarketIntelligenceTests(unittest.TestCase):
    def test_parse_bls_oews_table(self):
        sample = """
        <pre>
          Data scientists...................................................................     262,440    60.96    126,800       57.80
          Electrical engineers.............................................................     198,750    60.15    125,100       58.00
          Registered nurses.................................................................   3,379,720    48.76    101,420       46.90
        </pre>
        """
        records = parse_bls_oews_table(sample)
        self.assertEqual(records["data scientists"]["mean_annual_wage"], 126800)
        self.assertEqual(records["electrical engineers"]["employment"], 198750)
        self.assertEqual(records["registered nurses"]["median_hourly_wage"], 46.90)

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
        }
        self.assertTrue(expected.issubset(set(CAREER_TO_BLS_TITLE)))


if __name__ == "__main__":
    unittest.main()
