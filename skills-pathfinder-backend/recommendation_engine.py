"""Skills Pathfinder career recommendation engine.

Career readiness is based on direct required-skill evidence plus conservative,
controlled domain evidence. Extraction confidence and career readiness remain
separate concepts.
"""
import re
from typing import Any, Dict, Iterable

CAREER_PATHS = [
 {"id":"electrical_engineer","path":"Electrical Engineer","category":"Engineering","required_skills":["Power Distribution","Overhead Lines","HSE Compliance","Project Management","AutoCAD","Troubleshooting"],"job_outlook":"7% growth (2022-2032)","median_salary":"$104,630","top_locations":["Texas","California","Florida","New York"]},
 {"id":"data_analyst","path":"Data Analyst","category":"Data & Analytics","required_skills":["Python","SQL","Power BI","Tableau","Data Analytics","Advanced Excel"],"job_outlook":"23% growth (2022-2032)","median_salary":"$93,750","top_locations":["California","New York","Texas","Washington"]},
 {"id":"electrical_engineering_manager","path":"Electrical Engineering Manager","category":"Engineering Management","required_skills":["Project Management","Team Leadership","Budget Management","HSE Compliance","Power Distribution","Stakeholder Collaboration"],"job_outlook":"4% growth (2022-2032)","median_salary":"$156,350","top_locations":[]},
 {"id":"power_systems_engineer","path":"Power Systems Engineer","category":"Specialized Engineering","required_skills":["Power Distribution","MV Electrical Power Distribution","Overhead Lines","Underground Cabling","AutoCAD","GIS"],"job_outlook":"9% growth (2022-2032)","median_salary":"$115,000","top_locations":[]},
 {"id":"renewable_energy_engineer","path":"Renewable Energy Engineer","category":"Green Energy","required_skills":["Solar Power System Installation","Power Distribution","Project Management","HSE Compliance","AutoCAD"],"job_outlook":"15% growth (2022-2032)","median_salary":"$102,000","top_locations":[]},
 {"id":"software_tester","path":"Software Test Engineer","category":"Software & IT","required_skills":["Selenium","Java","SQL","Software Testing","Automation"],"job_outlook":"25% growth (2022-2032)","median_salary":"$99,000","top_locations":[]},
 {"id":"project_manager_engineering","path":"Engineering Project Manager","category":"Project Management","required_skills":["Project Management","Stakeholder Collaboration","Budget Management","HSE Compliance","Team Leadership","Risk Management"],"job_outlook":"6% growth (2022-2032)","median_salary":"$135,000","top_locations":[]},
 {"id":"controls_engineer","path":"Controls/Automation Engineer","category":"Automation & Control","required_skills":["Troubleshooting","Electrical Systems","Mechanical Systems","AutoCAD","Python","Project Management"],"job_outlook":"8% growth (2022-2032)","median_salary":"$108,000","top_locations":[]},
]

SKILL_ALIASES={
 "ms excel":"excel","microsoft excel":"excel","advanced excel":"excel","excel spreadsheet":"excel",
 "powerbi":"power bi","ms power bi":"power bi","microsoft power bi":"power bi",
 "postgres":"postgresql","postgres sql":"postgresql","mssql":"sql server","microsoft sql server":"sql server",
 "js":"javascript","nodejs":"node.js","node js":"node.js","scikit learn":"scikit-learn","sklearn":"scikit-learn",
 "google cloud platform":"gcp","microsoft azure":"azure","project management professional":"project management",
 "engineering project management":"project management","project coordination":"project management",
 "health safety environment":"hse compliance","health safety and environment":"hse compliance","hse":"hse compliance",
 "medium voltage electrical power distribution":"mv electrical power distribution","medium voltage power distribution":"mv electrical power distribution",
 "mv power distribution":"mv electrical power distribution","power systems":"power system","electrical power systems":"power system",
 "data analysis":"data analytics","stakeholder management":"stakeholder collaboration","leadership":"team leadership",
 "autocad electrical":"autocad","overhead line":"overhead lines","underground cable":"underground cabling"
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
  'mv electrical power distribution':{'mv electrical power distribution','power distribution'},
  'solar power system installation':{'solar power system installation','solar power','solar power systems'},
  'team leadership':{'team leadership'},'stakeholder collaboration':{'stakeholder collaboration'},
  'software testing':{'software testing','quality assurance','qa testing'},
  'automation':{'automation','test automation','industrial automation'},
  'project management':{'project management'},'autocad':{'autocad'},'excel':{'excel'}
 }
 for candidate in hierarchy.get(key,{key}):
  if candidate in skill_index:return skill_index[candidate]
 return None

