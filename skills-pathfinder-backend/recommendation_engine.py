"""Skills Pathfinder career recommendation engine.

The current knowledge base is intentionally small while the project moves toward
an O*NET/BLS-backed occupation layer.  The scoring code is production-oriented:
it normalizes known aliases, never uses arbitrary substring matching, considers
extraction confidence, and returns explainable match/gap metrics while preserving
the response fields consumed by the React frontend.
"""

import re
from typing import Any, Dict, Iterable, List, Optional, Tuple


CAREER_PATHS = [
    {
        "id": "electrical_engineer",
        "path": "Electrical Engineer",
        "category": "Engineering",
        "required_skills": ["Power Distribution", "Overhead Lines", "HSE Compliance", "Project Management", "AutoCAD", "Troubleshooting"],
        "job_outlook": "7% growth (2022-2032)",
        "median_salary": "$104,630",
        "top_locations": ["Texas", "California", "Florida", "New York"],
        "recommended_certifications": [
            {"name": "Professional Engineer (PE) License", "provider": "NCEES", "time": "4-6 years experience + exam", "cost": "$300-$1,000", "url": "https://www.ncees.org/engineering/licensing"},
            {"name": "IEEE Senior Member", "provider": "IEEE", "time": "5+ years experience", "cost": "$100/year", "url": "https://www.ieee.org/membership"},
            {"name": "Project Management Professional (PMP)", "provider": "PMI", "time": "3-6 months preparation", "cost": "$405-$575", "url": "https://www.pmi.org/certifications/pmp"},
        ],
        "recommended_degrees": [
            {"name": "Master of Science in Electrical Engineering", "type": "Master's Degree", "duration": "2 years", "format": "Online/On-campus"},
            {"name": "MBA with Engineering Management Focus", "type": "Master's Degree", "duration": "2 years", "format": "Online/On-campus"},
        ],
        "next_steps": [
            "Complete PE exam preparation and schedule your exam",
            "Join IEEE and attend local chapter meetings for networking",
            "Apply for electrical engineer roles aligned with your strongest technical experience",
            "Consider a master's degree for deeper specialization or management advancement",
            "Build a portfolio of completed projects with measurable outcomes",
        ],
        "learning_resources": [
            {"name": "IEEE Power & Energy Society Courses", "type": "Online", "cost": "Free-$200", "url": "https://www.ieee-pes.org/education/"},
            {"name": "Coursera Power Systems Courses", "type": "Online", "cost": "Varies", "url": "https://www.coursera.org/search?query=power%20systems"},
        ],
    },
    {
        "id": "data_analyst",
        "path": "Data Analyst",
        "category": "Data & Analytics",
        "required_skills": ["Python", "SQL", "Power BI", "Tableau", "Data Analytics", "Advanced Excel"],
        "job_outlook": "23% growth (2022-2032)",
        "median_salary": "$93,750",
        "top_locations": ["California", "New York", "Texas", "Washington"],
        "recommended_certifications": [
            {"name": "Google Data Analytics Professional Certificate", "provider": "Google/Coursera", "time": "About 6 months", "cost": "Subscription", "url": "https://www.coursera.org/professional-certificates/google-data-analytics"},
            {"name": "Microsoft Power BI Data Analyst", "provider": "Microsoft", "time": "Self-paced", "cost": "Exam fee varies", "url": "https://learn.microsoft.com/credentials/certifications/power-bi-data-analyst-associate/"},
            {"name": "Tableau Desktop Specialist", "provider": "Tableau", "time": "Self-paced", "cost": "Exam fee varies", "url": "https://www.tableau.com/learn/certification"},
        ],
        "recommended_degrees": [
            {"name": "Master of Science in Data Science", "type": "Master's Degree", "duration": "1-2 years", "format": "Online/On-campus"},
            {"name": "Master of Business Analytics", "type": "Master's Degree", "duration": "1-2 years", "format": "Online/On-campus"},
        ],
        "next_steps": [
            "Build a portfolio with 3-5 data analysis projects",
            "Strengthen SQL, spreadsheet analysis and visualization skills",
            "Practice communicating findings with dashboards and concise business recommendations",
            "Apply for analyst roles that match your strongest domain knowledge",
        ],
        "learning_resources": [
            {"name": "Kaggle Learn", "type": "Online", "cost": "Free", "url": "https://www.kaggle.com/learn"},
            {"name": "Microsoft Learn Power BI", "type": "Online", "cost": "Free", "url": "https://learn.microsoft.com/training/powerplatform/power-bi/"},
        ],
    },
    {
        "id": "electrical_engineering_manager",
        "path": "Electrical Engineering Manager",
        "category": "Engineering Management",
        "required_skills": ["Project Management", "Team Leadership", "Budget Management", "HSE Compliance", "Power Distribution", "Stakeholder Collaboration"],
        "job_outlook": "4% growth (2022-2032)",
        "median_salary": "$156,350",
        "top_locations": ["California", "Texas", "New York", "Illinois"],
        "recommended_certifications": [
            {"name": "Project Management Professional (PMP)", "provider": "PMI", "time": "3-6 months preparation", "cost": "Exam fee varies", "url": "https://www.pmi.org/certifications/project-management-pmp"},
            {"name": "Six Sigma Green Belt", "provider": "ASQ", "time": "2-4 months", "cost": "Varies", "url": "https://www.asq.org/cert/six-sigma-green-belt"},
        ],
        "recommended_degrees": [
            {"name": "MBA with Engineering Management", "type": "Master's Degree", "duration": "2 years", "format": "Online/On-campus"},
            {"name": "Master of Engineering Management", "type": "Master's Degree", "duration": "1-2 years", "format": "Online/On-campus"},
        ],
        "next_steps": [
            "Seek measurable team or project leadership responsibilities",
            "Strengthen budgeting, stakeholder and risk-management experience",
            "Consider PMP or an engineering-management graduate program",
        ],
        "learning_resources": [
            {"name": "PMI Learning", "type": "Professional", "cost": "Varies", "url": "https://www.pmi.org/learning"},
        ],
    },
    {
        "id": "power_systems_engineer",
        "path": "Power Systems Engineer",
        "category": "Specialized Engineering",
        "required_skills": ["Power Distribution", "MV Electrical Power Distribution", "Overhead Lines", "Underground Cabling", "AutoCAD", "GIS"],
        "job_outlook": "9% growth (2022-2032)",
        "median_salary": "$115,000",
        "top_locations": ["Texas", "California", "Florida", "Arizona"],
        "recommended_certifications": [
            {"name": "Professional Engineer (PE) - Power", "provider": "NCEES", "time": "Experience + exam", "cost": "Varies", "url": "https://ncees.org/exams/pe-exam/"},
            {"name": "Certified Energy Manager", "provider": "AEE", "time": "Varies", "cost": "Varies", "url": "https://www.aeecenter.org/certified-energy-manager/"},
        ],
        "recommended_degrees": [
            {"name": "Master of Science in Power Systems Engineering", "type": "Master's Degree", "duration": "2 years", "format": "Online/On-campus"},
            {"name": "Master of Science in Renewable Energy", "type": "Master's Degree", "duration": "1-2 years", "format": "Online/On-campus"},
        ],
        "next_steps": [
            "Gain experience with power-system analysis and protection",
            "Learn an industry power-system simulation tool",
            "Develop grid-modernization and renewable-integration knowledge",
            "Review PE eligibility for the state where you intend to practice",
        ],
        "learning_resources": [
            {"name": "IEEE Power & Energy Society", "type": "Professional Organization", "cost": "Membership varies", "url": "https://www.ieee-pes.org/"},
        ],
    },
    {
        "id": "renewable_energy_engineer",
        "path": "Renewable Energy Engineer",
        "category": "Green Energy",
        "required_skills": ["Solar Power System Installation", "Power Distribution", "Project Management", "HSE Compliance", "AutoCAD"],
        "job_outlook": "15% growth (2022-2032)",
        "median_salary": "$102,000",
        "top_locations": ["California", "Texas", "Florida", "Arizona", "Nevada"],
        "recommended_certifications": [
            {"name": "NABCEP PV Installation Professional", "provider": "NABCEP", "time": "Eligibility + exam", "cost": "Varies", "url": "https://www.nabcep.org/certifications/nabcep-board-certifications/"},
            {"name": "LEED Green Associate", "provider": "USGBC", "time": "Self-paced", "cost": "Exam fee varies", "url": "https://www.usgbc.org/credentials/leed-green-associate"},
        ],
        "recommended_degrees": [
            {"name": "Master of Science in Renewable Energy", "type": "Master's Degree", "duration": "1-2 years", "format": "Online/On-campus"},
            {"name": "Master of Science in Sustainable Energy", "type": "Master's Degree", "duration": "2 years", "format": "Online/On-campus"},
        ],
        "next_steps": [
            "Build renewable-energy project experience",
            "Learn battery storage and grid-integration fundamentals",
            "Review NABCEP pathways if solar installation is your target specialty",
        ],
        "learning_resources": [
            {"name": "NABCEP Resources", "type": "Professional", "cost": "Varies", "url": "https://www.nabcep.org/"},
        ],
    },
    {
        "id": "software_tester",
        "path": "Software Test Engineer",
        "category": "Software & IT",
        "required_skills": ["Selenium", "Java", "SQL", "Software Testing", "Automation"],
        "job_outlook": "25% growth (2022-2032)",
        "median_salary": "$99,000",
        "top_locations": ["California", "Washington", "Texas", "New York"],
        "recommended_certifications": [
            {"name": "ISTQB Certified Tester", "provider": "ISTQB", "time": "Self-paced", "cost": "Exam fee varies", "url": "https://www.istqb.org/certifications/"},
            {"name": "AWS Certified Cloud Practitioner", "provider": "AWS", "time": "Self-paced", "cost": "Exam fee varies", "url": "https://aws.amazon.com/certification/certified-cloud-practitioner/"},
        ],
        "recommended_degrees": [
            {"name": "Master of Science in Computer Science", "type": "Master's Degree", "duration": "2 years", "format": "Online/On-campus"},
            {"name": "Master of Science in Software Engineering", "type": "Master's Degree", "duration": "2 years", "format": "Online/On-campus"},
        ],
        "next_steps": [
            "Build an automated testing portfolio",
            "Learn API testing and CI/CD integration",
            "Practice test design, defect reporting and regression strategy",
        ],
        "learning_resources": [
            {"name": "Selenium Documentation", "type": "Online", "cost": "Free", "url": "https://www.selenium.dev/documentation/"},
        ],
    },
    {
        "id": "project_manager_engineering",
        "path": "Engineering Project Manager",
        "category": "Project Management",
        "required_skills": ["Project Management", "Stakeholder Collaboration", "Budget Management", "HSE Compliance", "Team Leadership", "Risk Management"],
        "job_outlook": "6% growth (2022-2032)",
        "median_salary": "$135,000",
        "top_locations": ["California", "Texas", "New York", "Illinois", "Florida"],
        "recommended_certifications": [
            {"name": "Project Management Professional (PMP)", "provider": "PMI", "time": "3-6 months preparation", "cost": "Exam fee varies", "url": "https://www.pmi.org/certifications/project-management-pmp"},
            {"name": "Certified ScrumMaster", "provider": "Scrum Alliance", "time": "Course + assessment", "cost": "Varies", "url": "https://www.scrumalliance.org/get-certified/scrum-master-track/certified-scrummaster"},
        ],
        "recommended_degrees": [
            {"name": "MBA with Project Management Focus", "type": "Master's Degree", "duration": "2 years", "format": "Online/On-campus"},
            {"name": "Master of Science in Project Management", "type": "Master's Degree", "duration": "1-2 years", "format": "Online/On-campus"},
        ],
        "next_steps": [
            "Document project scope, schedule, budget and outcome achievements",
            "Strengthen stakeholder, risk and team-leadership skills",
            "Consider PMP when eligibility requirements are met",
        ],
        "learning_resources": [
            {"name": "PMI Learning", "type": "Professional", "cost": "Varies", "url": "https://www.pmi.org/learning"},
        ],
    },
    {
        "id": "controls_engineer",
        "path": "Controls/Automation Engineer",
        "category": "Automation & Control",
        "required_skills": ["Troubleshooting", "Electrical Systems", "Mechanical Systems", "AutoCAD", "Python", "Project Management"],
        "job_outlook": "8% growth (2022-2032)",
        "median_salary": "$108,000",
        "top_locations": ["Michigan", "Ohio", "Texas", "California", "Illinois"],
        "recommended_certifications": [
            {"name": "Certified Automation Professional", "provider": "ISA", "time": "Eligibility + exam", "cost": "Varies", "url": "https://www.isa.org/certification/cap"},
        ],
        "recommended_degrees": [
            {"name": "Master of Science in Control Systems Engineering", "type": "Master's Degree", "duration": "2 years", "format": "Online/On-campus"},
            {"name": "Master of Science in Mechatronics", "type": "Master's Degree", "duration": "2 years", "format": "Online/On-campus"},
        ],
        "next_steps": [
            "Learn PLC programming and industrial automation fundamentals",
            "Gain experience with SCADA/HMI systems",
            "Learn industrial networking protocols and controls troubleshooting",
        ],
        "learning_resources": [
            {"name": "ISA Training", "type": "Professional", "cost": "Varies", "url": "https://www.isa.org/training"},
        ],
    },
]


