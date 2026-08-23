"""Generic cleanup for dynamic career recommendations.

The AI blueprint may list licensing or credential areas that the resume already shows.
This module prevents those existing credentials from being presented as new recommendations
without hard-coding any profession-specific credential names.
"""

import re
from typing import Any, Dict, Iterable, List, Set


def _normalize(value: Any) -> str:
    text = str(value or "").lower().replace("&", " and ")
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"\b(?:license|licence|licensed|licensure|certification|certificate|credential|registration|registered)\b", " ", text)
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _tokens(value: Any) -> List[str]:
    return [token for token in _normalize(value).split() if token]


def _acronym(value: Any) -> str:
    tokens = _tokens(value)
    return "".join(token[0] for token in tokens if token)


def _credential_signatures(value: Any) -> Set[str]:
    raw = str(value or "").strip()
    normalized = _normalize(raw)
    signatures: Set[str] = set()
    if normalized:
        signatures.add(normalized)
        compact = normalized.replace(" ", "")
        if compact:
            signatures.add(compact)
        acronym = _acronym(raw)
        if len(acronym) >= 2:
            signatures.add(acronym)
    raw_compact = re.sub(r"[^A-Za-z0-9]+", "", raw).lower()
    if raw_compact:
        signatures.add(raw_compact)
    return signatures


def credentials_equivalent(left: Any, right: Any) -> bool:
    a = _credential_signatures(left)
    b = _credential_signatures(right)
    if not a or not b:
        return False
    if a & b:
        return True
    left_tokens, right_tokens = set(_tokens(left)), set(_tokens(right))
    if left_tokens and right_tokens:
        overlap = len(left_tokens & right_tokens) / max(1, min(len(left_tokens), len(right_tokens)))
        if overlap >= 0.8:
            return True
    return False


def _credential_name(item: Any) -> str:
    if isinstance(item, dict):
        return str(item.get("name") or item.get("certification_name") or "").strip()
    return str(item or "").strip()


def filter_existing_credentials(
    structured_evidence: Dict[str, Any],
    recommendations: Iterable[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    existing = [
        _credential_name(item)
        for item in (structured_evidence or {}).get("certifications", [])
        if _credential_name(item)
    ]

    output: List[Dict[str, Any]] = []
    for recommendation in recommendations or []:
        if not isinstance(recommendation, dict):
            continue
        row = dict(recommendation)
        suggested = []
        for item in row.get("recommended_certifications") or []:
            name = _credential_name(item)
            if name and any(credentials_equivalent(name, held) for held in existing):
                continue
            suggested.append(item)
        row["recommended_certifications"] = suggested
        row["credentials_already_evidenced"] = list(existing)
        output.append(row)
    return output
