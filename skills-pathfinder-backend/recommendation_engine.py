"""Skills Pathfinder evidence-aware career recommendation engine.

Career readiness combines demonstrated competencies with career-domain evidence.
Transferable skills can support a career, but specialized careers require evidence
from the appropriate domain so generic management skills do not create unrelated
recommendations.
"""
import re
from datetime import date
from typing import Any, Dict, Iterable

CAREER_PATHS = [
    {"id":"industrial_engineer","path":"Industrial Engineer","category":"Industrial Engineering","required_skills":["Process Improvement","Data Analysis","Microsoft Excel","Project Management","Workflow Analysis","Problem Solving"],"domain_terms":["industrial engineering","business process","process improvement","workflow","operational","operations","standardized procedures","efficien"],"domain_gate":["industrial engineering","business process","process improvement","workflow","operational","operations"],"median_salary":"$101,140","job_outlook":"Verify current BLS data","top_locations":[]},
    {"id":"business_process_analyst","path":"Business Process Analyst","category":"Business & Process Analysis","required_skills":["Process Improvement","Data Analysis","Microsoft Excel","Workflow Analysis","Stakeholder Collaboration","Project Management"],"domain_terms":["business process","workflow","standardized procedures","data governance","data integrity","process improvement","operational time","client objectives"],"domain_gate":["business process","workflow","standardized procedures","data governance","process improvement"],"median_salary":"$100,000","job_outlook":"Verify current market data","top_locations":[]},
    {"id":"management_analyst","path":"Management Analyst / Consultant","category":"Consulting","required_skills":["Market Research","Data Analysis","Stakeholder Collaboration","Project Management","Presentation","Problem Solving"],"domain_terms":["consultant","consulting","client","market research","competitive analysis","strategic recommendations","whitepaper","industry experts"],"domain_gate":["consultant","consulting","client","market research","competitive analysis"],"median_salary":"$101,190","job_outlook":"Verify current BLS data","top_locations":[]},
    {"id":"operations_analyst","path":"Operations Analyst","category":"Operations & Analytics","required_skills":["Data Analysis","Microsoft Excel","Process Improvement","Workflow Analysis","Data Governance","Problem Solving"],"domain_terms":["operational","operations","workflow","data accuracy","data governance","data integrity","inefficien","standardized procedures"],"domain_gate":["operational","operations","workflow","data governance","standardized procedures"],"median_salary":"$95,000","job_outlook":"Verify current market data","top_locations":[]},
    {"id":"business_intelligence_analyst","path":"Business Intelligence Analyst","category":"Data & Analytics","required_skills":["Power BI","Tableau","Microsoft Excel","Data Analysis","Data Visualization","Stakeholder Collaboration"],"domain_terms":["power bi","tableau","data visualization","market data","research insights","data analysis","excel"],"domain_gate":["power bi","tableau","data visualization","data analysis"],"median_salary":"$100,000","job_outlook":"Verify current market data","top_locations":[]},
    {"id":"data_analyst","path":"Data Analyst","category":"Data & Analytics","required_skills":["Python","SQL","Power BI","Tableau","Data Analytics","Advanced Excel"],"domain_terms":["data analytics","data analyst","python","sql","power bi","tableau","data visualization"],"domain_gate":["data analytics","data analyst","python","sql","power bi","tableau"],"median_salary":"$93,750","job_outlook":"Verify current BLS data","top_locations":[]},
    {"id":"electrical_engineer","path":"Electrical Engineer","category":"Engineering","required_skills":["Power Distribution","Overhead Lines","HSE Compliance","Project Management","AutoCAD","Troubleshooting"],"domain_terms":["electrical engineering","electrical engineer","power distribution","electrical power","overhead line","underground cabl"],"domain_gate":["electrical engineering","electrical engineer","power distribution","electrical power","overhead line","underground cabl"],"median_salary":"$104,630","job_outlook":"Verify current BLS data","top_locations":[]},
    {"id":"electrical_engineering_manager","path":"Electrical Engineering Manager","category":"Engineering Management","required_skills":["Project Management","Team Leadership","Budget Management","HSE Compliance","Power Distribution","Stakeholder Collaboration"],"domain_terms":["electrical engineering","electrical engineer","power distribution","electrical power"],"domain_gate":["electrical engineering","electrical engineer","power distribution","electrical power"],"median_salary":"$156,350","job_outlook":"Verify current BLS data","top_locations":[]},
    {"id":"power_systems_engineer","path":"Power Systems Engineer","category":"Specialized Engineering","required_skills":["Power Distribution","MV Electrical Power Distribution","Overhead Lines","Underground Cabling","AutoCAD","GIS"],"domain_terms":["power system","power distribution","electrical engineering","overhead line","underground cabl","11 kv","33/11"],"domain_gate":["power system","power distribution","electrical engineering","overhead line","underground cabl","11 kv","33/11"],"median_salary":"$115,000","job_outlook":"Verify current market data","top_locations":[]},
    {"id":"mechanical_engineer","path":"Mechanical Engineer","category":"Mechanical Engineering","required_skills":["Mechanical Design","CAD","Engineering Drawings","MATLAB","Troubleshooting","Simulation Analysis"],"domain_terms":["mechanical engineering","mechanical engineer","mechanical design","hvac","thermodynamics","heat transfer","mechanical systems"],"domain_gate":["mechanical engineering","mechanical engineer","mechanical design","hvac"],"median_salary":"$102,320","job_outlook":"Verify current BLS data","top_locations":[]},
    {"id":"mechanical_design_engineer","path":"Mechanical Design Engineer","category":"Mechanical Design","required_skills":["Mechanical Design","CAD","Engineering Drawings","Creo Parametric","Siemens NX","Simulation Analysis"],"domain_terms":["mechanical engineering","mechanical design","siemens nx","creo parametric","cad","fuselage","mechanical sculpture"],"domain_gate":["mechanical engineering","mechanical design","siemens nx","creo parametric","fuselage"],"median_salary":"$105,000","job_outlook":"Verify current market data","top_locations":[]},
    {"id":"hvac_engineer","path":"HVAC Engineer","category":"Building Systems","required_skills":["HVAC Load Calculations","AutoCAD","Microsoft Excel","Mechanical Design","Heat Transfer","Troubleshooting"],"domain_terms":["hvac","air terminal","load calculations","heat transfer","thermodynamics","mechanical engineering"],"domain_gate":["hvac","air terminal","load calculations"],"median_salary":"$98,000","job_outlook":"Verify current market data","top_locations":[]},
    {"id":"manufacturing_engineer","path":"Manufacturing Engineer","category":"Manufacturing","required_skills":["Mechanical Design","CAD","3D Printing","MIG Welding","Troubleshooting","Project Management"],"domain_terms":["manufactur","fabrication","mechanical engineering","mechanical design","3d printing","welding"],"domain_gate":["manufactur","fabrication","3d printing","welding"],"median_salary":"$101,000","job_outlook":"Verify current market data","top_locations":[]},
    {"id":"product_design_engineer","path":"Product Design Engineer","category":"Product Development","required_skills":["Mechanical Design","CAD","Creo Parametric","Simulation Analysis","Structural Optimization","Project Management"],"domain_terms":["mechanical design","product design","design project","creo parametric","structural optimization"],"domain_gate":["mechanical design","product design","creo parametric","structural optimization"],"median_salary":"$105,000","job_outlook":"Verify current market data","top_locations":[]},
    {"id":"software_tester","path":"Software Test Engineer","category":"Software & IT","required_skills":["Selenium","Java","SQL","Software Testing","Automation"],"domain_terms":["software testing","selenium","test automation"],"domain_gate":["software testing","selenium","test automation"],"median_salary":"$99,000","job_outlook":"Verify current market data","top_locations":[]},
    {"id":"project_manager_engineering","path":"Engineering Project Manager","category":"Project Management","required_skills":["Project Management","Stakeholder Collaboration","Budget Management","HSE Compliance","Team Leadership","Risk Management"],"domain_terms":["engineering","engineering project","project management","project coordination"],"domain_gate":["engineering","engineering project"],"median_salary":"$135,000","job_outlook":"Verify current market data","top_locations":[]},
    {"id":"controls_engineer","path":"Controls/Automation Engineer","category":"Automation & Control","required_skills":["Troubleshooting","Electrical Systems","Mechanical Systems","AutoCAD","Python","Project Management"],"domain_terms":["automation","controls","electrical engineering","mechanical engineering"],"domain_gate":["automation","controls","electrical engineering","mechanical engineering"],"median_salary":"$108,000","job_outlook":"Verify current market data","top_locations":[]},
]

