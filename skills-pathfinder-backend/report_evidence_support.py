"""Evidence-aware career report endpoint.

Career reports must use the same resume evidence and canonical Career Intelligence output.
This prevents contradictions and stops the report from inventing new credential names that
were not produced by the recommendation pipeline.
"""

import json
import re
from difflib import SequenceMatcher
from typing import Any, Dict, List

from pydantic import BaseModel, Field
from recommendation_cleanup import credentials_equivalent


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


def _credential_name(item: Any) -> str:
    if isinstance(item, dict):
        return str(item.get("name") or item.get("certification_name") or "").strip()
    return str(item or "").strip()


def _credential_has_authoritative_source(item: Any) -> bool:
    """Accept specific recommended credential names only when canonical metadata supports them.

    This is deliberately profession-neutral. AI-only names with a generic 'verify' provider
    are not promoted as established credentials in the final report.
    """
    if not isinstance(item, dict):
        return False
    if item.get("verification_url") or item.get("source_url") or item.get("official_url"):
        return True
    provider = str(item.get("provider") or item.get("issuer") or item.get("organization") or "").strip()
    if not provider:
        return False
    generic = provider.lower()
    if "verify with" in generic or "official/recognized" in generic or "recognized provider" in generic:
        return False
    return True


def _allowed_recommended_credentials(career_recommendations: List[Dict[str, Any]]) -> List[str]:
    output: List[str] = []
    for item in career_recommendations or []:
        if not isinstance(item, dict):
            continue
        data = item.get("recommendation_data") if isinstance(item.get("recommendation_data"), dict) else item
        for credential in data.get("recommended_certifications") or []:
            name = _credential_name(credential)
            if not name or not _credential_has_authoritative_source(credential):
                continue
            if not any(credentials_equivalent(name, existing) for existing in output):
                output.append(name)
    return output[:20]


def _norm_title(value: Any) -> str:
    text = str(value or "").lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _career_tokens(value: Any) -> set[str]:
    stop = {"and", "or", "the", "a", "an", "if", "experience", "aligns", "position", "positions", "role", "roles"}
    return {token for token in _norm_title(value).split() if len(token) > 2 and token not in stop}


def _same_career_title(left: Any, right: Any) -> bool:
    """Profession-neutral title comparison for report/canonical recommendation alignment."""
    a = _norm_title(left)
    b = _norm_title(right)
    if not a or not b:
        return False
    if a == b or a in b or b in a:
        return True
    ta, tb = _career_tokens(left), _career_tokens(right)
    if ta and tb:
        overlap = len(ta & tb) / max(1, min(len(ta), len(tb)))
        if overlap >= 0.60:
            return True
    return SequenceMatcher(None, a, b).ratio() >= 0.72


def _match_percentage(value: Any) -> float:
    try:
        score = float(value)
    except (TypeError, ValueError):
        return 0.0
    return score * 100.0 if 0.0 <= score <= 1.0 else score


