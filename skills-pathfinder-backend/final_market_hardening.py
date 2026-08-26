"""Final profession-agnostic market-resolution hardening.

Adds order-insensitive O*NET title matching and lets validated O*NET occupation data
remain available when BLS/OEWS enrichment is temporarily unavailable. No profession
aliases or demo-specific mappings are used.
"""
from __future__ import annotations

from difflib import SequenceMatcher
from typing import Any, Dict, Optional


def _stem(token: str) -> str:
    token = str(token or "").lower().strip()
    if len(token) > 4 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 4 and token.endswith("es"):
        return token[:-2]
    if len(token) > 3 and token.endswith("s"):
        return token[:-1]
    return token


def _title_tokens(market_module, value: str) -> set[str]:
    # Keep occupational nouns. Remove only modifiers/job-level words that otherwise
    # dominate similarity. This is deliberately profession-neutral.
    stop = {
        "senior", "junior", "lead", "principal", "associate", "assistant", "staff",
        "manager", "management", "specialist", "coordinator", "director", "supervisor",
        "officer", "consultant", "professional", "technician", "general",
        "the", "and", "of", "for", "in", "with", "level", "grade",
    }
    return {
        stemmed
        for raw in market_module._normalize(value).split()
        if (stemmed := _stem(raw)) and len(stemmed) > 2 and stemmed not in stop
    }


def _generic_title_score(market_module, requested: str, candidate: str) -> float:
    requested_norm = market_module._normalize(requested)
    candidate_norm = market_module._normalize(candidate)
    seq = SequenceMatcher(None, requested_norm, candidate_norm).ratio()
    left = _title_tokens(market_module, requested)
    right = _title_tokens(market_module, candidate)
    if not left or not right:
        return seq
    shared = left & right
    containment = len(shared) / max(1, min(len(left), len(right)))
    jaccard = len(shared) / max(1, len(left | right))
    token_score = 1.0 if left <= right or right <= left else 0.60 * containment + 0.40 * jaccard
    return max(seq, token_score)


def install_onet_title_matcher(market_module) -> None:
    """Replace order-sensitive SequenceMatcher-only lookup with generic token scoring."""

    def lookup_onet_occupation(career_title: str, bls_soc_code: Optional[str] = None) -> Dict[str, Any]:
        target = market_module._mapped_title(career_title, market_module.CAREER_TO_ONET_TITLE) or career_title
        target_norm = market_module._normalize(target)
        rows = market_module._onet_rows()
        exact = next((row for row in rows if market_module._normalize(row.get("title")) == target_norm), None)
        if exact:
            best, method, score = exact, "explicit_or_exact_title", 1.0
        else:
            candidates = rows
            if bls_soc_code:
                same_family = [
                    row for row in rows
                    if market_module._onet_base_soc(row.get("onetsoc_code")) == bls_soc_code
                ]
                if same_family:
                    candidates = same_family
            ranked = sorted(
                ((_generic_title_score(market_module, target, str(row.get("title") or "")), row) for row in candidates),
                key=lambda item: item[0],
                reverse=True,
            )
            score, best = ranked[0] if ranked else (0.0, None)
            method = "soc_family_generic_title_match" if bls_soc_code and candidates is not rows else "generic_title_match"

        if not best or score < 0.70:
            return {
                "available": False,
                "reason": "No sufficiently close O*NET occupation match was found.",
                "source": market_module.ONET_SOURCE_NAME,
                "source_release": market_module.ONET_RELEASE,
                "source_url": market_module.ONET_OCCUPATION_DATA_URL,
            }
        return {
            "available": True,
            "onet_soc_code": best.get("onetsoc_code"),
            "base_soc_code": market_module._onet_base_soc(best.get("onetsoc_code")),
            "occupation_title": best.get("title"),
            "description": best.get("description"),
            "match_score": round(score, 4),
            "mapping_method": method,
            "source": market_module.ONET_SOURCE_NAME,
            "source_release": market_module.ONET_RELEASE,
            "source_url": market_module.ONET_OCCUPATION_DATA_URL,
        }

    market_module.lookup_onet_occupation = lookup_onet_occupation


def _unavailable_bls(generic_module, occupation_title: str) -> Dict[str, Any]:
    market = generic_module.market
    return {
        "available": False,
        "reason": "Official occupation mapping was confirmed by O*NET, but BLS/OEWS wage enrichment is temporarily unavailable.",
        "mapped_occupation": occupation_title,
        "source": market.BLS_SOURCE_NAME,
        "source_period": market.BLS_OEWS_PERIOD,
        "source_url": market.BLS_OEWS_URL,
    }


def install_bls_independent_onet(generic_module) -> None:
    """Make O*NET useful independently; BLS enrichment must not gate occupation data."""
    original_resolution = generic_module._generic_resolution

    async def resilient_resolution(career_title: str, resilient_llm_generate):
        # First try the normal resolver because it provides the richest confirmed
        # O*NET+BLS crosswalk when both sources are available.
        resolved = await original_resolution(career_title, resilient_llm_generate)
        if resolved:
            return resolved

        # If BLS is down/missing, still surface a validated O*NET occupation rather than
        # throwing away authoritative occupation data.
        for variant in generic_module._market_title_variants(career_title):
            try:
                onet = generic_module.market.lookup_onet_occupation(variant)
            except Exception:
                continue
            if not onet.get("available"):
                continue
            title = onet.get("occupation_title") or variant
            bls = generic_module._bls_from_soc(onet.get("base_soc_code"), title) if onet.get("base_soc_code") else None
            if not bls:
                bls = _unavailable_bls(generic_module, title)
            return generic_module._crosswalk_result(
                career_title,
                onet,
                bls,
                {
                    "method": "generic_onet_with_optional_bls",
                    "requested_title": career_title,
                    "query_variant": variant,
                    "resolved_title": title,
                    "validated_soc": onet.get("base_soc_code"),
                },
            )
        return None

    generic_module._generic_resolution = resilient_resolution


def install(market_module, generic_module) -> None:
    install_onet_title_matcher(market_module)
    install_bls_independent_onet(generic_module)
