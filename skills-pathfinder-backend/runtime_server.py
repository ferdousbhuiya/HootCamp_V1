"""Final production bootstrap for Skills Pathfinder.

Loads the resume-first evidence API, installs skill-quality patches, and ensures
career recommendations are recalculated from the complete structured resume
profile instead of skill names alone.
"""

from fastapi import File, UploadFile

from evidence_server import app, enhanced_upload
import main as main_module
import recommendation_engine as recommendation_module
from skill_quality import install_main_skill_patch

install_main_skill_patch(main_module)


async def structured_resume_upload(file: UploadFile = File(...)):
    """Run normal resume extraction, then score careers from the full evidence object."""
    result = await enhanced_upload(file)
    result["recommendations"] = recommendation_module.get_career_recommendations(
        result.get("extracted_skills") or [],
        top_n=8,
        structured_evidence=result.get("structured_evidence") or {},
    )
    return result


# Replace the resume endpoints at runtime so all resume-path recommendations use
# education, experience, projects and publications together with normalized skills.
app.router.routes = [
    route for route in app.router.routes
    if not (
        getattr(route, "path", None) in {"/api/upload", "/api/resume-evidence"}
        and "POST" in getattr(route, "methods", set())
    )
]
app.add_api_route("/api/upload", structured_resume_upload, methods=["POST"], tags=["evidence"])
app.add_api_route("/api/resume-evidence", structured_resume_upload, methods=["POST"], tags=["evidence"])
