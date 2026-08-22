"""Skills Pathfinder resume-evidence career recommendation engine.

Career readiness uses skill evidence plus relevant education, employment duration,
project accomplishments and publications. Domain evidence is required so generic
transferable competencies cannot create unrelated career recommendations.
"""
import re
from datetime import date
from typing import Any, Dict, Iterable, List

CAREER_PATHS = [
 {"id":"electrical_engineer","path":"Electrical Engineer","category":"Engineering","required_skills":["Power Distribution","Overhead Lines","HSE Compliance","Project Management","AutoCAD","Troubleshooting"],"domain_terms":["electrical engineering","electrical engineer","power distribution","electrical power","overhead line","underground cabl"],"job_outlook":"7% growth (2022-2032)","median_salary":"$104,630","top_locations":["Texas","California","Florida","New York"]},
 {"id":"mechanical_engineer","path":"Mechanical Engineer","category":"Mechanical Engineering","required_skills":["Mechanical Design","CAD","Engineering Drawings","MATLAB","Troubleshooting","Simulation Analysis"],"domain_terms":["mechanical engineering","mechanical engineer","mechanical design","hvac","thermodynamics","heat transfer","mechanical systems"],"job_outlook":"Verify current BLS data","median_salary":"$102,320","top_locations":[]},
 {"id":"mechanical_design_engineer","path":"Mechanical Design Engineer","category":"Mechanical Design","required_skills":["Mechanical Design","CAD","Engineering Drawings","Creo Parametric","Siemens NX","Simulation Analysis"],"domain_terms":["mechanical engineering","mechanical design","siemens nx","creo parametric","cad","fuselage","mechanical sculpture"],"job_outlook":"Verify current market data","median_salary":"$105,000","top_locations":[]},
 {"id":"hvac_engineer","path":"HVAC Engineer","category":"Building Systems","required_skills":["HVAC Load Calculations","AutoCAD","Microsoft Excel","Mechanical Design","Heat Transfer","Troubleshooting"],"domain_terms":["hvac","air terminal","load calculations","heat transfer","thermodynamics","mechanical engineering"],"job_outlook":"Verify current market data","median_salary":"$98,000","top_locations":[]},
 {"id":"manufacturing_engineer","path":"Manufacturing Engineer","category":"Manufacturing","required_skills":["Mechanical Design","CAD","3D Printing","MIG Welding","Troubleshooting","Project Management"],"domain_terms":["manufactur","fabrication","mechanical engineering","mechanical design","3d printing","welding","built mission-specific"],"job_outlook":"Verify current market data","median_salary":"$101,000","top_locations":[]},
 {"id":"product_design_engineer","path":"Product Design Engineer","category":"Product Development","required_skills":["Mechanical Design","CAD","Creo Parametric","Simulation Analysis","Structural Optimization","Project Management"],"domain_terms":["mechanical design","product design","design project","creo parametric","structural optimization","mechanical sculpture"],"job_outlook":"Verify current market data","median_salary":"$105,000","top_locations":[]},
 {"id":"data_analyst","path":"Data Analyst","category":"Data & Analytics","required_skills":["Python","SQL","Power BI","Tableau","Data Analytics","Advanced Excel"],"domain_terms":["data analytics","data analyst","python","power bi","tableau"],"job_outlook":"23% growth (2022-2032)","median_salary":"$93,750","top_locations":["California","New York","Texas","Washington"]},
 {"id":"electrical_engineering_manager","path":"Electrical Engineering Manager","category":"Engineering Management","required_skills":["Project Management","Team Leadership","Budget Management","HSE Compliance","Power Distribution","Stakeholder Collaboration"],"domain_terms":["electrical engineering","electrical engineer","power distribution","project management"],"job_outlook":"4% growth (2022-2032)","median_salary":"$156,350","top_locations":[]},
 {"id":"power_systems_engineer","path":"Power Systems Engineer","category":"Specialized Engineering","required_skills":["Power Distribution","MV Electrical Power Distribution","Overhead Lines","Underground Cabling","AutoCAD","GIS"],"domain_terms":["power system","power distribution","electrical engineering","overhead line","underground cabl","11 kv","33/11"],"job_outlook":"9% growth (2022-2032)","median_salary":"$115,000","top_locations":[]},
 {"id":"renewable_energy_engineer","path":"Renewable Energy Engineer","category":"Green Energy","required_skills":["Solar Power System Installation","Power Distribution","Project Management","HSE Compliance","AutoCAD"],"domain_terms":["solar power","renewable energy"],"job_outlook":"15% growth (2022-2032)","median_salary":"$102,000","top_locations":[]},
 {"id":"software_tester","path":"Software Test Engineer","category":"Software & IT","required_skills":["Selenium","Java","SQL","Software Testing","Automation"],"domain_terms":["software testing","selenium","test automation"],"job_outlook":"25% growth (2022-2032)","median_salary":"$99,000","top_locations":[]},
 {"id":"project_manager_engineering","path":"Engineering Project Manager","category":"Project Management","required_skills":["Project Management","Stakeholder Collaboration","Budget Management","HSE Compliance","Team Leadership","Risk Management"],"domain_terms":["engineering","project management","project coordination","electrical engineer"],"job_outlook":"6% growth (2022-2032)","median_salary":"$135,000","top_locations":[]},
 {"id":"controls_engineer","path":"Controls/Automation Engineer","category":"Automation & Control","required_skills":["Troubleshooting","Electrical Systems","Mechanical Systems","AutoCAD","Python","Project Management"],"domain_terms":["automation","controls","electrical engineering","mechanical engineering"],"job_outlook":"8% growth (2022-2032)","median_salary":"$108,000","top_locations":[]},
]

