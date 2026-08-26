"""Resume-first evidence API for Skills Pathfinder.

This module intentionally focuses on one production path first:
resume upload -> structured evidence -> normalized skills -> career recommendations.
The same /api/upload endpoint can later be reused by the other entry paths.
"""

import json
import os
import re
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from fastapi import File, HTTPException, UploadFile
from pydantic import BaseModel, Field

import main as main_module
import recommendation_engine as recommendation_module
from career_server import app, career_blueprint, CareerBlueprintRequest
from server import resilient_llm_generate


def _clean_skill_name(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


SKILL_CANONICAL = {
    "excel": "Microsoft Excel",
    "advanced excel": "Microsoft Excel",
    "ms excel": "Microsoft Excel",
    "powerbi": "Power BI",
    "power system": "Power Systems",
    "power systems": "Power Systems",
    "electrical power": "Electrical Power Systems",
    "power distribution": "Power Distribution",
    "mv electrical power distribution": "MV Electrical Power Distribution",
    "steam power plant": "Steam Power Plant Operations",
    "power plant": "Power Plant Operations",
    "solar power": "Solar Power Systems",
    "solar power system installation": "Solar Power Systems",
    "hse": "HSE Compliance",
    "health safety environment": "HSE Compliance",
    "health safety and environment": "HSE Compliance",
    "risk": "Risk Management",
    "leadership": "Team Leadership",
    "project coordination": "Project Management",
}


def _canonical_skill_name(value: Any) -> str:
    clean = _clean_skill_name(value)
    key = clean.lower().replace("&", "and")
    key = re.sub(r"[^a-z0-9+#. -]+", " ", key)
    key = re.sub(r"\s+", " ", key).strip()
    return SKILL_CANONICAL.get(key, clean)


def _valid_skill(skill: Dict[str, Any]) -> bool:
    name = _clean_skill_name(skill.get("name"))
    if not name:
        return False
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
        item["name"] = _canonical_skill_name(item.get("name"))
        if not _valid_skill(item):
            continue
        key = item["name"].lower()
        try:
            confidence = max(0.0, min(1.0, float(item.get("confidence", 0.75))))
        except (TypeError, ValueError):
            confidence = 0.75
        item["confidence"] = confidence
        old = unique.get(key)
        if old is None or confidence > float(old.get("confidence", 0)):
            unique[key] = item
        elif not old.get("evidence") and item.get("evidence"):
            old["evidence"] = item["evidence"]
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


SECTION_HEADINGS = {
    "summary", "professional summary", "professional experience", "work experience", "experience",
    "education", "certifications", "certifications & awards", "certifications and awards",
    "skills", "technical skills", "languages", "publications", "projects", "courses"
}


def _section_map(text: str) -> Dict[str, List[str]]:
    sections: Dict[str, List[str]] = {"preamble": []}
    current = "preamble"
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        key = line.lower().strip(":")
        if key in SECTION_HEADINGS:
            current = key
            sections.setdefault(current, [])
        else:
            sections.setdefault(current, []).append(line)
    return sections


MONTHS = {m.lower(): i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], start=1
)}
MONTHS.update({
    "january": 1, "february": 2, "march": 3, "april": 4, "june": 6, "july": 7,
    "august": 8, "september": 9, "october": 10, "november": 11, "december": 12
})


def _parse_month_year(value: str) -> Optional[date]:
    value = str(value or "").strip()
    if not value:
        return None
    if value.lower() in {"present", "current", "now"}:
        return date.today()
    m = re.search(r"\b([A-Za-z]{3,9})\s+(19\d{2}|20\d{2})\b", value)
    if m:
        month = MONTHS.get(m.group(1).lower())
        if month:
            return date(int(m.group(2)), month, 1)
    y = re.search(r"\b(19\d{2}|20\d{2})\b", value)
    if y:
        return date(int(y.group(1)), 1, 1)
    return None


