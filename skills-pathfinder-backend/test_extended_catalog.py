import unittest

from career_catalog_extended import EXTENDED_CAREER_PATHS


class ExtendedCareerCatalogTests(unittest.TestCase):
    def test_catalog_covers_multiple_student_domains(self):
        categories = {career["category"] for career in EXTENDED_CAREER_PATHS}
        expected = {
            "Healthcare & Nursing",
            "Healthcare Administration",
            "Business & Analytics",
            "Accounting & Finance",
            "Human Resources",
            "Education",
            "History & Humanities",
            "Cybersecurity",
            "Data & AI",
            "Engineering",
        }
        self.assertTrue(expected.issubset(categories))

    def test_every_career_has_frontend_contract_fields(self):
        required = {
            "id",
            "path",
            "category",
            "required_skills",
            "job_outlook",
            "median_salary",
            "top_locations",
            "recommended_certifications",
            "recommended_degrees",
            "next_steps",
            "learning_resources",
        }
        for career in EXTENDED_CAREER_PATHS:
            self.assertTrue(required.issubset(career), career.get("id"))
            self.assertTrue(career["required_skills"], career["id"])

    def test_regulated_roles_are_flagged(self):
        by_id = {career["id"]: career for career in EXTENDED_CAREER_PATHS}
        self.assertTrue(by_id["registered_nurse"]["regulated_role"])
        self.assertTrue(by_id["teacher"]["regulated_role"])


if __name__ == "__main__":
    unittest.main()
