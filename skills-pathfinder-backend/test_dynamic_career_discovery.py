import asyncio
import json
import unittest

from dynamic_career_discovery import discover_dynamic_careers


class DynamicCareerDiscoveryTests(unittest.TestCase):
    def test_good_embedded_direct_candidate_does_not_make_second_ai_call(self):
        structured = {
            "career_profile": {
                "primary_profession": "Mechanical Engineer",
                "professional_level": "mid-career",
                "domain": "Mechanical Engineering",
                "specializations": ["Mechanical Design"],
            },
            "career_candidates": [
                {
                    "canonical_title": "Mechanical Engineer",
                    "career_category": "Engineering",
                    "career_summary": "Mechanical design and analysis.",
                    "candidate_relation": "current_profession",
                    "candidate_confidence": 0.98,
                    "candidate_evidence": ["Mechanical Engineer role", "BS Mechanical Engineering"],
                    "core_competencies": ["Mechanical Design", "CAD", "Simulation Analysis"],
                    "competency_evidence_map": [
                        {"competency": "Mechanical Design", "evidence_keywords": ["Mechanical Design"]},
                        {"competency": "CAD", "evidence_keywords": ["SolidWorks", "AutoCAD"]},
                        {"competency": "Simulation Analysis", "evidence_keywords": ["ANSYS"]},
                    ],
                    "domain_relevance_keywords": ["Mechanical Engineering"],
                },
                {
                    "canonical_title": "Manufacturing Engineer",
                    "career_category": "Manufacturing",
                    "career_summary": "Manufacturing process engineering.",
                    "candidate_relation": "adjacent",
                    "candidate_confidence": 0.8,
                    "candidate_evidence": ["Manufacturing experience"],
                    "core_competencies": ["Manufacturing Processes", "CAD", "Problem Solving"],
                    "competency_evidence_map": [],
                    "domain_relevance_keywords": ["Manufacturing"],
                },
                {
                    "canonical_title": "HVAC Engineer",
                    "career_category": "Building Systems",
                    "career_summary": "HVAC engineering.",
                    "candidate_relation": "specialization",
                    "candidate_confidence": 0.7,
                    "candidate_evidence": ["HVAC project"],
                    "core_competencies": ["HVAC Systems", "Thermodynamics", "Mechanical Design"],
                    "competency_evidence_map": [],
                    "domain_relevance_keywords": ["Mechanical Engineering"],
                },
            ],
            "education": [{"program_or_degree": "Bachelor of Science in Mechanical Engineering", "field_of_study": "Mechanical Engineering"}],
            "experience": [{"role": "Mechanical Engineer", "skills_demonstrated": ["Mechanical Design", "SolidWorks", "ANSYS"]}],
            "certifications": [{"name": "Certified SolidWorks Professional"}],
            "projects": [{"name": "HVAC Energy Optimization", "description": "Analyzed HVAC performance"}],
        }
        skills = [
            {"name": "Mechanical Design", "confidence": 0.95},
            {"name": "SolidWorks", "confidence": 0.95},
            {"name": "ANSYS", "confidence": 0.95},
        ]

        async def should_not_be_called(*args, **kwargs):
            raise AssertionError("Second AI call should not run for a complete direct-profession candidate set")

        profile, results = asyncio.run(discover_dynamic_careers(structured, skills, should_not_be_called, max_careers=6))
        self.assertEqual(profile["primary_profession"], "Mechanical Engineer")
        self.assertEqual(results[0]["path"], "Mechanical Engineer")
        self.assertEqual(results[0]["candidate_relation"], "current_profession")

    def test_missing_direct_profession_triggers_targeted_recovery(self):
        structured = {
            "career_profile": {
                "primary_profession": "Healthcare Operations Manager",
                "professional_level": "mid-career",
                "domain": "Healthcare Administration",
                "specializations": ["Healthcare Operations"],
            },
            "career_candidates": [
                {
                    "canonical_title": "Operations Analyst",
                    "career_category": "Operations & Analytics",
                    "career_summary": "General operations analysis.",
                    "candidate_relation": "adjacent",
                    "candidate_confidence": 0.72,
                    "candidate_evidence": ["Workflow optimization"],
                    "core_competencies": ["Workflow Analysis", "Data Governance", "Data Analysis"],
                    "competency_evidence_map": [],
                    "domain_relevance_keywords": ["Operations"],
                },
                {
                    "canonical_title": "Industrial Engineer",
                    "career_category": "Engineering",
                    "career_summary": "Industrial process improvement.",
                    "candidate_relation": "adjacent",
                    "candidate_confidence": 0.60,
                    "candidate_evidence": ["Process improvement"],
                    "core_competencies": ["Process Improvement", "Workflow Analysis", "Problem Solving"],
                    "competency_evidence_map": [],
                    "domain_relevance_keywords": ["Operations"],
                },
            ],
            "education": [
                {"program_or_degree": "Master of Healthcare Administration", "field_of_study": "Healthcare Administration"},
                {"program_or_degree": "Bachelor of Science in Health Sciences", "field_of_study": "Health Sciences"},
            ],
            "experience": [
                {"role": "Healthcare Operations Manager", "skills_demonstrated": ["Healthcare Operations", "HIPAA Compliance", "EHR Workflow Optimization"]},
                {"role": "Patient Services Coordinator", "skills_demonstrated": ["Patient Scheduling", "Medical Billing"]},
            ],
            "certifications": [
                {"name": "Certified Healthcare Administrative Professional"},
                {"name": "Lean Six Sigma Green Belt (Healthcare)"},
            ],
            "projects": [
                {"name": "EHR Workflow Optimization in Epic", "description": "Reduced patient check-in wait time"},
                {"name": "Joint Commission Audit Preparation", "description": "Achieved accreditation compliance"},
            ],
        }
        skills = [
            {"name": "Healthcare Operations", "confidence": 0.95},
            {"name": "HIPAA Compliance", "confidence": 0.95},
            {"name": "EHR Workflow Optimization", "confidence": 0.95},
            {"name": "Patient Scheduling", "confidence": 0.9},
            {"name": "Medical Billing", "confidence": 0.9},
        ]
        calls = []

        async def fake_llm(prompt, max_tokens_override=None):
            calls.append(prompt)
            return json.dumps({
                "profile": structured["career_profile"],
                "careers": [
                    {
                        "canonical_title": "Healthcare Administrator",
                        "career_category": "Healthcare Management",
                        "career_summary": "Leads healthcare administrative and operational functions.",
                        "candidate_relation": "current_profession",
                        "candidate_confidence": 0.97,
                        "candidate_evidence": ["MHA", "Healthcare Operations Manager", "cHAP"],
                        "core_competencies": ["Healthcare Operations", "HIPAA Compliance", "EHR Workflow Management", "Patient Services", "Quality Compliance"],
                        "competency_evidence_map": [
                            {"competency": "Healthcare Operations", "evidence_keywords": ["Healthcare Operations"]},
                            {"competency": "HIPAA Compliance", "evidence_keywords": ["HIPAA Compliance"]},
                            {"competency": "EHR Workflow Management", "evidence_keywords": ["EHR Workflow Optimization"]},
                            {"competency": "Patient Services", "evidence_keywords": ["Patient Scheduling", "Medical Billing"]},
                            {"competency": "Quality Compliance", "evidence_keywords": ["Joint Commission", "accreditation compliance"]},
                        ],
                        "domain_relevance_keywords": ["Healthcare Administration", "Health Sciences"],
                    },
                    {
                        "canonical_title": "Healthcare Operations Manager",
                        "career_category": "Healthcare Management",
                        "career_summary": "Manages healthcare operations and service delivery.",
                        "candidate_relation": "specialization",
                        "candidate_confidence": 0.96,
                        "candidate_evidence": ["Current job title", "Healthcare operations experience"],
                        "core_competencies": ["Healthcare Operations", "EHR Workflow Management", "Patient Services", "Quality Compliance", "Team Leadership"],
                        "competency_evidence_map": [
                            {"competency": "Healthcare Operations", "evidence_keywords": ["Healthcare Operations"]},
                            {"competency": "EHR Workflow Management", "evidence_keywords": ["EHR Workflow Optimization"]},
                            {"competency": "Patient Services", "evidence_keywords": ["Patient Scheduling"]},
                        ],
                        "domain_relevance_keywords": ["Healthcare Administration"],
                    },
                ],
            })

        profile, results = asyncio.run(discover_dynamic_careers(structured, skills, fake_llm, max_careers=6))
        titles = [row["path"] for row in results]
        self.assertEqual(len(calls), 1)
        self.assertIn("Healthcare Administrator", titles)
        self.assertIn("Healthcare Operations Manager", titles)
        self.assertLess(titles.index("Healthcare Administrator"), titles.index("Industrial Engineer"))
        self.assertGreater(results[titles.index("Healthcare Administrator")]["occupational_alignment_score"], results[titles.index("Industrial Engineer")]["occupational_alignment_score"])

    def test_recovery_failure_preserves_original_candidates(self):
        structured = {
            "career_profile": {"primary_profession": "Unknown Specialty", "domain": "General Operations"},
            "career_candidates": [
                {
                    "canonical_title": "Operations Analyst",
                    "career_category": "Operations",
                    "career_summary": "Operations analysis.",
                    "candidate_relation": "adjacent",
                    "candidate_confidence": 0.7,
                    "candidate_evidence": ["Operations evidence"],
                    "core_competencies": ["Workflow Analysis", "Problem Solving"],
                    "competency_evidence_map": [],
                    "domain_relevance_keywords": ["Operations"],
                }
            ],
            "experience": [{"role": "Operations Coordinator"}],
        }
        skills = [{"name": "Workflow Analysis", "confidence": 0.9}]

        async def failing_llm(*args, **kwargs):
            raise RuntimeError("temporary Groq outage")

        _, results = asyncio.run(discover_dynamic_careers(structured, skills, failing_llm, max_careers=6))
        self.assertEqual([row["path"] for row in results], ["Operations Analyst"])


if __name__ == "__main__":
    unittest.main()
