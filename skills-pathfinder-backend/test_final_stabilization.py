import career_blueprint_service as blueprint
import dynamic_career_discovery as discovery
import generic_market_resolution as generic_market
from final_stabilization import (
    filter_cross_domain,
    install_market_variants_patch,
    install_semantic_match_patch,
)


def setup_module():
    install_semantic_match_patch(blueprint, discovery)
    install_market_variants_patch(generic_market)


def test_legal_research_and_drafting_satisfies_legal_research():
    index = blueprint.build_evidence_index([
        {"name": "Legal Research & Drafting", "confidence": 1.0}
    ])
    row = blueprint._find_keyword(index, "Legal Research")
    assert row and row["name"] == "Legal Research & Drafting"


def test_endodontics_satisfies_endodontic_therapy():
    index = blueprint.build_evidence_index([
        {"name": "Endodontics", "confidence": 1.0}
    ])
    row = blueprint._find_keyword(index, "Endodontic Therapy")
    assert row and row["name"] == "Endodontics"


def test_digital_radiography_satisfies_digital_imaging():
    index = blueprint.build_evidence_index([
        {"name": "Digital Radiography", "confidence": 1.0}
    ])
    row = blueprint._find_keyword(index, "Digital Imaging")
    assert row and row["name"] == "Digital Radiography"


def test_dentist_does_not_get_weak_manufacturing_engineer_path():
    rows = [
        {"path": "General Dentist", "candidate_relation": "current_profession", "match_score": .55, "matched_skills": ["A", "B", "C"]},
        {"path": "Manufacturing Engineer", "candidate_relation": "adjacent", "match_score": .37, "matched_skills": ["CAD", "Troubleshooting"]},
        {"path": "Endodontist", "candidate_relation": "specialization", "match_score": .42, "matched_skills": ["Endodontics", "Digital Radiography"]},
    ]
    filtered = filter_cross_domain("General Dentist", rows)
    titles = [row["path"] for row in filtered]
    assert "General Dentist" in titles
    assert "Endodontist" in titles
    assert "Manufacturing Engineer" not in titles


def test_market_variants_include_broad_official_family():
    assert "Lawyers" in generic_market._market_title_variants("Corporate Litigation Attorney")
    assert "Dentists, General" in generic_market._market_title_variants("General Dentist")
    assert "Security Guards" in generic_market._market_title_variants("Security Officer")
