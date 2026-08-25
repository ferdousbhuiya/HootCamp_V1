import unittest

from dynamic_career_discovery import _recommendation_sort_key, _relation_priority


class CareerRelationshipOrderingTests(unittest.TestCase):
    def test_relationship_priority_is_profession_first(self):
        self.assertGreater(_relation_priority("current_profession"), _relation_priority("specialization"))
        self.assertGreater(_relation_priority("specialization"), _relation_priority("advancement"))
        self.assertGreater(_relation_priority("advancement"), _relation_priority("adjacent"))

    def test_adjacent_high_score_does_not_redefine_profession(self):
        rows = [
            {"career_title": "Adjacent Analyst", "candidate_relation": "adjacent", "match_score": 0.96, "discovery_confidence": 0.95, "matched_skills": ["a", "b", "c"]},
            {"career_title": "Established Profession", "candidate_relation": "current_profession", "match_score": 0.52, "discovery_confidence": 0.85, "matched_skills": ["a"]},
            {"career_title": "Specialty", "candidate_relation": "specialization", "match_score": 0.80, "discovery_confidence": 0.90, "matched_skills": ["a", "b"]},
        ]
        rows.sort(key=_recommendation_sort_key, reverse=True)
        self.assertEqual(rows[0]["career_title"], "Established Profession")
        self.assertEqual(rows[1]["career_title"], "Specialty")
        self.assertEqual(rows[2]["career_title"], "Adjacent Analyst")

    def test_readiness_still_orders_paths_within_same_relationship(self):
        rows = [
            {"career_title": "Specialty B", "candidate_relation": "specialization", "match_score": 0.60, "discovery_confidence": 0.80},
            {"career_title": "Specialty A", "candidate_relation": "specialization", "match_score": 0.80, "discovery_confidence": 0.80},
        ]
        rows.sort(key=_recommendation_sort_key, reverse=True)
        self.assertEqual(rows[0]["career_title"], "Specialty A")


if __name__ == "__main__":
    unittest.main()
