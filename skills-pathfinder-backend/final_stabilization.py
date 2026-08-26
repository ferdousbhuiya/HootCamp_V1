"""General stabilization helpers for Skills Pathfinder.

This module leaves resume extraction and profession discovery generic. It improves
semantic evidence matching, applies an evidence threshold to adjacent-career pivots,
preserves documented current-role careers in the catalog fallback, and preserves
education evidence. It intentionally contains no profession-title market crosswalks or
profession-specific readiness tables.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List


# Small semantic-equivalence vocabulary used only to normalize skill wording. These are
# competency phrases, not profession/title rules, and the generic token matcher remains
# the primary path for unseen professions and skills.
ALIASES = {
    "legal research": {"legal research and drafting", "legal research & drafting"},
    "pleading drafting": {"legal research and drafting", "legal research & drafting"},
    "litigation strategy": {"commercial litigation", "corporate litigation", "dispute resolution"},
    "settlement management": {"negotiation", "dispute resolution", "commercial litigation"},
    "trial advocacy": {"commercial litigation", "dispute resolution"},
    "client counseling": {"negotiation", "legal research and drafting"},
    "risk assessment": {"corporate compliance", "commercial litigation", "security operations oversight"},
    "contract negotiation": {"contract law", "negotiation"},
    "corporate governance": {"corporate compliance"},
    "compliance management": {"corporate compliance"},
    "legal advisory": {"legal research and drafting", "corporate compliance"},
    "clinical diagnosis": {"oral diagnostics"},
    "treatment planning": {"restorative dentistry", "oral diagnostics"},
    "restorative procedures": {"restorative dentistry"},
    "endodontic therapy": {"endodontics"},
    "root canal therapy": {"endodontics"},
    "endodontic diagnosis": {"endodontics", "oral diagnostics"},
    "patient education": {"patient relations"},
    "patient communication": {"patient relations"},
    "digital imaging": {"digital radiography"},
    "infection control": {"restorative dentistry", "surgical extractions"},
    "facility security": {"access control", "cctv and surveillance systems", "security operations oversight", "patrol operations"},
    "incident response": {"emergency response", "incident reporting"},
    "staff training": {"training and scheduling"},
    "team leadership": {"training and scheduling", "security operations oversight"},
    "security operations management": {"security operations oversight"},
}

_GENERIC_TITLE_WORDS = {
    "senior", "junior", "lead", "principal", "staff", "associate", "assistant",
    "manager", "management", "specialist", "coordinator", "director", "supervisor",
    "officer", "consultant", "professional", "technician", "level", "grade",
}


def norm(value: Any) -> str:
    text = str(value or "").lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9+#./ -]+", " ", text)
    return re.sub(r"\s+", " ", text).strip(" .-/")


def _stem_token(token: str) -> str:
    token = re.sub(r"[^a-z0-9]+", "", str(token or "").lower())
    if len(token) > 5 and token.endswith("ing"):
        token = token[:-3]
    elif len(token) > 4 and token.endswith("ies"):
        token = token[:-3] + "y"
    elif len(token) > 4 and token.endswith("ics"):
        token = token[:-3]
    elif len(token) > 4 and token.endswith("es"):
        token = token[:-2]
    elif len(token) > 3 and token.endswith("s"):
        token = token[:-1]
    return token


def _stem_tokens(value: Any) -> set[str]:
    return {
        _stem_token(token)
        for token in norm(value).split()
        if len(_stem_token(token)) >= 3
    }


def _title_tokens(value: Any) -> set[str]:
    generic = {_stem_token(token) for token in _GENERIC_TITLE_WORDS}
    return {token for token in _stem_tokens(value) if token not in generic}


def _title_overlap(left: Any, right: Any) -> float:
    a, b = _title_tokens(left), _title_tokens(right)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return len(a & b) / max(1, min(len(a), len(b)))


def install_semantic_match_patch(blueprint_module, discovery_module) -> None:
    original = blueprint_module._find_keyword

    def improved(index: Dict[str, Dict[str, Any]], keyword: str):
        direct = original(index, keyword)
        if direct:
            return direct

        wanted = norm(keyword)
        candidates = set(ALIASES.get(wanted, set()))
        for canonical, synonyms in ALIASES.items():
            if wanted in synonyms:
                candidates.add(canonical)
        for candidate in candidates:
            row = index.get(norm(candidate))
            if row:
                return row

        wanted_tokens = _stem_tokens(wanted)
        if not wanted_tokens:
            return None
        best = None
        best_score = 0.0
        for key, row in index.items():
            tokens = _stem_tokens(key)
            if not tokens:
                continue
            containment = len(wanted_tokens & tokens) / max(1, min(len(wanted_tokens), len(tokens)))
            jaccard = len(wanted_tokens & tokens) / max(1, len(wanted_tokens | tokens))
            score = 0.72 * containment + 0.28 * jaccard
            if containment >= 0.67 and score > best_score:
                best, best_score = row, score
        return best

    blueprint_module._find_keyword = improved
    discovery_module.score_blueprint = blueprint_module.score_blueprint


def filter_cross_domain(current_title: str, recommendations: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Apply a profession-neutral evidence gate to career pivots.

    We trust current-profession, specialization and advancement relationships established
    from resume history. A genuinely adjacent/cross-career pivot is kept only when it has
    substantial evidence. No profession names or domain dictionaries are involved.
    """
    rows = [dict(x) for x in recommendations if isinstance(x, dict)]
    filtered: List[Dict[str, Any]] = []
    for row in rows:
        relation = norm(row.get("candidate_relation")).replace(" ", "_")
        if relation in {"current_profession", "specialization", "advancement"}:
            filtered.append(row)
            continue

        try:
            score = float(row.get("match_score") or 0.0)
        except (TypeError, ValueError):
            score = 0.0
        try:
            discovery = float(row.get("discovery_confidence") or 0.0)
        except (TypeError, ValueError):
            discovery = 0.0
        matched = len(row.get("matched_skills") or [])

        strong = score >= 0.60 and matched >= 4
        very_strong = score >= 0.70 and matched >= 3 and discovery >= 0.80
        if strong or very_strong:
            filtered.append(row)
    return filtered


