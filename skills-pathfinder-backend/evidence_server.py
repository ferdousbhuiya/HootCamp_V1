"""Unified evidence API layer for Skills Pathfinder.

Adds structured resume evidence extraction, junk-skill filtering, and ongoing-course
alignment while preserving the existing career blueprint API.
"""

import json
import os
import re
from typing import Any, Dict, List

from fastapi import File, HTTPException, UploadFile
from pydantic import BaseModel, Field

import main as main_module
import recommendation_engine as recommendation_module
from career_server import app, career_blueprint, CareerBlueprintRequest
from server import resilient_llm_generate


def _clean_skill_name(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _valid_skill(skill: Dict[str, Any]) -> bool:
    name = _clean_skill_name(skill.get("name"))
    if not name:
        return False
    # Single-letter fallback hits such as C/R are common false positives in words
    # like "credits" or "career". Keep them only when the AI explicitly classified
    # them as a programming language.
    if len(name) == 1 and name.upper() in {"C", "R"}:
        return str(skill.get("category") or "").lower() == "programming language"
    if len(name) < 2:
        return False
    if not re.search(r"[A-Za-z0-9+#]", name):
        return False
    return True


def _sanitize_skills(skills: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    unique: Dict[str, Dict[str, Any]] = {}
    for raw in skills or []:
        if not isinstance(raw, dict):
            continue
        item = dict(raw)
        item["name"] = _clean_skill_name(item.get("name"))
        if not _valid_skill(item):
            continue
        key = item["name"].lower()
        try:
            confidence = max(0.0, min(1.0, float(item.get("confidence", 0.75))))
        except (TypeError, ValueError):
            confidence = 0.75
        item["confidence"] = confidence
        if key not in unique or confidence > float(unique[key].get("confidence", 0)):
            unique[key] = item
    return list(unique.values())


def _extract_text(filename: str, file_bytes: bytes) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext not in main_module.ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF, DOCX, TXT, PNG, JPG or JPEG.")
    if not file_bytes:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(file_bytes) > main_module.MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds the 15MB limit.")
    if ext == ".pdf":
        text = main_module.extract_text_from_pdf(file_bytes)
    elif ext == ".docx":
        text = main_module.extract_text_from_docx(file_bytes)
    elif ext == ".txt":
        text = main_module.extract_text_from_txt(file_bytes)
    else:
        text = main_module.extract_text_from_image(file_bytes)
    text = main_module.clean_extracted_text(text)
    if len(text.strip()) < 10:
        raise HTTPException(status_code=400, detail="Could not extract meaningful text from the document.")
    return text


async def _structured_resume_evidence(text: str) -> Dict[str, Any]:
    prompt = f"""
Analyze this resume or career document as a complete evidence source, not only a skill list.
Extract only information supported by the document. Do not invent dates, degrees, employers,
skills, certifications, projects, or current study.

Return ONLY JSON with this structure:
{{
  "skills": [{{"name":"","category":"","confidence":0.0,"evidence":""}}],
  "education": [{{"institution":"","program_or_degree":"","field_of_study":"","status":"completed|in_progress|unknown","start_date":"","end_or_expected_date":"","evidence":""}}],
  "experience": [{{"employer":"","role":"","start_date":"","end_date":"","responsibilities":[],"skills_demonstrated":[],"evidence":""}}],
  "projects": [{{"name":"","description":"","skills_demonstrated":[],"evidence":""}}],
  "certifications": [{{"name":"","provider":"","status":"completed|in_progress|unknown","evidence":""}}],
  "courses": [{{"name":"","institution_or_provider":"","status":"completed|in_progress|unknown","topics":[],"skills_demonstrated":[],"evidence":""}}]
}}

Rules:
- Extract every meaningful skill supported by the document, including technical, analytical,
  domain, professional, communication, leadership, tools, methodologies, and software skills.
- Do not output isolated letters as skills unless the resume explicitly presents C or R as a
  programming language.
- Education is not a skill. Preserve education separately in the education array.
- Projects, certifications, and courses must remain separate evidence types even when they also
  support skills.
- If an education/course item is clearly current, use status in_progress.

DOCUMENT:
{text}
"""
    try:
        raw = await resilient_llm_generate(prompt, max_tokens_override=2600)
        data = json.loads(raw)
    except Exception as exc:
        print(f"[RESUME EVIDENCE] Structured extraction failed: {exc}")
        data = {}
    data["skills"] = _sanitize_skills(data.get("skills") or [])
    for key in ("education", "experience", "projects", "certifications", "courses"):
        if not isinstance(data.get(key), list):
            data[key] = []
    return data


async def enhanced_upload(file: UploadFile = File(...)):
    filename = file.filename or "document"
    file_bytes = await file.read()
    text = _extract_text(filename, file_bytes)
    structured = await _structured_resume_evidence(text)

    skills = structured.get("skills") or []
    explanations = []
    for skill in skills:
        explanations.append({
            "skill": skill.get("name"),
            "reasoning": "Supported by the uploaded resume/document.",
            "evidence": skill.get("evidence") or ""
        })

    # If structured extraction produced no useful skills, use the old extractor and
    # sanitize it. The local fallback remains a final safety net.
    ai_failed = False
    if not skills:
        try:
            old = await main_module.extract_skills_with_llm(text)
            skills = _sanitize_skills(old.get("skills") or [])
            explanations = old.get("explanations") or []
        except Exception as exc:
            print(f"[RESUME EVIDENCE] legacy extractor fallback failed: {exc}")
            ai_failed = True
    if not skills:
        skills = _sanitize_skills(main_module.local_skill_fallback(text))
        ai_failed = True

    recommendations = recommendation_module.get_career_recommendations(skills)
    return {
        "filename": filename,
        "character_count": len(text),
        "skills_count": len(skills),
        "extracted_skills": skills,
        "explanations": explanations,
        "recommendations": recommendations,
        "education": structured.get("education", []),
        "experience": structured.get("experience", []),
        "projects": structured.get("projects", []),
        "certifications_from_resume": structured.get("certifications", []),
        "courses_from_resume": structured.get("courses", []),
        "structured_evidence": structured,
        "ai_failed": ai_failed,
        "extraction_status": "fallback_completed" if ai_failed else "completed"
    }


class CourseAlignmentRequest(BaseModel):
    course_name: str = Field(min_length=2, max_length=240)
    institution: str = ""
    subject_area: str = ""
    description: str = ""
    topics: List[str] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    career_title: str = ""
    career_blueprint: Dict[str, Any] = Field(default_factory=dict)


async def course_alignment(request: CourseAlignmentRequest):
    blueprint = request.career_blueprint or {}
    if request.career_title and not blueprint:
        target = await career_blueprint(CareerBlueprintRequest(career_title=request.career_title, skills=[]))
        blueprint = target.get("blueprint") or {}

    prompt = f"""
Evaluate how an ongoing course contributes to a student's target career. Do not claim that a
course satisfies licensing, degree, clinical, flight-hour, apprenticeship, or legal requirements.

COURSE: {request.course_name}
INSTITUTION/PROVIDER: {request.institution}
SUBJECT AREA: {request.subject_area}
DESCRIPTION: {request.description}
TOPICS: {json.dumps(request.topics)}
STUDENT-ENTERED SKILLS: {json.dumps(request.skills)}
TARGET CAREER: {request.career_title or blueprint.get('canonical_title','')}
TARGET CORE COMPETENCIES: {json.dumps(blueprint.get('core_competencies', []))}
TARGET SUBJECTS: {json.dumps(blueprint.get('recommended_subjects', []))}

Return ONLY JSON:
{{
  "extracted_skills": [{{"name":"","category":"Course Skill","confidence":0.0}}],
  "topics": [""],
  "aligned_competencies": [""],
  "potential_skill_gaps_addressed": [""],
  "academic_preparation_addressed": [""],
  "alignment_summary": "",
  "alignment_level": "high|medium|low|unknown",
  "caution": ""
}}
"""
    try:
        raw = await resilient_llm_generate(prompt, max_tokens_override=1200)
        result = json.loads(raw)
    except Exception as exc:
        print(f"[COURSE ALIGNMENT] AI failed: {exc}")
        result = {
            "extracted_skills": [{"name": s, "category": "Course Skill", "confidence": 0.9} for s in request.skills],
            "topics": request.topics,
            "aligned_competencies": [],
            "potential_skill_gaps_addressed": [],
            "academic_preparation_addressed": [],
            "alignment_summary": "Course saved. Detailed AI alignment was temporarily unavailable.",
            "alignment_level": "unknown",
            "caution": "Career alignment is guidance, not confirmation of official program or licensing requirements."
        }
    result["extracted_skills"] = _sanitize_skills(result.get("extracted_skills") or [])
    return {"status": "success", "course": request.course_name, "career_title": request.career_title or blueprint.get("canonical_title"), **result}


# Replace the original upload route so every entry path receives the same structured evidence.
app.router.routes = [
    route for route in app.router.routes
    if not (getattr(route, "path", None) == "/api/upload" and "POST" in getattr(route, "methods", set()))
]
app.add_api_route("/api/upload", enhanced_upload, methods=["POST"], tags=["evidence"])
app.add_api_route("/api/resume-evidence", enhanced_upload, methods=["POST"], tags=["evidence"])
app.add_api_route("/api/course-alignment", course_alignment, methods=["POST"], tags=["evidence"])
