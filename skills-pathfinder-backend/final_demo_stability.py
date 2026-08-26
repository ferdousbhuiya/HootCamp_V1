"""Profession-agnostic final stability helpers for Skills Pathfinder.

Resume extraction and dynamic career discovery remain generic. This module only makes
current-profession readiness deterministic from resume evidence and makes the official
BLS/OEWS table usable without per-profession title mappings.
"""
from __future__ import annotations

import html
import re
from difflib import SequenceMatcher
from typing import Any, Dict, Iterable, List, Optional


def _norm(value: Any) -> str:
    text = str(value or "").strip().lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9+#./ -]+", " ", text)
    return re.sub(r"\s+", " ", text).strip(" .-/")


def _stem(token: str) -> str:
    token = re.sub(r"[^a-z0-9]+", "", str(token or "").lower())
    if len(token) > 4 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 4 and token.endswith("es"):
        return token[:-2]
    if len(token) > 3 and token.endswith("s"):
        return token[:-1]
    return token


def _title_tokens(value: Any) -> set[str]:
    stop = {
        "senior", "junior", "lead", "principal", "associate", "assistant", "staff",
        "the", "and", "of", "for", "in", "with", "level", "grade",
    }
    return {
        _stem(token)
        for token in _norm(value).replace("/", " ").replace(".", " ").split()
        if len(_stem(token)) > 2 and _stem(token) not in stop
    }


def _titles_overlap(left: Any, right: Any) -> bool:
    a, b = _title_tokens(left), _title_tokens(right)
    if not a or not b:
        return False
    if a == b:
        return True
    return len(a & b) / max(1, min(len(a), len(b))) >= 0.60


def _experience_years(structured: Dict[str, Any]) -> float:
    try:
        return max(0.0, float((structured or {}).get("total_experience_years") or 0.0))
    except (TypeError, ValueError):
        return 0.0


def _has_documented_role(title: str, structured: Dict[str, Any]) -> bool:
    return any(
        isinstance(item, dict) and _titles_overlap(title, item.get("role"))
        for item in (structured or {}).get("experience") or []
    )


def _evidence_competencies(
    structured: Dict[str, Any],
    extracted_skills: Optional[Iterable[Dict[str, Any]]] = None,
) -> List[str]:
    """Return a deterministic, deduplicated competency inventory from resume evidence.

    The list is based only on extracted resume evidence, never on an AI career blueprint.
    This means a repeated upload with the same extracted evidence gets the same readiness
    inputs regardless of how the dynamic career model phrases a career competency list.
    """
    output: List[str] = []
    seen = set()

    def add(value: Any) -> None:
        name = str(value or "").strip()
        key = _norm(name)
        if not name or not key or key in seen:
            return
        seen.add(key)
        output.append(name)

    for item in extracted_skills or []:
        if isinstance(item, dict):
            add(item.get("name") or item.get("skill_name"))
        else:
            add(item)

    for role in (structured or {}).get("experience") or []:
        if not isinstance(role, dict):
            continue
        for value in role.get("skills_demonstrated") or []:
            add(value)

    for project in (structured or {}).get("projects") or []:
        if not isinstance(project, dict):
            continue
        for value in project.get("skills_demonstrated") or []:
            add(value)

    return output


