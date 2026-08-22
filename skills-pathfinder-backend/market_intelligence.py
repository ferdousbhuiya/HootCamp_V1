"""Authoritative, no-paid-key market intelligence for Skills Pathfinder.

The module intentionally keeps market lookup separate from resume processing.
If BLS or O*NET is unavailable, recommendation generation still succeeds and the
frontend can show the static catalog reference values.

Sources:
- U.S. Bureau of Labor Statistics (BLS) OEWS May 2025 national wage table.
- O*NET 30.3 occupation data from the U.S. Department of Labor.
"""

from __future__ import annotations

import html
import json
import os
import re
import threading
import time
from difflib import SequenceMatcher
from typing import Any, Dict, Optional
from urllib.request import Request, urlopen


BLS_OEWS_URL = os.getenv(
    "BLS_OEWS_URL",
    "https://www.bls.gov/news.release/ocwage.t01.htm",
)
BLS_OEWS_PERIOD = "May 2025"
BLS_SOURCE_NAME = "U.S. Bureau of Labor Statistics Occupational Employment and Wage Statistics"

ONET_OCCUPATION_DATA_URL = os.getenv(
    "ONET_OCCUPATION_DATA_URL",
    "https://www.onetcenter.org/dl_files/database/db_30_3_json/occupation_data.json",
)
ONET_RELEASE = "30.3"
ONET_SOURCE_NAME = "O*NET Database, U.S. Department of Labor/ETA"

CACHE_TTL_SECONDS = int(os.getenv("MARKET_CACHE_TTL_SECONDS", "43200"))
HTTP_TIMEOUT_SECONDS = int(os.getenv("MARKET_HTTP_TIMEOUT_SECONDS", "12"))
USER_AGENT = "SkillsPathfinder/1.0 (career education project; BLS/O*NET public data)"

_cache: Dict[str, Dict[str, Any]] = {}
_cache_lock = threading.Lock()