SKILL_ALIASES={
    "ms excel":"excel","microsoft excel":"excel","advanced excel":"excel","excel spreadsheet":"excel",
    "powerbi":"power bi","microsoft power bi":"power bi","data analysis":"data analytics",
    "project coordination":"project management","engineering project management":"project management",
    "stakeholder management":"stakeholder collaboration","leadership":"team leadership",
    "health safety environment":"hse compliance","hse":"hse compliance",
    "mechanical troubleshooting":"troubleshooting","overhead line":"overhead lines",
    "underground cable":"underground cabling","fusion360":"fusion 360"
}

# Transferable skills are useful, but they must not dominate a specialized career score.
TRANSFERABLE_SKILLS={
    "project management","team leadership","budget management","stakeholder collaboration",
    "presentation","problem solving","microsoft excel","advanced excel","excel",
    "risk management","workflow analysis","process improvement"
}

STRUCTURED_SKILL_TERMS={
    "project management":["project management","project plan","project coordination","progress meetings","deliverables"],
    "team leadership":["supervised a team","led a ","managed a ","team of four","executive board","delegating roles"],
    "budget management":["annual budget","managed a $","budget","allocating resources"],
    "stakeholder collaboration":["client objectives","present findings to clients","client presentations","industry experts","group members","stakeholder"],
    "market research":["market research","competitive analysis","primary and secondary research","market data"],
    "presentation":["present findings","presentations","storytelling quality","presented reports"],
    "problem solving":["problem","recommendations","identify and eliminate inefficiencies","root cause","corrective actions"],
    "process improvement":["standardized procedures","standardize operational","eliminate inefficiencies","improving data accuracy","process improvement"],
    "workflow analysis":["workflow","operational time estimates","standardized procedures","process"],
    "data governance":["data governance","data integrity","compliance"],
    "data analysis":["data analysis","analyzing market data","financial models","excel-based tool","analysis"],
    "data analytics":["data analytics","data analysis","analyzing market data"],
    "data visualization":["data visualization","visualized research insights","power bi","tableau"],
    "excel":["excel","excel-based"],"power bi":["power bi"],"tableau":["tableau"],
    "hse compliance":["hse","health safety environment"],"risk management":["risk management","risk register","risk controls"],
    "power distribution":["power distribution","33/11/0.415 kv"],"mv electrical power distribution":["11 kv","33/11","medium voltage"],
    "overhead lines":["overhead line"],"underground cabling":["underground cabl"],"autocad":["autocad"],
    "troubleshooting":["troubleshoot","diagnos","root cause","corrective actions"],
    "cad":["cad","autocad","siemens nx","creo","inventor","fusion360","solidworks","ansys"],
    "mechanical design":["mechanical design","mechanical sculpture","aircraft fuselage"],
    "engineering drawings":["engineering drawings","cad drawings","autocad designs"],"matlab":["matlab"],
    "simulation analysis":["simulation analysis","dynamic forces","position velocity acceleration","ansys"],
    "creo parametric":["creo parametric","creo"],"siemens nx":["siemens nx"],
    "hvac load calculations":["hvac load calculations","load calculations"],"heat transfer":["heat transfer"],
    "3d printing":["3d printing"],"mig welding":["mig welding"],"structural optimization":["structural optimization","optimizing structure"],
    "software testing":["software testing"],"selenium":["selenium"],"java":["java"],"sql":["sql"],"automation":["automation"]
}

