"""Generic career discovery from structured resume evidence.

This module removes occupation-catalog dependency from the resume journey. Groq is
used once to identify plausible occupations and describe the competency blueprint
for each one. The application then scores those blueprints deterministically.

The local career catalog remains useful as a fast fallback, but it is no longer a
gate that decides whether a profession can appear in Career Intelligence.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, Iterable, List, Tuple

from career_blueprint_service import (
    recommendation_from_blueprint,
    sanitize_blueprint,
    score_blueprint,
)


def _safe_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _norm(value: Any) -> str:
    text = str(value or "").strip().lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9+#./ -]+", " ", text)
    return re.sub(r"\s+", " ", text).strip(" .-/")


def _compact(items: Any, fields: Iterable[str], limit: int = 20) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for item in _safe_list(items)[:limit]:
        if not isinstance(item, dict):
            continue
        row = {field: item.get(field) for field in fields if item.get(field) not in (None, "", [])}
        if row:
            rows.append(row)
    return rows


def build_scoring_evidence(
    structured_evidence: Dict[str, Any],
    extracted_skills: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Create a generic evidence index without pretending all evidence is a skill.

    The blueprint scorer consumes label-like evidence. We therefore add exact labels
    from roles, degrees, fields, certifications, courses, projects and explicitly
    demonstrated skills while preserving the evidence category/source.
    """

    output: List[Dict[str, Any]] = []
    seen = set()

    def add(name: Any, category: str, confidence: float, source: str) -> None:
        clean = str(name or "").strip()
        key = _norm(clean)
        if not clean or not key or key in seen:
            return
        seen.add(key)
        output.append({
            "name": clean,
            "category": category,
            "confidence": confidence,
            "source": source,
        })

    for skill in extracted_skills or []:
        if not isinstance(skill, dict):
            continue
        add(
            skill.get("name") or skill.get("skill_name"),
            skill.get("category") or "Skill",
            float(skill.get("confidence") or 0.82),
            skill.get("source") or "resume_skill",
        )

    for item in _safe_list(structured_evidence.get("education")):
        if not isinstance(item, dict):
            continue
        add(item.get("program_or_degree"), "Formal Education", 0.98, "resume_education")
        add(item.get("field_of_study"), "Field of Study", 0.96, "resume_education")

    for item in _safe_list(structured_evidence.get("certifications")):
        if isinstance(item, dict):
            add(item.get("name"), "Professional Credential", 0.98, "resume_credential")

    for item in _safe_list(structured_evidence.get("experience")):
        if not isinstance(item, dict):
            continue
        add(item.get("role"), "Professional Role", 0.97, "resume_experience")
        for label in _safe_list(item.get("skills_demonstrated")):
            add(label, "Demonstrated Competency", 0.92, "resume_experience")

    for item in _safe_list(structured_evidence.get("courses")):
        if not isinstance(item, dict):
            continue
        add(item.get("name"), "Course / Training", 0.90, "resume_course")
        for label in _safe_list(item.get("skills_demonstrated")):
            add(label, "Course Competency", 0.86, "resume_course")
        for label in _safe_list(item.get("topics")):
            add(label, "Course Topic", 0.82, "resume_course")

    for item in _safe_list(structured_evidence.get("projects")):
        if not isinstance(item, dict):
            continue
        add(item.get("name"), "Project Evidence", 0.84, "resume_project")
        for label in _safe_list(item.get("skills_demonstrated")):
            add(label, "Project Competency", 0.86, "resume_project")

    return output


def _sanitize_profile(raw: Any) -> Dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    specializations = [str(x).strip() for x in _safe_list(raw.get("specializations")) if str(x).strip()]
    return {
        "primary_profession": str(raw.get("primary_profession") or "").strip(),
        "professional_level": str(raw.get("professional_level") or "").strip(),
        "domain": str(raw.get("domain") or "").strip(),
        "specializations": specializations[:8],
        "summary": str(raw.get("summary") or "").strip(),
        "source": "dynamic_resume_intelligence",
    }


def merge_recommendations(
    dynamic_results: List[Dict[str, Any]],
    catalog_results: List[Dict[str, Any]],
    top_n: int = 8,
) -> List[Dict[str, Any]]:
    """Merge dynamic and catalog recommendations by normalized career title.

    Dynamic discovery gets a small tie-break preference because it is based on the
    complete current resume, while the catalog result remains an important fallback.
    """

    merged: Dict[str, Dict[str, Any]] = {}
    for source_name, items in (("dynamic", dynamic_results), ("catalog", catalog_results)):
        for item in items or []:
            if not isinstance(item, dict):
                continue
            title = item.get("path") or item.get("career_title")
            key = _norm(title)
            if not key:
                continue
            row = dict(item)
            row.setdefault("recommendation_source", source_name)
            score = float(row.get("match_score") or 0)
            discovery = float(row.get("discovery_confidence") or 0)
            rank_value = score + (0.015 * discovery if source_name == "dynamic" else 0)
            current = merged.get(key)
            if current is None or rank_value > current[0]:
                merged[key] = (rank_value, row)

    rows = [value[1] for value in merged.values()]
    rows.sort(
        key=lambda item: (
            float(item.get("match_score") or 0),
            float(item.get("discovery_confidence") or 0),
            len(item.get("matched_skills") or []),
        ),
        reverse=True,
    )
    return rows[: max(1, int(top_n or 8))]


