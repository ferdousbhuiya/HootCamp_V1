"""Dynamic career blueprint layer for Skills Pathfinder.

This module sits on top of the production server and keeps the existing API
intact while adding a generalized target-career pathway for occupations that
are not preloaded in the local catalog.
"""

import json
import re
from typing import Any, Dict, List

from pydantic import BaseModel, Field

import recommendation_engine as recommendation_module
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

_BLUEPRINT_CACHE: Dict[str, Dict[str, Any]] = {}


def _normalize_title(value: str) -> str:
    text = str(value or "").strip().lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9+#./ -]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" .-/")
    return CAREER_TITLE_ALIASES.get(text, text)


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", _normalize_title(value)).strip("_") or "career_target"


def _find_known_career(title: str):
    normalized = _normalize_title(title)
    for career in recommendation_module.CAREER_PATHS:
        if _normalize_title(career.get("path", "")) == normalized:
            return career
        if _normalize_title(str(career.get("id", "")).replace("_", " ")) == normalized:
            return career
    return None


def _fallback_blueprint(title: str, known: Dict[str, Any] | None = None) -> Dict[str, Any]:
    path = (known or {}).get("path") or title.strip()
    required = list((known or {}).get("required_skills") or [])
    subjects = [
        {"name": skill, "reason": f"Builds foundational knowledge or competency related to {skill}."}
        for skill in required[:5]
    ]
    return {
        "canonical_title": path,
        "category": (known or {}).get("category") or "Career pathway",
        "career_summary": f"Career pathway guidance for {path}.",
        "regulated_role": bool((known or {}).get("regulated_role")),
        "regulation_note": "Verify current licensing, certification, education, medical, or legal requirements with the appropriate official authority before making regulated-career decisions." if (known or {}).get("regulated_role") else "No regulated-role determination was verified by this fallback profile.",
        "core_competencies": required,
        "recommended_subjects": subjects,
        "education_or_training_pathway": [item.get("name") for item in (known or {}).get("recommended_degrees", []) if item.get("name")],
        "credentials_or_licenses": [
            {"name": item.get("name"), "note": f"Provider: {item.get('provider') or 'not specified'}", "official_verification_required": True}
            for item in (known or {}).get("recommended_certifications", []) if item.get("name")
        ],
        "30_day_actions": list((known or {}).get("next_steps") or [])[:3],
        "6_month_actions": [],
        "1_year_actions": [],
        "source_type": "local_catalog_fallback" if known else "general_fallback",
        "requires_official_verification": bool((known or {}).get("regulated_role")) or not bool(known),
    }


