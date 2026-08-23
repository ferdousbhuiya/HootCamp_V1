"""Single-pass generic resume evidence and career-intelligence extraction.

One Groq request extracts the resume facts and proposes evidence-grounded career
blueprints. Career scores remain deterministic in dynamic_career_discovery.py.
"""

import json
from typing import Any, Dict


def install_combined_resume_intelligence(evidence_module, resilient_llm_generate):
    async def combined_structured_resume_evidence(text: str) -> Dict[str, Any]:
        prompt = f"""
Analyze this resume as a complete career evidence source for ANY profession. Extract only
information supported by the resume. Do not assume a technology or engineering career.
Preserve education, employment, projects, publications, credentials/licenses and courses
as separate evidence categories.

At the same time, identify 3 to 6 careers strongly supported by the complete evidence.
Prioritize the person's CURRENT profession and demonstrated specialty when professional
experience clearly establishes one. Then include natural specialization, advancement or
adjacent paths. Do not force the person into a predefined catalog and do not invent a
career pivot merely because a tool or transferable skill appears.

For every career provide 5 to 8 core competencies and evidence keywords. These are a
blueprint only. Do NOT calculate a match score. The application calculates scores itself.
For regulated professions, mark regulated_role=true and describe regulation broadly;
do not invent jurisdiction-specific legal requirements.

Return ONLY JSON in this structure:
{{
  "skills": [{{"name":"","category":"","confidence":0.0,"evidence":""}}],
  "education": [{{"institution":"","program_or_degree":"","field_of_study":"","status":"completed|in_progress|unknown","start_date":"","end_or_expected_date":"","evidence":""}}],
  "experience": [{{"employer":"","role":"","start_date":"","end_date":"","responsibilities":[],"skills_demonstrated":[],"evidence":""}}],
  "projects": [{{"name":"","description":"","skills_demonstrated":[],"evidence":""}}],
  "publications": [{{"title":"","citation":"","evidence":""}}],
  "certifications": [{{"name":"","provider":"","status":"completed|in_progress|unknown","evidence":""}}],
  "courses": [{{"name":"","institution_or_provider":"","status":"completed|in_progress|unknown","topics":[],"skills_demonstrated":[],"evidence":""}}],
  "career_profile": {{"primary_profession":"","professional_level":"student|entry|early-career|mid-career|senior|unknown","domain":"","specializations":[],"summary":""}},
  "career_candidates": [{{
    "canonical_title":"",
    "career_category":"",
    "career_summary":"",
    "candidate_relation":"current_profession|specialization|advancement|adjacent",
    "candidate_confidence":0.0,
    "candidate_evidence":[],
    "regulated_role":false,
    "regulation_note":"",
    "core_competencies":[],
    "competency_evidence_map":[{{"competency":"","evidence_keywords":[]}}],
    "domain_relevance_keywords":[],
    "recommended_subjects":[],
    "education_or_training_pathway":[],
    "credentials_or_licensing_areas":[],
    "experience_or_portfolio_evidence":[],
    "actions_30_days":[],
    "actions_6_months":[],
    "actions_1_year":[]
  }}]
}}

Extraction rules:
- Extract ALL employment roles, employers and dates.
- Extract ALL formal education.
- Credentials include professional licenses, certifications and named credentials exactly
  as supported by the resume. A resume-listed credential is evidence, not independent verification.
- Extract explicit and strongly demonstrated occupational skills from summary, skills and
  experience bullets, not only from a dedicated Skills section.
- Education and credentials are evidence categories, not skills.
- Candidate evidence must point to facts present in this resume.
- Current profession must outrank unrelated pivots when substantial experience supports it.

RESUME:
{text}
"""
        try:
            raw = await resilient_llm_generate(prompt, max_tokens_override=5200)
            data = json.loads(raw)
        except Exception as exc:
            print(f"[COMBINED RESUME INTELLIGENCE] AI extraction failed: {exc}")
            # Preserve the existing resilient evidence extractor as the fallback. This may
            # perform its own AI call, but only after the preferred single-pass call failed.
            return await original_extractor(text)

        for key in ("education", "experience", "projects", "publications", "certifications", "courses", "career_candidates"):
            if not isinstance(data.get(key), list):
                data[key] = []
        if not isinstance(data.get("career_profile"), dict):
            data["career_profile"] = {}

        if not data["experience"]:
            data["experience"] = evidence_module._fallback_experience(text)
        if not data["education"]:
            data["education"] = evidence_module._fallback_education(text)
        if not data["publications"]:
            data["publications"] = evidence_module._fallback_publications(text)

        combined_skills = (data.get("skills") or []) + evidence_module._signal_skills(text)
        data["skills"] = evidence_module._sanitize_skills(combined_skills)
        data["total_experience_years"] = evidence_module._experience_years(data["experience"])
        return data

    original_extractor = evidence_module._structured_resume_evidence
    evidence_module._structured_resume_evidence = combined_structured_resume_evidence
    return combined_structured_resume_evidence