def _normalize_text(value:Any)->str:
    text=str(value or "").strip().lower().replace("&"," and ")
    text=re.sub(r"[^a-z0-9+#$.,/ -]+"," ",text)
    text=re.sub(r"\s+"," ",text).strip(" ./-")
    return SKILL_ALIASES.get(text,text)

def _safe_confidence(value):
    try: c=float(value)
    except (TypeError,ValueError): return .70
    return max(0.,min(1.,c))

def safe_list(value): return value if isinstance(value,list) else []

def _build_skill_index(skills:Iterable[Dict[str,Any]]):
    out={}
    for skill in skills or []:
        if not isinstance(skill,dict): continue
        name=str(skill.get("name") or "").strip(); key=_normalize_text(name)
        if not key: continue
        conf=_safe_confidence(skill.get("confidence"))
        if key not in out or conf>out[key]["confidence"]:
            out[key]={"name":name,"confidence":conf,"category":skill.get("category") or "Other","source":skill.get("source") or "resume"}
    return out

def _record_text(item):
    vals=[]
    for key in ("role","employer","program_or_degree","field_of_study","institution","name","description","title","citation","evidence"):
        if item.get(key): vals.append(str(item[key]))
    for key in ("responsibilities","skills_demonstrated","topics","bullets","achievements"):
        if isinstance(item.get(key),list): vals.extend(str(x) for x in item[key])
    return _normalize_text(" ".join(vals))

