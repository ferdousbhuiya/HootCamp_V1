import career_blueprint_service as blueprint
import dynamic_career_discovery as discovery
import generic_market_resolution as generic_market
from final_stabilization import (
    filter_cross_domain,
    install_market_variants_patch,
    install_semantic_match_patch,
)
from recommendation_cleanup import credentials_equivalent


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


def test_weak_adjacent_pivot_is_filtered_without_profession_rules():
    rows = [
        {"path": "Current Role", "candidate_relation": "current_profession", "match_score": .55, "matched_skills": ["A", "B", "C"]},
        {"path": "Unrelated Adjacent Role", "candidate_relation": "adjacent", "match_score": .37, "matched_skills": ["Generic Skill", "Troubleshooting"], "discovery_confidence": .9},
        {"path": "Specialized Role", "candidate_relation": "specialization", "match_score": .42, "matched_skills": ["A", "B"]},
    ]
    filtered = filter_cross_domain("Current Role", rows)
    titles = [row["path"] for row in filtered]
    assert "Current Role" in titles
    assert "Specialized Role" in titles
    assert "Unrelated Adjacent Role" not in titles


def test_strong_adjacent_pivot_is_kept_when_evidence_is_substantial():
    rows = [{
        "path": "Evidence-Supported Adjacent Role",
        "candidate_relation": "adjacent",
        "match_score": .72,
        "matched_skills": ["A", "B", "C", "D"],
        "discovery_confidence": .85,
    }]
    filtered = filter_cross_domain("Current Role", rows)
    assert [row["path"] for row in filtered] == ["Evidence-Supported Adjacent Role"]


def test_market_patch_does_not_add_profession_specific_mappings():
    before_bls = dict(generic_market.market.CAREER_TO_BLS_TITLE)
    before_onet = dict(generic_market.market.CAREER_TO_ONET_TITLE)
    install_market_variants_patch(generic_market)
    assert generic_market.market.CAREER_TO_BLS_TITLE == before_bls
    assert generic_market.market.CAREER_TO_ONET_TITLE == before_onet


def test_bls_cpr_equivalent_wording_is_not_recommended_twice():
    held = "Basic Life Support (BLS) & CPR Certified"
    suggested = "BLS & CPR Certification"
    assert credentials_equivalent(held, suggested)
