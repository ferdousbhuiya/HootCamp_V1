"""Regression coverage for regulated-profession resume evidence.

This test intentionally uses only explicit resume evidence and no network calls.
"""

import evidence_server as evidence_module
import market_intelligence as market_module
import recommendation_engine as recommendation_module
from regulated_profession_support import install_regulated_profession_support


RESUME_TEXT = """
SARAH CONNER, BSN, RN, CCRN | Chicago, IL
Summary: Compassionate ICU Nurse with 5 years of critical care experience in Level 1 Trauma Centers.
Skilled in ventilator management, hemodynamic monitoring, and rapid response coordination.
Certifications: Registered Nurse (IL), CCRN, ACLS, BLS, PALS.
Skills: Patient Assessment, IV Infusion Management, Electronic Health Records (Epic, Cerner), Multidisciplinary Collaboration.
Experience:
Critical Care Nurse (ICU) | Northwestern Health System | 2021 - Present
Managed 1:2 nurse-to-patient ratio for high-acuity surgical patients; led telemetry training for department staff.
Staff Nurse (Medical-Surgical) | Mercy Hospital | 2019 - 2021
Administered post-operative care, monitored vitals, and managed pain protocols for 5-6 patients per shift.
Education: Bachelor of Science in Nursing | Loyola University Chicago
"""


def _install_once():
    install_regulated_profession_support(evidence_module, recommendation_module, market_module)


def test_nursing_resume_extracts_clinical_and_credential_signals():
    _install_once()
    skills = evidence_module._signal_skills(RESUME_TEXT)
    names = {item["name"] for item in skills}

    expected = {
        "Patient Assessment",
        "IV Infusion Management",
        "Electronic Health Records",
        "Multidisciplinary Collaboration",
        "Ventilator Management",
        "Hemodynamic Monitoring",
        "Rapid Response Coordination",
        "Telemetry",
        "Postoperative Care",
        "Vital Signs Monitoring",
        "Pain Management",
        "Critical Care Nursing",
        "Medical-Surgical Nursing",
        "Registered Nurse License",
        "CCRN",
        "ACLS",
        "BLS",
        "PALS",
    }
    assert expected.issubset(names)


def test_nursing_resume_generates_regulated_career_matches():
    _install_once()
    skills = evidence_module._signal_skills(RESUME_TEXT)
    structured = {
        "skills": skills,
        "education": [{
            "institution": "Loyola University Chicago",
            "program_or_degree": "Bachelor of Science in Nursing",
            "field_of_study": "Nursing",
            "status": "completed",
            "evidence": "Bachelor of Science in Nursing | Loyola University Chicago",
        }],
        "experience": [
            {
                "role": "Critical Care Nurse (ICU)",
                "employer": "Northwestern Health System",
                "start_date": "2021",
                "end_date": "Present",
                "responsibilities": [
                    "Managed high-acuity surgical patients",
                    "Led telemetry training for department staff",
                ],
                "evidence": "Critical Care Nurse ICU high-acuity telemetry training",
            },
            {
                "role": "Staff Nurse (Medical-Surgical)",
                "employer": "Mercy Hospital",
                "start_date": "2019",
                "end_date": "2021",
                "responsibilities": [
                    "Administered post-operative care",
                    "Monitored vitals",
                    "Managed pain protocols",
                ],
                "evidence": "Medical-Surgical post-operative care monitored vitals pain protocols",
            },
        ],
        "projects": [],
        "publications": [],
        "certifications": [
            {"name": "Registered Nurse (IL)", "status": "completed", "evidence": "Registered Nurse (IL)"},
            {"name": "CCRN", "status": "completed", "evidence": "CCRN"},
            {"name": "ACLS", "status": "completed", "evidence": "ACLS"},
            {"name": "BLS", "status": "completed", "evidence": "BLS"},
            {"name": "PALS", "status": "completed", "evidence": "PALS"},
        ],
        "courses": [],
    }

    recommendations = recommendation_module.get_career_recommendations(
        skills,
        top_n=8,
        structured_evidence=structured,
    )
    by_title = {item["path"]: item for item in recommendations}

    assert "Critical Care Nurse" in by_title
    assert "Registered Nurse" in by_title
    assert by_title["Critical Care Nurse"]["match_percentage"] >= 70
    assert by_title["Registered Nurse"]["match_percentage"] >= 60