def _all_structured_text(evidence):
    parts=[]
    for key in ("education","experience","projects","project_accomplishments","publications","certifications","courses","academic_subjects","leadership","activities","extracurricular_activities"):
        for item in safe_list(evidence.get(key)):
            if isinstance(item,dict): parts.append(_record_text(item))
    return " ".join(parts)

def _match_required(req,index):
    key=_normalize_text(req)
    if key in index: return index[key]
    hierarchy={
        "advanced excel":{"excel","microsoft excel","advanced excel"},"microsoft excel":{"excel","microsoft excel","advanced excel"},
        "data analysis":{"data analytics","data analysis"},"problem solving":{"troubleshooting","problem solving"},
        "cad":{"cad","autocad","siemens nx","creo parametric","creo","inventor","fusion 360","solidworks","ansys"},
        "mechanical design":{"mechanical design","engineering design"},"engineering drawings":{"engineering drawings","autocad","siemens nx","creo parametric","creo"},
        "power distribution":{"power distribution","mv electrical power distribution","power system"},
        "troubleshooting":{"troubleshooting","mechanical troubleshooting"}
    }
    for candidate in hierarchy.get(key,{key}):
        if candidate in index: return index[candidate]
    return None

def _match_structured(req,evidence):
    key=_normalize_text(req); body=_all_structured_text(evidence)
    for term in STRUCTURED_SKILL_TERMS.get(key,[key]):
        if _normalize_text(term) in body:
            return {"name":req,"confidence":.88,"category":"Structured Resume Evidence","source":"structured_resume"}
    return None

def _contains_domain(text,terms):
    body=_normalize_text(text)
    return any(_normalize_text(t) in body for t in terms if t)

def _parse_date(value):
    s=str(value or "").strip().lower()
    if not s: return None
    if s in {"present","current","now"}: return date.today()
    months={"jan":1,"january":1,"feb":2,"february":2,"mar":3,"march":3,"apr":4,"april":4,"may":5,"jun":6,"june":6,"jul":7,"july":7,"aug":8,"august":8,"sep":9,"sept":9,"september":9,"oct":10,"october":10,"nov":11,"november":11,"dec":12,"december":12}
    m=re.search(r"([a-z]{3,9})\s+(19\d{2}|20\d{2})",s)
    if m and m.group(1) in months: return date(int(m.group(2)),months[m.group(1)],1)
    y=re.search(r"(19\d{2}|20\d{2})",s)
    return date(int(y.group(1)),1,1) if y else None