SKILL_ALIASES={
 "ms excel":"excel","microsoft excel":"excel","advanced excel":"excel","excel spreadsheet":"excel",
 "powerbi":"power bi","ms power bi":"power bi","microsoft power bi":"power bi",
 "postgres":"postgresql","postgres sql":"postgresql","mssql":"sql server","microsoft sql server":"sql server",
 "js":"javascript","nodejs":"node.js","node js":"node.js","scikit learn":"scikit-learn","sklearn":"scikit-learn",
 "project management professional":"project management","engineering project management":"project management","project coordination":"project management",
 "health safety environment":"hse compliance","health safety and environment":"hse compliance","hse":"hse compliance",
 "medium voltage electrical power distribution":"mv electrical power distribution","medium voltage power distribution":"mv electrical power distribution",
 "mv power distribution":"mv electrical power distribution","power systems":"power system","electrical power systems":"power system",
 "data analysis":"data analytics","stakeholder management":"stakeholder collaboration","leadership":"team leadership",
 "autocad electrical":"autocad","overhead line":"overhead lines","underground cable":"underground cabling",
 "mechanical troubleshooting":"troubleshooting","solidworks":"solidworks","fusion360":"fusion 360"
}

STRUCTURED_SKILL_TERMS={
 'project management':['project management','project coordination','coordinated and supervised projects','managed engineering design','project activities','concept to completion','start-up and acceptance'],
 'power distribution':['power distribution','33/11/0.415 kv','distribution network','distribution across urban and rural networks'],
 'mv electrical power distribution':['33/11','11 kv','medium voltage','mv electrical power distribution','power distribution'],
 'overhead lines':['overhead line','overhead lines'],'underground cabling':['underground cabling','underground cable'],
 'hse compliance':['hse','health safety environment','health safety and environment'],'autocad':['autocad','schematics'],
 'troubleshooting':['troubleshoot','diagnostics','diagnostic','fault','root cause'],'team leadership':['team leadership','led ','directed ','supervised ','managed a 10-member team','cross-functional'],
 'stakeholder collaboration':['stakeholder collaboration','stakeholder','collaborative environment'],'budget management':['budget planning','budget management','budget'],
 'risk management':['risk management','risk'],'selenium':['selenium'],'java':['java'],'sql':['sql'],'software testing':['software testing'],'automation':['automation'],
 'python':['python'],'power bi':['power bi'],'tableau':['tableau'],'data analytics':['data analytics','advanced data analytics'],'excel':['advanced excel','microsoft excel','excel'],
 'electrical systems':['electrical systems','electrical engineering','electrical power'],'mechanical systems':['mechanical systems','mechanical engineering','mechanical design'],
 'solar power system installation':['solar power','solar power system'],
 'mechanical design':['mechanical design','mechanical sculpture','aircraft fuselage'],'cad':['cad','autocad','siemens nx','creo parametric','inventor','fusion 360','solidworks','ansys'],
 'engineering drawings':['engineering drawings','detailed drawings','autocad designs'],'matlab':['matlab'],'simulation analysis':['simulation analysis','position velocity acceleration','dynamic forces','ansys'],
 'creo parametric':['creo parametric','creo'],'siemens nx':['siemens nx'],'hvac load calculations':['hvac load calculations','load calculations'],
 'heat transfer':['heat transfer'],'3d printing':['3d printing'],'mig welding':['mig welding'],'structural optimization':['structural optimization','optimizing structure']
}

