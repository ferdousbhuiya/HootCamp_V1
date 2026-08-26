"""Profession-agnostic safeguards for local catalog career scoring.

Some catalog entries predate domain_terms/domain_gate. The base scorer treats missing
metadata as no domain evidence and therefore returns zero. This module derives conservative
fallback metadata from each career's own title, category and non-transferable competencies.
No profession names or per-profession tables are used.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List


_GENERIC_TITLE_WORDS = {
    "senior", "junior", "lead", "principal", "staff", "associate", "assistant",
    "manager", "management", "specialist", "coordinator", "director", "supervisor",
    "officer", "consultant", "professional", "technician", "level", "grade",
}


def _norm(value: Any) -> str:
    text = str(value or "").lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9+#./ -]+", " ", text)
    return re.sub(r"\s+", " ", text).strip(" .-/")


def _tokens(value: Any) -> List[str]:
    return [
        token for token in _norm(value).replace("/", " ").replace(".", " ").split()
        if len(token) >= 3 and token not in _GENERIC_TITLE_WORDS
    ]


def _unique(values) -> List[str]:
    output: List[str] = []
    seen = set()
    for value in values:
        text = str(value or "").strip()
        key = _norm(text)
        if not text or not key or key in seen:
            continue
        seen.add(key)
        output.append(text)
    return output


def derive_domain_metadata(career: Dict[str, Any], transferable_skills=None) -> Dict[str, Any]:
    """Return a copy of career with conservative fallback domain metadata."""
    row = dict(career or {})
    if row.get("domain_terms") and row.get("domain_gate"):
        return row

    transferable = {_norm(item) for item in (transferable_skills or set())}
    title = str(row.get("path") or "").strip()
    category = str(row.get("category") or "").strip()
    required = [str(item).strip() for item in row.get("required_skills") or [] if str(item).strip()]

    title_tokens = _tokens(title)
    category_tokens = _tokens(category)
    technical_required = [item for item in required if _norm(item) not in transferable]

    terms = _unique(
        [title, category]
        + title_tokens
        + category_tokens
        + technical_required
    )

    # Gate terms should be stricter than general domain terms. Prefer meaningful title
    # words; fall back to category words and then non-transferable required competencies.
    gate = _unique(title_tokens + category_tokens + technical_required[:3])

    if not row.get("domain_terms"):
        row["domain_terms"] = terms
    if not row.get("domain_gate"):
        row["domain_gate"] = gate
    row["domain_metadata_source"] = "derived_from_career_metadata"
    return row


def install_generic_domain_metadata(recommendation_module) -> None:
    """Patch the catalog scorer so missing domain metadata never means automatic zero."""
    if getattr(recommendation_module, "_generic_domain_metadata_installed", False):
        return

    original = recommendation_module._score_career

    def score(extracted_skills, career, structured_evidence=None):
        prepared = derive_domain_metadata(
            career,
            getattr(recommendation_module, "TRANSFERABLE_SKILLS", set()),
        )
        return original(extracted_skills, prepared, structured_evidence)

    recommendation_module._score_career = score
    recommendation_module._generic_domain_metadata_installed = True
