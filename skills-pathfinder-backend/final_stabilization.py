"""General stabilization helpers for Skills Pathfinder.

This module leaves resume extraction and profession discovery generic. It improves
semantic evidence matching, applies an evidence threshold to adjacent-career pivots,
and preserves education evidence. It intentionally contains no profession-title market
crosswalks or profession-specific readiness tables.
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
    substantial evidence: at least four matched competencies and >=60% readiness, or at
    least three matched competencies with >=70% readiness and strong discovery confidence.
    No profession names or domain dictionaries are involved.
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
