"""Production bootstrap for Skills Pathfinder.

This module extends the original FastAPI application with:
- resilient Groq JSON handling;
- the expanded career catalog;
- conservative certificate verification;
- safe verification-link rechecks; and
- structured career-development plans.
"""

import json
import os
import re
from typing import Any, Dict, List

from fastapi import File, HTTPException, UploadFile
from pydantic import BaseModel, Field

import main as main_module
import recommendation_engine as recommendation_module
from career_catalog_extended import EXTENDED_CAREER_PATHS
from certificate_verification import (
    SUPPORTED_CERTIFICATE_EXTENSIONS,
    normalize_certificate_skills,
    verify_certificate_url,
)
from recommendation_engine import get_career_recommendations, get_skill_gap_analysis


_existing_career_ids = {career.get("id") for career in recommendation_module.CAREER_PATHS}
recommendation_module.CAREER_PATHS.extend(
    career for career in EXTENDED_CAREER_PATHS if career.get("id") not in _existing_career_ids
)

main_module.get_career_recommendations = get_career_recommendations
main_module.get_skill_gap_analysis = get_skill_gap_analysis


def _extract_json_text(raw_text: str) -> str:
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


main_module.llm_generate = resilient_llm_generate


async def _extract_certificate_document(file: UploadFile):
    filename = file.filename or "certificate"
    extension = os.path.splitext(filename)[1].lower()

    if extension not in SUPPORTED_CERTIFICATE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported certificate file. Use PDF, DOCX, TXT, PNG, JPG or JPEG.",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Certificate file is empty.")
    if len(file_bytes) > main_module.MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Certificate file exceeds the 15MB limit.")

    if extension == ".pdf":
        text = main_module.extract_text_from_pdf(file_bytes)
    elif extension == ".docx":
        text = main_module.extract_text_from_docx(file_bytes)
    elif extension == ".txt":
        text = main_module.extract_text_from_txt(file_bytes)
    else:
        text = main_module.extract_text_from_image(file_bytes)

    text = main_module.clean_extracted_text(text)
    if len(text.strip()) < 10:
        raise HTTPException(status_code=400, detail="Could not extract meaningful certificate text.")

    return filename, extension, text


async def verify_certificate_v2(file: UploadFile = File(...)):
    filename, extension, text = await _extract_certificate_document(file)

    prompt = f"""
Analyze this certificate or completed-course credential.
Do not invent information. Extract only evidence supported by the document.

Return ONLY JSON in this exact structure:
{{
  "certification_name": "",
  "provider": "",
  "holder_name": "",
  "credential_id": "",
  "verification_url": "",
  "issue_date": "",
  "expiration_date": "",
  "skills": [
    {{"name": "", "category": "", "confidence": 0.0}}
  ]
}}

For skills, extract every meaningful skill, tool, methodology, domain competency,
technology, or professional capability explicitly represented by the certificate.
Do not restrict the skills to technology or engineering fields.

CERTIFICATE TEXT:
{text}
"""

    try:
        response = await resilient_llm_generate(prompt, max_tokens_override=1400)
        data = json.loads(response)
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[CERTIFICATE] AI metadata extraction failed: {exc}")
        data = {}

    if not data.get("certification_name"):
        data["certification_name"] = os.path.splitext(filename)[0]
    if not data.get("provider"):
        data["provider"] = "Unknown"

    certificate_skills = normalize_certificate_skills(data.get("skills"))
    if not certificate_skills:
        certificate_skills = main_module.deduplicate_skills(main_module.local_skill_fallback(text))
        for skill in certificate_skills:
            skill["source"] = "certificate"

    verification = verify_certificate_url(data)

    return {
        "filename": filename,
        "file_type": extension,
        "certification_name": data.get("certification_name") or "",
        "provider": data.get("provider") or "Unknown",
        "holder_name": data.get("holder_name") or "",
        "credential_id": data.get("credential_id") or "",
        "verification_url": data.get("verification_url") or "",
        "issue_date": data.get("issue_date") or "",
        "expiration_date": data.get("expiration_date") or "",
        "extracted_skills": certificate_skills,
        "skills_count": len(certificate_skills),
        "verification_status": verification["verification_status"],
        "verification_method": verification.get("verification_method"),
        "verification_message": verification.get("verification_message"),
        "verification_evidence": verification.get("verification_evidence", []),
        "verified_url": verification.get("verified_url"),
        "is_verified": bool(verification.get("is_verified")),
        "auto_verified": bool(verification.get("is_verified")),
        "character_count": len(text),
    }