def _date_range(line: str) -> Tuple[Optional[str], Optional[str], Optional[date], Optional[date]]:
    m = re.search(
        r"\b([A-Za-z]{3,9}\s+\d{4}|\d{4})\s*[\-–—]\s*([A-Za-z]{3,9}\s+\d{4}|\d{4}|Present|Current|Now)\b",
        line, re.I
    )
    if not m:
        return None, None, None, None
    start_raw, end_raw = m.group(1), m.group(2)
    return start_raw, end_raw, _parse_month_year(start_raw), _parse_month_year(end_raw)


def _fallback_experience(text: str) -> List[Dict[str, Any]]:
    sections = _section_map(text)
    lines = sections.get("professional experience") or sections.get("work experience") or sections.get("experience") or []
    records: List[Dict[str, Any]] = []
    i = 0
    while i < len(lines):
        start_raw, end_raw, start_dt, end_dt = _date_range(lines[i])
        if start_raw and i >= 1:
            role = lines[i - 2] if i >= 2 else ""
            employer = lines[i - 1] if i >= 1 else ""
            responsibilities = []
            j = i + 1
            while j < len(lines) and not _date_range(lines[j])[0]:
                if j + 2 < len(lines) and _date_range(lines[j + 2])[0]:
                    break
                responsibilities.append(lines[j].lstrip("-• "))
                j += 1
            records.append({
                "employer": employer,
                "role": role,
                "start_date": start_raw,
                "end_date": end_raw,
                "responsibilities": responsibilities,
                "skills_demonstrated": [],
                "evidence": f"{role}; {employer}; {start_raw} - {end_raw}",
                "_start": start_dt.isoformat() if start_dt else None,
                "_end": end_dt.isoformat() if end_dt else None,
            })
        i += 1
    out, seen = [], set()
    for r in records:
        key = (r.get("role", "").lower(), r.get("employer", "").lower(), r.get("start_date"), r.get("end_date"))
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def _fallback_education(text: str) -> List[Dict[str, Any]]:
    sections = _section_map(text)
    lines = sections.get("education") or []
    out: List[Dict[str, Any]] = []
    for line in lines:
        pieces = [p.strip() for p in re.split(r"\s+[–—-]\s+", line, maxsplit=1)]
        program = pieces[0] if pieces else line
        rest = pieces[1] if len(pieces) > 1 else ""
        end_match = re.search(r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)?\s*(?:19\d{2}|20\d{2})\b", line, re.I)
        end_date = end_match.group(0).strip() if end_match else ""
        institution = rest
        if end_date and institution:
            institution = institution.replace(end_date, "").strip(" ,()")
        field = ""
        degree_match = re.search(r"(?:B\.?S\.?c?\.?|M\.?S\.?c?\.?|Bachelors?|Masters?|Ph\.?D\.?)\s*(?:in|of)?\s*(.+)", program, re.I)
        if degree_match:
            field = degree_match.group(1).strip()
        out.append({
            "institution": institution,
            "program_or_degree": program,
            "field_of_study": field,
            "status": "completed",
            "start_date": "",
            "end_or_expected_date": end_date,
            "evidence": line,
        })
    return [x for x in out if x.get("program_or_degree")]


def _fallback_publications(text: str) -> List[Dict[str, Any]]:
    sections = _section_map(text)
    lines = sections.get("publications") or []
    if not lines:
        return []
    joined = " ".join(lines).strip()
    if not joined:
        return []
    return [{"title": joined, "citation": joined, "evidence": joined}]


def _experience_years(records: List[Dict[str, Any]]) -> float:
    months = set()
    today = date.today()
    for item in records or []:
        start = _parse_month_year(item.get("start_date") or item.get("_start") or "")
        end = _parse_month_year(item.get("end_date") or item.get("_end") or "") or today
        if not start or end < start:
            continue
        y, m = start.year, start.month
        while (y, m) <= (end.year, end.month):
            months.add((y, m))
            m += 1
            if m == 13:
                y += 1
                m = 1
    return round(len(months) / 12.0, 1)


