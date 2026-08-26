"""Profession-agnostic final stability helpers for Skills Pathfinder.

Resume extraction and dynamic career discovery remain generic. This module makes
readiness for documented work roles deterministic from resume evidence and makes the
official BLS/OEWS table usable without per-profession title mappings.
"""
from __future__ import annotations

import html
import re
from datetime import date
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
        "manager", "management", "specialist", "coordinator", "director", "supervisor",
        "officer", "consultant", "professional", "technician",
        "the", "and", "of", "for", "in", "with", "level", "grade",
    }
    return {
        _stem(token)
        for token in _norm(value).replace("/", " ").replace(".", " ").split()
        if len(_stem(token)) > 2 and _stem(token) not in stop
    }


def _title_overlap_ratio(left: Any, right: Any) -> float:
    a, b = _title_tokens(left), _title_tokens(right)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return len(a & b) / max(1, min(len(a), len(b)))


def _titles_overlap(left: Any, right: Any) -> bool:
    return _title_overlap_ratio(left, right) >= 0.60


def _parse_date(value: Any) -> Optional[date]:
    text = str(value or "").strip().lower()
    if not text:
        return None
    if text in {"present", "current", "now"}:
        return date.today()
    months = {
        "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
        "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
        "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
        "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
    }
    month_match = re.search(r"([a-z]{3,9})\s+(19\d{2}|20\d{2})", text)
    if month_match and month_match.group(1) in months:
        return date(int(month_match.group(2)), months[month_match.group(1)], 1)
    year_match = re.search(r"(19\d{2}|20\d{2})", text)
    return date(int(year_match.group(1)), 1, 1) if year_match else None


def _months_between(start: date, end: date) -> set[tuple[int, int]]:
    if end < start:
        return set()
    months = set()
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        months.add((year, month))
        month += 1
        if month == 13:
            year += 1
            month = 1
    return months


def _documented_role_years(title: str, structured: Dict[str, Any]) -> float:
    months = set()
    matching_roles = []
    for item in (structured or {}).get("experience") or []:
        if not isinstance(item, dict):
            continue
        if _title_overlap_ratio(title, item.get("role")) < 0.50:
            continue
        matching_roles.append(item)
        start = _parse_date(item.get("start_date"))
        end = _parse_date(item.get("end_date")) or date.today()
        if start:
            months.update(_months_between(start, end))

    if months:
        return round(len(months) / 12.0, 1)

    # Some extraction paths already calculate non-overlapping total experience but do not
    # preserve parseable role dates. Use that only when at least one role title matched.
    if matching_roles:
        try:
            return max(0.0, float((structured or {}).get("total_experience_years") or 0.0))
        except (TypeError, ValueError):
            pass
    return 0.0


def _experience_years(structured: Dict[str, Any]) -> float:
    try:
        total = max(0.0, float((structured or {}).get("total_experience_years") or 0.0))
    except (TypeError, ValueError):
        total = 0.0
    if total:
        return total

    months = set()
    for item in (structured or {}).get("experience") or []:
        if not isinstance(item, dict):
            continue
        start = _parse_date(item.get("start_date"))
        end = _parse_date(item.get("end_date")) or date.today()
        if start:
            months.update(_months_between(start, end))
    return round(len(months) / 12.0, 1) if months else 0.0


def _has_documented_role(title: str, structured: Dict[str, Any]) -> bool:
    return any(
        isinstance(item, dict) and _titles_overlap(title, item.get("role"))
        for item in (structured or {}).get("experience") or []
    )


def _evidence_competencies(
    structured: Dict[str, Any],
    extracted_skills: Optional[Iterable[Dict[str, Any]]] = None,
) -> List[str]:
    """Return a deterministic, deduplicated competency inventory from resume evidence."""
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


def documented_role_readiness(
    title: str,
    structured: Dict[str, Any],
    extracted_skills: Optional[Iterable[Dict[str, Any]]] = None,
) -> Optional[Dict[str, Any]]:
    """Return stable readiness for any occupation explicitly documented in work history.

    No career catalog, profession dictionary, or AI-generated competency list is used.
    The same evidence therefore produces the same result for any profession.
    """
    if not title or not _has_documented_role(title, structured):
        return None

    evidence = _evidence_competencies(structured, extracted_skills)
    years = _documented_role_years(title, structured)
    if years <= 0:
        years = _experience_years(structured)
    breadth_factor = min(1.0, len(evidence) / 8.0)
    corroboration = bool((structured or {}).get("education") or (structured or {}).get("certifications"))

    role_component = 0.55
    experience_component = 0.20 * min(1.0, years / 5.0)
    breadth_component = 0.20 * breadth_factor
    corroboration_component = 0.05 if corroboration else 0.0
    score = min(0.95, role_component + experience_component + breadth_component + corroboration_component)

    return {
        "score": round(score, 4),
        "percentage": round(score * 100, 1),
        "experience_years": round(years, 1),
        "evidence": evidence,
        "corroboration": corroboration,
        "method": "profession_agnostic_documented_role_evidence",
    }


def stabilize_current_profession(
    profile: Dict[str, Any],
    structured: Dict[str, Any],
    recommendations: Iterable[Dict[str, Any]],
    extracted_skills: Optional[Iterable[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Replace AI-variable current-profession readiness with documented-role evidence."""
    rows = [dict(item) for item in recommendations or [] if isinstance(item, dict)]

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
        stable = documented_role_readiness(title, structured, extracted_skills)
        if not stable:
            continue

        score = stable["score"]
        evidence = stable["evidence"]
        years = stable["experience_years"]
        row["match_score"] = score
        row["match_percentage"] = stable["percentage"]
        row["skill_gap_percentage"] = round((1.0 - score) * 100, 1)
        row["matched_skills"] = evidence[:12]
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
            "method": stable["method"],
            "documented_current_role": True,
            "demonstrated_competencies": len(evidence),
            "experience_years": years,
            "corroborating_education_or_credentials": stable["corroboration"],
        }
    return rows


def _clean_bls_text(raw_html: str) -> str:
    text = html.unescape(raw_html or "")
    text = re.sub(r"<script\b[^>]*>.*?</script>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<style\b[^>]*>.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", "", text)
    return text.replace("\xa0", " ")


def _normalize_leader_dots(line: str) -> str:
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
    return _best_bls_row(parse_bls_rows(raw_html), mapped_title)


def install_bls_table_fallback(market_module) -> None:
    """Install a generic official-table parser and fallback for any occupation title."""
    original_lookup = market_module.lookup_bls_market
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
