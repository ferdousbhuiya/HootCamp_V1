"""Production bootstrap for Skills Pathfinder.

This keeps main.py compatible with the existing project while wiring the career
engine explicitly and providing a Groq JSON fallback for models that reject
Groq's strict response_format validation.
"""

import json
import re

from fastapi import HTTPException

import main as main_module
from recommendation_engine import get_career_recommendations, get_skill_gap_analysis


# main.py currently calls these functions without importing them.  Wiring them
# here fixes the runtime NameError without changing the existing API routes.
main_module.get_career_recommendations = get_career_recommendations
main_module.get_skill_gap_analysis = get_skill_gap_analysis


def _extract_json_text(raw_text: str) -> str:
    """Return a normalized JSON string from a model response."""
    text = (raw_text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)

    try:
        parsed = json.loads(text)
        return json.dumps(parsed)
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        candidate = text[start : end + 1]
        parsed = json.loads(candidate)
        return json.dumps(parsed)

    raise ValueError("Model response did not contain a valid JSON object")


async def resilient_llm_generate(prompt: str, max_tokens_override: int = None):
    """Call Groq and normalize JSON without relying on response_format.

    gpt-oss-20b has previously returned Groq json_validate_failed errors when
    response_format={type: json_object} was used.  A strict JSON system prompt
    plus local validation is more tolerant while still guaranteeing valid JSON
    to the rest of the application.
    """
    if not main_module.groq_client:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured.")

    max_tokens = max_tokens_override or main_module.AI_MAX_OUTPUT_TOKENS

    try:
        print(
            f"[LLM] Calling Groq API model={main_module.GROQ_MODEL}, "
            f"max_tokens={max_tokens}, resilient_json=true"
        )
        completion = main_module.groq_client.chat.completions.create(
            model=main_module.GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Return exactly one valid JSON object. Do not use markdown, "
                        "code fences, commentary, or text outside the JSON object."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=max_tokens,
        )
        raw = completion.choices[0].message.content or ""
        normalized = _extract_json_text(raw)
        print(f"[LLM] Valid JSON response length: {len(normalized)} characters")
        return normalized

    except HTTPException:
        raise
    except Exception as exc:
        error_text = str(exc)
        print(f"[LLM] Groq API Error: {error_text}")
        if "413" in error_text or "tokens per minute" in error_text.lower():
            raise HTTPException(
                status_code=429,
                detail="Groq free-tier token limit reached. Please retry with a smaller document or after the limit resets.",
            )
        if "rate_limit" in error_text.lower() or "429" in error_text:
            raise HTTPException(status_code=429, detail="Groq rate limit reached. Please try again shortly.")
        raise HTTPException(status_code=502, detail=f"Groq AI processing failed: {error_text}")


# Functions already defined in main.py resolve this module global at request
# time, so replacing it here updates resume, certificate, and report generation.
main_module.llm_generate = resilient_llm_generate

app = main_module.app
