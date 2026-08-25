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
        self.assertIn("readiness_level", top)
        self.assertIn("competency_percentage", top)

    def test_generic_transferable_skills_do_not_create_specialized_career(self):
        evidence = {
            "experience": [
                {
                    "role": "Office Manager",
                    "start_date": "2020",
                    "end_date": "Present",
                    "responsibilities": ["Project management", "budget", "stakeholder collaboration"]
                }
            ]
        }
        recs = get_career_recommendations([
            self.skill("Project Management"),
            self.skill("Team Leadership"),
            self.skill("Budget Management"),
            self.skill("Stakeholder Collaboration"),
            self.skill("Problem Solving"),
        ], top_n=20, structured_evidence=evidence)
        ids = {r["id"] for r in recs}
        self.assertNotIn("electrical_engineer", ids)
        self.assertNotIn("mechanical_engineer", ids)
        self.assertNotIn("power_systems_engineer", ids)

    def test_training_only_data_candidate_is_not_labeled_professional_ready(self):
        evidence = {
            "education": [{"program_or_degree": "BS", "field_of_study": "Data Analytics"}],
            "projects": [{"title": "Analytics capstone", "description": "Python SQL Power BI data analysis dashboard"}],
        }
        recs = get_career_recommendations([
            self.skill("Python"), self.skill("SQL"), self.skill("Power BI"),
            self.skill("Tableau"), self.skill("Data Analytics"), self.skill("Advanced Excel")
        ], top_n=10, structured_evidence=evidence)
        data = next(r for r in recs if r["id"] == "data_analyst")
        self.assertLessEqual(data["match_percentage"], 74.0)
        self.assertIn(data["readiness_level"], {"transition_career", "future_upskilling"})

    def test_relevant_experience_can_create_best_fit_now(self):
        evidence = {
            "education": [{"program_or_degree": "BS Electrical Engineering", "field_of_study": "Electrical Engineering"}],
            "experience": [{
                "role": "Electrical Engineer",
                "start_date": "January 2021",
                "end_date": "Present",
                "responsibilities": ["Power distribution", "overhead lines", "AutoCAD", "HSE compliance", "troubleshooting"]
            }]
        }
        recs = get_career_recommendations([
            self.skill("Power Distribution"), self.skill("Overhead Lines"), self.skill("HSE Compliance"),
            self.skill("Project Management"), self.skill("AutoCAD"), self.skill("Troubleshooting")
        ], top_n=10, structured_evidence=evidence)
        electrical = next(r for r in recs if r["id"] == "electrical_engineer")
        self.assertEqual(electrical["readiness_level"], "best_fit_now")
        self.assertGreaterEqual(electrical["match_percentage"], 68.0)

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