def _is_professional_role(item):
    role=_normalize_text(item.get("role"))
    return not any(token in role for token in ("intern","internship","student","trainee","volunteer"))

def _relevant_years(experience,terms):
    months=set()
    for item in experience:
        if not isinstance(item,dict) or not _is_professional_role(item) or not _contains_domain(_record_text(item),terms): continue
        start=_parse_date(item.get("start_date")); end=_parse_date(item.get("end_date")) or date.today()
        if not start or end<start: continue
        y,m=start.year,start.month
        while (y,m)<=(end.year,end.month):
            months.add((y,m)); m+=1
            if m==13: y+=1; m=1
    return round(len(months)/12.,1)

def _evidence_hits(records,terms):
    return [x for x in records if isinstance(x,dict) and _contains_domain(_record_text(x),terms)]

def _skill_weight(required_skill):
    return .55 if _normalize_text(required_skill) in TRANSFERABLE_SKILLS else 1.0

def _career_readiness_level(score,years,education_hits,project_hits,internship_hits,certification_hits):
    strong_training=bool(education_hits and (project_hits or internship_hits or certification_hits))
    if score>=.68 and (years>=1.0 or (score>=.75 and strong_training)):
        return "best_fit_now"
    if score>=.45:
        return "transition_career"
    return "future_upskilling"

def calculate_match_score(extracted_skills,required_skills,skill_weights=None):
    if not required_skills: return 0.,[],[]
    index=_build_skill_index(extracted_skills); matched=[]; missing=[]
    for req in required_skills:
        if _match_required(req,index): matched.append(req)
        else: missing.append(req)
    return round(len(matched)/len(required_skills),4),matched,missing

