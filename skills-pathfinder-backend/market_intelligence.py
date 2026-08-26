"""Authoritative, no-paid-key market intelligence for Skills Pathfinder.

BLS supplies wage/employment statistics and O*NET supplies occupational detail.
The two sources may legitimately use different levels of occupational specificity,
so the service returns explicit crosswalk metadata instead of silently mixing labels.
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
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BLS_API_URL = os.getenv("BLS_API_URL", "https://api.bls.gov/publicAPI/v2/timeseries/data/")
BLS_OEWS_URL = os.getenv("BLS_OEWS_URL", "https://www.bls.gov/news.release/ocwage.t01.htm")
BLS_OEWS_PERIOD = "May 2025"
BLS_SOURCE_NAME = "U.S. Bureau of Labor Statistics Occupational Employment and Wage Statistics"
ONET_OCCUPATION_DATA_URL = os.getenv("ONET_OCCUPATION_DATA_URL", "https://www.onetcenter.org/dl_files/database/db_30_3_json/occupation_data.json")
ONET_RELEASE = "30.3"
ONET_SOURCE_NAME = "O*NET Database, U.S. Department of Labor/ETA"
CACHE_TTL_SECONDS = int(os.getenv("MARKET_CACHE_TTL_SECONDS", "43200"))
HTTP_TIMEOUT_SECONDS = int(os.getenv("MARKET_HTTP_TIMEOUT_SECONDS", "12"))
HTTP_FETCH_RETRIES = max(1, int(os.getenv("MARKET_HTTP_FETCH_RETRIES", "2")))
USER_AGENT = os.getenv(
    "MARKET_HTTP_USER_AGENT",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
)

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
    "Electrical engineers": "172071", "Architectural and engineering managers": "119041",
    "Engineers, all other": "172199", "Software quality assurance analysts and testers": "151253",
    "Project management specialists": "131082", "Operations research analysts": "152031",
    "Registered nurses": "291141", "Medical assistants": "319092",
    "Medical and health services managers": "119111", "Natural sciences managers": "119121",
    "Health education specialists": "211091", "Clinical laboratory technologists and technicians": "292010",
    "Biological technicians": "194021", "Environmental scientists and specialists, including health": "192041",
    "Management analysts": "131111", "Accountants and auditors": "132011",
    "Financial and investment analysts": "132051", "Human resources specialists": "131071",
    "Market research analysts and marketing specialists": "131161", "General and operations managers": "111021",
    "Logisticians": "131081", "Instructional coordinators": "252031", "Historians": "193093",
    "Software developers": "151252", "Information security analysts": "151212",
    "Computer network support specialists": "151232", "Data scientists": "152051",
    "Database administrators": "151241", "Network and computer systems administrators": "151244",
    "Civil engineers": "172051", "Industrial engineers": "172112", "Mechanical engineers": "172141",
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
    """Fetch public market/reference text with bounded retries.

    Some public labor-data endpoints occasionally reject automated requests or fail
    transiently. Retry a small number of times with normal browser request headers.
    Callers still degrade to unavailable data if the source remains unreachable.
    """
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }
    last_error = None
    for attempt in range(HTTP_FETCH_RETRIES):
        try:
            req = Request(url, headers=headers)
            with urlopen(req, timeout=HTTP_TIMEOUT_SECONDS) as response:
                return response.read().decode(response.headers.get_content_charset() or "utf-8", errors="replace")
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt + 1 < HTTP_FETCH_RETRIES:
                time.sleep(0.35 * (attempt + 1))
    if last_error:
        raise last_error
    raise RuntimeError(f"Unable to fetch market source: {url}")


def _post_json(url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    req = Request(url, data=json.dumps(payload).encode("utf-8"), method="POST", headers={"User-Agent": USER_AGENT, "Content-Type": "application/json", "Accept": "application/json"})
    with urlopen(req, timeout=HTTP_TIMEOUT_SECONDS) as response:
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
    row_pattern = re.compile(r"^\s*(?P<title>[A-Za-z][A-Za-z0-9 ,/&'()\-–—]+?)\.{3,}\s*(?P<employment>[\d,]+)\s+\$?(?P<mean_hourly>\d+(?:\.\d+)?)\s+\$?(?P<mean_annual>[\d,]+)\s+\$?(?P<median_hourly>\d+(?:\.\d+)?)\s*$")
    for line in text.splitlines():
        match = row_pattern.match(line)
        if match:
            title = re.sub(r"\s+", " ", match.group("title")).strip()
            records[_normalize(title)] = {"occupation_title": title, "employment": int(match.group("employment").replace(",", "")), "mean_hourly_wage": float(match.group("mean_hourly")), "mean_annual_wage": int(match.group("mean_annual").replace(",", "")), "median_hourly_wage": float(match.group("median_hourly"))}
    return records


def _bls_series_id(occupation_code: str, datatype_code: str) -> str:
    return f"OEUN0000000000000{occupation_code}{datatype_code}"


def _soc_from_bls_code(code: Optional[str]) -> Optional[str]:
    if not code or len(code) != 6 or not code.isdigit():
        return None
    return f"{code[:2]}-{code[2:]}"


def _onet_base_soc(code: Optional[str]) -> Optional[str]:
    if not code:
        return None
    return str(code).split(".", 1)[0]


def _bls_api_record(mapped_title: str) -> Optional[Dict[str, Any]]:
    occupation_code = BLS_TITLE_TO_OCCUPATION_CODE.get(mapped_title)
    if not occupation_code:
        return None
    employment_id = _bls_series_id(occupation_code, "01")
    annual_mean_id = _bls_series_id(occupation_code, "04")
    payload = _post_json(BLS_API_URL, {"seriesid": [employment_id, annual_mean_id]})
    if payload.get("status") != "REQUEST_SUCCEEDED":
        raise RuntimeError("BLS public API request did not succeed")
    values = {}
    for series in (payload.get("Results") or {}).get("series", []):
        if series.get("data"):
            values[series.get("seriesID")] = series["data"][0]
    emp, wage = values.get(employment_id), values.get(annual_mean_id)
    if not emp or not wage:
        return None
    try:
        employment = int(float(str(emp.get("value", "")).replace(",", "")))
        annual_wage = int(float(str(wage.get("value", "")).replace(",", "")))
    except (TypeError, ValueError):
        return None
    return {"occupation_title": mapped_title, "occupation_code": occupation_code, "soc_code": _soc_from_bls_code(occupation_code), "employment": employment, "mean_annual_wage": annual_wage, "source_year": wage.get("year") or emp.get("year"), "series_ids": {"employment": employment_id, "mean_annual_wage": annual_mean_id}}


def _bls_records() -> Dict[str, Dict[str, Any]]:
    """Return parsed BLS rows, caching only successful non-empty responses.

    A blocked/failed BLS request must not poison market intelligence for the full
    cache TTL. When the source becomes reachable, the next request can recover.
    """
    key = "bls-oews-html"
    now = time.time()
    with _cache_lock:
        entry = _cache.get(key)
        if entry and now - entry["time"] < CACHE_TTL_SECONDS and entry.get("value"):
            return entry["value"]
    try:
        records = parse_bls_oews_table(_fetch_text(BLS_OEWS_URL))
    except Exception:
        return {}
    if records:
        with _cache_lock:
            _cache[key] = {"time": now, "value": records}
    return records


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
        return {"available": False, "reason": "No conservative BLS occupation mapping is configured for this career yet.", "source": BLS_SOURCE_NAME, "source_period": BLS_OEWS_PERIOD, "source_url": BLS_API_URL}
    api_error = None
    try:
        record = _cached(f"bls-api:{mapped}", lambda: _bls_api_record(mapped))
        if record:
            return {"available": True, **record, "mapped_occupation": mapped, "mapping_method": "explicit_conservative_mapping", "retrieval_method": "bls_public_api", "source": BLS_SOURCE_NAME, "source_period": f"May {record.get('source_year')}" if record.get("source_year") else BLS_OEWS_PERIOD, "source_url": BLS_API_URL}
    except Exception as exc:
        api_error = str(exc)
    try:
        record = _bls_records().get(_normalize(mapped))
        if record:
            occupation_code = BLS_TITLE_TO_OCCUPATION_CODE.get(mapped)
            return {"available": True, **record, "occupation_code": occupation_code, "soc_code": _soc_from_bls_code(occupation_code), "mapped_occupation": mapped, "mapping_method": "explicit_conservative_mapping", "retrieval_method": "bls_html_fallback", "source": BLS_SOURCE_NAME, "source_period": BLS_OEWS_PERIOD, "source_url": BLS_OEWS_URL}
    except Exception as html_exc:
        return {"available": False, "reason": f"BLS market source unavailable: {html_exc}", "source": BLS_SOURCE_NAME, "source_period": BLS_OEWS_PERIOD, "source_url": BLS_OEWS_URL}
    reason = "BLS public API did not return the mapped occupation series, and the official OEWS table fallback did not contain the mapped title."
    if api_error:
        reason += " Live API access may be temporarily unavailable."
    return {"available": False, "reason": reason, "source": BLS_SOURCE_NAME, "source_period": BLS_OEWS_PERIOD, "source_url": BLS_OEWS_URL}


def lookup_onet_occupation(career_title: str) -> Dict[str, Any]:
    requested = str(career_title or "").strip()
    mapped = _mapped_title(requested, CAREER_TO_ONET_TITLE)
    target = mapped or requested
    try:
        rows = _onet_rows()
    except Exception as exc:
        return {"available": False, "reason": f"O*NET occupation data unavailable: {exc}", "source": ONET_SOURCE_NAME, "source_release": ONET_RELEASE, "source_url": ONET_OCCUPATION_DATA_URL}
    target_norm = _normalize(target)
    best_row, best_score = None, 0.0
    for row in rows:
        title_norm = _normalize(row.get("title"))
        if title_norm == target_norm:
            best_row, best_score = row, 1.0
            break
        score = SequenceMatcher(None, target_norm, title_norm).ratio()
        if score > best_score:
            best_row, best_score = row, score
    if not best_row or best_score < (0.74 if mapped else 0.88):
        return {"available": False, "reason": "No sufficiently confident O*NET occupation mapping was found.", "source": ONET_SOURCE_NAME, "source_release": ONET_RELEASE, "source_url": ONET_OCCUPATION_DATA_URL}
    code = str(best_row.get("code") or "")
    return {"available": True, "occupation_title": best_row.get("title"), "onet_soc_code": code, "base_soc_code": _onet_base_soc(code), "description": best_row.get("description"), "mapping_method": "explicit_title_mapping" if mapped else "high_confidence_title_match", "match_confidence": round(best_score, 3), "source": ONET_SOURCE_NAME, "source_release": ONET_RELEASE, "source_url": ONET_OCCUPATION_DATA_URL}


def _build_crosswalk(career_title: str, bls: Dict[str, Any], onet: Dict[str, Any]) -> Dict[str, Any]:
    bls_title = bls.get("occupation_title") or bls.get("mapped_occupation")
    onet_title = onet.get("occupation_title")
    bls_soc, onet_soc = bls.get("soc_code"), onet.get("base_soc_code")
    same_soc = bool(bls_soc and onet_soc and bls_soc == onet_soc)
    same_title = bool(bls_title and onet_title and _normalize(bls_title) == _normalize(onet_title))
    if bls.get("available") and onet.get("available"):
        relationship = "same_occupation_title" if same_title else ("same_soc_family_different_detail" if same_soc else "different_confirmed_mappings")
    elif bls.get("available"):
        relationship = "bls_only"
    elif onet.get("available"):
        relationship = "onet_only"
    else:
        relationship = "unmapped"
    return {"requested_career": career_title, "relationship": relationship, "same_soc_family": same_soc, "bls_occupation_title": bls_title, "bls_soc_code": bls_soc, "onet_occupation_title": onet_title, "onet_soc_code": onet.get("onet_soc_code"), "onet_base_soc_code": onet_soc}


def get_market_intelligence(career_title: str) -> Dict[str, Any]:
    bls = lookup_bls_market(career_title)
    onet = lookup_onet_occupation(career_title)
    return {"requested_career": career_title, "bls": bls, "onet": onet, "crosswalk": _build_crosswalk(career_title, bls, onet)}
