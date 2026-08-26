"""Production-safe Groq JSON generation for Skills Pathfinder.

The Groq model occasionally returns syntactically malformed JSON even when the prompt asks
for JSON. This wrapper uses Groq JSON-object mode and retries once only when the returned
content cannot be parsed. When the primary model is rate-limited, it can fall back to a
second compatible model without changing normal behavior.
"""

import json
import os

from fastapi import HTTPException

import main as main_module
from server import _extract_json_text


FALLBACK_GROQ_MODEL = os.getenv("GROQ_FALLBACK_MODEL", "openai/gpt-oss-120b").strip()


def _is_rate_limit_error(error_text: str) -> bool:
    lowered = str(error_text or "").lower()
    return (
        "rate_limit" in lowered
        or "rate limit" in lowered
        or "429" in lowered
        or "tokens per day" in lowered
        or "tokens per minute" in lowered
    )


async def robust_resilient_llm_generate(prompt: str, max_tokens_override: int = None):
    if not main_module.groq_client:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured.")

    max_tokens = max_tokens_override or main_module.AI_MAX_OUTPUT_TOKENS
    primary_model = str(main_module.GROQ_MODEL or "").strip()
    models = [primary_model]
    if FALLBACK_GROQ_MODEL and FALLBACK_GROQ_MODEL not in models:
        models.append(FALLBACK_GROQ_MODEL)

    last_error = None
    rate_limited_models = []

    for model_index, model in enumerate(models):
        for attempt in range(2):
            try:
                label = "primary" if model_index == 0 else "fallback"
                print(
                    f"[LLM] Calling Groq API model={model} ({label}), "
                    f"max_tokens={max_tokens}, strict_json=true, attempt={attempt + 1}"
                )

                messages = [
                    {
                        "role": "system",
                        "content": (
                            "Return exactly one valid JSON object. Do not use markdown, code fences, "
                            "comments, trailing commas, or text outside the JSON object."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ]

                if attempt == 1:
                    messages.insert(
                        1,
                        {
                            "role": "system",
                            "content": (
                                "The previous response was not valid JSON. Produce a fresh complete "
                                "JSON object matching the requested schema. Keep strings concise and "
                                "ensure every property is separated by a comma."
                            ),
                        },
                    )

                completion = main_module.groq_client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=0.0 if attempt else 0.1,
                    max_tokens=max_tokens,
                    response_format={"type": "json_object"},
                )

                raw = completion.choices[0].message.content or ""
                normalized = _extract_json_text(raw)
                json.loads(normalized)
                print(f"[LLM] Valid JSON response model={model}, length={len(normalized)} characters")
                return normalized

            except HTTPException:
                raise
            except Exception as exc:
                last_error = exc
                error_text = str(exc)
                print(f"[LLM] Groq JSON model={model} attempt {attempt + 1} failed: {error_text}")

                # A model-level rate limit is not a malformed-output retry. Move directly
                # to the configured fallback model when one is available.
                if _is_rate_limit_error(error_text):
                    rate_limited_models.append(model)
                    break

                # Only malformed/invalid model output gets one fresh generation attempt.
                if attempt == 0:
                    continue

        if model in rate_limited_models and model_index + 1 < len(models):
            print(f"[LLM] Model {model} is rate-limited; trying fallback model {models[model_index + 1]}")
            continue

    if rate_limited_models:
        raise HTTPException(
            status_code=429,
            detail=(
                "Groq AI capacity is temporarily unavailable on the configured primary and "
                "fallback models. Please try again after the model limits reset."
            ),
        )

    raise HTTPException(
        status_code=502,
        detail=f"Groq AI processing failed after JSON retry: {last_error}",
    )
