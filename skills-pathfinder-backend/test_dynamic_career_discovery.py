import unittest

from dynamic_career_discovery import (
    _ensure_current_profession_candidate,
    _recommendation_sort_key,
    _relation_priority,
)


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

    def test_missing_current_profession_is_recovered_from_resume_role(self):
        profile = {"primary_profession": "Middle School Math Teacher", "domain": "Education"}
        candidates = [
            {
                "canonical_title": "STEM Curriculum Developer",
                "candidate_relation": "specialization",
                "candidate_confidence": 0.94,
                "core_competencies": ["Curriculum Design"],
            },
            {
                "canonical_title": "EdTech Specialist",
                "candidate_relation": "adjacent",
                "candidate_confidence": 0.91,
                "core_competencies": ["Technology Integration"],
            },
        ]
        evidence = {
            "experience": [
                {
                    "role": "Middle School Math Teacher (Grades 6-8)",
                    "responsibilities": ["Teach Pre-Algebra and Algebra I to 130+ students."],
                    "skills_demonstrated": ["Classroom Management", "Differentiated Instruction"],
                }
            ]
        }
        skills = [
            {"name": "Instructional Design"},
            {"name": "Classroom Management"},
            {"name": "Differentiated Instruction"},
        ]
        resolved_profile, resolved = _ensure_current_profession_candidate(profile, candidates, evidence, skills)
        self.assertEqual(resolved_profile["primary_profession"], "Middle School Math Teacher")
        self.assertEqual(resolved[0]["canonical_title"], "Middle School Math Teacher")
        self.assertEqual(resolved[0]["candidate_relation"], "current_profession")
        self.assertIn("Classroom Management", resolved[0]["core_competencies"])

    def test_matching_existing_candidate_is_promoted_not_duplicated(self):
        profile = {"primary_profession": "Corporate Attorney", "domain": "Legal"}
        candidates = [
            {
                "canonical_title": "Corporate Attorney",
                "candidate_relation": "specialization",
                "candidate_confidence": 0.80,
                "core_competencies": ["Contract Drafting", "Compliance"],
            },
            {
                "canonical_title": "Compliance Officer",
                "candidate_relation": "adjacent",
                "candidate_confidence": 0.75,
                "core_competencies": ["Compliance"],
            },
        ]
        _, resolved = _ensure_current_profession_candidate(profile, candidates, {"experience": []}, [])
        current = [row for row in resolved if row.get("candidate_relation") == "current_profession"]
        self.assertEqual(len(current), 1)
        self.assertEqual(current[0]["canonical_title"], "Corporate Attorney")
        self.assertEqual(len(resolved), 2)


if __name__ == "__main__":
    unittest.main()
