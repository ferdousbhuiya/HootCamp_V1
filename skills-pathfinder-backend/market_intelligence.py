"""Authoritative, no-paid-key market intelligence for Skills Pathfinder.

Market lookup is intentionally separate from resume processing. If BLS or O*NET
is unavailable, recommendation generation still succeeds and the frontend can
fall back to catalog reference values.
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

BLS_API_URL = os.getenv("BLS_API_URL", "https://api.bls.gov/publicAPI/v2/timeseries/data/")
BLS_OEWS_URL = os.getenv("BLS_OEWS_URL", "https://www.bls.gov/news.release/ocwage.t01.htm")
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
USER_AGENT = "Mozilla/5.0 SkillsPathfinder/1.0"

_cache: Dict[str, Dict[str, Any]] = {}
_cache_lock = threading.Lock()


def _normalize(value: str) -> str:
    value = html.unescape(str(value or "")).lower().replace("&", " and ")
    value = re.sub(r"[^a-z0-9+.# ]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


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

BLS_TITLE_TO_OCCUPATION_CODE = {
    "Electrical engineers": "172071",
    "Architectural and engineering managers": "119041",
    "Engineers, all other": "172199",
    "Software quality assurance analysts and testers": "151253",
    "Project management specialists": "131082",
    "Operations research analysts": "152031",
    "Registered nurses": "291141",
    "Medical assistants": "319092",
    "Medical and health services managers": "119111",
    "Natural sciences managers": "119121",
    "Health education specialists": "211091",
    "Clinical laboratory technologists and technicians": "292010",
    "Biological technicians": "194021",
    "Environmental scientists and specialists, including health": "192041",
    "Management analysts": "131111",
    "Accountants and auditors": "132011",
    "Financial and investment analysts": "132051",
    "Human resources specialists": "131071",
    "Market research analysts and marketing specialists": "131161",
    "General and operations managers": "111021",
    "Logisticians": "131081",
    "Instructional coordinators": "252031",
    "Historians": "193093",
    "Software developers": "151252",
    "Information security analysts": "151212",
    "Computer network support specialists": "151232",
    "Data scientists": "152051",
    "Database administrators": "151241",
    "Network and computer systems administrators": "151244",
    "Civil engineers": "172051",
    "Industrial engineers": "172112",
    "Mechanical engineers": "172141",
}

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
    request = Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
    })
    with urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        return response.read().decode(response.headers.get_content_charset() or "utf-8", errors="replace")


def _post_json(url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    request = Request(
        url,
        data=body,
        method="POST",
        headers={"User-Agent": USER_AGENT, "Content-Type": "application/json", "Accept": "application/json"},
    )
    with urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


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
    text = html.unescape(raw_html or "")
    text = re.sub(r"<script\b[^>]*>.*?</script>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<style\b[^>]*>.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", "", text)
    records: Dict[str, Dict[str, Any]] = {}
    row_pattern = re.compile(
        r"^\s*(?P<title>[A-Za-z][A-Za-z0-9 ,/&'()\-–—]+?)\.{3,}\s*"
        r"(?P<employment>[\d,]+)\s+"
        r"\$?(?P<mean_hourly>\d+(?:\.\d+)?)\s+"
        r"\$?(?P<mean_annual>[\d,]+)\s+"
        r"\$?(?P<median_hourly>\d+(?:\.\d+)?)\s*$"
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


def _bls_series_id(occupation_code: str, datatype_code: str) -> str:
    return f"OEUN0000000{'000000'}{occupation_code}{datatype_code}"


def _bls_api_record(mapped_title: str) -> Optional[Dict[str, Any]]:
    occupation_code = BLS_TITLE_TO_OCCUPATION_CODE.get(mapped_title)
    if not occupation_code:
        return None
    employment_id = _bls_series_id(occupation_code, "01")
    annual_mean_id = _bls_series_id(occupation_code, "04")
    payload = _post_json(BLS_API_URL, {"seriesid": [employment_id, annual_mean_id]})
    if payload.get("status") != "REQUEST_SUCCEEDED":
        raise RuntimeError("BLS public API request did not succeed")
    values: Dict[str, Dict[str, Any]] = {}
    for series in (payload.get("Results") or {}).get("series", []):
        series_id = series.get("seriesID")
        data = series.get("data") or []
        if not data:
            continue
        item = data[0]
        values[series_id] = item
    employment_item = values.get(employment_id)
    wage_item = values.get(annual_mean_id)
    if not employment_item or not wage_item:
        return None
    try:
        employment = int(float(str(employment_item.get("value", "")).replace(",", "")))
        annual_wage = int(float(str(wage_item.get("value", "")).replace(",", "")))
    except (TypeError, ValueError):
        return None
    year = wage_item.get("year") or employment_item.get("year")
    return {
        "occupation_title": mapped_title,
        "employment": employment,
        "mean_annual_wage": annual_wage,
        "source_year": year,
        "series_ids": {"employment": employment_id, "mean_annual_wage": annual_mean_id},
    }


def _bls_records() -> Dict[str, Dict[str, Any]]:
    return _cached("bls-oews-html", lambda: parse_bls_oews_table(_fetch_text(BLS_OEWS_URL)))


def _onet_rows():
    def load():
        payload = json.loads(_fetch_text(ONET_OCCUPATION_DATA_URL))
        rows = payload.get("row", []) if isinstance(payload, dict) else []
        return [row for row in rows if isinstance(row, dict) and row.get("title")]
    return _cached("onet-occupations", load)


def _mapped_title(career_title: str, mapping: Dict[str, str]) -> Optional[str]:
    return mapping.get(_normalize(career_title))


def lookup_bls_market(career_title: str) -> Dict[str, Any]:
    mapped = _mapped_title(career_title, CAREER_TO_BLS_TITLE)
    if not mapped:
        return {
            "available": False,
            "reason": "No conservative BLS occupation mapping is configured for this career yet.",
            "source": BLS_SOURCE_NAME,
            "source_period": BLS_OEWS_PERIOD,
            "source_url": BLS_API_URL,
        }

    api_error = None
    try:
        record = _cached(f"bls-api:{mapped}", lambda: _bls_api_record(mapped))
        if record:
            return {
                "available": True,
                **record,
                "mapped_occupation": mapped,
                "mapping_method": "explicit_conservative_mapping",
                "retrieval_method": "bls_public_api",
                "source": BLS_SOURCE_NAME,
                "source_period": f"May {record.get('source_year')}" if record.get("source_year") else BLS_OEWS_PERIOD,
                "source_url": BLS_API_URL,
            }
    except Exception as exc:
        api_error = str(exc)

    try:
        records = _bls_records()
        record = records.get(_normalize(mapped))
        if record:
            return {
                "available": True,
                **record,
                "mapped_occupation": mapped,
                "mapping_method": "explicit_conservative_mapping",
                "retrieval_method": "bls_html_fallback",
                "source": BLS_SOURCE_NAME,
                "source_period": BLS_OEWS_PERIOD,
                "source_url": BLS_OEWS_URL,
            }
    except Exception as html_exc:
        return {
            "available": False,
            "reason": f"BLS API unavailable ({api_error or 'no data'}); HTML fallback unavailable ({html_exc}).",
            "mapped_occupation": mapped,
            "source": BLS_SOURCE_NAME,
            "source_period": BLS_OEWS_PERIOD,
            "source_url": BLS_API_URL,
        }

    return {
        "available": False,
        "reason": f"The mapped BLS occupation '{mapped}' was not found. API detail: {api_error or 'no current data returned'}.",
        "mapped_occupation": mapped,
        "source": BLS_SOURCE_NAME,
        "source_period": BLS_OEWS_PERIOD,
        "source_url": BLS_API_URL,
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
            key=lambda item: item[0], reverse=True,
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
            "source_url": BLS_API_URL,
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
