"""Evidence-aware career report endpoint.

Career reports must use the same resume evidence that powers Career Intelligence.
This prevents contradictions such as claiming a degree, license, or credential is
missing when it is explicitly listed in the latest resume. Resume-listed credentials
remain distinct from independently verified saved certificates.
"""

import json
from typing import Any, Dict, List

from pydantic import BaseModel, Field


class EvidenceAwareCareerAdviceRequest(BaseModel):
    skills: List[str] = Field(default_factory=list)
    certifications: List[Dict[str, Any]] = Field(default_factory=list)
    courses: List[Dict[str, Any]] = Field(default_factory=list)
    career_recommendations: List[Dict[str, Any]] = Field(default_factory=list)
    resume_evidence: Dict[str, Any] = Field(default_factory=dict)


def _compact_items(items, fields, limit=20):
    output = []
    for item in (items or [])[:limit]:
        if not isinstance(item, dict):
            continue
        row = {field: item.get(field) for field in fields if item.get(field) not in (None, "", [])}
        if row:
            output.append(row)
    return output


def install_evidence_aware_report(app, resilient_llm_generate):
    async def generate_evidence_aware_advice(request: EvidenceAwareCareerAdviceRequest):
        evidence = request.resume_evidence or {}
        education = _compact_items(
            evidence.get("education") or [],
            ["program_or_degree", "field_of_study", "institution", "status", "end_or_expected_date", "evidence"],
        )
        experience = _compact_items(
            evidence.get("experience") or [],
            ["role", "employer", "start_date", "end_date", "responsibilities", "skills_demonstrated", "evidence"],
        )
        resume_credentials = _compact_items(
            evidence.get("certifications") or [],
            ["name", "provider", "status", "evidence"],
        )
        projects = _compact_items(
            evidence.get("projects") or [],
            ["name", "description", "skills_demonstrated", "evidence"],
            limit=12,
        )
        publications = _compact_items(
            evidence.get("publications") or [],
            ["title", "citation", "evidence"],
            limit=10,
        )

        saved_credentials = _compact_items(
            request.certifications,
            ["certification_name", "provider", "is_verified", "verification_status", "status"],
        )
        courses = _compact_items(
            request.courses,
            ["course_name", "provider", "status", "expected_completion_date"],
        )
        careers = []
        for item in request.career_recommendations[:8]:
            if not isinstance(item, dict):
                continue
            data = item.get("recommendation_data") if isinstance(item.get("recommendation_data"), dict) else {}
            careers.append({
                "title": item.get("path") or item.get("career_title") or data.get("path"),
                "match_percentage": item.get("match_percentage") or data.get("match_percentage") or item.get("match_score"),
                "matched_skills": item.get("matched_skills") or data.get("matched_skills") or [],
                "missing_skills": item.get("missing_skills") or data.get("missing_skills") or [],
                "match_reason": data.get("match_reason") or item.get("match_reason"),
            })

        prompt = f"""
Create a career-development report from the student's complete evidence profile.

EVIDENCE RULES:
- Never say the student lacks a degree, license, certification, or experience when it is explicitly present below.
- Resume-listed licenses and credentials are valid resume evidence, but do NOT call them independently verified unless the saved/verified credential list confirms verification.
- Give the greatest weight to demonstrated professional experience, formal education, licenses/credentials, and the ranked Career Intelligence results.
- When the evidence strongly supports the student's existing profession, prioritize that profession and its logical advancement paths before suggesting unrelated career pivots.
- For regulated careers, distinguish three things: formal education, resume-listed license/credential evidence, and independently verified credentials.
- Do not downgrade an experienced professional to entry level merely because a credential has not been uploaded separately to the verification store.
- Do not invent credentials, education, experience, or clinical/technical competencies.
- If Career Intelligence returns strong career matches, use those matches as the primary career paths rather than inventing unrelated alternatives.
- Avoid recommending beginner training that duplicates evidence already present.

Skills: {json.dumps(request.skills[:120])}
Formal education from latest resume: {json.dumps(education)}
Professional experience from latest resume: {json.dumps(experience)}
Total resume experience years: {json.dumps(evidence.get('total_experience_years'))}
Credentials/licenses listed in latest resume (not independently verified unless also saved below): {json.dumps(resume_credentials)}
Saved or independently processed credentials: {json.dumps(saved_credentials)}
Projects: {json.dumps(projects)}
Publications: {json.dumps(publications)}
Ongoing courses: {json.dumps(courses)}
Career Intelligence matches: {json.dumps(careers)}

Return ONLY JSON:
{{
  "executive_summary": "",
  "swot_analysis": {{"strengths": [], "weaknesses": [], "opportunities": [], "threats": []}},
  "career_readiness": {{"current_level": "", "strongest_path": "", "alternative_paths": [], "major_constraints": []}},
  "action_plan": {{"30_days": [""], "6_months": [""], "1_year": [""]}},
  "recommended_next_skills": [],
  "recommended_certifications": [],
  "recommended_projects": [],
  "ongoing_course_alignment": [],
  "application_readiness": {{"can_apply_now": [], "prepare_before_applying": [], "regulated_roles_note": ""}}
}}

The regulated_roles_note should describe only requirements that are genuinely unresolved by the evidence. If a license is listed in the resume, say it is listed in the resume and may need independent verification for application purposes; do not say it is absent.
"""
        response = await resilient_llm_generate(prompt, max_tokens_override=2400)
        advice = json.loads(response)
        advice["evidence_summary"] = {
            "formal_education_count": len(education),
            "resume_credential_count": len(resume_credentials),
            "saved_credential_count": len(saved_credentials),
            "experience_role_count": len(experience),
            "total_experience_years": evidence.get("total_experience_years"),
        }
        return {"status": "success", "advice": advice}

    app.router.routes = [
        route for route in app.router.routes
        if not (
            getattr(route, "path", None) == "/api/generate-career-advice"
            and "POST" in getattr(route, "methods", set())
        )
    ]
    app.add_api_route(
        "/api/generate-career-advice",
        generate_evidence_aware_advice,
        methods=["POST"],
        tags=["career"],
    )