async def _generate_blueprint(title: str) -> Dict[str, Any]:
    cache_key = _normalize_title(title)
    if cache_key in _BLUEPRINT_CACHE:
        return _BLUEPRINT_CACHE[cache_key]

    known = _find_known_career(title)
    known_context = {
        "path": known.get("path"),
        "category": known.get("category"),
        "required_skills": known.get("required_skills") or [],
        "recommended_certifications": known.get("recommended_certifications") or [],
        "recommended_degrees": known.get("recommended_degrees") or [],
        "next_steps": known.get("next_steps") or [],
        "regulated_role": bool(known.get("regulated_role")),
    } if known else None

    prompt = f"""
Build a structured career-development blueprint for the target occupation below.
The blueprint must work for any legitimate occupation, including careers outside
technology, business, healthcare, or engineering.

TARGET CAREER: {title}
LOCAL CATALOG CONTEXT: {json.dumps(known_context)}

Rules:
- Normalize the title to a clear common occupation title.
- Do not require the student to already match the career. This is a target pathway.
- Provide 5-8 core competencies that can later be compared with student evidence.
- Provide 4-6 sensible academic subjects or learning areas and explain why each helps.
- Separate academic subjects from professional training, licenses, certificates, flight/clinical hours, apprenticeships, or other regulated requirements.
- Be conservative about regulated careers. Do not invent exact legal, licensing, medical, flight-hour, state, or exam requirements. When a requirement depends on jurisdiction or current regulation, say that official verification is required.
- If LOCAL CATALOG CONTEXT is present, preserve its known regulated-role status and do not contradict its core pathway.
- Do not include salary claims in this blueprint.
- Keep action plans practical for a student or career changer.

Return ONLY JSON in this structure:
{{
  "canonical_title": "",
  "category": "",
  "career_summary": "",
  "regulated_role": false,
  "regulation_note": "",
  "core_competencies": [""],
  "recommended_subjects": [{{"name": "", "reason": ""}}],
  "education_or_training_pathway": [""],
  "credentials_or_licenses": [{{"name": "", "note": "", "official_verification_required": true}}],
  "30_day_actions": [""],
  "6_month_actions": [""],
  "1_year_actions": [""],
  "requires_official_verification": false
}}
"""

    try:
        response = await resilient_llm_generate(prompt, max_tokens_override=1800)
        blueprint = json.loads(response)
        blueprint["canonical_title"] = str(blueprint.get("canonical_title") or (known or {}).get("path") or title).strip()
        blueprint["category"] = str(blueprint.get("category") or (known or {}).get("category") or "Career pathway").strip()
        blueprint["core_competencies"] = [str(item).strip() for item in blueprint.get("core_competencies", []) if str(item).strip()][:10]
        subjects = []
        for item in blueprint.get("recommended_subjects", [])[:8]:
            if isinstance(item, dict) and str(item.get("name") or "").strip():
                subjects.append({"name": str(item.get("name")).strip(), "reason": str(item.get("reason") or "Supports preparation for this target career.").strip()})
        blueprint["recommended_subjects"] = subjects
        if known and known.get("regulated_role"):
            blueprint["regulated_role"] = True
            blueprint["requires_official_verification"] = True
        blueprint["source_type"] = "ai_blueprint_with_local_catalog" if known else "ai_dynamic_blueprint"
        if not blueprint["core_competencies"]:
            blueprint = _fallback_blueprint(title, known)
    except Exception as exc:
        print(f"[CAREER BLUEPRINT] Dynamic generation failed for {title}: {exc}")
        blueprint = _fallback_blueprint(title, known)

    _BLUEPRINT_CACHE[cache_key] = blueprint
    return blueprint


def _recommendation_from_blueprint(blueprint: Dict[str, Any], skills: List[Dict[str, Any]]) -> Dict[str, Any]:
    required = blueprint.get("core_competencies") or []
    score, matched, missing = recommendation_module.calculate_match_score(skills, required)
    match_percentage = round(score * 100, 1)
    skill_gap_percentage = round((1 - score) * 100, 1) if required else 100.0
    if matched:
        reason = f"Your saved evidence currently supports {len(matched)} of {len(required)} core competencies for this selected target."
    else:
        reason = "This is your selected career target. Current evidence does not yet demonstrate the mapped core competencies, so the pathway focuses on what to build next."
    return {
        "id": f"target_{_slug(blueprint.get('canonical_title') or 'career')}",
        "path": blueprint.get("canonical_title"),
        "category": blueprint.get("category"),
        "match_score": score,
        "match_percentage": match_percentage,
        "skill_gap_percentage": skill_gap_percentage,
        "matched_skills": matched,
        "missing_skills": missing,
        "match_reason": reason,
        "recommended_certifications": blueprint.get("credentials_or_licenses") or [],
        "recommended_degrees": [{"name": item, "type": "Education or training pathway"} for item in blueprint.get("education_or_training_pathway", [])],
        "next_steps": (blueprint.get("30_day_actions") or []) + (blueprint.get("6_month_actions") or [])[:2],
        "learning_resources": [],
        "regulated_role": bool(blueprint.get("regulated_role")),
        "target_selected": True,
        "dynamic_blueprint": True,
        "career_blueprint": blueprint,
    }


async def career_blueprint(request: CareerBlueprintRequest):
    blueprint = await _generate_blueprint(request.career_title)
    recommendation = _recommendation_from_blueprint(blueprint, request.skills)
    return {
        "status": "success",
        "target_found": True,
        "career_title": request.career_title,
        "blueprint": blueprint,
        "recommendation": recommendation,
    }


async def target_career_analysis(request: CareerBlueprintRequest):
    return await career_blueprint(request)


# Replace the earlier catalog-only target route with the generalized blueprint route.
app.router.routes = [
    route for route in app.router.routes
    if not (
        getattr(route, "path", None) in {"/api/target-career-analysis", "/api/career-blueprint"}
        and "POST" in getattr(route, "methods", set())
    )
]
app.add_api_route("/api/target-career-analysis", target_career_analysis, methods=["POST"], tags=["career"])
app.add_api_route("/api/career-blueprint", career_blueprint, methods=["POST"], tags=["career"])
