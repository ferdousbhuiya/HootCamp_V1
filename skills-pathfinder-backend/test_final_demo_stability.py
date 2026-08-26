import final_demo_stability as demo
from report_evidence_support import _gate_application_readiness, _same_career_title


def test_same_resume_evidence_gets_same_current_profession_score_despite_blueprint_variance():
    profile = {"primary_profession": "Head Baker"}
    structured = {
        "total_experience_years": 6.7,
        "education": [{"program_or_degree": "Culinary Arts Diploma"}],
        "experience": [{"role": "Head Baker", "skills_demonstrated": ["Food Safety", "Production Planning"]}],
    }
    extracted = [
        {"name": "Bread Production"},
        {"name": "Pastry Preparation"},
        {"name": "Food Safety"},
        {"name": "Inventory Control"},
        {"name": "Production Planning"},
        {"name": "Team Training"},
    ]
    first = [{
        "path": "Head Baker",
        "candidate_relation": "current_profession",
        "match_score": 0.93,
        "matched_skills": ["A"] * 8,
        "missing_skills": [],
    }]
    second = [{
        "path": "Head Baker",
        "candidate_relation": "current_profession",
        "match_score": 0.61,
        "matched_skills": ["A"] * 3,
        "missing_skills": ["B", "C", "D"],
    }]

    out1 = demo.stabilize_current_profession(profile, structured, first, extracted)
    out2 = demo.stabilize_current_profession(profile, structured, second, extracted)

    assert out1[0]["match_percentage"] == out2[0]["match_percentage"] == 95.0
    assert out1[0]["matched_skills"] == out2[0]["matched_skills"]
    assert out1[0]["missing_skills"] == out2[0]["missing_skills"] == []
    assert out1[0]["readiness_basis"]["method"] == "profession_agnostic_documented_role_evidence"


def test_current_profession_stabilization_does_not_change_specialization():
    profile = {"primary_profession": "Head Baker"}
    structured = {"total_experience_years": 6.7, "experience": [{"role": "Head Baker"}]}
    rows = [{
        "path": "Pastry Chef",
        "candidate_relation": "specialization",
        "match_score": 0.61,
        "match_percentage": 61.0,
        "matched_skills": ["A", "B", "C", "D"],
        "missing_skills": ["E"],
    }]
    out = demo.stabilize_current_profession(profile, structured, rows, [{"name": "Bread Production"}])
    assert out[0]["match_percentage"] == 61.0


def test_extract_bls_row_accepts_spaced_leader_dots():
    raw = """
    <pre>
      Chefs and Head Cooks . . . . . . . .  180,000  31.25  65,000  29.00
    </pre>
    """
    row = demo._extract_bls_row(raw, "Chefs and Head Cooks")
    assert row["employment"] == 180000
    assert row["mean_annual_wage"] == 65000
    assert row["mean_hourly_wage"] == 31.25


def test_generic_bls_title_match_does_not_require_profession_mapping():
    raw = """
    <pre>
      Chefs and Head Cooks . . . . . . . .  180,000  31.25  65,000  29.00
      Dentists, General . . . . . . . .  124,390  91.99  191,350  82.19
    </pre>
    """
    records = demo.parse_bls_rows(raw)
    row = demo._best_bls_row(records, "Chef")
    assert row and row["occupation_title"] == "Chefs and Head Cooks"


def test_application_readiness_gate_moves_low_scoring_non_current_career():
    advice = {
        "application_readiness": {
            "can_apply_now": ["Principal Analyst", "Director / Practice Lead (if experience aligns)"],
            "prepare_before_applying": [],
        }
    }
    careers = [
        {"title": "Principal Analyst", "candidate_relation": "current_profession", "match_percentage": 95},
        {"title": "Director / Practice Lead", "candidate_relation": "advancement_path", "match_percentage": 18},
    ]

    _gate_application_readiness(advice, careers)

    assert advice["application_readiness"]["can_apply_now"] == ["Principal Analyst"]
    assert advice["application_readiness"]["prepare_before_applying"] == ["Director / Practice Lead (if experience aligns)"]


def test_application_readiness_gate_allows_generic_strong_non_current_career():
    advice = {
        "application_readiness": {
            "can_apply_now": ["Risk Consultant"],
            "prepare_before_applying": [],
        }
    }
    careers = [
        {"title": "Risk Consultant", "candidate_relation": "adjacent_opportunity", "match_percentage": 72},
    ]

    _gate_application_readiness(advice, careers)
    assert advice["application_readiness"]["can_apply_now"] == ["Risk Consultant"]


def test_report_career_title_matching_is_profession_neutral():
    assert _same_career_title("Director / Practice Lead (if experience aligns)", "Director / Practice Lead")
    assert _same_career_title("Senior Data Analyst positions", "Senior Data Analyst")
    assert not _same_career_title("Security Manager", "Software Engineer")