def install_current_role_catalog_preservation(recommendation_module) -> None:
    """Keep catalog careers supported by meaningful documented role-title evidence.

    Generic job-level words such as manager, specialist, assistant, or officer are ignored
    when comparing titles. A meaningful occupation word shared with documented work history
    is sufficient to preserve the catalog career; its displayed readiness still comes from
    the normal evidence scorer. No profession names or profession-specific rules are used.
    """
    if getattr(recommendation_module, "_role_preservation_installed", False):
        return

    original = recommendation_module.get_career_recommendations

    def wrapped(extracted_skills, top_n=5, structured_evidence=None):
        results = list(original(extracted_skills, top_n=top_n, structured_evidence=structured_evidence))
        evidence = structured_evidence or {}
        role_titles = [
            str(item.get("role") or "").strip()
            for item in evidence.get("experience") or []
            if isinstance(item, dict) and str(item.get("role") or "").strip()
        ]
        if not role_titles:
            return results

        supported = []
        for career in getattr(recommendation_module, "CAREER_PATHS", []):
            if not isinstance(career, dict):
                continue
            overlap = max((_title_overlap(career.get("path"), role) for role in role_titles[:4]), default=0.0)
            if overlap < 0.50:
                continue
            scoring = recommendation_module._score_career(extracted_skills, career, structured_evidence)
            row = recommendation_module._career_result(career, scoring)
            row["documented_role_overlap"] = round(overlap, 3)
            supported.append(row)

        supported.sort(
            key=lambda row: (row.get("documented_role_overlap", 0), row.get("match_score", 0)),
            reverse=True,
        )

        merged = []
        merged_ids = set()
        for row in supported + results:
            key = str(row.get("id") or row.get("path") or "")
            if not key or key in merged_ids:
                continue
            merged_ids.add(key)
            merged.append(row)
            if len(merged) >= max(1, int(top_n or 5)):
                break
        return merged

    recommendation_module.get_career_recommendations = wrapped
    recommendation_module._role_preservation_installed = True


def current_title(profile: Dict[str, Any], structured: Dict[str, Any]) -> str:
    title = str((profile or {}).get("primary_profession") or "").strip()
    if title:
        return title
    for item in structured.get("experience") or []:
        if isinstance(item, dict) and item.get("role"):
            return str(item.get("role"))
    return ""


def install_market_variants_patch(generic_market_module) -> None:
    """Compatibility hook; market resolution is intentionally fully generic now.

    generic_market_resolution already resolves titles against the full O*NET dataset and
    then validates SOC/OEWS data. Do not inject per-profession aliases or SOC codes here.
    """
    return None


def normalize_education(structured: Dict[str, Any]) -> Dict[str, Any]:
    """Preserve explicit formal education, including non-degree school diplomas."""
    structured = dict(structured or {})
    education = list(structured.get("education") or [])
    if not education:
        for item in structured.get("certifications") or []:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            if "high school diploma" in norm(name):
                education.append({
                    "program_or_degree": name,
                    "field_of_study": "General Education",
                    "institution": item.get("provider") or item.get("institution") or "",
                    "source": "resume_evidence",
                })
    structured["education"] = education
    return structured
