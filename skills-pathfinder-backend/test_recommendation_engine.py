import unittest

from recommendation_engine import calculate_match_score, get_career_recommendations, get_skill_gap_analysis


class RecommendationEngineTests(unittest.TestCase):
    def skill(self, name, confidence=1.0):
        return {"name": name, "category": "Test", "confidence": confidence}

    def test_power_bi_does_not_match_power_distribution(self):
        score, matched, missing = calculate_match_score(
            [self.skill("Power BI")],
            ["Power Distribution"],
        )
        self.assertEqual(score, 0.0)
        self.assertEqual(matched, [])
        self.assertEqual(missing, ["Power Distribution"])

    def test_known_alias_matches(self):
        score, matched, missing = calculate_match_score(
            [self.skill("Microsoft Power BI")],
            ["Power BI"],
        )
        self.assertGreater(score, 0.9)
        self.assertEqual(matched, ["Power BI"])
        self.assertEqual(missing, [])

    def test_core_match_ratio_is_independent_of_confidence(self):
        high, _, _ = calculate_match_score([self.skill("Python", 1.0)], ["Python"])
        low, _, _ = calculate_match_score([self.skill("Python", 0.2)], ["Python"])
        self.assertEqual(high, 1.0)
        self.assertEqual(low, 1.0)

    def test_recommendations_include_explainability_fields(self):
        evidence = {
            "education": [
                {"program_or_degree": "Certificate in Data Analytics", "field_of_study": "Data Analytics"}
            ],
            "projects": [
                {"title": "Data Analytics Project", "description": "Built Power BI dashboards using SQL and Python for data analysis."}
            ],
        }
        recs = get_career_recommendations([
            self.skill("Python"),
            self.skill("SQL"),
            self.skill("Power BI"),
            self.skill("Tableau"),
            self.skill("Data Analytics"),
            self.skill("Advanced Excel"),
        ], structured_evidence=evidence)
        self.assertTrue(recs)
        top = recs[0]
        self.assertIn("match_reason", top)
        self.assertIn("match_percentage", top)
        self.assertIn("skill_gap_percentage", top)
        self.assertIn("matched_skill_details", top)
        self.assertIn("domain_evidence", top)

    def test_skill_gap_returns_percentages(self):
        analysis = get_skill_gap_analysis(
            [self.skill("Python"), self.skill("SQL")],
            "data_analyst",
        )
        self.assertIsNotNone(analysis)
        self.assertIn("match_percentage", analysis)
        self.assertIn("skill_gap_percentage", analysis)
        self.assertIn("priority_missing_skills", analysis)


if __name__ == "__main__":
    unittest.main()
