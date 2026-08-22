"""Skills Pathfinder resume-evidence career recommendation engine.

Career readiness uses skill evidence plus relevant education, employment duration,
project accomplishments and publications. Generic transferable skills cannot by
themselves create an unrelated career recommendation.
"""
import re
from datetime import date
from typing import Any, Dict, Iterable, List

CAREER_PATHS = [
 {"id":"electrical_engineer","path":"Electrical Engineer","category":"Engineering","required_skills":["Power Distribution","Overhead Lines","HSE Compliance","Project Management","AutoCAD","Troubleshooting"],"domain_terms":["electrical engineering","electrical engineer","power distribution","electrical power","overhead line","underground cabl"],"job_outlook":"7% growth (2022-2032)","median_salary":"$104,630","top_locations":["Texas","California","Florida","New York"]},
 {"id":"data_analyst","path":"Data Analyst","category":"Data & Analytics","required_skills":["Python","SQL","Power BI","Tableau","Data Analytics","Advanced Excel"],"domain_terms":["data analytics","data analyst","python","power bi","tableau"],"job_outlook":"23% growth (2022-2032)","median_salary":"$93,750","top_locations":["California","New York","Texas","Washington"]},
 {"id":"electrical_engineering_manager","path":"Electrical Engineering Manager","category":"Engineering Management","required_skills":["Project Management","Team Leadership","Budget Management","HSE Compliance","Power Distribution","Stakeholder Collaboration"],"domain_terms":["electrical engineering","electrical engineer","power distribution","project management"],"job_outlook":"4% growth (2022-2032)","median_salary":"$156,350","top_locations":[]},
 {"id":"power_systems_engineer","path":"Power Systems Engineer","category":"Specialized Engineering","required_skills":["Power Distribution","MV Electrical Power Distribution","Overhead Lines","Underground Cabling","AutoCAD","GIS"],"domain_terms":["power system","power distribution","electrical engineering","overhead line","underground cabl","11 kv","33/11"],"job_outlook":"9% growth (2022-2032)","median_salary":"$115,000","top_locations":[]},
 {"id":"renewable_energy_engineer","path":"Renewable Energy Engineer","category":"Green Energy","required_skills":["Solar Power System Installation","Power Distribution","Project Management","HSE Compliance","AutoCAD"],"domain_terms":["solar power","renewable energy"],"job_outlook":"15% growth (2022-2032)","median_salary":"$102,000","top_locations":[]},
 {"id":"software_tester","path":"Software Test Engineer","category":"Software & IT","required_skills":["Selenium","Java","SQL","Software Testing","Automation"],"domain_terms":["software testing","selenium","test automation"],"job_outlook":"25% growth (2022-2032)","median_salary":"$99,000","top_locations":[]},
 {"id":"project_manager_engineering","path":"Engineering Project Manager","category":"Project Management","required_skills":["Project Management","Stakeholder Collaboration","Budget Management","HSE Compliance","Team Leadership","Risk Management"],"domain_terms":["engineering","project management","project coordination","electrical engineer"],"job_outlook":"6% growth (2022-2032)","median_salary":"$135,000","top_locations":[]},
 {"id":"controls_engineer","path":"Controls/Automation Engineer","category":"Automation & Control","required_skills":["Troubleshooting","Electrical Systems","Mechanical Systems","AutoCAD","Python","Project Management"],"domain_terms":["automation","controls","electrical engineering"],"job_outlook":"8% growth (2022-2032)","median_salary":"$108,000","top_locations":[]},
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
 "autocad electrical":"autocad","overhead line":"overhead lines","underground cable":"underground cabling"
}

STRUCTURED_SKILL_TERMS={
 'project management':['project management','project coordination','coordinated and supervised projects','managed engineering design','project activities','concept to completion','start-up and acceptance'],
 'power distribution':['power distribution','33/11/0.415 kv','distribution network','distribution across urban and rural networks'],
 'mv electrical power distribution':['33/11','11 kv','medium voltage','mv electrical power distribution','power distribution'],
 'overhead lines':['overhead line','overhead lines'],
 'underground cabling':['underground cabling','underground cable'],
 'hse compliance':['hse','health safety environment','health safety and environment'],
 'autocad':['autocad','schematics'],
 'troubleshooting':['troubleshoot','diagnostics','diagnostic','fault'],
 'team leadership':['team leadership','led ','directed ','supervised ','cross-functional'],
 'stakeholder collaboration':['stakeholder collaboration','stakeholder','collaborative environment'],
 'budget management':['budget planning','budget management','budget'],
 'risk management':['risk management','risk'],
 'selenium':['selenium'],
 'java':['java'],
 'sql':['sql'],
 'software testing':['software testing'],
 'automation':['automation'],
 'python':['python'],
 'power bi':['power bi'],
 'tableau':['tableau'],
 'data analytics':['data analytics','advanced data analytics'],
 'excel':['advanced excel','microsoft excel','excel'],
 'electrical systems':['electrical systems','electrical engineering','electrical power'],
 'mechanical systems':['mechanical systems','mechanical'],
 'solar power system installation':['solar power','solar power system']
}