def _normalize(value: str) -> str:
    value = html.unescape(str(value or "")).lower()
    value = value.replace("&", " and ")
    value = re.sub(r"[^a-z0-9+.# ]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


# The BLS table uses standard SOC occupation titles while the application uses
# student-friendly career names. Explicit mapping is safer than arbitrary fuzzy
# matching for wages because an incorrect salary is worse than no salary.
CAREER_TO_BLS_TITLE = {
    "electrical engineer": "Electrical engineers",
    "electrical engineering manager": "Architectural and engineering managers",
    "power systems engineer": "Electrical engineers",
    "renewable energy engineer": "Engineers, all other",
    "software test engineer": "Software quality assurance analysts and testers",
    "engineering project manager": "Project management specialists",
    "controls automation engineer": "Electrical engineers",
    "controls/automation engineer": "Electrical engineers",
    "data analyst": "Operations research analysts",
    "registered nurse": "Registered nurses",
    "medical assistant": "Medical assistants",
    "healthcare administrator": "Medical and health services managers",
    "clinical research coordinator": "Natural sciences managers",
    "public health specialist": "Health education specialists",
    "medical laboratory technologist": "Clinical laboratory technologists and technicians",
    "biology research assistant": "Biological technicians",
    "environmental scientist": "Environmental scientists and specialists, including health",
    "business analyst": "Management analysts",
    "business process analyst": "Management analysts",
    "management analyst consultant": "Management analysts",
    "management analyst / consultant": "Management analysts",
    "operations analyst": "Operations research analysts",
    "accountant": "Accountants and auditors",
    "financial analyst": "Financial and investment analysts",
    "human resources specialist": "Human resources specialists",
    "marketing specialist": "Market research analysts and marketing specialists",
    "operations manager": "General and operations managers",
    "supply chain analyst": "Logisticians",
    "instructional coordinator": "Instructional coordinators",
    "historian archivist": "Historians",
    "historian / archivist": "Historians",
    "software developer": "Software developers",
    "cybersecurity analyst": "Information security analysts",
    "cloud support engineer": "Computer network support specialists",
    "data scientist": "Data scientists",
    "machine learning engineer": "Data scientists",
    "database administrator": "Database administrators",
    "network administrator": "Network and computer systems administrators",
    "civil engineer": "Civil engineers",
    "industrial engineer": "Industrial engineers",
    "manufacturing engineer": "Industrial engineers",
    "mechanical engineer": "Mechanical engineers",
    "mechanical design engineer": "Mechanical engineers",
    "product design engineer": "Mechanical engineers",
    "hvac engineer": "Mechanical engineers",
    "project manager": "Project management specialists",
}

# O*NET is more granular than OEWS, so some titles can map directly to the
# student-facing path while others use a close official occupation title.
CAREER_TO_ONET_TITLE = {
    "healthcare administrator": "Medical and Health Services Managers",
    "clinical research coordinator": "Clinical Research Coordinators",
    "public health specialist": "Health Education Specialists",
    "medical laboratory technologist": "Medical and Clinical Laboratory Technologists",
    "biology research assistant": "Biological Technicians",
    "business analyst": "Management Analysts",
    "business process analyst": "Management Analysts",
    "management analyst consultant": "Management Analysts",
    "management analyst / consultant": "Management Analysts",
    "operations analyst": "Operations Research Analysts",
    "business intelligence analyst": "Business Intelligence Analysts",
    "industrial engineer": "Industrial Engineers",
    "manufacturing engineer": "Manufacturing Engineers",
    "mechanical design engineer": "Mechanical Engineers",
    "product design engineer": "Mechanical Engineers",
    "hvac engineer": "Mechanical Engineers",
    "supply chain analyst": "Logisticians",
    "cybersecurity analyst": "Information Security Analysts",
    "cloud support engineer": "Computer Network Support Specialists",
    "machine learning engineer": "Data Scientists",
    "project manager": "Project Management Specialists",
    "engineering project manager": "Project Management Specialists",
    "controls automation engineer": "Electrical Engineers",
    "controls/automation engineer": "Electrical Engineers",
    "power systems engineer": "Electrical Engineers",
    "renewable energy engineer": "Energy Engineers, Except Wind and Solar",
    "historian archivist": "Historians",
    "historian / archivist": "Historians",
}


def _fetch_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/json"})
    with urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        return response.read().decode(response.headers.get_content_charset() or "utf-8", errors="replace")


def _cached(key: str, loader):
    now = time.time()
    with _cache_lock:
        entry = _cache.get(key)
        if entry and now - entry["time"] < CACHE_TTL_SECONDS:
            return entry["value"]
    value = loader()
    with _cache_lock:
        _cache[key] = {"time": now, "value": value}
    return value


def parse_bls_oews_table(raw_html: str) -> Dict[str, Dict[str, Any]]:
    """Parse BLS OEWS Table 1 into a normalized-title lookup.

    Table columns are: employment, mean hourly wage, mean annual wage, and
    median hourly wage. The parser deliberately requires all numeric columns so
    headings and aggregate prose cannot be mistaken for occupation records.
    """
    text = html.unescape(raw_html or "")
    text = re.sub(r"<script\b[^>]*>.*?</script>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<style\b[^>]*>.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", "", text)

    records: Dict[str, Dict[str, Any]] = {}
    row_pattern = re.compile(
        r"^\s*(?P<title>[A-Za-z][A-Za-z0-9 ,/&'()\-–—]+?)\.{3,}\s*"
        r"(?P<employment>[\d,]+)\s+"
        r"(?P<mean_hourly>\d+(?:\.\d+)?)\s+"
        r"(?P<mean_annual>[\d,]+)\s+"
        r"(?P<median_hourly>\d+(?:\.\d+)?)\s*$"
    )

    for line in text.splitlines():
        match = row_pattern.match(line)
        if not match:
            continue
        title = re.sub(r"\s+", " ", match.group("title")).strip()
        records[_normalize(title)] = {
            "occupation_title": title,
            "employment": int(match.group("employment").replace(",", "")),
            "mean_hourly_wage": float(match.group("mean_hourly")),
            "mean_annual_wage": int(match.group("mean_annual").replace(",", "")),
            "median_hourly_wage": float(match.group("median_hourly")),
        }
    return records


def _bls_records() -> Dict[str, Dict[str, Any]]:
    return _cached("bls-oews", lambda: parse_bls_oews_table(_fetch_text(BLS_OEWS_URL)))


def _onet_rows():
    def load():
        payload = json.loads(_fetch_text(ONET_OCCUPATION_DATA_URL))
        rows = payload.get("row", []) if isinstance(payload, dict) else []
        return [row for row in rows if isinstance(row, dict) and row.get("title")]
    return _cached("onet-occupations", load)


def _mapped_title(career_title: str, mapping: Dict[str, str]) -> Optional[str]:
    normalized = _normalize(career_title)
    return mapping.get(normalized)


def lookup_bls_market(career_title: str) -> Dict[str, Any]:
    mapped = _mapped_title(career_title, CAREER_TO_BLS_TITLE)
    if not mapped:
        return {
            "available": False,
            "reason": "No conservative BLS occupation mapping is configured for this career yet.",
            "source": BLS_SOURCE_NAME,
            "source_period": BLS_OEWS_PERIOD,
            "source_url": BLS_OEWS_URL,
        }

    records = _bls_records()
    record = records.get(_normalize(mapped))
    if not record:
        return {
            "available": False,
            "reason": f"The mapped BLS occupation '{mapped}' was not found in the current wage table.",
            "mapped_occupation": mapped,
            "source": BLS_SOURCE_NAME,
            "source_period": BLS_OEWS_PERIOD,
            "source_url": BLS_OEWS_URL,
        }

    return {
        "available": True,
        **record,
        "mapped_occupation": mapped,
        "mapping_method": "explicit_conservative_mapping",
        "source": BLS_SOURCE_NAME,
        "source_period": BLS_OEWS_PERIOD,
        "source_url": BLS_OEWS_URL,
    }


def lookup_onet_occupation(career_title: str) -> Dict[str, Any]:
    target = _mapped_title(career_title, CAREER_TO_ONET_TITLE) or career_title
    target_norm = _normalize(target)
    rows = _onet_rows()

    exact = next((row for row in rows if _normalize(row.get("title")) == target_norm), None)
    if exact:
        best = exact
        method = "explicit_or_exact_title"
        score = 1.0
    else:
        ranked = sorted(
            ((SequenceMatcher(None, target_norm, _normalize(row.get("title"))).ratio(), row) for row in rows),
            key=lambda item: item[0],
            reverse=True,
        )
        score, best = ranked[0] if ranked else (0.0, None)
        method = "title_similarity"

    if not best or score < 0.70:
        return {
            "available": False,
            "reason": "No sufficiently close O*NET occupation match was found.",
            "source": ONET_SOURCE_NAME,
            "source_release": ONET_RELEASE,
            "source_url": ONET_OCCUPATION_DATA_URL,
        }

    return {
        "available": True,
        "onet_soc_code": best.get("onetsoc_code"),
        "occupation_title": best.get("title"),
        "description": best.get("description"),
        "match_score": round(score, 4),
        "mapping_method": method,
        "source": ONET_SOURCE_NAME,
        "source_release": ONET_RELEASE,
        "source_url": ONET_OCCUPATION_DATA_URL,
    }


def get_market_intelligence(career_title: str) -> Dict[str, Any]:
    """Return independent BLS and O*NET evidence without making either mandatory."""
    result: Dict[str, Any] = {
        "career_title": career_title,
        "retrieved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "bls": None,
        "onet": None,
        "warnings": [],
    }

    try:
        result["bls"] = lookup_bls_market(career_title)
    except Exception as exc:
        result["bls"] = {
            "available": False,
            "reason": f"BLS lookup unavailable: {exc}",
            "source": BLS_SOURCE_NAME,
            "source_period": BLS_OEWS_PERIOD,
            "source_url": BLS_OEWS_URL,
        }
        result["warnings"].append("BLS market data could not be refreshed; career matching is unaffected.")

    try:
        result["onet"] = lookup_onet_occupation(career_title)
    except Exception as exc:
        result["onet"] = {
            "available": False,
            "reason": f"O*NET lookup unavailable: {exc}",
            "source": ONET_SOURCE_NAME,
            "source_release": ONET_RELEASE,
            "source_url": ONET_OCCUPATION_DATA_URL,
        }
        result["warnings"].append("O*NET occupation detail could not be refreshed; career matching is unaffected.")

    result["available"] = bool(result["bls"].get("available") or result["onet"].get("available"))
    return result
