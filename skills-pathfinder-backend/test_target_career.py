import pytest

import server


def test_nurse_alias_maps_to_registered_nurse():
    career = server._find_target_career("Nurse")
    assert career is not None
    assert career["id"] == "registered_nurse"
    assert career["path"] == "Registered Nurse"


@pytest.mark.asyncio
async def test_selected_target_is_returned_even_with_zero_skill_match():
    request = server.TargetCareerRequest(career_title="Nurse", skills=[])
    result = await server.target_career_analysis(request)

    assert result["target_found"] is True
    recommendation = result["recommendation"]
    assert recommendation["path"] == "Registered Nurse"
    assert recommendation["target_selected"] is True
    assert recommendation["match_percentage"] == 0.0
    assert recommendation["skill_gap_percentage"] == 100.0
    assert "Patient Care" in recommendation["missing_skills"]
