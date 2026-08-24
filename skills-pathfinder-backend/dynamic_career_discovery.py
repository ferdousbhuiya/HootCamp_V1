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


_STOPWORDS = {
    "and", "the", "of", "for", "in", "to", "with", "a", "an", "on", "at", "from",
    "senior", "junior", "lead", "specialist", "professional", "manager", "management",
    "engineer", "engineering", "analyst", "administrator", "coordinator", "officer",
}


def _tokens(value: Any) -> set:
    return {
        token for token in re.findall(r"[a-z0-9+#]+", _norm(value))
        if len(token) >= 3 and token not in _STOPWORDS
    }


def _token_similarity(left: Any, right: Any) -> float:
    a, b = _tokens(left), _tokens(right)
    if not a or not b:
        return 0.0
    overlap = len(a & b)
    if not overlap:
        return 0.0
    # Containment matters more than raw Jaccard for titles such as
    # "Healthcare Operations Manager" -> "Healthcare Administrator".
    containment = overlap / min(len(a), len(b))
    jaccard = overlap / len(a | b)
    return min(1.0, 0.72 * containment + 0.28 * jaccard)


def _evidence_texts(structured_evidence: Dict[str, Any]) -> Dict[str, List[str]]:
    roles, education, credentials, projects = [], [], [], []
    for item in _safe_list(structured_evidence.get("experience")):
        if isinstance(item, dict):
            roles.append(str(item.get("role") or ""))
    for item in _safe_list(structured_evidence.get("education")):
        if isinstance(item, dict):
            education.extend([
                str(item.get("program_or_degree") or ""),
                str(item.get("field_of_study") or ""),
            ])
    for item in _safe_list(structured_evidence.get("certifications")):
        if isinstance(item, dict):
            credentials.append(str(item.get("name") or ""))
    for item in _safe_list(structured_evidence.get("projects")):
        if isinstance(item, dict):
            projects.extend([
                str(item.get("name") or ""),
                str(item.get("description") or ""),
            ])
    return {
        "roles": [x for x in roles if x],
        "education": [x for x in education if x],
        "credentials": [x for x in credentials if x],
        "projects": [x for x in projects if x],
    }


def _occupational_alignment(
    profile: Dict[str, Any],
    candidate: Dict[str, Any],
    structured_evidence: Dict[str, Any],
) -> Dict[str, Any]:
    """Estimate direct profession/domain alignment without profession-specific rules.

    Core skill fit answers "can this person demonstrate the work?" Alignment answers
    "is this actually their documented profession/domain?" Direct role, education,
    credential and project evidence should outrank merely transferable competencies.
    """
    title = str(candidate.get("canonical_title") or "")
    category = str(candidate.get("career_category") or "")
    summary = str(candidate.get("career_summary") or "")
    relation = _norm(candidate.get("candidate_relation") or "adjacent")

    relation_prior = {
        "current profession": 1.00,
        "current_profession": 1.00,
        "specialization": 0.94,
        "advancement": 0.78,
        "adjacent": 0.42,
    }.get(relation, 0.55)

    profile_signals = [
        profile.get("primary_profession"),
        profile.get("domain"),
        *(_safe_list(profile.get("specializations"))),
    ]
    profile_match = max((_token_similarity(title, signal) for signal in profile_signals if signal), default=0.0)
    profile_domain = max((_token_similarity(f"{title} {category} {summary}", signal) for signal in profile_signals if signal), default=0.0)

    evidence = _evidence_texts(structured_evidence)
    role_match = max((_token_similarity(title, value) for value in evidence["roles"]), default=0.0)
    role_domain = max((_token_similarity(f"{title} {category} {summary}", value) for value in evidence["roles"]), default=0.0)
    education_match = max((_token_similarity(f"{title} {category}", value) for value in evidence["education"]), default=0.0)
    credential_match = max((_token_similarity(f"{title} {category}", value) for value in evidence["credentials"]), default=0.0)
    project_match = max((_token_similarity(f"{title} {category} {summary}", value) for value in evidence["projects"]), default=0.0)

    direct_evidence = max(role_match, profile_match)
    domain_evidence = max(profile_domain, role_domain, education_match, credential_match, project_match)
    alignment = min(1.0, 0.45 * relation_prior + 0.35 * direct_evidence + 0.20 * domain_evidence)

    return {
        "score": round(alignment, 4),
        "percentage": round(alignment * 100, 1),
        "relation_prior": round(relation_prior * 100, 1),
        "direct_role_or_profile": round(direct_evidence * 100, 1),
        "domain_education_credential_project": round(domain_evidence * 100, 1),
    }


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
            alignment = float(row.get("occupational_alignment_score") or 0)
            discovery = float(row.get("discovery_confidence") or 0)
            rank_value = score + (0.10 * alignment) + (0.01 * discovery if source_name == "dynamic" else 0)
            if key not in merged or rank_value > merged[key][0]:
                merged[key] = (rank_value, row)
    rows = [value[1] for value in merged.values()]
    rows.sort(
        key=lambda x: (
            float(x.get("match_score") or 0),
            float(x.get("occupational_alignment_score") or 0),
            float(x.get("discovery_confidence") or 0),
            len(x.get("matched_skills") or []),
        ),
        reverse=True,
    )
    return rows[:max(1, int(top_n or 8))]


