"""Final production bootstrap for Skills Pathfinder.

Uses one profession-neutral AI pass to extract resume evidence and candidate career
blueprints, then scores those blueprints deterministically. The local catalog remains
a resilient fallback rather than an occupation gate.
"""

from fastapi import File, UploadFile

import evidence_server as evidence_module
from evidence_server import app, enhanced_upload
import main as main_module
import recommendation_engine as recommendation_module
from combined_resume_intelligence import install_combined_resume_intelligence
from dynamic_career_discovery import discover_dynamic_careers, merge_recommendations
from generic_market_resolution import install_generic_market_route
from report_evidence_support import install_evidence_aware_report
from server import resilient_llm_generate
from skill_quality import install_main_skill_patch

install_main_skill_patch(main_module)
install_combined_resume_intelligence(evidence_module, resilient_llm_generate)
install_evidence_aware_report(app, resilient_llm_generate)
install_generic_market_route(app, resilient_llm_generate)


async def structured_resume_upload(file: UploadFile = File(...)):
    """Extract evidence, discover careers generically, then score deterministically."""
    result = await enhanced_upload(file)
    skills = result.get("extracted_skills") or []
    structured = result.get("structured_evidence") or {}

    catalog_results = recommendation_module.get_career_recommendations(
        skills,
        top_n=8,
        structured_evidence=structured,
    )

    try:
        career_profile, dynamic_results = await discover_dynamic_careers(
            structured,
            skills,
            resilient_llm_generate,
            max_careers=6,
        )
        result["career_profile"] = career_profile
        result["dynamic_career_discovery"] = bool(dynamic_results)
        result["recommendations"] = merge_recommendations(dynamic_results, catalog_results, top_n=8)
        if not result["recommendations"]:
            result["career_discovery_warning"] = "No evidence-supported career recommendations were produced."
    except Exception as exc:
        print(f"[DYNAMIC CAREER DISCOVERY] Falling back to local catalog: {exc}")
        result["career_profile"] = structured.get("career_profile") or {}
        result["dynamic_career_discovery"] = False
        result["dynamic_career_discovery_error"] = str(exc)
        result["recommendations"] = catalog_results

    return result


app.router.routes = [
    route for route in app.router.routes
    if not (
        getattr(route, "path", None) in {"/api/upload", "/api/resume-evidence"}
        and "POST" in getattr(route, "methods", set())
    )
]
app.add_api_route("/api/upload", structured_resume_upload, methods=["POST"], tags=["evidence"])
app.add_api_route("/api/resume-evidence", structured_resume_upload, methods=["POST"], tags=["evidence"])
