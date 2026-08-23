"""Generic market-title resolution for dynamically discovered careers.

Specialty job titles often do not exist as separate OEWS occupations. This layer first
uses O*NET to resolve a detailed occupation and then uses its base SOC for BLS/OEWS wage
and employment data. If a specialty title is too colloquial for direct O*NET matching,
a small Groq call supplies only an occupational-family hint; the hint is then validated
against O*NET before any BLS figures are returned.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, Optional

from fastapi import Query

import market_intelligence as market


def _soc_to_bls_code(soc: Optional[str]) -> Optional[str]:
    text = str(soc or "").split(".", 1)[0]
    digits = re.sub(r"\D", "", text)
    return digits if len(digits) == 6 else None


def _bls_from_soc(soc: str, occupation_title: str) -> Optional[Dict[str, Any]]:
    code = _soc_to_bls_code(soc)
    if not code:
        return None
    employment_id = market._bls_series_id(code, "01")
    annual_mean_id = market._bls_series_id(code, "04")
    payload = market._post_json(market.BLS_API_URL, {"seriesid": [employment_id, annual_mean_id]})
    if payload.get("status") != "REQUEST_SUCCEEDED":
        return None
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
    return {
        "available": True,
        "occupation_title": occupation_title,
        "occupation_code": code,
        "soc_code": market._soc_from_bls_code(code),
        "employment": employment,
        "mean_annual_wage": annual_wage,
        "source_year": wage.get("year") or emp.get("year"),
        "series_ids": {"employment": employment_id, "mean_annual_wage": annual_mean_id},
        "mapped_occupation": occupation_title,
        "mapping_method": "onet_validated_soc_family",
        "retrieval_method": "bls_public_api",
        "source": market.BLS_SOURCE_NAME,
        "source_period": f"May {wage.get('year') or emp.get('year')}" if (wage.get("year") or emp.get("year")) else market.BLS_OEWS_PERIOD,
        "source_url": market.BLS_API_URL,
    }


def _crosswalk_result(requested_title: str, onet: Dict[str, Any], bls: Dict[str, Any], resolution: Dict[str, Any]) -> Dict[str, Any]:
    result = {
        "career_title": requested_title,
        "retrieved_at": market.time.strftime("%Y-%m-%dT%H:%M:%SZ", market.time.gmtime()),
        "bls": bls,
        "onet": onet,
        "warnings": [],
        "title_resolution": resolution,
    }
    result["crosswalk"] = market._build_crosswalk(requested_title, bls, onet)
    result["available"] = bool(bls.get("available") or onet.get("available"))
    return result


def _direct_onet_soc_resolution(career_title: str) -> Optional[Dict[str, Any]]:
    try:
        onet = market.lookup_onet_occupation(career_title)
    except Exception:
        return None
    if not onet.get("available") or not onet.get("base_soc_code"):
        return None
    try:
        bls = _bls_from_soc(onet["base_soc_code"], onet.get("occupation_title") or career_title)
    except Exception:
        bls = None
    if not bls:
        return None
    return _crosswalk_result(career_title, onet, bls, {
        "method": "direct_onet_to_bls_soc",
        "requested_title": career_title,
        "resolved_title": onet.get("occupation_title"),
        "validated_soc": onet.get("base_soc_code"),
    })


async def _ai_family_resolution(career_title: str, resilient_llm_generate) -> Optional[Dict[str, Any]]:
    prompt = f"""Map this job title or specialty to the closest broad U.S. O*NET/SOC occupation family used for official labor-market statistics.
Do not provide salary, employment numbers, or a SOC code. Do not invent a new occupation.
Return only JSON: {{"occupation_title_hint":"","reason":""}}.
JOB TITLE: {career_title}"""
    try:
        raw = await resilient_llm_generate(prompt, max_tokens_override=300)
        payload = json.loads(raw)
        hint = str(payload.get("occupation_title_hint") or "").strip()
    except Exception:
        return None
    if not hint:
        return None
    try:
        onet = market.lookup_onet_occupation(hint)
    except Exception:
        return None
    if not onet.get("available") or not onet.get("base_soc_code"):
        return None
    try:
        bls = _bls_from_soc(onet["base_soc_code"], onet.get("occupation_title") or hint)
    except Exception:
        return None
    if not bls:
        return None
    return _crosswalk_result(career_title, onet, bls, {
        "method": "ai_hint_validated_by_onet_soc",
        "requested_title": career_title,
        "occupation_title_hint": hint,
        "resolved_title": onet.get("occupation_title"),
        "validated_soc": onet.get("base_soc_code"),
        "reason": str(payload.get("reason") or "").strip(),
    })


def install_generic_market_route(app, resilient_llm_generate):
    async def generic_market_data(career_title: str = Query(..., min_length=2, max_length=180)):
        # Preserve existing exact/conservative mappings when they already work.
        direct = market.get_market_intelligence(career_title)
        if (direct.get("bls") or {}).get("available"):
            direct["title_resolution"] = {"method": "existing_confirmed_mapping", "requested_title": career_title}
            return {"status": "success", "market_data": direct}

        # Generic path 1: detailed O*NET occupation -> base SOC -> OEWS.
        resolved = _direct_onet_soc_resolution(career_title)
        if resolved:
            return {"status": "success", "market_data": resolved}

        # Generic path 2: colloquial/specialty title -> AI family hint -> O*NET validation -> OEWS.
        resolved = await _ai_family_resolution(career_title, resilient_llm_generate)
        if resolved:
            return {"status": "success", "market_data": resolved}

        direct.setdefault("title_resolution", {"method": "unresolved", "requested_title": career_title})
        return {"status": "success", "market_data": direct}

    app.router.routes = [
        route for route in app.router.routes
        if not (getattr(route, "path", None) == "/api/market-data" and "GET" in getattr(route, "methods", set()))
    ]
    app.add_api_route("/api/market-data", generic_market_data, methods=["GET"], tags=["market"])
    return generic_market_data