class CertificateLinkRequest(BaseModel):
    certification_name: str = ""
    provider: str = ""
    holder_name: str = ""
    credential_id: str = ""
    verification_url: str = ""


async def verify_certificate_link(request: CertificateLinkRequest):
    certificate = request.model_dump()
    result = verify_certificate_url(certificate)
    return {
        **certificate,
        "verification_status": result["verification_status"],
        "verification_method": result.get("verification_method"),
        "verification_message": result.get("verification_message"),
        "verification_evidence": result.get("verification_evidence", []),
        "verified_url": result.get("verified_url"),
        "is_verified": bool(result.get("is_verified")),
        "auto_verified": bool(result.get("is_verified")),
    }


class CareerAdviceRequest(BaseModel):
    skills: List[str] = Field(default_factory=list)
    certifications: List[Dict[str, Any]] = Field(default_factory=list)
    courses: List[Dict[str, Any]] = Field(default_factory=list)
    career_recommendations: List[Dict[str, Any]] = Field(default_factory=list)


async def generate_career_advice_v2(request: CareerAdviceRequest):
    """Generate a practical 30-day, 6-month and 1-year student plan."""
    compact_certs = [
        {
            "name": item.get("certification_name"),
            "provider": item.get("provider"),
            "verified": item.get("is_verified"),
            "status": item.get("verification_status"),
        }
        for item in request.certifications[:20]
    ]
    compact_courses = [
        {
            "name": item.get("course_name"),
            "provider": item.get("provider"),
            "status": item.get("status"),
            "completion": item.get("expected_completion_date"),
        }
        for item in request.courses[:20]
    ]
    compact_careers = [
        {
            "title": item.get("path") or item.get("career_title"),
            "match": item.get("match_percentage") or item.get("match_score"),
            "missing_skills": item.get("missing_skills", []),
        }
        for item in request.career_recommendations[:5]
    ]

    prompt = f"""
Create a student career-development report from the structured profile below.
Do not assume licenses, degrees, or certifications that are not present.
If a target career is regulated, clearly separate current skills from licensing/education requirements.
Avoid recommending a beginner course when the student is already taking an equivalent ongoing course.

Skills: {json.dumps(request.skills[:100])}
Certificates: {json.dumps(compact_certs)}
Ongoing courses: {json.dumps(compact_courses)}
Career matches: {json.dumps(compact_careers)}

Return ONLY JSON:
{{
  "executive_summary": "",
  "swot_analysis": {{
    "strengths": [],
    "weaknesses": [],
    "opportunities": [],
    "threats": []
  }},
  "career_readiness": {{
    "current_level": "",
    "strongest_path": "",
    "alternative_paths": [],
    "major_constraints": []
  }},
  "action_plan": {{
    "30_days": [""],
    "6_months": [""],
    "1_year": [""]
  }},
  "recommended_next_skills": [],
  "recommended_certifications": [],
  "recommended_projects": [],
  "ongoing_course_alignment": [
    {{"course": "", "career_or_skill": "", "alignment": ""}}
  ],
  "application_readiness": {{
    "can_apply_now": [],
    "prepare_before_applying": [],
    "regulated_roles_note": ""
  }}
}}

Be practical, specific, and concise.
"""

    response = await resilient_llm_generate(prompt, max_tokens_override=2200)
    return {"status": "success", "advice": json.loads(response)}


def _remove_post_route(path: str):
    main_module.app.router.routes = [
        route
        for route in main_module.app.router.routes
        if not (
            getattr(route, "path", None) == path
            and "POST" in getattr(route, "methods", set())
        )
    ]


_remove_post_route("/api/verify-certificate")
_remove_post_route("/api/generate-career-advice")

main_module.app.add_api_route(
    "/api/verify-certificate",
    verify_certificate_v2,
    methods=["POST"],
    tags=["certificates"],
)
main_module.app.add_api_route(
    "/api/verify-certificate-link",
    verify_certificate_link,
    methods=["POST"],
    tags=["certificates"],
)
main_module.app.add_api_route(
    "/api/generate-career-advice",
    generate_career_advice_v2,
    methods=["POST"],
    tags=["career"],
)

app = main_module.app