DOMAIN_EVIDENCE={
 'registered_nurse':{'nursing':.14,'healthcare':.08,'health sciences':.08,'anatomy':.06,'physiology':.06,'biology':.04},
 'data_scientist':{'data science':.14,'data analytics':.08,'statistics':.08,'computer science':.05,'mathematics':.05},
 'data_analyst':{'data analytics':.12,'statistics':.07,'business analytics':.06},
 'software_developer':{'computer science':.10,'software engineering':.12,'programming':.10},
 'civil_engineer':{'civil engineering':.14,'engineering':.06,'physics':.04},
 'electrical_engineer':{'electrical engineering':.14,'engineering':.05,'electrical systems':.08,'power system':.06},
 'electrical_engineering_manager':{'electrical engineering':.10,'engineering':.04},
 'power_systems_engineer':{'electrical engineering':.08,'power system':.10},
 'project_manager_engineering':{'electrical engineering':.04,'engineering':.04}
}

def _domain_relevance(career,skill_index,already_matched):
 mapping=DOMAIN_EVIDENCE.get(career.get('id'),{}); contributions=[]; total=0.; matched_keys={_normalize_text(x) for x in already_matched}
 for evidence_name,weight in mapping.items():
  k=_normalize_text(evidence_name); evidence=skill_index.get(k)
  if not evidence or k in matched_keys:continue
  credit=weight*(.65+.35*evidence['confidence']); total+=credit
  contributions.append({'evidence_skill':evidence['name'],'confidence':round(evidence['confidence'],3),'readiness_credit':round(credit,4),'type':'domain_relevance'})
 return min(.20,total),contributions

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

def _score_career(extracted_skills,career):
 index=_build_skill_index(extracted_skills); required=career.get('required_skills') or []; matched=[]; missing=[]; details=[]; earned=total=0.
 for req in required:
  w=_required_skill_weight(career,req); total+=w; e=_match_required_skill(req,index)
  if e:
   matched.append(req); factor=.65+.35*e['confidence']; earned+=w*factor
   details.append({'required_skill':req,'evidence_skill':e['name'],'confidence':round(e['confidence'],3),'source':e['source'],'weight':round(w,3),'type':'core_competency'})
  else:missing.append(req)
 core=(earned/total) if total else 0.; domain_credit,domain_details=_domain_relevance(career,index,matched)
 score=round(min(1.,core+domain_credit),4); pct=round(score*100,1)
 if matched:reason=f"Demonstrates {len(matched)} of {len(required)} mapped core competencies."
 elif domain_details:reason=f"Relevant {', '.join(d['evidence_skill'] for d in domain_details[:3])} evidence supports this pathway, but core occupational competencies still need to be demonstrated."
 else:reason='No mapped core or domain-relevant evidence has been demonstrated yet.'
 return {'match_score':score,'match_percentage':pct,'skill_gap_percentage':round((1-score)*100,1),'matched_skills':matched,'missing_skills':missing,'matched_skill_details':details,'domain_evidence':domain_details,'domain_relevance_percentage':round(domain_credit*100,1),'match_reason':reason}

def _career_result(career,scoring):
 return {'id':career['id'],'path':career['path'],'category':career['category'],**scoring,'job_outlook':career.get('job_outlook'),'median_salary':career.get('median_salary'),'top_locations':career.get('top_locations') or [],'recommended_certifications':career.get('recommended_certifications') or [],'recommended_degrees':career.get('recommended_degrees') or [],'next_steps':career.get('next_steps') or [],'learning_resources':career.get('learning_resources') or []}

def get_career_recommendations(extracted_skills,top_n=5):
 out=[]
 for career in CAREER_PATHS:
  scoring=_score_career(extracted_skills,career)
  if scoring['match_score']>=.30:out.append(_career_result(career,scoring))
 out.sort(key=lambda x:(x['match_score'],len(x['matched_skills'])),reverse=True)
 return out[:max(1,int(top_n or 5))]

def get_skill_gap_analysis(extracted_skills,target_career_id):
 target=next((c for c in CAREER_PATHS if c['id']==target_career_id),None)
 if not target:return None
 scoring=_score_career(extracted_skills,target); missing=scoring['missing_skills']
 return {'career_id':target['id'],'career':target['path'],**scoring,'priority_missing_skills':missing[:3],'recommended_certifications':target.get('recommended_certifications') or [],'recommended_degrees':target.get('recommended_degrees') or [],'next_steps':target.get('next_steps') or [],'learning_resources':target.get('learning_resources') or []}