def _gate_application_readiness(advice: Dict[str, Any], careers: List[Dict[str, Any]], threshold: float = 50.0) -> None:
    """Keep 'Can Apply Now' consistent with canonical Career Intelligence scores.

    Current profession is always preserved. Other careers must match a canonical career
    and meet the generic readiness threshold. Unmatched AI-invented titles are removed.
    """
    readiness = advice.get("application_readiness")
    if not isinstance(readiness, dict):
        return

    can_apply = readiness.get("can_apply_now") or []
    kept = []
    moved = []
    for entry in can_apply:
        title = str(entry or "").strip()
        if not title:
            continue
        matched = next((row for row in careers if _same_career_title(title, row.get("title"))), None)
        if not matched:
            continue
        relation = _norm_title(matched.get("candidate_relation")).replace(" ", "_")
        pct = _match_percentage(matched.get("match_percentage"))
        if relation == "current_profession" or pct >= threshold:
            kept.append(title)
        else:
            moved.append(title)

    readiness["can_apply_now"] = kept
    prepare = readiness.get("prepare_before_applying") or []
    existing_prepare = [str(item).strip() for item in prepare if str(item or "").strip()]
    for title in moved:
        if not any(_same_career_title(title, item) for item in existing_prepare):
            existing_prepare.append(title)
    readiness["prepare_before_applying"] = existing_prepare


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
        allowed_credentials = _allowed_recommended_credentials(request.career_recommendations)
        careers = []
        for item in request.career_recommendations[:8]:
            if not isinstance(item, dict):
                continue
            data = item.get("recommendation_data") if isinstance(item.get("recommendation_data"), dict) else {}
            career_credentials = []
            for credential in data.get("recommended_certifications") or item.get("recommended_certifications") or []:
                name = _credential_name(credential)
                if name and any(credentials_equivalent(name, allowed) for allowed in allowed_credentials):
                    career_credentials.append(name)
            careers.append({
                "title": item.get("path") or item.get("career_title") or data.get("path"),
                "candidate_relation": item.get("candidate_relation") or data.get("candidate_relation"),
                "match_percentage": item.get("match_percentage") or data.get("match_percentage") or item.get("match_score"),
                "matched_skills": item.get("matched_skills") or data.get("matched_skills") or [],
                "missing_skills": item.get("missing_skills") or data.get("missing_skills") or [],
                "match_reason": data.get("match_reason") or item.get("match_reason"),
                "recommended_certifications": career_credentials,
            })

        held_credentials = [
            _credential_name(item)
            for item in (evidence.get("certifications") or [])
            if _credential_name(item)
        ] + [
            _credential_name(item)
            for item in request.certifications
            if _credential_name(item)
        ]

        education_rule = (
            "Formal education evidence is present below. Mention only degrees, diplomas, fields, or education levels explicitly shown in that evidence."
            if education
            else "No formal education evidence is present below. Do not infer or claim a high school diploma, college degree, or any other education level; say only that no formal degree was detected if education must be discussed."
        )

        prompt = f"""
Create a career-development report from the student's complete evidence profile.

EVIDENCE RULES:
- Never say the student lacks a degree, license, certification, or experience when it is explicitly present below.
- {education_rule}
- Never state a specific degree, diploma, school credential, or education level unless it appears in Formal education from latest resume.
- Resume-listed licenses and credentials are valid resume evidence, but do NOT call them independently verified unless the saved/verified credential list confirms verification.
- Give the greatest weight to demonstrated professional experience, formal education, licenses/credentials, and the ranked Career Intelligence results.
- When the evidence strongly supports the student's existing profession, prioritize that profession and its logical advancement paths before suggesting unrelated career pivots.
- For regulated careers, distinguish formal education, resume-listed license/credential evidence, and independently verified credentials.
- Do not downgrade an experienced professional to entry level merely because a credential has not been uploaded separately to the verification store.
- Do not invent credentials, education, experience, clinical competencies, technical competencies, professional associations, fellowships, boards, or certification names.
- Recommended certifications may ONLY use names from ALLOWED RECOMMENDED CREDENTIALS below. If that list is empty, return an empty recommended_certifications list and describe development needs as training or specialty credentialing only if appropriate, without inventing a credential name.
- Do not recommend a credential that is equivalent to one already held, even if the wording or acronym differs.
- If Career Intelligence returns strong career matches, use those matches as the primary career paths rather than inventing unrelated alternatives.
- Avoid recommending beginner training that duplicates evidence already present.
- application_readiness.can_apply_now must not include a non-current career with weak Career Intelligence readiness. Treat the canonical Career Intelligence scores below as authoritative.

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
ALLOWED RECOMMENDED CREDENTIALS: {json.dumps(allowed_credentials)}

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

        # Final deterministic guard: only source-backed canonical credential names survive.
        report_credentials = advice.get("recommended_certifications") or []
        filtered_credentials = []
        for item in report_credentials:
            name = _credential_name(item)
            if not name:
                continue
            approved = next((allowed for allowed in allowed_credentials if credentials_equivalent(name, allowed)), None)
            if not approved:
                continue
            if any(credentials_equivalent(approved, held) for held in held_credentials):
                continue
            if not any(credentials_equivalent(approved, existing) for existing in filtered_credentials):
                filtered_credentials.append(approved)
        advice["recommended_certifications"] = filtered_credentials

        # Final deterministic readiness guard: report application-readiness cannot contradict
        # the canonical Career Intelligence scores supplied in the same request.
        _gate_application_readiness(advice, careers)

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