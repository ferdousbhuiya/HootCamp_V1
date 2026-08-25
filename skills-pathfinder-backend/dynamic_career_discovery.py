"""Generic career discovery from structured resume evidence.

The resume extractor can return profession/career intelligence in the same Groq call
that extracts evidence. Reusing that payload avoids a second large AI request and makes
the generic career path much more reliable on rate-limited deployments.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, Iterable, List, Tuple

from career_blueprint_service import recommendation_from_blueprint, sanitize_blueprint, score_blueprint


def _safe_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _norm(value: Any) -> str:
    text = str(value or "").strip().lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9+#./ -]+", " ", text)
    return re.sub(r"\s+", " ", text).strip(" .-/")


def _relation_priority(value: Any) -> int:
    """Keep professional identity separate from readiness scoring.

    Match score answers how ready the person is for a path. It must not be allowed to
    redefine the person's established profession merely because an adjacent career has
    a shorter competency list or more transferable-skill overlap.
    """
    return {
        "current_profession": 4,
        "specialization": 3,
        "advancement": 2,
        "adjacent": 1,
    }.get(_norm(value).replace(" ", "_"), 0)


def _recommendation_sort_key(item: Dict[str, Any]) -> tuple:
    return (
        _relation_priority(item.get("candidate_relation")),
        float(item.get("discovery_confidence") or 0),
        float(item.get("match_score") or 0),
        len(item.get("matched_skills") or []),
    )


def _compact(items: Any, fields: Iterable[str], limit: int = 20) -> List[Dict[str, Any]]:
    rows = []
    for item in _safe_list(items)[:limit]:
        if not isinstance(item, dict):
            continue
        row = {field: item.get(field) for field in fields if item.get(field) not in (None, "", [])}
        if row:
            rows.append(row)
    return rows


def build_scoring_evidence(structured_evidence: Dict[str, Any], extracted_skills: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    output: List[Dict[str, Any]] = []
    seen = set()

    def add(name: Any, category: str, confidence: float, source: str) -> None:
        clean = str(name or "").strip()
        key = _norm(clean)
        if not clean or not key or key in seen:
            return
        seen.add(key)
        output.append({"name": clean, "category": category, "confidence": confidence, "source": source})

    for skill in extracted_skills or []:
        if isinstance(skill, dict):
            try:
                confidence = float(skill.get("confidence") or 0.82)
            except (TypeError, ValueError):
                confidence = 0.82
            add(skill.get("name") or skill.get("skill_name"), skill.get("category") or "Skill", confidence, skill.get("source") or "resume_skill")

    for item in _safe_list(structured_evidence.get("education")):
        if isinstance(item, dict):
            add(item.get("program_or_degree"), "Formal Education", 0.98, "resume_education")
            add(item.get("field_of_study"), "Field of Study", 0.96, "resume_education")
    for item in _safe_list(structured_evidence.get("certifications")):
        if isinstance(item, dict):
            add(item.get("name"), "Professional Credential", 0.98, "resume_credential")
    for item in _safe_list(structured_evidence.get("experience")):
        if isinstance(item, dict):
            add(item.get("role"), "Professional Role", 0.97, "resume_experience")
            for label in _safe_list(item.get("skills_demonstrated")):
                add(label, "Demonstrated Competency", 0.92, "resume_experience")
    for item in _safe_list(structured_evidence.get("courses")):
        if isinstance(item, dict):
            add(item.get("name"), "Course / Training", 0.90, "resume_course")
            for label in _safe_list(item.get("skills_demonstrated")) + _safe_list(item.get("topics")):
                add(label, "Course Evidence", 0.84, "resume_course")
    for item in _safe_list(structured_evidence.get("projects")):
        if isinstance(item, dict):
            add(item.get("name"), "Project Evidence", 0.84, "resume_project")
            for label in _safe_list(item.get("skills_demonstrated")):
                add(label, "Project Competency", 0.86, "resume_project")
    return output


def _sanitize_profile(raw: Any) -> Dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    return {
        "primary_profession": str(raw.get("primary_profession") or "").strip(),
        "professional_level": str(raw.get("professional_level") or "").strip(),
        "domain": str(raw.get("domain") or "").strip(),
        "specializations": [str(x).strip() for x in _safe_list(raw.get("specializations")) if str(x).strip()][:8],
        "summary": str(raw.get("summary") or "").strip(),
        "source": "dynamic_resume_intelligence",
    }


def merge_recommendations(dynamic_results: List[Dict[str, Any]], catalog_results: List[Dict[str, Any]], top_n: int = 8) -> List[Dict[str, Any]]:
    merged = {}
    for source_name, items in (("dynamic", dynamic_results), ("catalog", catalog_results)):
        for item in items or []:
            if not isinstance(item, dict):
                continue
            key = _norm(item.get("path") or item.get("career_title"))
            if not key:
                continue
            row = dict(item)
            row.setdefault("recommendation_source", source_name)
            score = float(row.get("match_score") or 0)
            discovery = float(row.get("discovery_confidence") or 0)
            rank_value = score + (0.015 * discovery if source_name == "dynamic" else 0)
            if key not in merged or rank_value > merged[key][0]:
                merged[key] = (rank_value, row)
    rows = [value[1] for value in merged.values()]
    rows.sort(key=_recommendation_sort_key, reverse=True)
    return rows[:max(1, int(top_n or 8))]


def _score_candidates(profile: Dict[str, Any], candidates: List[Dict[str, Any]], scoring_evidence: List[Dict[str, Any]], max_careers: int) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    results = []
    seen = set()
    for candidate in candidates[:max_careers]:
        if not isinstance(candidate, dict):
            continue
        title = str(candidate.get("canonical_title") or "").strip()
        key = _norm(title)
        if not title or not key or key in seen:
            continue
        seen.add(key)
        blueprint = sanitize_blueprint(candidate, title, known_career=None)
        if not blueprint.get("core_competencies"):
            continue
        scoring = score_blueprint(scoring_evidence, blueprint)
        recommendation = recommendation_from_blueprint(blueprint, scoring)
        recommendation["candidate_relation"] = str(candidate.get("candidate_relation") or "adjacent")
        try:
            confidence = max(0.0, min(1.0, float(candidate.get("candidate_confidence") or 0.7)))
        except (TypeError, ValueError):
            confidence = 0.7
        recommendation["discovery_confidence"] = round(confidence, 3)
        recommendation["candidate_evidence"] = [str(x).strip() for x in _safe_list(candidate.get("candidate_evidence")) if str(x).strip()][:8]
        recommendation["recommendation_source"] = "dynamic_resume_intelligence"
        recommendation["dynamic_blueprint"] = True
        recommendation["career_blueprint"] = blueprint
        results.append(recommendation)
    results.sort(key=_recommendation_sort_key, reverse=True)
    return _sanitize_profile(profile), results


async def discover_dynamic_careers(structured_evidence: Dict[str, Any], extracted_skills: List[Dict[str, Any]], resilient_llm_generate, max_careers: int = 6) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Discover careers generically, preferring intelligence from the extraction call."""
    structured_evidence = structured_evidence or {}
    scoring_evidence = build_scoring_evidence(structured_evidence, extracted_skills)

    embedded_candidates = _safe_list(structured_evidence.get("career_candidates"))
    if embedded_candidates:
        return _score_candidates(structured_evidence.get("career_profile") or {}, embedded_candidates, scoring_evidence, max_careers)

    compact_profile = {
        "skills": [{"name": x.get("name"), "category": x.get("category")} for x in (extracted_skills or [])[:80] if isinstance(x, dict) and x.get("name")],
        "education": _compact(structured_evidence.get("education"), ["program_or_degree", "field_of_study", "institution"], 10),
        "experience": _compact(structured_evidence.get("experience"), ["role", "employer", "responsibilities", "skills_demonstrated"], 15),
        "credentials": _compact(structured_evidence.get("certifications"), ["name", "provider"], 15),
        "projects": _compact(structured_evidence.get("projects"), ["name", "description", "skills_demonstrated"], 10),
        "total_experience_years": structured_evidence.get("total_experience_years"),
    }
    prompt = f"""Analyze this resume evidence for ANY profession. Return 3-{max_careers} evidence-supported careers.
First establish the person's documented current profession from the most recent/relevant role, sustained work history, education and professional credentials. Include EXACTLY ONE current_profession candidate representing that established occupation. Do not relabel a person by a narrower skill specialty unless the resume's role itself establishes that specialty. Then include natural specialization, advancement and adjacent paths. Readiness will be scored separately and must not determine professional identity. Do not invent credentials or experience.
Return ONLY JSON: {{"profile":{{"primary_profession":"","professional_level":"","domain":"","specializations":[],"summary":""}},"careers":[{{"canonical_title":"","career_category":"","career_summary":"","candidate_relation":"current_profession|specialization|advancement|adjacent","candidate_confidence":0.0,"candidate_evidence":[],"regulated_role":false,"regulation_note":"","core_competencies":[],"competency_evidence_map":[{{"competency":"","evidence_keywords":[]}}],"domain_relevance_keywords":[],"recommended_subjects":[],"education_or_training_pathway":[],"credentials_or_licensing_areas":[],"experience_or_portfolio_evidence":[],"actions_30_days":[],"actions_6_months":[],"actions_1_year":[]}}]}}\nPROFILE:{json.dumps(compact_profile)}"""
    raw = await resilient_llm_generate(prompt, max_tokens_override=2600)
    payload = json.loads(raw)
    return _score_candidates(payload.get("profile") or {}, _safe_list(payload.get("careers")), scoring_evidence, max_careers)
