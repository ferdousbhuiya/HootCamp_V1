"""Final demo stability patches for Skills Pathfinder.

This module intentionally avoids resume extraction changes. It stabilizes current-
profession readiness across repeated uploads and adds a robust official BLS/OEWS
national-table fallback when the public API path does not return usable data.
"""
from __future__ import annotations

import html
import re
from typing import Any, Dict, Iterable, List


def _norm(value: Any) -> str:
    text = str(value or "").strip().lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9+#./ -]+", " ", text)
    return re.sub(r"\s+", " ", text).strip(" .-/")


def _title_tokens(value: Any) -> set[str]:
    stop = {"senior", "junior", "lead", "principal", "associate", "assistant", "staff", "general", "the", "and", "of", "for", "in", "with"}
    return {token for token in _norm(value).replace("/", " ").split() if len(token) > 2 and token not in stop}


def _titles_overlap(left: Any, right: Any) -> bool:
    a, b = _title_tokens(left), _title_tokens(right)
    if not a or not b:
        return False
    return len(a & b) / max(1, min(len(a), len(b))) >= 0.60


def _experience_years(structured: Dict[str, Any]) -> float:
    try:
        return max(0.0, float((structured or {}).get("total_experience_years") or 0.0))
    except (TypeError, ValueError):
        return 0.0


def _has_documented_role(title: str, structured: Dict[str, Any]) -> bool:
    for item in (structured or {}).get("experience") or []:
        if isinstance(item, dict) and _titles_overlap(title, item.get("role")):
            return True
    return False


def stabilize_current_profession(
    profile: Dict[str, Any],
    structured: Dict[str, Any],
    recommendations: Iterable[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Make current-profession readiness deterministic and evidence-weighted.

    Dynamic AI blueprints may vary their competency list between identical uploads.
    For the documented current profession, readiness therefore uses the demonstrated
    core-competency ratio plus explicit role history and experience duration. This keeps
    specialization/adjacent scoring unchanged while preventing large swings in the same
    person's current-profession readiness.
    """
    rows = [dict(item) for item in recommendations or [] if isinstance(item, dict)]
    years = _experience_years(structured)
    for row in rows:
        relation = _norm(row.get("candidate_relation")).replace(" ", "_")
        if relation != "current_profession":
            continue
        title = str(row.get("path") or row.get("career_title") or (profile or {}).get("primary_profession") or "").strip()
        matched = len(row.get("matched_skills") or [])
        missing = len(row.get("missing_skills") or [])
        total = matched + missing
        if not title or total <= 0 or not _has_documented_role(title, structured):
            continue

        core_ratio = matched / total
        experience_factor = min(1.0, years / 5.0)
        # 68% demonstrated competencies + 17% documented role + 10% sustained experience.
        # The 95% ceiling leaves room for external credential/market verification and
        # avoids presenting any resume-only assessment as absolute readiness.
        stable_score = min(0.95, 0.68 * core_ratio + 0.17 + 0.10 * experience_factor)
        current_score = float(row.get("match_score") or 0.0)
        final_score = max(current_score, stable_score)
        row["match_score"] = round(final_score, 4)
        row["match_percentage"] = round(final_score * 100, 1)
        row["skill_gap_percentage"] = round((1.0 - final_score) * 100, 1)
        row["readiness_stabilized"] = True
        row["readiness_basis"] = {
            "core_competency_ratio": round(core_ratio * 100, 1),
            "documented_current_role": True,
            "experience_years": round(years, 1),
        }
    return rows


def _extract_bls_row(raw_html: str, mapped_title: str):
    text = html.unescape(raw_html or "")
    text = re.sub(r"<script\b[^>]*>.*?</script>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<style\b[^>]*>.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("\xa0", " ")
    # BLS national table rows are preformatted with dotted leaders:
    # Occupation .... employment mean-hourly mean-annual median-hourly
    pattern = re.compile(
        rf"(?im)^\s*{re.escape(mapped_title)}\.*\s+"
        r"(?P<employment>[\d,]+)\s+"
        r"(?P<mean_hourly>\d+(?:\.\d+)?|\([^\r\n]+?\))\s+"
        r"(?P<mean_annual>[\d,]+|\([^\r\n]+?\))\s+"
        r"(?P<median_hourly>\d+(?:\.\d+)?|\([^\r\n]+?\))\s*$"
    )
    match = pattern.search(text)
    if not match:
        return None
    annual = match.group("mean_annual")
    hourly = match.group("mean_hourly")
    if not re.fullmatch(r"[\d,]+", annual) or not re.fullmatch(r"\d+(?:\.\d+)?", hourly):
        return None
    return {
        "occupation_title": mapped_title,
        "employment": int(match.group("employment").replace(",", "")),
        "mean_hourly_wage": float(hourly),
        "mean_annual_wage": int(annual.replace(",", "")),
        "median_hourly_wage": float(match.group("median_hourly")) if re.fullmatch(r"\d+(?:\.\d+)?", match.group("median_hourly")) else None,
    }


def install_bls_table_fallback(market_module) -> None:
    """Patch BLS lookup with a robust official May-2025 national-table fallback."""
    original = market_module.lookup_bls_market

    def lookup(career_title: str):
        result = original(career_title)
        if isinstance(result, dict) and result.get("available"):
            return result
        mapped = market_module.CAREER_TO_BLS_TITLE.get(market_module._normalize(career_title))
        if not mapped:
            return result
        try:
            raw = market_module._fetch_text(market_module.BLS_OEWS_URL)
            row = _extract_bls_row(raw, mapped)
        except Exception:
            row = None
        if not row:
            return result
        code = market_module.BLS_TITLE_TO_OCCUPATION_CODE.get(mapped)
        return {
            "available": True,
            **row,
            "occupation_code": code,
            "soc_code": market_module._soc_from_bls_code(code),
            "mapped_occupation": mapped,
            "mapping_method": "explicit_conservative_mapping",
            "retrieval_method": "bls_official_national_table_fallback",
            "source": market_module.BLS_SOURCE_NAME,
            "source_period": market_module.BLS_OEWS_PERIOD,
            "source_url": market_module.BLS_OEWS_URL,
        }

    market_module.lookup_bls_market = lookup