def _normalize_text(value:Any)->str:
 text=str(value or '').strip().lower().replace('&',' and '); text=re.sub(r'[^a-z0-9+#./ -]+',' ',text); text=re.sub(r'\s+',' ',text).strip(' ./-')
 return SKILL_ALIASES.get(text,text)

def _safe_confidence(value):
 try:c=float(value)
 except (TypeError,ValueError):return .70
 return max(0.,min(1.,c))

def safe_list(value):return value if isinstance(value,list) else []

def _build_skill_index(skills:Iterable[Dict[str,Any]]):
 out={}
 for skill in skills or []:
  if not isinstance(skill,dict):continue
  name=str(skill.get('name') or '').strip(); key=_normalize_text(name)
  if not key:continue
  conf=_safe_confidence(skill.get('confidence'))
  if key not in out or conf>out[key]['confidence']:out[key]={'name':name,'confidence':conf,'category':skill.get('category') or 'Other','source':skill.get('source') or 'resume'}
 return out

def _record_text(item):
 vals=[]
 for key in ('role','employer','program_or_degree','field_of_study','institution','name','description','title','citation','evidence'):
  if item.get(key):vals.append(str(item[key]))
 for key in ('responsibilities','skills_demonstrated','topics'):
  if isinstance(item.get(key),list):vals.extend(str(x) for x in item[key])
 return _normalize_text(' '.join(vals))

def _all_structured_text(evidence):
 parts=[]
 for key in ('education','experience','projects','project_accomplishments','publications','certifications','courses','academic_subjects'):
  for item in safe_list(evidence.get(key)):
   if isinstance(item,dict):parts.append(_record_text(item))
 return ' '.join(parts)

def _match_required(req,index):
 key=_normalize_text(req)
 if key in index:return index[key]
 hierarchy={
  'electrical systems':{'electrical systems','electrical engineering','electrical power','power system'},
  'power distribution':{'power distribution','mv electrical power distribution','power system'},
  'mv electrical power distribution':{'mv electrical power distribution','power distribution','power system'},
  'solar power system installation':{'solar power system installation','solar power','solar power systems'},
  'software testing':{'software testing','quality assurance','qa testing'},'automation':{'automation','test automation','industrial automation'},
  'troubleshooting':{'troubleshooting','mechanical troubleshooting'},
  'cad':{'cad','autocad','siemens nx','creo parametric','inventor','fusion 360','fusion360','solidworks','ansys'},
  'mechanical design':{'mechanical design','engineering design'},
  'engineering drawings':{'engineering drawings','autocad','siemens nx','creo parametric'}
 }
 for candidate in hierarchy.get(key,{key}):
  if candidate in index:return index[candidate]
 return None

def _match_structured(req,evidence):
 key=_normalize_text(req); body=_all_structured_text(evidence)
 for term in STRUCTURED_SKILL_TERMS.get(key,[key]):
  if _normalize_text(term) in body:return {'name':req,'confidence':.88,'category':'Structured Resume Evidence','source':'structured_resume'}
 return None

def _contains_domain(text,terms):
 body=_normalize_text(text); return any(_normalize_text(t) in body for t in terms if t)

def _parse_date(value):
 s=str(value or '').strip().lower()
 if not s:return None
 if s in {'present','current','now'}:return date.today()
 months={'jan':1,'january':1,'feb':2,'february':2,'mar':3,'march':3,'apr':4,'april':4,'may':5,'jun':6,'june':6,'jul':7,'july':7,'aug':8,'august':8,'sep':9,'sept':9,'september':9,'oct':10,'october':10,'nov':11,'november':11,'dec':12,'december':12}
 m=re.search(r'([a-z]{3,9})\s+(19\d{2}|20\d{2})',s)
 if m and m.group(1) in months:return date(int(m.group(2)),months[m.group(1)],1)
 y=re.search(r'(19\d{2}|20\d{2})',s); return date(int(y.group(1)),1,1) if y else None

def _is_professional_role(item):
 role=_normalize_text(item.get('role'))
 return not any(token in role for token in ('intern','internship','student','trainee','volunteer'))

def _relevant_years(experience,terms):
 months=set()
 for item in experience:
  if not isinstance(item,dict) or not _is_professional_role(item) or not _contains_domain(_record_text(item),terms):continue
  start=_parse_date(item.get('start_date')); end=_parse_date(item.get('end_date')) or date.today()
  if not start or end<start:continue
  y,m=start.year,start.month
  while (y,m)<=(end.year,end.month):
   months.add((y,m)); m+=1
   if m==13:y+=1;m=1
 return round(len(months)/12.,1)

