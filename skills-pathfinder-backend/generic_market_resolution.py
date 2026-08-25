"""Generic market-title resolution for dynamically discovered careers.

Specialty titles are resolved to an O*NET occupation first, then to the validated base
SOC used for BLS/OEWS data. When the public BLS API is unavailable, the published OEWS
table is matched generically by occupation title instead of relying on a small hard-coded
career list. Groq may suggest an occupation-family title, but every result is validated by
O*NET before any BLS wage or employment figure is returned.
"""
from __future__ import annotations

import json
import re
from difflib import SequenceMatcher
from typing import Any, Dict, Optional

from fastapi import Query

import market_intelligence as market


def _soc_to_bls_code(soc: Optional[str]) -> Optional[str]:
    text = str(soc or "").split(".", 1)[0]
    digits = re.sub(r"\D", "", text)
    return digits if len(digits) == 6 else None


def _title_tokens(value: str) -> set[str]:
    tokens = []
    for token in market._normalize(value).split():
        if len(token) <= 2:
            continue
        if len(token) > 4 and token.endswith("ies"):
            token = token[:-3] + "y"
        elif len(token) > 4 and token.endswith("es"):
            token = token[:-2]
        elif len(token) > 3 and token.endswith("s"):
            token = token[:-1]
        tokens.append(token)
    return set(tokens)


def _best_bls_html_record(occupation_title: str) -> Optional[Dict[str, Any]]:
    """Find the published OEWS row matching an O*NET occupation title.

    O*NET and OEWS labels are frequently nearly identical but not byte-for-byte equal.
    Matching is conservative: exact normalized title wins; otherwise a high token overlap
    and string-similarity threshold is required.
    """
    try:
        records = market._bls_records()
    except Exception:
        return None
    if not records:
        return None

    wanted_norm = market._normalize(occupation_title)
    exact = records.get(wanted_norm)
    if exact:
        return exact

    wanted_tokens = _title_tokens(occupation_title)
    if not wanted_tokens:
        return None

    best = None
    best_score = 0.0
    for row in records.values():
        row_title = str(row.get("occupation_title") or "")
        row_tokens = _title_tokens(row_title)
        if not row_tokens:
            continue
        overlap = len(wanted_tokens & row_tokens) / max(1, len(wanted_tokens | row_tokens))
        similarity = SequenceMatcher(None, wanted_norm, market._normalize(row_title)).ratio()
        score = 0.72 * overlap + 0.28 * similarity
        if overlap >= 0.55 and similarity >= 0.58 and score > best_score:
            best, best_score = row, score
    return best


def _bls_html_fallback_for_soc(code: str, occupation_title: str) -> Optional[Dict[str, Any]]:
    record = _best_bls_html_record(occupation_title)
    if not record:
        # Preserve support for known explicit mappings when the O*NET/BLS labels differ.
        known_title = next((title for title, known_code in market.BLS_TITLE_TO_OCCUPATION_CODE.items() if known_code == code), None)
        if known_title:
            try:
                record = market._bls_records().get(market._normalize(known_title))
            except Exception:
                record = None
    if not record:
        return None

    mapped_title = record.get("occupation_title") or occupation_title
    return {
        "available": True,
        **record,
        "occupation_title": mapped_title,
        "occupation_code": code,
        "soc_code": market._soc_from_bls_code(code),
        "mapped_occupation": mapped_title,
        "mapping_method": "onet_validated_soc_family",
        "retrieval_method": "bls_html_title_family_fallback",
        "source": market.BLS_SOURCE_NAME,
        "source_period": market.BLS_OEWS_PERIOD,
        "source_url": market.BLS_OEWS_URL,
    }


def _bls_from_soc(soc: str, occupation_title: str) -> Optional[Dict[str, Any]]:
    code = _soc_to_bls_code(soc)
    if not code:
        return None
    employment_id = market._bls_series_id(code, "01")
    annual_mean_id = market._bls_series_id(code, "04")
    try:
        payload = market._post_json(market.BLS_API_URL, {"seriesid": [employment_id, annual_mean_id]})
        if payload.get("status") == "REQUEST_SUCCEEDED":
            values = {}
            for series in (payload.get("Results") or {}).get("series", []):
                if series.get("data"):
                    values[series.get("seriesID")] = series["data"][0]
            emp, wage = values.get(employment_id), values.get(annual_mean_id)
            if emp and wage:
                try:
                    employment = int(float(str(emp.get("value", "")).replace(",", "")))
                    annual_wage = int(float(str(wage.get("value", "")).replace(",", "")))
                except (TypeError, ValueError):
                    employment = annual_wage = None
                if employment is not None and annual_wage is not None:
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
    except Exception:
        pass
    return _bls_html_fallback_for_soc(code, occupation_title)


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
    bls = _bls_from_soc(onet["base_soc_code"], onet.get("occupation_title") or career_title)
    if not bls:
        return None
    return _crosswalk_result(career_title, onet, bls, {
        "method": "direct_onet_to_bls_soc",
        "requested_title": career_title,
        "resolved_title": onet.get("occupation_title"),
        "validated_soc": onet.get("base_soc_code"),
    })