def _score_career(extracted_skills,career,structured_evidence=None):
    evidence=structured_evidence or {}; index=_build_skill_index(extracted_skills); required=career.get("required_skills") or []
    matched=[]; missing=[]; details=[]; earned=0.; possible=0.
    for req in required:
        weight=_skill_weight(req); possible+=weight
        e=_match_required(req,index) or _match_structured(req,evidence)
        if e:
            matched.append(req)
            contribution=weight*(.60+.40*e["confidence"])
            earned+=contribution
            details.append({"required_skill":req,"evidence_skill":e["name"],"confidence":round(e["confidence"],3),"source":e["source"],"weight":weight,"type":"transferable" if weight<1 else "domain_or_technical"})
        else: missing.append(req)
    competency=earned/possible if possible else 0.

    all_text=_all_structured_text(evidence)
    gate_terms=career.get("domain_gate") or career.get("domain_terms") or []
    gate_ok=_contains_domain(all_text,gate_terms)
    terms=career.get("domain_terms") or []
    education=safe_list(evidence.get("education")); experience=safe_list(evidence.get("experience"))
    projects=safe_list(evidence.get("projects"))+safe_list(evidence.get("project_accomplishments"))
    publications=safe_list(evidence.get("publications")); certifications=safe_list(evidence.get("certifications")); courses=safe_list(evidence.get("courses"))
    education_hits=_evidence_hits(education,terms)
    project_hits=_evidence_hits(projects,terms)
    publication_hits=_evidence_hits(publications,terms)
    certification_hits=_evidence_hits(certifications,terms)
    course_hits=_evidence_hits(courses,terms)
    internship_hits=[x for x in experience if isinstance(x,dict) and not _is_professional_role(x) and _contains_domain(_record_text(x),terms)]
    years=_relevant_years(experience,terms)

    professional_strength=min(1.0,years/5.0)
    education_strength=1.0 if education_hits else 0.
    project_strength=min(1.0,len(project_hits)/2.0)
    internship_strength=1.0 if internship_hits else 0.
    certification_strength=min(1.0,(len(certification_hits)+len(course_hits))/2.0)
    publication_strength=1.0 if publication_hits else 0.
    domain_strength=(
        .42*professional_strength+
        .18*education_strength+
        .16*project_strength+
        .10*internship_strength+
        .08*certification_strength+
        .06*publication_strength
    )

    has_professional_domain=bool(years)
    has_training_domain=bool(education_hits or internship_hits or certification_hits or course_hits)
    has_substantive_domain=bool(has_professional_domain or has_training_domain or project_hits or publication_hits)

    if not gate_ok or not has_substantive_domain:
        score=0.
    else:
        score=.55*competency+.45*domain_strength
        # Academic/project evidence can support a transition recommendation, but should
        # not look equivalent to established professional readiness.
        if not years and has_training_domain:
            score=min(score,.74)
        elif years<1.0:
            score=min(score,.80)
        # A career supported only by transferable competencies should remain modest.
        technical_matches=sum(1 for d in details if d["type"]=="domain_or_technical")
        if technical_matches==0:
            score=min(score,.48)
        score=min(1.,score)

    score=round(score,4); pct=round(score*100,1)
    readiness=_career_readiness_level(score,years,education_hits,project_hits,internship_hits,certification_hits)
    reason=f"Matches {len(matched)} of {len(required)} mapped competencies"
    if years:
        reason+=f" and has {years:g} years of career-relevant professional experience."
    elif education_hits and project_hits:
        reason+=" with relevant education and project evidence, but no detected full-time professional experience in this career domain."
    elif has_training_domain:
        reason+=" with relevant education, internship, certification, or course evidence, but limited professional evidence in this career domain."
    else:
        reason+=" with limited direct domain evidence."

    return {
        "match_score":score,
        "match_percentage":pct,
        "skill_gap_percentage":round((1-score)*100,1),
        "readiness_level":readiness,
        "matched_skills":matched,
        "missing_skills":missing,
        "matched_skill_details":details,
        "domain_evidence":{
            "education_records":len(education_hits),
            "relevant_experience_years":years,
            "internship_records":len(internship_hits),
            "project_records":len(project_hits),
            "publication_records":len(publication_hits),
            "certification_records":len(certification_hits),
            "course_records":len(course_hits),
            "professional_domain_evidence":has_professional_domain,
            "training_domain_evidence":has_training_domain,
            "domain_gate_passed":gate_ok
        },
        "domain_relevance_percentage":round(domain_strength*100,1),
        "competency_percentage":round(competency*100,1),
        "match_reason":reason,
        "career_relevant_experience_years":years
    }

def _career_result(career,scoring):
    return {"id":career["id"],"path":career["path"],"category":career["category"],**scoring,"job_outlook":career.get("job_outlook"),"median_salary":career.get("median_salary"),"top_locations":career.get("top_locations") or []}

def get_career_recommendations(extracted_skills,top_n=5,structured_evidence=None):
    out=[]
    readiness_rank={"best_fit_now":3,"transition_career":2,"future_upskilling":1}
    for career in CAREER_PATHS:
        scoring=_score_career(extracted_skills,career,structured_evidence)
        if scoring["match_score"]>=.25: out.append(_career_result(career,scoring))
    out.sort(key=lambda x:(readiness_rank.get(x.get("readiness_level"),0),x["match_score"],x.get("career_relevant_experience_years",0),len(x["matched_skills"])),reverse=True)
    return out[:max(1,int(top_n or 5))]

def get_skill_gap_analysis(extracted_skills,target_career_id,structured_evidence=None):
    target=next((c for c in CAREER_PATHS if c["id"]==target_career_id),None)
    if not target: return None
    scoring=_score_career(extracted_skills,target,structured_evidence)
    weighted_missing=sorted(scoring["missing_skills"],key=lambda s:_skill_weight(s),reverse=True)
    return {"career_id":target["id"],"career":target["path"],**scoring,"priority_missing_skills":weighted_missing[:3]}