async def discover_dynamic_careers(
    structured_evidence: Dict[str, Any],
    extracted_skills: List[Dict[str, Any]],
    resilient_llm_generate,
    max_careers: int = 6,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Discover and score careers for any profession represented by the resume."""

    structured_evidence = structured_evidence or {}
    scoring_evidence = build_scoring_evidence(structured_evidence, extracted_skills)

    compact_profile = {
        "skills": [
            {
                "name": item.get("name"),
                "category": item.get("category"),
                "confidence": item.get("confidence"),
            }
            for item in (extracted_skills or [])[:100]
            if isinstance(item, dict) and item.get("name")
        ],
        "education": _compact(
            structured_evidence.get("education"),
            ["program_or_degree", "field_of_study", "institution", "status", "evidence"],
            15,
        ),
        "experience": _compact(
            structured_evidence.get("experience"),
            ["role", "employer", "start_date", "end_date", "responsibilities", "skills_demonstrated", "evidence"],
            20,
        ),
        "credentials": _compact(
            structured_evidence.get("certifications"),
            ["name", "provider", "status", "evidence"],
            20,
        ),
        "courses": _compact(
            structured_evidence.get("courses"),
            ["name", "institution_or_provider", "status", "topics", "skills_demonstrated", "evidence"],
            15,
        ),
        "projects": _compact(
            structured_evidence.get("projects"),
            ["name", "description", "skills_demonstrated", "evidence"],
            12,
        ),
        "publications": _compact(
            structured_evidence.get("publications"),
            ["title", "citation", "evidence"],
            10,
        ),
        "total_experience_years": structured_evidence.get("total_experience_years"),
    }

    prompt = f"""
Analyze this complete structured resume profile and identify the occupations that are
most strongly supported by the evidence. Skills Pathfinder must work for ANY legitimate
profession: healthcare, engineering, education, trades, business, law, science, arts,
public service, technology, hospitality, transportation, and other fields.

Do not force the resume into a predefined career catalog.
Do not invent education, licenses, certifications, skills, or experience.
Prioritize the person's current profession and natural specialty/advancement paths when
the resume shows substantial professional experience. Career pivots should appear only
when the evidence genuinely supports them.

For each candidate occupation, provide a complete competency blueprint so the application
can calculate the match score itself. Do NOT calculate a match percentage.

For regulated occupations, set regulated_role=true, but do not invent jurisdiction-specific
legal requirements, exact supervised hours, examination rules, or statutory thresholds.
Use broad licensing/credential areas that should later be verified with official sources.

Return ONLY JSON in this structure:
{{
  "profile": {{
    "primary_profession": "",
    "professional_level": "student|entry|early-career|mid-career|senior|unknown",
    "domain": "",
    "specializations": [""],
    "summary": ""
  }},
  "careers": [
    {{
      "canonical_title": "",
      "career_category": "",
      "career_summary": "",
      "candidate_relation": "current_profession|specialization|advancement|adjacent",
      "candidate_confidence": 0.0,
      "candidate_evidence": [""],
      "regulated_role": false,
      "regulation_note": "",
      "core_competencies": [""],
      "competency_evidence_map": [
        {{"competency": "", "evidence_keywords": [""]}}
      ],
      "domain_relevance_keywords": [""],
      "recommended_subjects": [{{"name": "", "reason": ""}}],
      "education_or_training_pathway": [""],
      "credentials_or_licensing_areas": [""],
      "experience_or_portfolio_evidence": [""],
      "actions_30_days": [""],
      "actions_6_months": [""],
      "actions_1_year": [""]
    }}
  ]
}}

Return 3 to {max_careers} careers. Keep core_competencies focused (5-9 items each).
Evidence keywords must be genuine equivalents or phrases that could demonstrate that
competency in a resume. Avoid vague buzzwords.

STRUCTURED RESUME PROFILE:
{json.dumps(compact_profile)}
"""

    raw = await resilient_llm_generate(prompt, max_tokens_override=3600)
    payload = json.loads(raw)
    profile = _sanitize_profile(payload.get("profile"))

    dynamic_results: List[Dict[str, Any]] = []
    seen_titles = set()
    for candidate in _safe_list(payload.get("careers"))[:max_careers]:
        if not isinstance(candidate, dict):
            continue
        title = str(candidate.get("canonical_title") or "").strip()
        key = _norm(title)
        if not title or not key or key in seen_titles:
            continue
        seen_titles.add(key)

        blueprint = sanitize_blueprint(candidate, title, known_career=None)
        scoring = score_blueprint(scoring_evidence, blueprint)
        recommendation = recommendation_from_blueprint(blueprint, scoring)
        recommendation["candidate_relation"] = str(candidate.get("candidate_relation") or "adjacent")
        try:
            confidence = max(0.0, min(1.0, float(candidate.get("candidate_confidence") or 0.7)))
        except (TypeError, ValueError):
            confidence = 0.7
        recommendation["discovery_confidence"] = round(confidence, 3)
        recommendation["candidate_evidence"] = [
            str(x).strip() for x in _safe_list(candidate.get("candidate_evidence")) if str(x).strip()
        ][:8]
        recommendation["recommendation_source"] = "dynamic_resume_intelligence"
        recommendation["dynamic_blueprint"] = True
        recommendation["career_blueprint"] = blueprint
        dynamic_results.append(recommendation)

    dynamic_results.sort(
        key=lambda item: (
            float(item.get("match_score") or 0),
            float(item.get("discovery_confidence") or 0),
        ),
        reverse=True,
    )
    return profile, dynamic_results