def _signal_skills(text: str) -> List[Dict[str, Any]]:
    """Deterministic evidence enrichment for skills explicitly present in resume text.

    These rules are intentionally domain-agnostic: they only emit a skill when a matching
    phrase is present in the uploaded document. AI extraction can add context, but a temporary
    AI variation should not make obvious resume skills disappear on a repeated upload.
    """
    rules = [
        (r"\bproject management\b|\bproject coordination\b|coordinated and supervised projects|concept to completion", "Project Management", "Leadership"),
        (r"\bHSE\b|health,? safety.*environment", "HSE Compliance", "Methodology/Standard"),
        (r"risk management", "Risk Management", "Professional Skill"),
        (r"\b33/11/0\.415\s*kV\b|\bpower distribution\b|distribution network", "Power Distribution", "Engineering"),
        (r"\b33/11\s*kV\b|\b11\s*kV\b|medium voltage", "MV Electrical Power Distribution", "Engineering"),
        (r"overhead line", "Overhead Lines", "Domain Knowledge"),
        (r"underground cabl", "Underground Cabling", "Domain Knowledge"),
        (r"troubleshoot|vibration diagnostic|fault detection", "Troubleshooting", "Technical Skill"),
        (r"\bMAXIMO\b", "MAXIMO", "Tool/Software"),
        (r"\bGIS\b", "GIS", "Tool/Software"),
        (r"budget planning|budget management", "Budget Management", "Professional Skill"),
        (r"asset lifecycle", "Asset Lifecycle Management", "Professional Skill"),
        (r"stakeholder collaboration|stakeholder coordination|stakeholder reporting", "Stakeholder Collaboration", "Soft Skill"),
        (r"cross-functional teams|led .*teams|team leadership|supervised .*team", "Team Leadership", "Soft Skill"),
        (r"engineering design", "Engineering Design", "Domain Knowledge"),
        (r"maintenance", "Equipment Maintenance", "Technical Skill"),
        (r"technical training|training programs", "Technical Training", "Professional Skill"),
        (r"\bAutoCAD\b", "AutoCAD", "Tool/Software"),
        (r"\bPython\b", "Python", "Programming"),
        (r"\bSQL\b", "SQL", "Programming"),
        (r"\bPower\s*BI\b", "Power BI", "Data Analytics"),
        (r"\bTableau\b", "Tableau", "Data Analytics"),
        (r"\b(?:Microsoft|MS)?\s*Excel\b|\bAdvanced Excel\b", "Microsoft Excel", "Data Analytics"),
        (r"\bMSBI\b", "MSBI", "Software"),
        (r"advanced data analytics|\bdata analytics\b", "Data Analytics", "Data Analytics"),
        (r"\bselenium\b", "Selenium", "Tool/Software"),
        (r"software testing", "Software Testing", "Technical Skill"),
        (r"\bautomation\b", "Automation", "Technical Skill"),
        (r"\bJava\b", "Java", "Programming"),
        (r"solar power(?: system)?(?: installation| maintenance)?", "Solar Power Systems", "Engineering"),
        (r"steam power plant", "Steam Power Plant Operations", "Engineering"),
        (r"\bBangla\b|\bBengali\b", "Bangla", "Languages"),
        (r"\bEnglish\b", "English", "Languages"),
        (r"\bHindi\b", "Hindi", "Languages"),
        (r"\bUrdu\b", "Urdu", "Languages"),
        (r"\bArabic\b", "Arabic", "Languages"),
    ]
    out = []
    for pattern, name, category in rules:
        m = re.search(pattern, text, re.I | re.S)
        if m:
            out.append({"name": name, "category": category, "confidence": 0.9, "evidence": m.group(0)[:160], "source": "resume_signal"})
    return out