def _normalize_text(value:Any)->str:
 text=str(value or '').strip().lower().replace('&',' and ')
 text=re.sub(r'[^a-z0-9+#./ -]+',' ',text); text=re.sub(r'\s+',' ',text).strip(' ./-')
 return SKILL_ALIASES.get(text,text)

def _safe_confidence(value:Any)->float:
 try:c=float(value)
 except (TypeError,ValueError):return .70
 return max(0.,min(1.,c))

def _build_skill_index(extracted_skills:Iterable[Dict[str,Any]])->Dict[str,Dict[str,Any]]:
 index={}
 for skill in extracted_skills or []:
  if not isinstance(skill,dict):continue
  name=str(skill.get('name') or '').strip(); key=_normalize_text(name)
  if not key:continue
  conf=_safe_confidence(skill.get('confidence')); current=index.get(key)
  if current is None or conf>current['confidence']:
   index[key]={'name':name,'confidence':conf,'category':skill.get('category') or 'Other','source':skill.get('source') or 'resume'}
 return index

def _required_skill_weight(career,skill_name):
 try:return max(.01,float((career.get('skill_weights') or {}).get(skill_name,1.)))
 except (TypeError,ValueError):return 1.

def _match_required_skill(required_skill,skill_index):
 key=_normalize_text(required_skill)
 if key in skill_index:return skill_index[key]
 hierarchy={
  'electrical systems':{'electrical systems','electrical engineering','electrical power','power system'},
  'power distribution':{'power distribution','mv electrical power distribution','power system'},
  'mv electrical power distribution':{'mv electrical power distribution','power distribution','power system'},
  'solar power system installation':{'solar power system installation','solar power','solar power systems'},
  'team leadership':{'team leadership'},'stakeholder collaboration':{'stakeholder collaboration'},
  'software testing':{'software testing','quality assurance','qa testing'},
  'automation':{'automation','test automation','industrial automation'},
  'project management':{'project management'},'autocad':{'autocad'},'excel':{'excel'}
 }
 for candidate in hierarchy.get(key,{key}):
  if candidate in skill_index:return skill_index[candidate]
 return None

def safe_list(value):return value if isinstance(value,list) else []

def _record_text(item:Dict[str,Any])->str:
 values=[]
 for key in ('role','employer','program_or_degree','field_of_study','institution','name','description','title','citation','evidence'):
  v=item.get(key)
  if v:values.append(str(v))
 for key in ('responsibilities','skills_demonstrated'):
  v=item.get(key)
  if isinstance(v,list):values.extend(str(x) for x in v)
 return _normalize_text(' '.join(values))

def _all_structured_text(evidence:Dict[str,Any])->str:
 parts=[]
 for key in ('education','experience','projects','project_accomplishments','publications','certifications','courses'):
  for item in safe_list(evidence.get(key)):
   if isinstance(item,dict):parts.append(_record_text(item))
 return ' '.join(parts)

def _match_structured_required(required_skill,evidence):
 key=_normalize_text(required_skill); text=_all_structured_text(evidence)
 if not text:return None
 terms=STRUCTURED_SKILL_TERMS.get(key,[key])
 for term in terms:
  normalized=_normalize_text(term)
  if normalized and normalized in text:
   return {'name':required_skill,'confidence':.88,'category':'Structured Resume Evidence','source':'structured_resume'}
 return None

def _contains_domain(text:str,terms:List[str])->bool:
 raw=_normalize_text(text)
 return any(_normalize_text(term) in raw for term in terms if term)

def _parse_date(value:Any):
 s=str(value or '').strip().lower()
 if not s:return None
 if s in {'present','current','now'}:return date.today()
 months={'jan':1,'january':1,'feb':2,'february':2,'mar':3,'march':3,'apr':4,'april':4,'may':5,'jun':6,'june':6,'jul':7,'july':7,'aug':8,'august':8,'sep':9,'sept':9,'september':9,'oct':10,'october':10,'nov':11,'november':11,'dec':12,'december':12}
 m=re.search(r'([a-z]{3,9})\s+(19\d{2}|20\d{2})',s)
 if m and m.group(1) in months:return date(int(m.group(2)),months[m.group(1)],1)
 y=re.search(r'(19\d{2}|20\d{2})',s)
 return date(int(y.group(1)),1,1) if y else None