def _stem_token(token: str) -> str:
    token = re.sub(r"[^a-z0-9]+", "", token.lower())
    if len(token) > 4 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 4 and token.endswith("es"):
        return token[:-2]
    if len(token) > 3 and token.endswith("s"):
        return token[:-1]
    return token


def _lexical_onet_family_resolution(career_title: str) -> Optional[Dict[str, Any]]:
    try:
        rows = market._onet_rows()
    except Exception:
        return None
    requested_norm = market._normalize(career_title)
    requested_tokens = {_stem_token(t) for t in requested_norm.split() if len(_stem_token(t)) >= 3}
    if not requested_tokens:
        return None

    ranked = []
    for row in rows:
        title = str(row.get("title") or "")
        description = str(row.get("description") or "")
        title_norm = market._normalize(title)
        title_tokens = {_stem_token(t) for t in title_norm.split() if len(_stem_token(t)) >= 3}
        description_tokens = {_stem_token(t) for t in market._normalize(description).split() if len(_stem_token(t)) >= 3}
        title_overlap = len(requested_tokens & title_tokens)
        context_overlap = len(requested_tokens & description_tokens)
        if title_overlap == 0 and context_overlap == 0:
            continue
        similarity = SequenceMatcher(None, requested_norm, title_norm).ratio()
        score = (3.0 * title_overlap) + (0.8 * context_overlap) + similarity
        ranked.append((score, row))

    for _, row in sorted(ranked, key=lambda item: item[0], reverse=True)[:12]:
        base_soc = market._onet_base_soc(row.get("onetsoc_code"))
        if not base_soc:
            continue
        bls = _bls_from_soc(base_soc, row.get("title") or career_title)
        if not bls:
            continue
        onet = {
            "available": True,
            "onet_soc_code": row.get("onetsoc_code"),
            "base_soc_code": base_soc,
            "occupation_title": row.get("title"),
            "description": row.get("description"),
            "match_score": None,
            "mapping_method": "lexical_title_description_family",
            "source": market.ONET_SOURCE_NAME,
            "source_release": market.ONET_RELEASE,
            "source_url": market.ONET_OCCUPATION_DATA_URL,
        }
        return _crosswalk_result(career_title, onet, bls, {
            "method": "lexical_onet_family_validated_by_bls",
            "requested_title": career_title,
            "resolved_title": row.get("title"),
            "validated_soc": base_soc,
        })
    return None


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
    bls = _bls_from_soc(onet["base_soc_code"], onet.get("occupation_title") or hint)
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


def _safe_existing_market(career_title: str) -> Dict[str, Any]:
    try:
        result = market.get_market_intelligence(career_title)
        return result if isinstance(result, dict) else {}
    except Exception as exc:
        return {
            "career_title": career_title,
            "bls": {"available": False, "reason": f"Initial market lookup unavailable: {type(exc).__name__}: {exc}"},
            "onet": {"available": False},
            "warnings": ["Initial market lookup failed; generic occupation resolution was attempted."],
            "available": False,
        }


async def _generic_resolution(career_title: str, resilient_llm_generate) -> Optional[Dict[str, Any]]:
    resolved = _direct_onet_soc_resolution(career_title)
    if resolved:
        return resolved
    resolved = await _ai_family_resolution(career_title, resilient_llm_generate)
    if resolved:
        return resolved
    return _lexical_onet_family_resolution(career_title)


def install_generic_market_route(app, resilient_llm_generate):
    async def generic_market_data(career_title: str = Query(..., min_length=2, max_length=180)):
        direct = _safe_existing_market(career_title)
        if (direct.get("bls") or {}).get("available"):
            direct["title_resolution"] = {"method": "existing_confirmed_mapping", "requested_title": career_title}
            return {"status": "success", "market_data": direct}

        resolved = await _generic_resolution(career_title, resilient_llm_generate)
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