async def _structured_resume_evidence(text: str) -> Dict[str, Any]:
    prompt = f"""
Analyze this resume as a complete career evidence source. Extract only information supported by
this resume. Preserve work history, education, projects, publications and credentials separately.

Return ONLY JSON:
{{
  "skills": [{{"name":"","category":"","confidence":0.0,"evidence":""}}],
  "education": [{{"institution":"","program_or_degree":"","field_of_study":"","status":"completed|in_progress|unknown","start_date":"","end_or_expected_date":"","evidence":""}}],
  "experience": [{{"employer":"","role":"","start_date":"","end_date":"","responsibilities":[],"skills_demonstrated":[],"evidence":""}}],
  "projects": [{{"name":"","description":"","skills_demonstrated":[],"evidence":""}}],
  "publications": [{{"title":"","citation":"","evidence":""}}],
  "certifications": [{{"name":"","provider":"","status":"completed|in_progress|unknown","evidence":""}}],
  "courses": [{{"name":"","institution_or_provider":"","status":"completed|in_progress|unknown","topics":[],"skills_demonstrated":[],"evidence":""}}]
}}

Important rules:
- Extract ALL employment roles with employer and dates.
- Extract ALL education/training records under Education.
- Extract publications explicitly listed in a Publications section.
- Extract explicit and strongly demonstrated skills, including technical tools, programming,
  analytics, engineering domains, project/leadership competencies, languages and professional
  methods when they are supported by the resume.
- Never emit isolated C/R unless explicitly presented as programming languages.
- Education is not a skill.

RESUME:
{text}
"""
    try:
        raw = await resilient_llm_generate(prompt, max_tokens_override=3600)
        data = json.loads(raw)
    except Exception as exc:
        print(f"[RESUME EVIDENCE] Structured extraction failed: {exc}")
        data = {}

    for key in ("education", "experience", "projects", "publications", "certifications", "courses"):
        if not isinstance(data.get(key), list):
            data[key] = []

    if not data["experience"]:
        data["experience"] = _fallback_experience(text)
    if not data["education"]:
        data["education"] = _fallback_education(text)
    if not data["publications"]:
        data["publications"] = _fallback_publications(text)

    combined_skills = (data.get("skills") or []) + _signal_skills(text)
    data["skills"] = _sanitize_skills(combined_skills)
    data["total_experience_years"] = _experience_years(data["experience"])
    return data


async def enhanced_upload(file: UploadFile = File(...)):
    filename = file.filename or "document"
    file_bytes = await file.read()
    text = _extract_text(filename, file_bytes)
    structured = await _structured_resume_evidence(text)

    skills = structured.get("skills") or []
    explanations = [
        {"skill": s.get("name"), "reasoning": "Supported by the uploaded resume.", "evidence": s.get("evidence") or ""}
        for s in skills
    ]

    ai_failed = False
    if not skills:
        try:
            old = await main_module.extract_skills_with_llm(text)
            skills = _sanitize_skills((old.get("skills") or []) + _signal_skills(text))
            explanations = old.get("explanations") or []
        except Exception as exc:
            print(f"[RESUME EVIDENCE] legacy extractor fallback failed: {exc}")
            ai_failed = True
    if not skills:
        skills = _sanitize_skills(main_module.local_skill_fallback(text) + _signal_skills(text))
        ai_failed = True

    # Keep the same structured evidence object attached to scoring so education, experience,
    # projects and publications influence career recommendations consistently on every path.
    structured["skills"] = skills
    recommendations = recommendation_module.get_career_recommendations(
        skills,
        top_n=8,
        structured_evidence=structured,
    )
    return {
        "filename": filename,
        "character_count": len(text),
        "skills_count": len(skills),
        "extracted_skills": skills,
        "explanations": explanations,
        "recommendations": recommendations,
        "education": structured.get("education", []),
        "experience": structured.get("experience", []),
        "total_experience_years": structured.get("total_experience_years", 0),
        "projects": structured.get("projects", []),
        "publications": structured.get("publications", []),
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


app.router.routes = [
    route for route in app.router.routes
    if not (getattr(route, "path", None) == "/api/upload" and "POST" in getattr(route, "methods", set()))
]
app.add_api_route("/api/upload", enhanced_upload, methods=["POST"], tags=["evidence"])
app.add_api_route("/api/resume-evidence", enhanced_upload, methods=["POST"], tags=["evidence"])
app.add_api_route("/api/course-alignment", course_alignment, methods=["POST"], tags=["evidence"])