def _relevant_experience_years(experience,terms):
 months=set()
 for item in experience or []:
  if not isinstance(item,dict) or not _contains_domain(_record_text(item),terms):continue
  start=_parse_date(item.get('start_date')); end=_parse_date(item.get('end_date')) or date.today()
  if not start or end<start:continue
  y,m=start.year,start.month
  while (y,m)<=(end.year,end.month):
   months.add((y,m)); m+=1
   if m==13:y+=1;m=1
 return round(len(months)/12.,1)

def calculate_match_score(extracted_skills,required_skills,skill_weights=None):
 if not required_skills:return 0.,[],[]
 index=_build_skill_index(extracted_skills); matched=[]; missing=[]; earned=total=0.; weights=skill_weights or {}
 for required in required_skills:
  try:w=max(.01,float(weights.get(required,1.)))
  except (TypeError,ValueError):w=1.
  total+=w; e=_match_required_skill(required,index)
  if e:matched.append(required); earned+=w*(.65+.35*e['confidence'])
  else:missing.append(required)
 return round(earned/total,4),matched,missing

def _score_career(extracted_skills,career,structured_evidence=None):
 evidence=structured_evidence or {}; index=_build_skill_index(extracted_skills); required=career.get('required_skills') or []
 matched=[]; missing=[]; details=[]; earned=total=0.
 for req in required:
  w=_required_skill_weight(career,req); total+=w
  e=_match_required_skill(req,index) or _match_structured_required(req,evidence)
  if e:
   matched.append(req); factor=.65+.35*e['confidence']; earned+=w*factor
   details.append({'required_skill':req,'evidence_skill':e['name'],'confidence':round(e['confidence'],3),'source':e['source'],'weight':round(w,3),'type':'core_competency'})
  else:missing.append(req)
 core=(earned/total) if total else 0.
 terms=career.get('domain_terms') or []
 education=safe_list(evidence.get('education')); experience=safe_list(evidence.get('experience')); projects=safe_list(evidence.get('projects') or evidence.get('project_accomplishments')); publications=safe_list(evidence.get('publications'))
 education_hits=[x for x in education if _contains_domain(_record_text(x),terms)]
 project_hits=[x for x in projects if _contains_domain(_record_text(x),terms)]
 publication_hits=[x for x in publications if _contains_domain(_record_text(x),terms)]
 years=_relevant_experience_years(experience,terms)
 education_credit=.10 if education_hits else 0.
 experience_credit=min(.15,years/10.*.15) if years else 0.
 project_credit=min(.06,len(project_hits)*.02)
 publication_credit=min(.04,len(publication_hits)*.04)
 structured_credit=education_credit+experience_credit+project_credit+publication_credit
 has_domain=bool(education_hits or years or project_hits or publication_hits)
 coverage=(len(matched)/len(required)) if required else 0.
 eligible=has_domain or coverage>=.50
 score=round(min(1.,core*.70+structured_credit),4) if eligible else 0.
 pct=round(score*100,1)
 if matched:reason=f"Demonstrates {len(matched)} of {len(required)} mapped core competencies"
 else:reason='No mapped core competencies have been demonstrated yet'
 if years:reason+=f" with {years:g} years of career-relevant experience."
 elif education_hits:reason+=' with relevant education evidence.'
 else:reason+='.'
 return {'match_score':score,'match_percentage':pct,'skill_gap_percentage':round((1-score)*100,1),'matched_skills':matched,'missing_skills':missing,'matched_skill_details':details,'domain_evidence':{'education_records':len(education_hits),'relevant_experience_years':years,'project_records':len(project_hits),'publication_records':len(publication_hits),'structured_credit':round(structured_credit,3)},'domain_relevance_percentage':round(structured_credit*100,1),'match_reason':reason,'career_relevant_experience_years':years}

def _career_result(career,scoring):
 return {'id':career['id'],'path':career['path'],'category':career['category'],**scoring,'job_outlook':career.get('job_outlook'),'median_salary':career.get('median_salary'),'top_locations':career.get('top_locations') or [],'recommended_certifications':career.get('recommended_certifications') or [],'recommended_degrees':career.get('recommended_degrees') or [],'next_steps':career.get('next_steps') or [],'learning_resources':career.get('learning_resources') or []}

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
 scoring=_score_career(extracted_skills,target,structured_evidence); missing=scoring['missing_skills']
 return {'career_id':target['id'],'career':target['path'],**scoring,'priority_missing_skills':missing[:3],'recommended_certifications':target.get('recommended_certifications') or [],'recommended_degrees':target.get('recommended_degrees') or [],'next_steps':target.get('next_steps') or [],'learning_resources':target.get('learning_resources') or []}
