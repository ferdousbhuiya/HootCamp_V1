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
    """Keep professional identity separate from readiness scoring."""
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


def _title_tokens(value: Any) -> set[str]:
    stop = {
        "senior", "junior", "lead", "principal", "associate", "assistant", "staff",
        "grade", "grades", "level", "the", "and", "of", "for", "in", "with",
    }
    return {
        token for token in _norm(value).replace("/", " ").replace(".", " ").split()
        if len(token) > 2 and token not in stop and not token.isdigit()
    }


def _titles_overlap(left: Any, right: Any) -> bool:
    a, b = _norm(left), _norm(right)
    if not a or not b:
        return False
    if a == b or a in b or b in a:
        return True
    ta, tb = _title_tokens(a), _title_tokens(b)
    if not ta or not tb:
        return False
    overlap = len(ta & tb) / max(1, min(len(ta), len(tb)))
    return overlap >= 0.60


def _current_profession_title(profile: Dict[str, Any], structured_evidence: Dict[str, Any]) -> str:
    primary = str((profile or {}).get("primary_profession") or "").strip()
    if primary:
        return primary
    for item in _safe_list((structured_evidence or {}).get("experience")):
        if isinstance(item, dict) and str(item.get("role") or "").strip():
            return str(item.get("role")).strip()
    return ""


def _ensure_current_profession_candidate(
    profile: Dict[str, Any],
    candidates: List[Dict[str, Any]],
    structured_evidence: Dict[str, Any],
    extracted_skills: List[Dict[str, Any]],
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Guarantee one evidence-grounded current-profession candidate.

    Groq occasionally returns only specializations/adjacent careers even when the resume
    clearly establishes a current occupation. Rather than inventing a profession from
    transferable skills, anchor the current profession to career_profile.primary_profession
    or the most recent parsed work role. If a matching candidate already exists, promote
    that candidate to current_profession. Otherwise synthesize a minimal blueprint using
    only resume-backed skills and work evidence.
    """
    profile = dict(profile or {})
    rows = [dict(item) for item in (candidates or []) if isinstance(item, dict)]
    anchor = _current_profession_title(profile, structured_evidence)
    if not anchor:
        return profile, rows

    profile.setdefault("primary_profession", anchor)

    matching_index = None
    for index, row in enumerate(rows):
        if _titles_overlap(row.get("canonical_title"), anchor):
            matching_index = index
            break

    if matching_index is not None:
        for index, row in enumerate(rows):
            if index == matching_index:
                row["candidate_relation"] = "current_profession"
                try:
                    row["candidate_confidence"] = max(float(row.get("candidate_confidence") or 0), 0.95)
                except (TypeError, ValueError):
                    row["candidate_confidence"] = 0.95
            elif _norm(row.get("candidate_relation")).replace(" ", "_") == "current_profession":
                row["candidate_relation"] = "specialization"
        return profile, rows

    for row in rows:
        if _norm(row.get("candidate_relation")).replace(" ", "_") == "current_profession":
            row["candidate_relation"] = "specialization"

    competency_names: List[str] = []
    seen = set()

    def add_competency(value: Any) -> None:
        clean = str(value or "").strip()
        key = _norm(clean)
        if not clean or not key or key in seen:
            return
        seen.add(key)
        competency_names.append(clean)

    for skill in extracted_skills or []:
        if isinstance(skill, dict):
            add_competency(skill.get("name") or skill.get("skill_name"))
        elif isinstance(skill, str):
            add_competency(skill)
        if len(competency_names) >= 8:
            break

    evidence_lines: List[str] = []
    for item in _safe_list((structured_evidence or {}).get("experience")):
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip()
        if role and not evidence_lines:
            evidence_lines.append(f"Current/recent role: {role}")
        for label in _safe_list(item.get("skills_demonstrated")):
            add_competency(label)
        for responsibility in _safe_list(item.get("responsibilities"))[:2]:
            text = str(responsibility or "").strip()
            if text:
                evidence_lines.append(text)
        if evidence_lines:
            break

    if not competency_names:
        competency_names = [anchor]

    domain = str(profile.get("domain") or "").strip() or "Current Profession"
    current_candidate = {
        "canonical_title": anchor,
        "career_category": domain,
        "career_summary": f"Current profession established by the resume's documented work history: {anchor}.",
        "candidate_relation": "current_profession",
        "candidate_confidence": 0.98,
        "candidate_evidence": evidence_lines[:6] or [f"Resume documents the role {anchor}."],
        "regulated_role": False,
        "regulation_note": "",
        "core_competencies": competency_names[:8],
        "competency_evidence_map": [
            {"competency": name, "evidence_keywords": [name]} for name in competency_names[:8]
        ],
        "domain_relevance_keywords": [domain, anchor],
        "recommended_subjects": [],
        "education_or_training_pathway": [],
        "credentials_or_licensing_areas": [],
        "experience_or_portfolio_evidence": evidence_lines[:6],
        "actions_30_days": ["Document recent measurable accomplishments and keep profession-specific evidence current."],
        "actions_6_months": ["Strengthen advanced evidence, professional development and leadership appropriate to the current profession."],
        "actions_1_year": ["Reassess advancement and specialization opportunities using updated experience and market evidence."],
    }
    return profile, [current_candidate, *rows]


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
        profile, candidates = _ensure_current_profession_candidate(
            structured_evidence.get("career_profile") or {}, embedded_candidates, structured_evidence, extracted_skills
        )
        return _score_candidates(profile, candidates, scoring_evidence, max_careers)

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
    profile, candidates = _ensure_current_profession_candidate(
        payload.get("profile") or {}, _safe_list(payload.get("careers")), structured_evidence, extracted_skills
    )
    return _score_candidates(profile, candidates, scoring_evidence, max_careers)