def stabilize_current_profession(
    profile: Dict[str, Any],
    structured: Dict[str, Any],
    recommendations: Iterable[Dict[str, Any]],
    extracted_skills: Optional[Iterable[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Score a documented current profession from stable resume evidence only.

    This deliberately does not use the AI blueprint's core_competencies,
    recommended_subjects, or domain_relevance_keywords. Those fields remain useful for
    specialization and adjacent-career exploration, but must not make the same current
    profession jump between percentages on repeated uploads.

    Generic evidence model (no profession table):
      55% documented current/recent role
      20% sustained experience (full credit at 5 years)
      20% evidence breadth (full credit at 8 distinct demonstrated competencies)
       5% corroborating formal education or professional credential evidence

    The score is capped at 95% because resume evidence is not independent verification.
    """
    rows = [dict(item) for item in recommendations or [] if isinstance(item, dict)]
    years = _experience_years(structured)
    evidence = _evidence_competencies(structured, extracted_skills)
    breadth_factor = min(1.0, len(evidence) / 8.0)
    corroboration = bool((structured or {}).get("education") or (structured or {}).get("certifications"))

    for row in rows:
        relation = _norm(row.get("candidate_relation")).replace(" ", "_")
        if relation != "current_profession":
            continue

        title = str(
            row.get("path")
            or row.get("career_title")
            or (profile or {}).get("primary_profession")
            or ""
        ).strip()
        if not title or not _has_documented_role(title, structured):
            continue

        role_component = 0.55
        experience_component = 0.20 * min(1.0, years / 5.0)
        breadth_component = 0.20 * breadth_factor
        corroboration_component = 0.05 if corroboration else 0.0
        score = min(
            0.95,
            role_component + experience_component + breadth_component + corroboration_component,
        )

        row["match_score"] = round(score, 4)
        row["match_percentage"] = round(score * 100, 1)
        row["skill_gap_percentage"] = round((1.0 - score) * 100, 1)
        row["matched_skills"] = evidence[:12]
        # A generic engine cannot truthfully claim occupation-specific missing competencies
        # without a verified occupation standard. Specialization/adjacent blueprints still
        # expose explicit gaps; the current profession shows only demonstrated evidence.
        row["missing_skills"] = []
        row["matched_skill_details"] = [
            {
                "required_skill": name,
                "evidence_skill": name,
                "confidence": 1.0,
                "source": "resume_evidence",
                "type": "documented_current_profession_evidence",
            }
            for name in evidence[:12]
        ]
        row["match_reason"] = (
            f"Resume evidence documents the current profession with {len(evidence)} "
            f"demonstrated competencies and {years:.1f} years of experience."
        )
        row["readiness_stabilized"] = True
        row["readiness_basis"] = {
            "method": "profession_agnostic_resume_evidence",
            "documented_current_role": True,
            "demonstrated_competencies": len(evidence),
            "experience_years": round(years, 1),
            "corroborating_education_or_credentials": corroboration,
        }
    return rows


def _clean_bls_text(raw_html: str) -> str:
    text = html.unescape(raw_html or "")
    text = re.sub(r"<script\b[^>]*>.*?</script>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<style\b[^>]*>.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", "", text)
    return text.replace("\xa0", " ")


def _normalize_leader_dots(line: str) -> str:
    # BLS uses both contiguous leaders (....) and spaced leaders (. . . .).
    # Collapse runs of two or more leader dots without touching decimal points.
    return re.sub(r"(?:\s*\.\s*){2,}", " ", str(line or ""))


def parse_bls_rows(raw_html: str) -> Dict[str, Dict[str, Any]]:
    """Parse all numeric occupation rows from the official national OEWS release."""
    records: Dict[str, Dict[str, Any]] = {}
    row_pattern = re.compile(
        r"^\s*(?P<title>[A-Za-z][A-Za-z0-9 ,/&'()\-–—]+?)\s+"
        r"(?P<employment>[\d,]+)\s+"
        r"\$?(?P<mean_hourly>\d+(?:\.\d+)?)\s+"
        r"\$?(?P<mean_annual>[\d,]+)\s+"
        r"\$?(?P<median_hourly>\d+(?:\.\d+)?)\s*$"
    )
    for raw_line in _clean_bls_text(raw_html).splitlines():
        line = _normalize_leader_dots(raw_line)
        match = row_pattern.match(line)
        if not match:
            continue
        title = re.sub(r"\s+", " ", match.group("title")).strip()
        records[_norm(title)] = {
            "occupation_title": title,
            "employment": int(match.group("employment").replace(",", "")),
            "mean_hourly_wage": float(match.group("mean_hourly")),
            "mean_annual_wage": int(match.group("mean_annual").replace(",", "")),
            "median_hourly_wage": float(match.group("median_hourly")),
        }
    return records


def _best_bls_row(records: Dict[str, Dict[str, Any]], title: str) -> Optional[Dict[str, Any]]:
    wanted = _norm(title)
    if not wanted or not records:
        return None
    if wanted in records:
        return records[wanted]

    wanted_tokens = _title_tokens(title)
    if not wanted_tokens:
        return None

    best = None
    best_score = 0.0
    for key, row in records.items():
        candidate_tokens = _title_tokens(row.get("occupation_title"))
        if not candidate_tokens:
            continue
        shared = wanted_tokens & candidate_tokens
        containment = len(shared) / max(1, min(len(wanted_tokens), len(candidate_tokens)))
        jaccard = len(shared) / max(1, len(wanted_tokens | candidate_tokens))
        similarity = SequenceMatcher(None, wanted, key).ratio()
        score = 0.55 * containment + 0.25 * jaccard + 0.20 * similarity
        if containment >= 0.60 and score > best_score:
            best, best_score = row, score
    return best


def _extract_bls_row(raw_html: str, mapped_title: str):
    """Backward-compatible single-title helper used by regression tests."""
    return _best_bls_row(parse_bls_rows(raw_html), mapped_title)


def install_bls_table_fallback(market_module) -> None:
    """Install a generic official-table parser and fallback for any occupation title."""
    original_lookup = market_module.lookup_bls_market

    # Make every existing consumer of market_module._bls_records benefit from the same
    # robust parser, including generic O*NET/SOC resolution paths.
    market_module.parse_bls_oews_table = parse_bls_rows

    def lookup(career_title: str):
        result = original_lookup(career_title)
        if isinstance(result, dict) and result.get("available"):
            return result

        try:
            records = market_module._bls_records()
        except Exception:
            records = {}

        mapped = market_module.CAREER_TO_BLS_TITLE.get(market_module._normalize(career_title))
        row = _best_bls_row(records, mapped or career_title)
        if not row:
            return result

        mapped_title = row.get("occupation_title") or mapped or career_title
        code = market_module.BLS_TITLE_TO_OCCUPATION_CODE.get(mapped_title)
        return {
            "available": True,
            **row,
            "occupation_code": code,
            "soc_code": market_module._soc_from_bls_code(code),
            "mapped_occupation": mapped_title,
            "mapping_method": "generic_official_title_match",
            "retrieval_method": "bls_official_national_table",
            "source": market_module.BLS_SOURCE_NAME,
            "source_period": market_module.BLS_OEWS_PERIOD,
            "source_url": market_module.BLS_OEWS_URL,
        }

    market_module.lookup_bls_market = lookup
