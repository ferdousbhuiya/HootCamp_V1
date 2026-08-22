from career_blueprint_service import recommendation_from_blueprint, sanitize_blueprint, score_blueprint


def test_unknown_career_blueprint_scores_foundational_evidence_without_claiming_full_readiness():
    raw = {
        "canonical_title": "Dentist",
        "career_category": "Dentistry",
        "career_summary": "Oral-health professional pathway.",
        "regulated_role": True,
        "regulation_note": "Verify current licensing and education requirements with official authorities.",
        "core_competencies": ["Patient Assessment", "Oral Health", "Clinical Communication", "Infection Control"],
        "competency_evidence_map": [
            {"competency": "Patient Assessment", "evidence_keywords": ["Clinical Assessment"]},
            {"competency": "Oral Health", "evidence_keywords": ["Dentistry"]},
            {"competency": "Clinical Communication", "evidence_keywords": ["Patient Communication"]},
            {"competency": "Infection Control", "evidence_keywords": ["Infection Prevention"]},
        ],
        "domain_relevance_keywords": ["Dentistry", "Biology", "Chemistry"],
        "recommended_subjects": [
            {"name": "Biology", "reason": "Foundational life science"},
            {"name": "Chemistry", "reason": "Foundational physical science"},
            {"name": "Biochemistry", "reason": "Supports advanced biomedical study"},
        ],
        "education_or_training_pathway": ["Complete appropriate pre-professional education", "Complete accredited professional dental education"],
        "credentials_or_licensing_areas": ["Professional dental licensure"],
        "experience_or_portfolio_evidence": ["Clinical observation or relevant service experience"],
        "actions_30_days": ["Review prerequisite gaps"],
        "actions_6_months": ["Complete priority science preparation"],
        "actions_1_year": ["Prepare for the next formal education milestone"],
    }
    blueprint = sanitize_blueprint(raw, "Dentist", None)
    skills = [
        {"name": "Biology", "confidence": 0.95, "source": "academic_subject"},
        {"name": "Chemistry", "confidence": 0.90, "source": "academic_subject"},
        {"name": "Dentistry", "confidence": 0.75, "source": "career_interest"},
    ]
    score = score_blueprint(skills, blueprint)
    assert 0 < score["match_percentage"] < 50
    assert score["readiness_components"]["academic_preparation"] > 0
    assert len(score["missing_skills"]) >= 2


def test_direct_competency_evidence_increases_readiness():
    raw = {
        "canonical_title": "Example Career",
        "core_competencies": ["Data Analysis", "Communication"],
        "competency_evidence_map": [
            {"competency": "Data Analysis", "evidence_keywords": ["Data Analytics"]},
            {"competency": "Communication", "evidence_keywords": ["Professional Communication"]},
        ],
        "recommended_subjects": [],
        "domain_relevance_keywords": [],
    }
    blueprint = sanitize_blueprint(raw, "Example Career", None)
    score = score_blueprint([{"name": "Data Analytics", "confidence": 1.0}], blueprint)
    assert score["match_percentage"] >= 30
    recommendation = recommendation_from_blueprint(blueprint, score)
    assert recommendation["target_selected"] is True
    assert recommendation["path"] == "Example Career"
