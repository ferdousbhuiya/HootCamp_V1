import final_demo_stability as demo


def test_current_profession_score_is_stable_for_experienced_dentist():
    profile = {"primary_profession": "General Dentist"}
    structured = {
        "total_experience_years": 6.7,
        "experience": [{"role": "General Dentist"}, {"role": "Associate Dentist"}],
    }
    rows = [{
        "path": "General Dentist",
        "candidate_relation": "current_profession",
        "match_score": 0.775,
        "matched_skills": ["A", "B", "C", "D", "E", "F"],
        "missing_skills": [],
    }]
    out = demo.stabilize_current_profession(profile, structured, rows)
    assert out[0]["match_percentage"] == 95.0
    assert out[0]["readiness_stabilized"] is True


def test_current_profession_stabilization_does_not_change_specialization():
    profile = {"primary_profession": "General Dentist"}
    structured = {"total_experience_years": 6.7, "experience": [{"role": "General Dentist"}]}
    rows = [{
        "path": "Endodontist",
        "candidate_relation": "specialization",
        "match_score": 0.61,
        "match_percentage": 61.0,
        "matched_skills": ["A", "B", "C", "D"],
        "missing_skills": ["E"],
    }]
    out = demo.stabilize_current_profession(profile, structured, rows)
    assert out[0]["match_percentage"] == 61.0


def test_extract_bls_row_from_official_table_format():
    raw = """
    <pre>
      Dentists, General............................................................. 124,390 91.99 191,350 82.19
    </pre>
    """
    row = demo._extract_bls_row(raw, "Dentists, General")
    assert row["employment"] == 124390
    assert row["mean_annual_wage"] == 191350
    assert row["mean_hourly_wage"] == 91.99
