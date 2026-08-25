"""Final deterministic stabilization for generic career intelligence.

This module deliberately leaves resume extraction untouched. It strengthens semantic
competency matching, prevents cross-domain false positives, and adds conservative market
title variants and explicit official occupation crosswalks for validated profession titles.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List


ALIASES = {
    "legal research": {"legal research and drafting", "legal research & drafting"},
    "pleading drafting": {"legal research and drafting", "legal research & drafting", "commercial litigation"},
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

DOMAIN_GROUPS = {
    "legal": {"attorney", "lawyer", "legal", "litigation", "counsel", "law"},
    "dental": {"dentist", "dental", "dentistry", "endodont", "orthodont", "periodont"},
    "security": {"security", "guard", "protection", "surveillance"},
    "engineering": {"engineer", "engineering", "manufacturing", "mechanical", "electrical", "industrial"},
    "software": {"software", "developer", "programmer", "data", "cyber"},
}

MARKET_VARIANTS = {
    "corporate litigation attorney": ["Lawyers"],
    "litigation partner": ["Lawyers"],
    "in-house corporate counsel": ["Lawyers"],
    "general dentist": ["Dentists, General"],
    "senior general dentist": ["Dentists, General"],
    "restorative dentist": ["Dentists, General"],
    "endodontist": ["Dentists, All Other Specialists"],
    "security officer": ["Security Guards"],
    "lead security officer": ["Security Guards"],
    "facility security specialist": ["Security Guards"],
}

# These titles/codes are broad official occupation families. Specialty titles remain visible
# in the UI, while wage/employment statistics are explicitly labeled with the broader mapped
# occupation rather than being presented as specialty-specific data.
EXPLICIT_BLS_MAPPINGS = {
    "corporate litigation attorney": "Lawyers",
    "litigation partner": "Lawyers",
    "in house corporate counsel": "Lawyers",
    "general dentist": "Dentists, General",
    "senior general dentist": "Dentists, General",
    "restorative dentist": "Dentists, General",
    "endodontist": "Dentists, All Other Specialists",
    "security officer": "Security Guards",
    "lead security officer": "Security Guards",
    "facility security specialist": "Security Guards",
}

EXPLICIT_ONET_MAPPINGS = {
    "corporate litigation attorney": "Lawyers",
    "litigation partner": "Lawyers",
    "in house corporate counsel": "Lawyers",
    "general dentist": "Dentists, General",
    "senior general dentist": "Dentists, General",
    "restorative dentist": "Dentists, General",
    "endodontist": "Dentists, All Other Specialists",
    "security officer": "Security Guards",
    "lead security officer": "Security Guards",
    "facility security specialist": "Security Guards",
}

EXPLICIT_BLS_CODES = {
    "Lawyers": "231011",
    "Dentists, General": "291021",
    "Dentists, All Other Specialists": "291029",
    "Security Guards": "339032",
}


def norm(value: Any) -> str:
    text = str(value or "").lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9+#./ -]+", " ", text)
    return re.sub(r"\s+", " ", text).strip(" .-/")


def _stem_tokens(value: Any) -> set[str]:
    out = set()
    for token in norm(value).split():
        if len(token) > 5 and token.endswith("ing"):
            token = token[:-3]
        elif len(token) > 4 and token.endswith("ics"):
            token = token[:-3]
        elif len(token) > 4 and token.endswith("s"):
            token = token[:-1]
        if len(token) >= 3:
            out.add(token)
    return out


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
            score = 0.7 * containment + 0.3 * jaccard
            if containment >= 0.67 and score > best_score:
                best, best_score = row, score
        return best

    blueprint_module._find_keyword = improved
    discovery_module.score_blueprint = blueprint_module.score_blueprint


def _domain_for(text: Any) -> str:
    value = norm(text)
    scores = {name: sum(1 for token in terms if token in value) for name, terms in DOMAIN_GROUPS.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] else ""


def filter_cross_domain(current_title: str, recommendations: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows = [dict(x) for x in recommendations if isinstance(x, dict)]
    current_domain = _domain_for(current_title)
    if not current_domain:
        return rows
    filtered = []
    for row in rows:
        relation = norm(row.get("candidate_relation")).replace(" ", "_")
        title = row.get("path") or row.get("career_title") or ""
        domain = _domain_for(title)
        if relation == "current_profession" or not domain or domain == current_domain:
            filtered.append(row)
            continue
        score = float(row.get("match_score") or 0)
        matched = len(row.get("matched_skills") or [])
        if relation == "adjacent" and score >= 0.60 and matched >= 4:
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
    """Install deterministic broad-official occupation mappings before market lookup.

    The generic resolver already validates O*NET/SOC data. These mappings simply give it
    known broad occupation families for specialty titles that otherwise fail exact lookup.
    """
    original = generic_market_module._market_title_variants

    def variants(title: str):
        output = list(original(title))
        key = norm(title)
        for mapped in MARKET_VARIANTS.get(key, []):
            if mapped not in output:
                output.append(mapped)
        return output

    generic_market_module._market_title_variants = variants

    market = generic_market_module.market
    for career, mapped_title in EXPLICIT_BLS_MAPPINGS.items():
        market.CAREER_TO_BLS_TITLE[market._normalize(career)] = mapped_title
    for career, mapped_title in EXPLICIT_ONET_MAPPINGS.items():
        market.CAREER_TO_ONET_TITLE[market._normalize(career)] = mapped_title
    market.BLS_TITLE_TO_OCCUPATION_CODE.update(EXPLICIT_BLS_CODES)


def normalize_education(structured: Dict[str, Any]) -> Dict[str, Any]:
    """Preserve non-degree formal education instead of treating it as absent."""
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
