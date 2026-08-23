"""Final production bootstrap for Skills Pathfinder.

Loads the resume-first evidence API, installs skill-quality patches, uses generic
AI-driven career discovery for any profession, installs evidence-aware report
generation, and keeps the local career catalog only as a resilient fallback.
"""

from fastapi import File, UploadFile

from evidence_server import app, enhanced_upload
import main as main_module
import recommendation_engine as recommendation_module
from dynamic_career_discovery import discover_dynamic_careers, merge_recommendations
from report_evidence_support import install_evidence_aware_report
from server import resilient_llm_generate
from skill_quality import install_main_skill_patch

install_main_skill_patch(main_module)
install_evidence_aware_report(app, resilient_llm_generate)


async def structured_resume_upload(file: UploadFile = File(...)):
    """Extract evidence, discover careers generically, then score deterministically.

    The catalog is no longer the occupation gate. Groq identifies plausible careers
    from the complete structured resume and supplies competency blueprints. Our own
    scoring code calculates readiness from evidence. If dynamic discovery is
    temporarily unavailable, the existing catalog scorer remains as a fallback.
    """

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
        result["dynamic_career_discovery"] = True
        result["recommendations"] = merge_recommendations(
            dynamic_results,
            catalog_results,
            top_n=8,
        )
    except Exception as exc:
        print(f"[DYNAMIC CAREER DISCOVERY] Falling back to local catalog: {exc}")
        result["career_profile"] = {}
        result["dynamic_career_discovery"] = False
        result["dynamic_career_discovery_error"] = str(exc)
        result["recommendations"] = catalog_results

    return result


# Replace the resume endpoints at runtime so all resume-path recommendations use
# the complete evidence profile and generic career discovery.
app.router.routes = [
    route for route in app.router.routes
    if not (
        getattr(route, "path", None) in {"/api/upload", "/api/resume-evidence"}
        and "POST" in getattr(route, "methods", set())
    )
]
app.add_api_route("/api/upload", structured_resume_upload, methods=["POST"], tags=["evidence"])
app.add_api_route("/api/resume-evidence", structured_resume_upload, methods=["POST"], tags=["evidence"])