# Canonical aliases intentionally stay explicit.  We do not use arbitrary
# substring matching because it makes unrelated skills such as Power and Power
# BI appear equivalent.
SKILL_ALIASES = {
    "ms excel": "excel",
    "microsoft excel": "excel",
    "excel spreadsheet": "excel",
    "powerbi": "power bi",
    "ms power bi": "power bi",
    "microsoft power bi": "power bi",
    "postgres": "postgresql",
    "postgres sql": "postgresql",
    "mssql": "sql server",
    "microsoft sql server": "sql server",
    "js": "javascript",
    "nodejs": "node.js",
    "node js": "node.js",
    "scikit learn": "scikit-learn",
    "sklearn": "scikit-learn",
    "google cloud platform": "gcp",
    "microsoft azure": "azure",
    "project management professional": "pmp",
    "health safety environment": "hse compliance",
    "health safety and environment": "hse compliance",
    "medium voltage electrical power distribution": "mv electrical power distribution",
    "medium voltage power distribution": "mv electrical power distribution",
    "power systems": "power system",
    "data analysis": "data analytics",
}


def _normalize_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9+#./ -]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" .-/")
    return SKILL_ALIASES.get(text, text)


def _safe_confidence(value: Any) -> float:
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return 0.70
    return max(0.0, min(1.0, confidence))