def calculate_match_score(extracted_skills,required_skills,skill_weights=None):
 if not required_skills:return 0.,[],[]
 index=_build_skill_index(extracted_skills); matched=[]; missing=[]; earned=0.
 for req in required_skills:
  if _match_required(req,index):matched.append(req); earned+=1
  else:missing.append(req)
 return round(earned/len(required_skills),4),matched,missing

def _score_career(extracted_skills,career,structured_evidence=None):
 evidence=structured_evidence or {}; index=_build_skill_index(extracted_skills); required=career.get('required_skills') or []
 matched=[]; missing=[]; details=[]; earned=0.
 for req in required:
  e=_match_required(req,index) or _match_structured(req,evidence)
  if e:
   matched.append(req); earned+=(.65+.35*e['confidence']); details.append({'required_skill':req,'evidence_skill':e['name'],'confidence':round(e['confidence'],3),'source':e['source'],'weight':1,'type':'core_competency'})
  else:missing.append(req)
 core=earned/len(required) if required else 0.
 terms=career.get('domain_terms') or []; education=safe_list(evidence.get('education')); experience=safe_list(evidence.get('experience')); projects=safe_list(evidence.get('projects') or evidence.get('project_accomplishments')); publications=safe_list(evidence.get('publications'))
 education_hits=[x for x in education if isinstance(x,dict) and _contains_domain(_record_text(x),terms)]
 project_hits=[x for x in projects if isinstance(x,dict) and _contains_domain(_record_text(x),terms)]
 publication_hits=[x for x in publications if isinstance(x,dict) and _contains_domain(_record_text(x),terms)]
 years=_relevant_years(experience,terms)
 internship_hits=[x for x in experience if isinstance(x,dict) and not _is_professional_role(x) and _contains_domain(_record_text(x),terms)]
 has_professional_domain=bool(years or project_hits or publication_hits)
 has_training_domain=bool(education_hits or internship_hits)
 eligible=has_professional_domain or has_training_domain
 if not eligible:score=0.
 else:
  education_credit=.08 if education_hits else 0.; experience_credit=min(.20,years/10*.20) if years else 0.; project_credit=min(.06,len(project_hits)*.02); publication_credit=min(.04,len(publication_hits)*.04); internship_credit=.04 if internship_hits else 0.
  score=min(1.,core*.65+education_credit+experience_credit+project_credit+publication_credit+internship_credit)
  if has_training_domain and not has_professional_domain:score=min(score,.68)
 score=round(score,4); pct=round(score*100,1)
 reason=f"Demonstrates {len(matched)} of {len(required)} mapped core competencies"
 if years:reason+=f" with {years:g} years of career-relevant professional experience."
 elif internship_hits and (education_hits or project_hits):reason+=' with relevant academic, project, and internship evidence but no detected full-time professional experience in this career domain.'
 elif has_training_domain:reason+=' with relevant education/training evidence but no detected professional experience in this career domain.'
 else:reason+='.'
 return {'match_score':score,'match_percentage':pct,'skill_gap_percentage':round((1-score)*100,1),'matched_skills':matched,'missing_skills':missing,'matched_skill_details':details,'domain_evidence':{'education_records':len(education_hits),'relevant_experience_years':years,'internship_records':len(internship_hits),'project_records':len(project_hits),'publication_records':len(publication_hits),'professional_domain_evidence':has_professional_domain,'training_domain_evidence':has_training_domain},'domain_relevance_percentage':round((.08 if education_hits else 0)+min(.20,years/10*.20)+min(.06,len(project_hits)*.02)+min(.04,len(publication_hits)*.04)+(.04 if internship_hits else 0),2)*100,'match_reason':reason,'career_relevant_experience_years':years}

def _career_result(career,scoring):return {'id':career['id'],'path':career['path'],'category':career['category'],**scoring,'job_outlook':career.get('job_outlook'),'median_salary':career.get('median_salary'),'top_locations':career.get('top_locations') or []}

def get_career_recommendations(extracted_skills,top_n=5,structured_evidence=None):
 out=[]
 for career in CAREER_PATHS:
  scoring=_score_career(extracted_skills,career,structured_evidence)
  if scoring['match_score']>=.30:out.append(_career_result(career,scoring))
 out.sort(key=lambda x:(x['match_score'],x.get('career_relevant_experience_years',0),len(x['matched_skills'])),reverse=True)
 return out[:max(1,int(top_n or 5))]

def get_skill_gap_analysis(extracted_skills,target_career_id,structured_evidence=None):
 target=next((c for c in CAREER_PATHS if c['id']==target_career_id),None)
 if not target:return None
 scoring=_score_career(extracted_skills,target,structured_evidence); return {'career_id':target['id'],'career':target['path'],**scoring,'priority_missing_skills':scoring['missing_skills'][:3]}
