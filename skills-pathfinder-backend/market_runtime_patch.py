"""Runtime optimization for generic market intelligence.

Keeps market enrichment out of the resume upload critical path, resolves occupations
with deterministic O*NET/BLS logic before spending an LLM call, and caches successful
or unavailable results briefly so repeated Career Intelligence views do not hammer
external services.
"""
from __future__ import annotations

import time
from typing import Any, Dict, Optional

import generic_market_resolution as generic

_CACHE_TTL = 60 * 60
_cache: Dict[str, Dict[str, Any]] = {}


def _key(title: str) -> str:
    return " ".join(str(title or "").strip().lower().split())


def _cached(title: str) -> Optional[Dict[str, Any]]:
    row = _cache.get(_key(title))
    if not row:
        return None
    if time.time() - row["time"] > _CACHE_TTL:
        _cache.pop(_key(title), None)
        return None
    return row["value"]


def _remember(title: str, value: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if value is not None:
        _cache[_key(title)] = {"time": time.time(), "value": value}
    return value


async def optimized_generic_resolution(career_title: str, resilient_llm_generate):
    cached = _cached(career_title)
    if cached is not None:
        return cached

    # Cheapest and most authoritative path first.
    resolved = generic._direct_onet_soc_resolution(career_title)
    if resolved:
        return _remember(career_title, resolved)

    # O*NET title/description evidence is deterministic and usually enough for
    # specialty titles. Try it before asking the LLM for an occupation-family hint.
    resolved = generic._lexical_onet_family_resolution(career_title)
    if resolved:
        return _remember(career_title, resolved)

    # LLM is only the last-resort title-family helper. It never supplies wage data.
    resolved = await generic._ai_family_resolution(career_title, resilient_llm_generate)
    return _remember(career_title, resolved)


def install():
    generic._generic_resolution = optimized_generic_resolution
