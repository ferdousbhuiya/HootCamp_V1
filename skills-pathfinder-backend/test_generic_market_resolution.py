import unittest
from unittest.mock import patch

import generic_market_resolution as resolver


class GenericMarketResolutionTests(unittest.TestCase):
    def setUp(self):
        self.rows = [
            {
                "title": "Instructional Coordinators",
                "description": "Develop instructional material, coordinate educational content, and incorporate current technology.",
                "onetsoc_code": "25-9031.00",
            },
            {
                "title": "Set and Exhibit Designers",
                "description": "Design sets and exhibits for entertainment and display.",
                "onetsoc_code": "27-1027.00",
            },
            {
                "title": "Middle School Teachers, Except Special and Career/Technical Education",
                "description": "Teach students in public or private middle schools in one or more subjects.",
                "onetsoc_code": "25-2022.00",
            },
        ]

    @staticmethod
    def fake_bls(soc, title):
        return {
            "available": True,
            "occupation_title": title,
            "mapped_occupation": title,
            "soc_code": soc,
            "mean_annual_wage": 100000,
            "employment": 1000,
            "source_url": "https://www.bls.gov/oes/",
        }

    def test_instructional_designer_maps_to_instructional_family(self):
        with patch.object(resolver.market, "_onet_rows", return_value=self.rows), patch.object(
            resolver, "_bls_from_soc", side_effect=self.fake_bls
        ):
            result = resolver._lexical_onet_family_resolution("Instructional Designer (EdTech)")
        self.assertIsNotNone(result)
        self.assertEqual(result["onet"]["occupation_title"], "Instructional Coordinators")
        self.assertEqual(result["title_resolution"]["validated_soc"], "25-9031")

    def test_middle_school_math_teacher_maps_to_middle_school_teacher_family(self):
        with patch.object(resolver.market, "_onet_rows", return_value=self.rows), patch.object(
            resolver, "_bls_from_soc", side_effect=self.fake_bls
        ):
            result = resolver._lexical_onet_family_resolution("Middle School Math Teacher (Grades 6-8)")
        self.assertIsNotNone(result)
        self.assertEqual(
            result["onet"]["occupation_title"],
            "Middle School Teachers, Except Special and Career/Technical Education",
        )
        self.assertEqual(result["title_resolution"]["validated_soc"], "25-2022")

    def test_parenthetical_specialty_generates_clean_variant(self):
        variants = resolver._market_title_variants("Instructional Designer (EdTech)")
        self.assertIn("Instructional Designer", variants)
        self.assertEqual(variants[0], "Instructional Designer (EdTech)")


if __name__ == "__main__":
    unittest.main()
