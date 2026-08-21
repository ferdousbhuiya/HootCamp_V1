"""Production API bootstrap with open-career target blueprints.

Imports the existing production server and adds a dynamic career layer so the
platform is not limited to a predefined occupation catalog.
"""

import json
from typing import Any, Dict, List

from fastapi import HTTPException
from pydantic import BaseModel, Field

import server as base
from career_blueprint_service import recommendation_from_blueprint, sanitize_blueprint, score_blueprint


app = base.app


class CareerBlueprintRequest(BaseModel):
    career_title: str = Field(min_length=2, max_length=180)
    skills: List[Dict[str, Any]] = Field(default_factory=list)


def _remove_route(path: str, method: str):
    app.router.routes = [
        route for route in app.router.routes
        if not (getattr(route, "path", None) == path and method in getattr(route, "methods", set()))
    ]


def _known_context(career):
    if not career:
        return None
    return {
        "id": career.get("id"),
        "path": career.get("path"),
        "category": career.get("category"),
        "required_skills": career.get("required_skills") or [],
        "regulated_role": bool(career.get("regulated_role")),
        "recommended_degrees": career.get("recommended_degrees") or [],
        "recommended_certifications": career.get("recommended_certifications") or [],
        "next_steps": career.get("next_steps") or [],
    }


async def _generate_blueprint(career_title: str, skills: List[Dict[str, Any]]):
    known = base._find_target_career(career_title)
    known_context = _known_context(known)
    evidence_names = [str(item.get("name") or item.get("skill_name") or "").strip() for item in skills[:120] if isinstance(item, dict)]

    prompt = f"""
Create a structured career-development blueprint for the student's exact target career.
The system must support any legitimate occupation or professional goal. Do not force the
career into a predefined technology, nursing, engineering, or business category.

Requested career: {career_title}
Known catalog context, if available: {json.dumps(known_context)}
Student evidence labels (for context only, do not invent achievements): {json.dumps(evidence_names[:80])}

Rules:
- Normalize the title to a commonly understood occupation title while preserving the student's intent.
- If catalog context includes required_skills, keep those as the core_competencies. You may add
  evidence keywords and pathway information, but do not silently replace known catalog competencies.
- For an uncatalogued career, identify 5-10 practical core competencies.
- Provide evidence keywords for each competency. Keywords must be genuine equivalents or strong
  evidence signals, not loosely related buzzwords.
- Provide 5-10 recommended academic subjects/learning areas suitable for preparation. These are
  guidance, not claims about a particular university's degree requirements.
- Provide domain_relevance_keywords for broad early evidence such as field names, foundational
  subjects, or domain concepts. They must not be treated as equivalent to occupational competence.
- If the profession is regulated or licensed (examples include healthcare, aviation, law,
  teaching, architecture, accounting in some contexts, etc.), set regulated_role=true and state
  clearly that exact current requirements must be verified with the relevant official authority.
- Never invent exact license hours, exam thresholds, statutory requirements, or guaranteed admission.
- Do not include salary figures in this blueprint.
- Keep actions practical for a student at an unknown stage.

Return ONLY this JSON object:
{{
  "canonical_title": "",
  "career_category": "",
  "career_summary": "",
  "regulated_role": false,
  "regulation_note": "",
  "core_competencies": [""],
  "competency_evidence_map": [{{"competency":"","evidence_keywords":[""]}}],
  "domain_relevance_keywords": [""],
  "recommended_subjects": [{{"name":"","reason":""}}],
  "education_or_training_pathway": [""],
  "credentials_or_licensing_areas": [""],
  "experience_or_portfolio_evidence": [""],
  "actions_30_days": [""],
  "actions_6_months": [""],
  "actions_1_year": [""]
}}
"""
    try:
        response = await base.resilient_llm_generate(prompt, max_tokens_override=2200)
        raw = json.loads(response)
    except Exception as exc:
        if not known:
            raise HTTPException(status_code=502, detail=f"Could not prepare a dynamic blueprint for this career: {exc}")
        raw = {
            "canonical_title": known.get("path") or career_title,
            "career_category": known.get("category") or "Career pathway",
            "career_summary": f"Preparation pathway for {known.get('path') or career_title}.",
            "regulated_role": bool(known.get("regulated_role")),
            "regulation_note": "Verify current official requirements with the relevant authority." if known.get("regulated_role") else "",
            "core_competencies": known.get("required_skills") or [],
            "competency_evidence_map": [],
            "domain_relevance_keywords": [],
            "recommended_subjects": [],
            "education_or_training_pathway": [item.get("name") for item in (known.get("recommended_degrees") or []) if isinstance(item, dict) and item.get("name")],
            "credentials_or_licensing_areas": [item.get("name") for item in (known.get("recommended_certifications") or []) if isinstance(item, dict) and item.get("name")],
            "experience_or_portfolio_evidence": [],
            "actions_30_days": known.get("next_steps") or [],
            "actions_6_months": [],
            "actions_1_year": [],
        }
    return sanitize_blueprint(raw, career_title, known)


async def career_blueprint(request: CareerBlueprintRequest):
    blueprint = await _generate_blueprint(request.career_title, request.skills)
    scoring = score_blueprint(request.skills, blueprint)
    return {
        "status": "success",
        "career_title": request.career_title,
        "blueprint": blueprint,
        "readiness": scoring,
    }


async def target_career_analysis_open(request: CareerBlueprintRequest):
    blueprint = await _generate_blueprint(request.career_title, request.skills)
    scoring = score_blueprint(request.skills, blueprint)
    recommendation = recommendation_from_blueprint(blueprint, scoring)
    return {
        "status": "success",
        "target_found": True,
        "career_title": request.career_title,
        "blueprint": blueprint,
        "recommendation": recommendation,
        "message": "The selected target was analyzed using the open-career blueprint engine.",
    }


_remove_route("/api/career-blueprint", "POST")
_remove_route("/api/target-career-analysis", "POST")
app.add_api_route("/api/career-blueprint", career_blueprint, methods=["POST"], tags=["career"])
app.add_api_route("/api/target-career-analysis", target_career_analysis_open, methods=["POST"], tags=["career"])
