"""Production-safe Groq JSON generation for Skills Pathfinder.

The Groq model occasionally returns syntactically malformed JSON even when the prompt asks
for JSON. This wrapper uses Groq JSON-object mode and retries once only when the returned
content cannot be parsed. Rate-limit and configuration errors are not retried here.
"""

import json

from fastapi import HTTPException

import main as main_module
from server import _extract_json_text


async def robust_resilient_llm_generate(prompt: str, max_tokens_override: int = None):
    if not main_module.groq_client:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured.")

    max_tokens = max_tokens_override or main_module.AI_MAX_OUTPUT_TOKENS
    last_error = None

    for attempt in range(2):
        try:
            print(
                f"[LLM] Calling Groq API model={main_module.GROQ_MODEL}, "
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
                model=main_module.GROQ_MODEL,
                messages=messages,
                temperature=0.0 if attempt else 0.1,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
            )

            raw = completion.choices[0].message.content or ""
            normalized = _extract_json_text(raw)
            # Parse once more here so callers can safely json.loads() the returned text.
            json.loads(normalized)
            print(f"[LLM] Valid JSON response length: {len(normalized)} characters")
            return normalized

        except HTTPException:
            raise
        except Exception as exc:
            last_error = exc
            error_text = str(exc)
            lowered = error_text.lower()
            print(f"[LLM] Groq JSON attempt {attempt + 1} failed: {error_text}")

            if "413" in error_text or "tokens per minute" in lowered:
                raise HTTPException(
                    status_code=429,
                    detail=(
                        "Groq free-tier token limit reached. Please retry with a smaller "
                        "document or after the limit resets."
                    ),
                )
            if "rate_limit" in lowered or "429" in error_text:
                raise HTTPException(
                    status_code=429,
                    detail="Groq rate limit reached. Please try again shortly.",
                )

            # Only malformed/invalid model output gets one fresh generation attempt.
            if attempt == 0:
                continue

    raise HTTPException(
        status_code=502,
        detail=f"Groq AI processing failed after JSON retry: {last_error}",
    )