def _score_candidates(
    profile: Dict[str, Any],
    candidates: List[Dict[str, Any]],
    scoring_evidence: List[Dict[str, Any]],
    structured_evidence: Dict[str, Any],
    max_careers: int,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    sanitized_profile = _sanitize_profile(profile)
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
        alignment = _occupational_alignment(sanitized_profile, candidate, structured_evidence)

        # Blend demonstrated competency fit with direct occupational/domain alignment.
        # This prevents a transferable-skills career from outranking the documented
        # profession while still allowing legitimate career-change recommendations.
        base_score = float(scoring.get("match_score") or 0)
        aligned_score = min(1.0, 0.72 * base_score + 0.28 * alignment["score"])
        scoring["competency_match_score"] = round(base_score, 4)
        scoring["occupational_alignment_score"] = alignment["score"]
        scoring["occupational_alignment_percentage"] = alignment["percentage"]
        scoring["occupational_alignment_components"] = {
            "candidate_relation": alignment["relation_prior"],
            "direct_role_or_profile": alignment["direct_role_or_profile"],
            "domain_education_credential_project": alignment["domain_education_credential_project"],
        }
        scoring["match_score"] = round(aligned_score, 4)
        scoring["match_percentage"] = round(aligned_score * 100, 1)
        scoring["skill_gap_percentage"] = round((1.0 - aligned_score) * 100, 1)

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
    results.sort(
        key=lambda x: (
            float(x.get("match_score") or 0),
            float(x.get("occupational_alignment_score") or 0),
            float(x.get("discovery_confidence") or 0),
        ),
        reverse=True,
    )
    return sanitized_profile, results


async def discover_dynamic_careers(structured_evidence: Dict[str, Any], extracted_skills: List[Dict[str, Any]], resilient_llm_generate, max_careers: int = 6) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Discover careers generically, preferring intelligence from the extraction call."""
    structured_evidence = structured_evidence or {}
    scoring_evidence = build_scoring_evidence(structured_evidence, extracted_skills)

    embedded_candidates = _safe_list(structured_evidence.get("career_candidates"))
    if embedded_candidates:
        return _score_candidates(
            structured_evidence.get("career_profile") or {},
            embedded_candidates,
            scoring_evidence,
            structured_evidence,
            max_careers,
        )

    compact_profile = {
        "skills": [{"name": x.get("name"), "category": x.get("category")} for x in (extracted_skills or [])[:80] if isinstance(x, dict) and x.get("name")],
        "education": _compact(structured_evidence.get("education"), ["program_or_degree", "field_of_study", "institution"], 10),
        "experience": _compact(structured_evidence.get("experience"), ["role", "employer", "responsibilities", "skills_demonstrated"], 15),
        "credentials": _compact(structured_evidence.get("certifications"), ["name", "provider"], 15),
        "projects": _compact(structured_evidence.get("projects"), ["name", "description", "skills_demonstrated"], 10),
        "total_experience_years": structured_evidence.get("total_experience_years"),
    }
    prompt = f"""Analyze this resume evidence for ANY profession. Return 3-{max_careers} evidence-supported careers. Prioritize the current profession and natural specialties/advancement paths. Do not invent credentials or experience. Return ONLY JSON: {{"profile":{{"primary_profession":"","professional_level":"","domain":"","specializations":[],"summary":""}},"careers":[{{"canonical_title":"","career_category":"","career_summary":"","candidate_relation":"current_profession|specialization|advancement|adjacent","candidate_confidence":0.0,"candidate_evidence":[],"regulated_role":false,"regulation_note":"","core_competencies":[],"competency_evidence_map":[{{"competency":"","evidence_keywords":[]}}],"domain_relevance_keywords":[],"recommended_subjects":[],"education_or_training_pathway":[],"credentials_or_licensing_areas":[],"experience_or_portfolio_evidence":[],"actions_30_days":[],"actions_6_months":[],"actions_1_year":[]}}]}}\nPROFILE:{json.dumps(compact_profile)}"""
    raw = await resilient_llm_generate(prompt, max_tokens_override=2600)
    payload = json.loads(raw)
    return _score_candidates(
        payload.get("profile") or {},
        _safe_list(payload.get("careers")),
        scoring_evidence,
        structured_evidence,
        max_careers,
    )