def _build_skill_index(extracted_skills: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    index: Dict[str, Dict[str, Any]] = {}
    for skill in extracted_skills or []:
        if not isinstance(skill, dict):
            continue
        display_name = str(skill.get("name") or "").strip()
        canonical = _normalize_text(display_name)
        if not canonical:
            continue
        confidence = _safe_confidence(skill.get("confidence"))
        current = index.get(canonical)
        if current is None or confidence > current["confidence"]:
            index[canonical] = {
                "name": display_name,
                "confidence": confidence,
                "category": skill.get("category") or "Other",
                "source": skill.get("source") or "document",
            }
    return index


def _required_skill_weight(career: Dict[str, Any], skill_name: str) -> float:
    """Return configured importance, defaulting to equal importance."""
    configured = career.get("skill_weights") or {}
    try:
        return max(0.01, float(configured.get(skill_name, 1.0)))
    except (TypeError, ValueError):
        return 1.0


def _match_required_skill(required_skill: str, skill_index: Dict[str, Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    required_key = _normalize_text(required_skill)
    direct = skill_index.get(required_key)
    if direct:
        return direct

    # Controlled equivalences that represent a genuine hierarchy rather than a
    # textual substring.  More can be added as the occupation vocabulary grows.
    hierarchy = {
        "advanced excel": {"advanced excel"},
        "data analytics": {"data analytics"},
        "electrical systems": {"electrical systems", "electrical engineering", "electrical power"},
        "power distribution": {"power distribution", "mv electrical power distribution"},
        "mv electrical power distribution": {"mv electrical power distribution"},
        "solar power system installation": {"solar power system installation", "solar power"},
        "team leadership": {"team leadership", "leadership"},
        "stakeholder collaboration": {"stakeholder collaboration", "stakeholder management"},
        "software testing": {"software testing", "quality assurance", "qa testing"},
        "automation": {"automation", "test automation", "industrial automation"},
    }
    for candidate in hierarchy.get(required_key, {required_key}):
        found = skill_index.get(candidate)
        if found:
            return found
    return None


def calculate_match_score(
    extracted_skills: List[Dict[str, Any]],
    required_skills: List[str],
    skill_weights: Optional[Dict[str, float]] = None,
) -> Tuple[float, List[str], List[str]]:
    """Compatibility scorer used by existing API call sites.

    Confidence is incorporated into each matched required skill.  A detected
    skill contributes between 65% and 100% of its configured weight depending
    on extraction confidence, preventing low-confidence OCR/AI output from
    counting exactly the same as high-confidence evidence.
    """
    if not required_skills:
        return 0.0, [], []

    skill_index = _build_skill_index(extracted_skills)
    matched: List[str] = []
    missing: List[str] = []
    earned = 0.0
    total = 0.0
    weights = skill_weights or {}

    for required in required_skills:
        try:
            weight = max(0.01, float(weights.get(required, 1.0)))
        except (TypeError, ValueError):
            weight = 1.0
        total += weight
        evidence = _match_required_skill(required, skill_index)
        if evidence:
            matched.append(required)
            confidence_factor = 0.65 + (0.35 * evidence["confidence"])
            earned += weight * confidence_factor
        else:
            missing.append(required)

    return round(earned / total, 4), matched, missing


def _score_career(extracted_skills: List[Dict[str, Any]], career: Dict[str, Any]) -> Dict[str, Any]:
    skill_index = _build_skill_index(extracted_skills)
    required = career.get("required_skills") or []
    matched: List[str] = []
    missing: List[str] = []
    matched_details: List[Dict[str, Any]] = []
    earned = 0.0
    total = 0.0

    for required_skill in required:
        weight = _required_skill_weight(career, required_skill)
        total += weight
        evidence = _match_required_skill(required_skill, skill_index)
        if evidence:
            matched.append(required_skill)
            factor = 0.65 + (0.35 * evidence["confidence"])
            contribution = weight * factor
            earned += contribution
            matched_details.append({
                "required_skill": required_skill,
                "evidence_skill": evidence["name"],
                "confidence": round(evidence["confidence"], 3),
                "source": evidence["source"],
                "weight": round(weight, 3),
            })
        else:
            missing.append(required_skill)

    score = (earned / total) if total else 0.0
    score = round(max(0.0, min(1.0, score)), 4)
    match_pct = round(score * 100, 1)
    gap_pct = round((1.0 - score) * 100, 1)

    if matched:
        strongest = ", ".join(matched[:3])
        reason = f"Matches {len(matched)} of {len(required)} core skills, including {strongest}."
    else:
        reason = "No core required skills were matched with sufficient evidence."

    return {
        "match_score": score,
        "match_percentage": match_pct,
        "skill_gap_percentage": gap_pct,
        "matched_skills": matched,
        "missing_skills": missing,
        "matched_skill_details": matched_details,
        "match_reason": reason,
    }


def get_career_recommendations(extracted_skills: List[Dict[str, Any]], top_n: int = 5) -> List[Dict[str, Any]]:
    recommendations: List[Dict[str, Any]] = []
    for career in CAREER_PATHS:
        scoring = _score_career(extracted_skills, career)
        if scoring["match_score"] < 0.30:
            continue
        recommendations.append({
            "id": career["id"],
            "path": career["path"],
            "category": career["category"],
            **scoring,
            "job_outlook": career.get("job_outlook"),
            "median_salary": career.get("median_salary"),
            "top_locations": career.get("top_locations") or [],
            "recommended_certifications": career.get("recommended_certifications") or [],
            "recommended_degrees": career.get("recommended_degrees") or [],
            "next_steps": career.get("next_steps") or [],
            "learning_resources": career.get("learning_resources") or [],
        })

    recommendations.sort(
        key=lambda item: (item["match_score"], len(item["matched_skills"])),
        reverse=True,
    )
    return recommendations[: max(1, int(top_n or 5))]


def get_skill_gap_analysis(extracted_skills: List[Dict[str, Any]], target_career_id: str) -> Optional[Dict[str, Any]]:
    target = next((career for career in CAREER_PATHS if career["id"] == target_career_id), None)
    if not target:
        return None

    scoring = _score_career(extracted_skills, target)
    missing = scoring["missing_skills"]
    return {
        "career_id": target["id"],
        "career": target["path"],
        **scoring,
        "priority_missing_skills": missing[:3],
        "recommended_certifications": target.get("recommended_certifications") or [],
        "recommended_degrees": target.get("recommended_degrees") or [],
        "next_steps": target.get("next_steps") or [],
        "learning_resources": target.get("learning_resources") or [],
    }
