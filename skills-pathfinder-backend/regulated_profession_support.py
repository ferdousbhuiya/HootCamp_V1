"""Generic regulated-profession evidence extensions for Skills Pathfinder.

The base career engine is intentionally conservative. This module adds domain-aware
support for professions where licenses, credentials, specialty practice, and formal
education are material evidence. Nursing is the first supported regulated domain,
but the design keeps the extension isolated from any individual resume.
"""

import re
from typing import Any, Dict, List


def _has_career(engine, career_id: str) -> bool:
    return any(item.get("id") == career_id for item in engine.CAREER_PATHS)


def _append_career(engine, career: Dict[str, Any]) -> None:
    if not _has_career(engine, career["id"]):
        engine.CAREER_PATHS.append(career)


def install_regulated_profession_support(evidence_module, recommendation_module, market_module=None) -> None:
    """Install evidence and career mappings for regulated professions.

    The rules only emit evidence that is explicitly present in resume text. They do
    not infer a license, certification, clinical procedure, or specialty from a job
    title alone.
    """

    original_signal_skills = evidence_module._signal_skills

    clinical_rules = [
        (r"\bpatient assessment\b", "Patient Assessment", "Clinical"),
        (r"\biv infusion(?: management)?\b|\bintravenous infusion\b", "IV Infusion Management", "Clinical"),
        (r"\bepic\b|\bcerner\b|electronic health records?|\behr\b", "Electronic Health Records", "Clinical Informatics"),
        (r"multidisciplinary collaboration|interdisciplinary collaboration|multidisciplinary team", "Multidisciplinary Collaboration", "Clinical"),
        (r"ventilator management|mechanical ventilation", "Ventilator Management", "Critical Care"),
        (r"hemodynamic monitoring", "Hemodynamic Monitoring", "Critical Care"),
        (r"rapid response coordination|rapid response team", "Rapid Response Coordination", "Critical Care"),
        (r"telemetry training|telemetry monitoring|\btelemetry\b", "Telemetry", "Critical Care"),
        (r"post[- ]operative care|postoperative care", "Postoperative Care", "Clinical"),
        (r"monitored vitals|vital signs?|vitals monitoring", "Vital Signs Monitoring", "Clinical"),
        (r"pain protocols?|pain management", "Pain Management", "Clinical"),
        (r"high[- ]acuity|critical care|\bicu\b|intensive care", "Critical Care Nursing", "Critical Care"),
        (r"medical[- ]surgical|med[- ]surg", "Medical-Surgical Nursing", "Clinical"),
        (r"\bregistered nurse\b|\brn\b", "Registered Nurse License", "Professional Credential"),
        (r"\bccrn\b", "CCRN", "Certification"),
        (r"\bacls\b", "ACLS", "Certification"),
        (r"\bpals\b", "PALS", "Certification"),
        (r"\bbls\b", "BLS", "Certification"),
    ]

    def regulated_signal_skills(text: str) -> List[Dict[str, Any]]:
        out = list(original_signal_skills(text))
        existing = {str(item.get("name") or "").strip().lower() for item in out}
        for pattern, name, category in clinical_rules:
            match = re.search(pattern, text or "", re.I | re.S)
            if match and name.lower() not in existing:
                out.append({
                    "name": name,
                    "category": category,
                    "confidence": 0.92,
                    "evidence": match.group(0)[:180],
                    "source": "resume_signal",
                })
                existing.add(name.lower())
        return out

    evidence_module._signal_skills = regulated_signal_skills

    recommendation_module.SKILL_ALIASES.update({
        "registered nurse": "registered nurse license",
        "rn license": "registered nurse license",
        "registered nurse il": "registered nurse license",
        "ehr": "electronic health records",
        "epic": "electronic health records",
        "cerner": "electronic health records",
        "critical care": "critical care nursing",
        "icu nursing": "critical care nursing",
        "med surg nursing": "medical-surgical nursing",
        "medical surgical nursing": "medical-surgical nursing",
    })

    recommendation_module.STRUCTURED_SKILL_TERMS.update({
        "registered nurse license": ["registered nurse", "registered nurse (il)", "rn license", " rn "],
        "ccrn": ["ccrn"],
        "acls": ["acls"],
        "bls": ["bls"],
        "pals": ["pals"],
        "patient assessment": ["patient assessment", "assessed patients"],
        "iv infusion management": ["iv infusion", "intravenous infusion"],
        "electronic health records": ["electronic health records", "epic", "cerner", "ehr"],
        "multidisciplinary collaboration": ["multidisciplinary collaboration", "multidisciplinary team", "interdisciplinary"],
        "critical care nursing": ["critical care", "icu", "intensive care", "high-acuity"],
        "ventilator management": ["ventilator management", "mechanical ventilation"],
        "hemodynamic monitoring": ["hemodynamic monitoring"],
        "rapid response coordination": ["rapid response coordination", "rapid response team"],
        "telemetry": ["telemetry"],
        "postoperative care": ["post-operative care", "postoperative care"],
        "vital signs monitoring": ["monitored vitals", "vital signs"],
        "pain management": ["pain protocols", "pain management"],
        "medical-surgical nursing": ["medical-surgical", "med-surg"],
    })

    _append_career(recommendation_module, {
        "id": "registered_nurse",
        "path": "Registered Nurse",
        "category": "Nursing",
        "required_skills": [
            "Registered Nurse License", "Patient Assessment", "Clinical Monitoring",
            "Medication / Treatment Administration", "Electronic Health Records",
            "Multidisciplinary Collaboration"
        ],
        "domain_terms": ["nursing", "registered nurse", "rn", "patient", "clinical", "hospital", "medical-surgical", "icu"],
        "domain_gate": ["nursing", "registered nurse", "rn", "patient", "clinical", "hospital"],
        "median_salary": "Verify current BLS data",
        "job_outlook": "Verify current BLS data",
        "top_locations": [],
    })
    _append_career(recommendation_module, {
        "id": "critical_care_nurse",
        "path": "Critical Care Nurse",
        "category": "Critical Care Nursing",
        "required_skills": [
            "Registered Nurse License", "Critical Care Nursing", "Patient Assessment",
            "Hemodynamic Monitoring", "Ventilator Management", "Rapid Response Coordination"
        ],
        "domain_terms": ["critical care", "icu", "intensive care", "high-acuity", "ventilator", "hemodynamic", "rapid response", "ccrn"],
        "domain_gate": ["critical care", "icu", "intensive care", "high-acuity", "ccrn"],
        "median_salary": "Verify current BLS data",
        "job_outlook": "Verify current BLS data",
        "top_locations": [],
    })
    _append_career(recommendation_module, {
        "id": "medical_surgical_nurse",
        "path": "Medical-Surgical Nurse",
        "category": "Nursing",
        "required_skills": [
            "Registered Nurse License", "Medical-Surgical Nursing", "Patient Assessment",
            "Postoperative Care", "Vital Signs Monitoring", "Pain Management"
        ],
        "domain_terms": ["medical-surgical", "med-surg", "post-operative", "postoperative", "vitals", "pain protocol", "nursing"],
        "domain_gate": ["medical-surgical", "med-surg", "post-operative", "postoperative", "nursing"],
        "median_salary": "Verify current BLS data",
        "job_outlook": "Verify current BLS data",
        "top_locations": [],
    })
    _append_career(recommendation_module, {
        "id": "nurse_educator",
        "path": "Nurse Educator",
        "category": "Nursing Education",
        "required_skills": [
            "Registered Nurse License", "Clinical Nursing", "Training / Education",
            "Team Leadership", "Patient Assessment", "Multidisciplinary Collaboration"
        ],
        "domain_terms": ["nurse", "nursing", "training", "staff education", "telemetry training", "clinical education"],
        "domain_gate": ["nurse", "nursing", "training", "clinical education"],
        "median_salary": "Verify current BLS data",
        "job_outlook": "Verify current BLS data",
        "top_locations": [],
    })

    # Cross-career competency aliases used by the generic scorer.
    recommendation_module.STRUCTURED_SKILL_TERMS.setdefault("clinical monitoring", []).extend([
        "hemodynamic monitoring", "telemetry", "monitored vitals", "vital signs"
    ])
    recommendation_module.STRUCTURED_SKILL_TERMS.setdefault("medication / treatment administration", []).extend([
        "administered", "iv infusion", "pain protocols", "post-operative care"
    ])
    recommendation_module.STRUCTURED_SKILL_TERMS.setdefault("clinical nursing", []).extend([
        "nurse", "nursing", "critical care", "medical-surgical"
    ])
    recommendation_module.STRUCTURED_SKILL_TERMS.setdefault("training / education", []).extend([
        "led telemetry training", "staff training", "education"
    ])

    if market_module is not None:
        market_module.CAREER_TO_BLS_TITLE.update({
            "critical care nurse": "Registered nurses",
            "medical surgical nurse": "Registered nurses",
            "medical-surgical nurse": "Registered nurses",
            "nurse educator": "Nursing instructors and teachers, postsecondary",
        })
        market_module.CAREER_TO_ONET_TITLE.update({
            "registered nurse": "Registered Nurses",
            "critical care nurse": "Critical Care Nurses",
            "medical surgical nurse": "Registered Nurses",
            "medical-surgical nurse": "Registered Nurses",
            "nurse educator": "Nursing Instructors and Teachers, Postsecondary",
        })
        # BLS code is added only for mappings with a known current OEWS occupation code.
        market_module.BLS_TITLE_TO_OCCUPATION_CODE.setdefault("Nursing instructors and teachers, postsecondary", "251072")
