"""Open-career blueprint utilities for Skills Pathfinder.

The local occupation catalog is a shortcut, not a gate. Unknown career titles can
be represented by a structured AI-generated blueprint and scored against the
same student evidence model.
"""

import re
from typing import Any, Dict, Iterable, List, Optional


def normalize(value: Any) -> str:
    text = str(value or "").strip().lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9+#./ -]+", " ", text)
    return re.sub(r"\s+", " ", text).strip(" .-/")


def slug(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalize(value)).strip("-") or "career"


def safe_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _confidence(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.70
    return max(0.0, min(1.0, number))


def build_evidence_index(skills: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    index: Dict[str, Dict[str, Any]] = {}
    for item in skills or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or item.get("skill_name") or "").strip()
        key = normalize(name)
        if not key:
            continue
        row = {
            "name": name,
            "confidence": _confidence(item.get("confidence")),
            "source": item.get("source") or "profile_evidence",
            "category": item.get("category") or "Evidence",
        }
        current = index.get(key)
        if current is None or row["confidence"] > current["confidence"]:
            index[key] = row
    return index


def _normalize_subjects(value: Any) -> List[Dict[str, str]]:
    output: List[Dict[str, str]] = []
    seen = set()
    for item in safe_list(value):
        if isinstance(item, str):
            name, reason = item.strip(), "Supports preparation for this career pathway."
        elif isinstance(item, dict):
            name = str(item.get("name") or item.get("subject") or "").strip()
            reason = str(item.get("reason") or item.get("why") or "Supports preparation for this career pathway.").strip()
        else:
            continue
        key = normalize(name)
        if name and key not in seen:
            seen.add(key)
            output.append({"name": name, "reason": reason})
    return output[:12]


def _strings(value: Any, limit: int = 20) -> List[str]:
    output: List[str] = []
    seen = set()
    for item in safe_list(value):
        text = str(item or "").strip()
        key = normalize(text)
        if text and key not in seen:
            seen.add(key)
            output.append(text)
    return output[:limit]


def sanitize_blueprint(raw: Dict[str, Any], requested_title: str, known_career: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    canonical = str(raw.get("canonical_title") or (known_career or {}).get("path") or requested_title).strip()
    known_required = _strings((known_career or {}).get("required_skills"), 30)
    ai_core = _strings(raw.get("core_competencies"), 30)
    core = known_required or ai_core

    evidence_map: List[Dict[str, Any]] = []
    raw_map = safe_list(raw.get("competency_evidence_map"))
    for competency in core:
        matching = next((m for m in raw_map if isinstance(m, dict) and normalize(m.get("competency")) == normalize(competency)), None)
        keywords = _strings((matching or {}).get("evidence_keywords"), 12)
        evidence_map.append({"competency": competency, "evidence_keywords": keywords})

    regulated = bool(raw.get("regulated_role") or (known_career or {}).get("regulated_role"))
    regulation_note = str(raw.get("regulation_note") or "").strip()
    if regulated and not regulation_note:
        regulation_note = "This is a regulated career. Licensing, education, examination, clinical, flight, supervised-practice, or jurisdiction-specific requirements must be verified with the relevant official authority."

    return {
        "requested_title": requested_title,
        "canonical_title": canonical,
        "career_category": str(raw.get("career_category") or (known_career or {}).get("category") or "Career pathway").strip(),
        "career_summary": str(raw.get("career_summary") or f"Preparation pathway for {canonical}.").strip(),
        "regulated_role": regulated,
        "regulation_note": regulation_note,
        "core_competencies": core,
        "competency_evidence_map": evidence_map,
        "domain_relevance_keywords": _strings(raw.get("domain_relevance_keywords"), 30),
        "recommended_subjects": _normalize_subjects(raw.get("recommended_subjects")),
        "education_or_training_pathway": _strings(raw.get("education_or_training_pathway"), 12),
        "credentials_or_licensing_areas": _strings(raw.get("credentials_or_licensing_areas"), 12),
        "experience_or_portfolio_evidence": _strings(raw.get("experience_or_portfolio_evidence"), 12),
        "actions_30_days": _strings(raw.get("actions_30_days"), 10),
        "actions_6_months": _strings(raw.get("actions_6_months"), 10),
        "actions_1_year": _strings(raw.get("actions_1_year"), 10),
        "source_type": "catalog_plus_ai" if known_career else "dynamic_ai_blueprint",
        "catalog_career_id": (known_career or {}).get("id"),
        "official_verification_required": regulated,
    }


def _find_keyword(index: Dict[str, Dict[str, Any]], keyword: str) -> Optional[Dict[str, Any]]:
    key = normalize(keyword)
    if not key:
        return None
    direct = index.get(key)
    if direct:
        return direct
    # Conservative phrase/token equivalence. Avoid one-token substring matches.
    wanted = set(key.split())
    if len(wanted) < 2:
        return None
    best = None
    best_overlap = 0.0
    for candidate_key, evidence in index.items():
        tokens = set(candidate_key.split())
        if not tokens:
            continue
        overlap = len(wanted & tokens) / len(wanted | tokens)
        if overlap >= 0.75 and overlap > best_overlap:
            best, best_overlap = evidence, overlap
    return best


def score_blueprint(skills: List[Dict[str, Any]], blueprint: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate explainable readiness for any career blueprint.

    70% is reserved for demonstrated occupation competencies, 20% for relevant
    academic preparation, and 10% for broader domain evidence. This prevents a
    prerequisite subject or broad field label from being mistaken for job
    readiness while still giving beginning students meaningful non-zero credit.
    """
    index = build_evidence_index(skills)
    core = _strings(blueprint.get("core_competencies"), 40)
    evidence_map = safe_list(blueprint.get("competency_evidence_map"))
    matched: List[str] = []
    missing: List[str] = []
    matched_details: List[Dict[str, Any]] = []

    core_earned = 0.0
    for competency in core:
        mapping = next((m for m in evidence_map if isinstance(m, dict) and normalize(m.get("competency")) == normalize(competency)), {})
        candidates = [competency] + _strings(mapping.get("evidence_keywords"), 15)
        evidence = next((_find_keyword(index, candidate) for candidate in candidates if _find_keyword(index, candidate)), None)
        if evidence:
            matched.append(competency)
            factor = 0.65 + 0.35 * evidence["confidence"]
            core_earned += factor
            matched_details.append({"required_skill": competency, "evidence_skill": evidence["name"], "confidence": round(evidence["confidence"], 3), "source": evidence["source"], "type": "core_competency"})
        else:
            missing.append(competency)
    core_ratio = core_earned / len(core) if core else 0.0

    subject_rows = _normalize_subjects(blueprint.get("recommended_subjects"))
    subject_matches: List[Dict[str, Any]] = []
    for subject in subject_rows:
        evidence = _find_keyword(index, subject["name"])
        if evidence:
            subject_matches.append({"subject": subject["name"], "evidence_skill": evidence["name"], "confidence": round(evidence["confidence"], 3)})
    academic_ratio = min(1.0, len(subject_matches) / max(1, min(5, len(subject_rows)))) if subject_rows else 0.0

    domain_matches: List[Dict[str, Any]] = []
    seen_evidence = set()
    for keyword in _strings(blueprint.get("domain_relevance_keywords"), 40):
        evidence = _find_keyword(index, keyword)
        if evidence and normalize(evidence["name"]) not in seen_evidence:
            seen_evidence.add(normalize(evidence["name"]))
            domain_matches.append({"keyword": keyword, "evidence_skill": evidence["name"], "confidence": round(evidence["confidence"], 3)})
    domain_ratio = min(1.0, len(domain_matches) / 3.0)

    score = max(0.0, min(1.0, 0.70 * core_ratio + 0.20 * academic_ratio + 0.10 * domain_ratio))
    match_pct = round(score * 100, 1)
    gap_pct = round((1.0 - score) * 100, 1)

    if matched:
        reason = f"Current evidence demonstrates {len(matched)} of {len(core)} mapped core competencies."
    elif subject_matches or domain_matches:
        names = [m["evidence_skill"] for m in (subject_matches + domain_matches)[:3]]
        reason = f"Relevant preparation evidence ({', '.join(names)}) supports this pathway, but core occupational competencies still need to be demonstrated."
    else:
        reason = "The selected target is preserved, but the current evidence does not yet demonstrate mapped preparation or core competencies."

    return {
        "match_score": round(score, 4),
        "match_percentage": match_pct,
        "skill_gap_percentage": gap_pct,
        "matched_skills": matched,
        "missing_skills": missing,
        "matched_skill_details": matched_details,
        "academic_preparation_matches": subject_matches,
        "domain_evidence": domain_matches,
        "readiness_components": {
            "core_competencies": round(core_ratio * 100, 1),
            "academic_preparation": round(academic_ratio * 100, 1),
            "domain_relevance": round(domain_ratio * 100, 1),
        },
        "match_reason": reason,
    }


def recommendation_from_blueprint(blueprint: Dict[str, Any], scoring: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": f"dynamic:{slug(blueprint.get('canonical_title'))}",
        "path": blueprint.get("canonical_title") or blueprint.get("requested_title") or "Target career",
        "category": blueprint.get("career_category") or "Career pathway",
        **scoring,
        "recommended_certifications": [{"name": item, "provider": "Verify with official/recognized provider", "time": "Varies", "cost": "Varies", "url": ""} for item in safe_list(blueprint.get("credentials_or_licensing_areas"))],
        "recommended_degrees": [{"name": item, "type": "Education / training pathway", "duration": "Varies", "format": "Varies"} for item in safe_list(blueprint.get("education_or_training_pathway"))],
        "next_steps": safe_list(blueprint.get("actions_30_days")) + safe_list(blueprint.get("actions_6_months"))[:2],
        "learning_resources": [],
        "regulated_role": bool(blueprint.get("regulated_role")),
        "target_selected": True,
        "dynamic_blueprint": True,
        "blueprint": blueprint,
    }
