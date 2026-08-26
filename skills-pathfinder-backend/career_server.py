"""Open-career production layer for Skills Pathfinder.

The local catalog is a trusted shortcut, not a restriction. Any legitimate
student-selected occupation can receive an AI-generated structured blueprint,
explainable readiness score, academic preparation suggestions, and action plan.
"""

import json
import re
from typing import Any, Dict, List

from fastapi import HTTPException
from pydantic import BaseModel, Field

import recommendation_engine as recommendation_module
from career_blueprint_service import recommendation_from_blueprint, sanitize_blueprint, score_blueprint
from server import app, resilient_llm_generate


class CareerBlueprintRequest(BaseModel):
    career_title: str = Field(min_length=2, max_length=180)
    skills: List[Dict[str, Any]] = Field(default_factory=list)


CAREER_TITLE_ALIASES = {
    "nurse": "registered nurse",
    "rn": "registered nurse",
    "nursing": "registered nurse",
    "registered nursing": "registered nurse",
    "software engineer": "software developer",
    "programmer": "software developer",
    "cyber security analyst": "cybersecurity analyst",
    "security analyst": "cybersecurity analyst",
    "data analysis": "data analyst",
    "business analytics": "business analyst",
    "medical laboratory scientist": "medical laboratory technologist",
    "medical lab scientist": "medical laboratory technologist",
    "educator": "teacher",
}

# In-process cache avoids repeat AI calls during a deployment. The frontend also
# persists student-specific blueprints in career_findings for durable reuse.
_BLUEPRINT_CACHE: Dict[str, Dict[str, Any]] = {}


def _normalize_title(value: str) -> str:
    text = str(value or "").strip().lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9+#./ -]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" .-/")
    return CAREER_TITLE_ALIASES.get(text, text)


def _find_known_career(title: str):
    normalized = _normalize_title(title)
    for career in recommendation_module.CAREER_PATHS:
        if _normalize_title(career.get("path", "")) == normalized:
            return career
        if _normalize_title(str(career.get("id", "")).replace("_", " ")) == normalized:
            return career
    return None


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


def _compatibility_fields(blueprint: Dict[str, Any]) -> Dict[str, Any]:
    """Keep field names used by earlier frontend builds while using V2 schema."""
    output = dict(blueprint)
    output["category"] = output.get("career_category") or output.get("category") or "Career pathway"
    output["credentials_or_licenses"] = [
        {"name": item, "note": "Verify current requirements with the appropriate official or recognized authority.", "official_verification_required": bool(output.get("regulated_role"))}
        for item in output.get("credentials_or_licensing_areas", [])
    ]
    output["30_day_actions"] = output.get("actions_30_days", [])
    output["6_month_actions"] = output.get("actions_6_months", [])
    output["1_year_actions"] = output.get("actions_1_year", [])
    output["requires_official_verification"] = bool(output.get("official_verification_required"))
    return output


async def _generate_blueprint(title: str, skills: List[Dict[str, Any]]) -> Dict[str, Any]:
    cache_key = _normalize_title(title)
    cached = _BLUEPRINT_CACHE.get(cache_key)
    if cached:
        return cached

    known = _find_known_career(title)
    context = _known_context(known)
    evidence_labels = [
        str(item.get("name") or item.get("skill_name") or "").strip()
        for item in skills[:120]
        if isinstance(item, dict) and (item.get("name") or item.get("skill_name"))
    ]

    prompt = f"""
Create a structured career-development blueprint for the student's exact target career.
Skills Pathfinder must support any legitimate occupation or professional goal. Do not
force the target into a predefined technology, business, healthcare, or engineering list.

REQUESTED CAREER: {title}
KNOWN LOCAL CATALOG CONTEXT, IF ANY: {json.dumps(context)}
CURRENT STUDENT EVIDENCE LABELS, FOR CONTEXT ONLY: {json.dumps(evidence_labels[:80])}

Rules:
- Normalize the career title while preserving the student's intent.
- If local context provides required_skills, keep those as the core competencies.
- For an uncatalogued career, identify 5-10 practical core occupational competencies.
- For every core competency provide genuine evidence keywords/equivalents that could
  support it. Do not use loosely related buzzwords.
- Give 5-10 academic subjects or learning areas that can prepare a student for the career.
  These are guidance, not claims about a particular university curriculum.
- Include broad domain_relevance_keywords for early evidence such as foundational subjects
  or field names. Broad domain evidence must not be treated as occupational competence.
- Separate education/training, professional credentials/licensing, and experience evidence.
- For regulated careers, set regulated_role=true. Do not invent exact legal requirements,
  flight/clinical hours, admission rules, statutory thresholds, or jurisdiction-specific
  requirements. Tell the student to verify current requirements with the official authority.
- Do not include salary claims here.
- Actions must be useful to a beginning student, career changer, or experienced learner.

Return ONLY JSON:
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
        response = await resilient_llm_generate(prompt, max_tokens_override=2200)
        raw = json.loads(response)
        blueprint = sanitize_blueprint(raw, title, known)
    except Exception as exc:
        print(f"[CAREER BLUEPRINT] AI generation failed for {title}: {exc}")
        if not known:
            raise HTTPException(status_code=502, detail="Could not prepare this career blueprint right now. Please retry shortly.")
        fallback = {
            "canonical_title": known.get("path") or title,
            "career_category": known.get("category") or "Career pathway",
            "career_summary": f"Preparation pathway for {known.get('path') or title}.",
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
        blueprint = sanitize_blueprint(fallback, title, known)

    blueprint = _compatibility_fields(blueprint)
    _BLUEPRINT_CACHE[cache_key] = blueprint
    return blueprint


async def career_blueprint(request: CareerBlueprintRequest):
    blueprint = await _generate_blueprint(request.career_title, request.skills)
    readiness = score_blueprint(request.skills, blueprint)
    recommendation = recommendation_from_blueprint(blueprint, readiness)
    # Preserve older field name inside recommendation for downstream UI/report code.
    recommendation["career_blueprint"] = blueprint
    return {
        "status": "success",
        "target_found": True,
        "career_title": request.career_title,
        "blueprint": blueprint,
        "readiness": readiness,
        "recommendation": recommendation,
    }


async def target_career_analysis(request: CareerBlueprintRequest):
    return await career_blueprint(request)


# Replace the earlier catalog-only target route with the generalized route.
app.router.routes = [
    route for route in app.router.routes
    if not (
        getattr(route, "path", None) in {"/api/target-career-analysis", "/api/career-blueprint"}
        and "POST" in getattr(route, "methods", set())
    )
]
app.add_api_route("/api/target-career-analysis", target_career_analysis, methods=["POST"], tags=["career"])
app.add_api_route("/api/career-blueprint", career_blueprint, methods=["POST"], tags=["career"])
