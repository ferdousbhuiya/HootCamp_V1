import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import AcademicPathwaysV2 from './AcademicPathwaysV2';

const supabase=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY);
const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,v));
const safe=v=>Array.isArray(v)?v:[];
const norm=v=>String(v||'').trim().toLowerCase();
const degreePattern=/\b(ph\.?d|doctor|master|m\.?s\.?|m\.?sc|mba|bachelor|b\.?s\.?|b\.?sc|associate|a\.?s\.?)\b/i;
const pct=rec=>{const p=Number(rec?.match_percentage);if(Number.isFinite(p))return clamp(Math.round(p));const s=Number(rec?.match_score);return Number.isFinite(s)?clamp(Math.round(s<=1?s*100:s)):0;};

const StudentCareerDashboardV2=({user,onAnalyzeResume,onOpenCareerIntelligence,onUpdateProfile})=>{
 const [loading,setLoading]=useState(true),[error,setError]=useState(null),[showAcademic,setShowAcademic]=useState(false);
 const [data,setData]=useState({});
 useEffect(()=>{let active=true;(async()=>{if(!user?.id)return;setLoading(true);setError(null);try{const q=await Promise.all([
  supabase.from('profiles').select('*').eq('id',user.id).maybeSingle(),
  supabase.from('academic_profiles').select('*').eq('user_id',user.id).maybeSingle(),
  supabase.from('academic_subjects').select('*').eq('user_id',user.id),
  supabase.from('career_goals').select('*').eq('user_id',user.id).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle(),
  supabase.from('resume_analyses').select('*').eq('user_id',user.id).order('uploaded_at',{ascending:false}).limit(10),
  supabase.from('career_recommendations').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(30),
  supabase.from('skill_tracking').select('*').eq('user_id',user.id),
  supabase.from('saved_certifications').select('*').eq('user_id',user.id),
  supabase.from('ongoing_courses').select('*').eq('user_id',user.id),
  supabase.from('learning_plans').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(10),
  supabase.from('education_history').select('*').eq('user_id',user.id)
 ]);const failed=q.find(x=>x.error);if(failed?.error)throw failed.error;if(!active)return;setData({profile:q[0].data||null,academic:q[1].data||null,subjects:q[2].data||[],goal:q[3].data||null,analyses:q[4].data||[],careerRows:q[5].data||[],skills:q[6].data||[],certs:q[7].data||[],courses:q[8].data||[],plans:q[9].data||[],history:q[10].data||[]});}catch(e){if(active)setError(e.message||'Dashboard could not load saved evidence.');}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[user?.id,showAcademic]);
 if(showAcademic)return <AcademicPathwaysV2 user={user} onOpenCareerIntelligence={onOpenCareerIntelligence} onBack={()=>setShowAcademic(false)}/>;
 if(loading)return <div className="app-card flex min-h-[420px] items-center justify-center p-8"><p className="text-sm text-slate-500">Building your career dashboard…</p></div>;
 if(error)return <div className="app-card border-rose-200 p-6 text-rose-800">{error}</div>;

 const latest=data.analyses?.find(r=>safe(r.recommendations).length||safe(r.extracted_skills).length)||data.analyses?.[0]||null;
 const raw=latest?.raw_analysis||latest||{};
 const resumeEducation=safe(raw.education);
 const resumeCourses=safe(raw.courses_from_resume||raw.structured_evidence?.courses);
 const resumeFormal=resumeEducation.filter(e=>degreePattern.test(`${e?.program_or_degree||''} ${e?.field_of_study||''}`));
 const resumeTraining=[...resumeEducation.filter(e=>!resumeFormal.includes(e)),...resumeCourses];
 const formalEducationCount=Math.max(data.history?.length||0,resumeFormal.length);
 const completedTrainingCount=resumeTraining.length;
 const academicEvidenceCount=formalEducationCount+completedTrainingCount;

 const analysisRecs=safe(latest?.recommendations);
 const savedRecs=useMemo(()=>{const seen=new Set();return safe(data.careerRows).map(row=>({...(row.recommendation_data||{}),id:row.career_id||row.id,path:row.career_title||row.recommendation_data?.path,match_score:row.match_score??row.recommendation_data?.match_score,match_percentage:row.match_percentage??row.recommendation_data?.match_percentage,matched_skills:safe(row.matched_skills).length?row.matched_skills:safe(row.recommendation_data?.matched_skills),missing_skills:safe(row.missing_skills).length?row.missing_skills:safe(row.recommendation_data?.missing_skills),match_reason:row.recommendation_data?.match_reason})).filter(x=>{const k=norm(x.path||x.id);if(!k||seen.has(k))return false;seen.add(k);return true;});},[data.careerRows]);
 const recommendations=analysisRecs.length?analysisRecs:savedRecs;
 const topCareer=[...recommendations].sort((a,b)=>pct(b)-pct(a))[0]||null;
 const careerFit=pct(topCareer);
 const skills=safe(data.skills),verified=skills.filter(s=>s.verification_status==='certificate_verified'),evidenced=skills.filter(s=>['certificate_verified','ai_verified','certificate_extracted_unverified'].includes(s.verification_status));
 const evidenceStrength=skills.length?Math.round((verified.length+Math.max(0,evidenced.length-verified.length)*.65)/skills.length*100):0;
 const activeCourses=safe(data.courses).filter(c=>['in_progress','active'].includes(norm(c.status)));
 const completedLearning=safe(data.courses).filter(c=>norm(c.status)==='completed').length+completedTrainingCount;
 const learningProgress=activeCourses.length?clamp(45+Math.min(activeCourses.length,4)*10):completedLearning?clamp(55+Math.min(completedLearning,3)*10):safe(data.subjects).length?45:0;
 const manualAcademic=data.academic?35:0;
 const credits=Number(data.academic?.credits_earned||0);
 const subjectCredit=Math.min(safe(data.subjects).length,10)*3;
 const formalCredit=formalEducationCount?45:0;
 const trainingCredit=Math.min(completedTrainingCount,3)*10;
 const academicCoverage=clamp(Math.round(Math.max(manualAcademic,formalCredit)+Math.min(credits,120)/120*30+subjectCredit+trainingCredit));
 const profileFields=['full_name','phone','city','state'];
 const profileCompletion=Math.round(profileFields.filter(f=>String(data.profile?.[f]||'').trim()).length/profileFields.length*100);
 const hasEvidence=Boolean(data.academic||academicEvidenceCount||safe(data.subjects).length||skills.length||safe(data.certs).length||safe(data.courses).length||safe(data.analyses).length);
 const readiness=!hasEvidence&&!topCareer?0:topCareer?clamp(Math.round(careerFit*.55+evidenceStrength*.2+learningProgress*.15+academicCoverage*.1)):clamp(Math.round(academicCoverage*.45+evidenceStrength*.3+learningProgress*.15));
 const dimensions=[['Career Fit',careerFit,'Generate or refine Career Intelligence for your target role.'],['Evidence',evidenceStrength,'Add verified certificates, stronger resume evidence, or documented skill sources.'],['Learning',learningProgress,'Add or complete learning tied to a priority skill gap.'],['Academic',academicCoverage,academicEvidenceCount?'Resume education and completed training are included.':'Add formal education, subjects, credits, or academic progress.'],['Profile',profileCompletion,'Complete the missing profile fields so reports and job guidance are stronger.']];
 const priority=[...dimensions].filter(x=>x[0]!=='Profile'||hasEvidence).sort((a,b)=>a[1]-b[1])[0];
 const missing=safe(topCareer?.missing_skills);
 const next=!topCareer?['Generate Career Intelligence','Convert your saved evidence into career matches and skill gaps.','Generate Career Intelligence']:missing.length?[`Work on ${missing[0]}`,`${missing[0]} is a priority gap for ${topCareer.path}.`,'Open skill-gap plan']:[`Create an action plan for ${topCareer?.path||'your target career'}`,'Create a trackable 30-day, 6-month, and 1-year roadmap.','Create career plan'];

 return <div className="space-y-6">
  <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-xl"><div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-center"><div><span className="rounded-full bg-teal-400/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-teal-300">Career command center</span><h2 className="mt-5 text-3xl font-black sm:text-4xl">{topCareer?`Strongest current path: ${topCareer.path}`:'Build your career profile from any evidence you have.'}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">All saved evidence, including education and training extracted from your resume, feeds one Career Intelligence profile.</p><div className="mt-6 flex flex-wrap gap-3"><button onClick={()=>setShowAcademic(true)} className="rounded-xl bg-teal-400 px-5 py-3 text-sm font-bold text-slate-950">Academic Profile & Subjects</button><button onClick={onAnalyzeResume} className="rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-bold text-white">Resume & Work Experience</button><button onClick={()=>onOpenCareerIntelligence?.()} className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-white">Career Intelligence</button></div></div><div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Readiness estimate</p><div className="mt-3 flex items-end gap-2"><span className="text-6xl font-black">{readiness}</span><span className="pb-2 text-xl text-slate-400">%</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-teal-400" style={{width:`${readiness}%`}}/></div><p className="mt-3 text-xs text-slate-400">Resume-derived academic evidence is included. Empty categories contribute 0%.</p><div className="mt-4 rounded-xl bg-white/[0.07] p-3 text-xs text-slate-300"><strong className="text-white">Best way to improve:</strong> {priority?.[2]}</div></div></div></section>
  <section className="rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-teal-50 p-6"><p className="text-xs font-bold uppercase tracking-[0.15em] text-amber-700">Your Next Best Action</p><h3 className="mt-2 text-2xl font-black">{next[0]}</h3><p className="mt-2 text-sm text-slate-600">{next[1]}</p><button onClick={()=>onOpenCareerIntelligence?.()} className="mt-4 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">{next[2]}</button></section>
  <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{dimensions.map(([label,value,action])=><div key={label} className="app-card p-5"><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-2 text-3xl font-black">{value}%</p><p className="mt-1 text-xs text-slate-500">{action}</p></div>)}</section>
  <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]"><div className="app-card p-6"><p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Career snapshot</p><h3 className="mt-1 text-xl font-bold">Current career outcomes</h3>{recommendations.length?<div className="mt-5 space-y-3">{recommendations.slice(0,5).map(rec=><div key={rec.id||rec.path} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><strong>{rec.path}</strong><span className="text-sm font-bold text-teal-700">{pct(rec)}%</span></div><p className="mt-2 text-xs text-slate-500">{rec.match_reason||`${safe(rec.matched_skills).length} matched strengths · ${safe(rec.missing_skills).length} identified gaps`}</p></div>)}</div>:<p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No career outcomes yet.</p>}</div><div className="app-card p-6"><p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-700">Academic evidence recognized</p><h3 className="mt-1 text-xl font-bold">Resume + saved profile</h3><div className="mt-5 space-y-3 text-sm"><div className="rounded-xl bg-slate-50 p-4"><strong>Formal education:</strong> {formalEducationCount}</div><div className="rounded-xl bg-slate-50 p-4"><strong>Completed training:</strong> {completedTrainingCount}</div><div className="rounded-xl bg-slate-50 p-4"><strong>Academic readiness:</strong> {academicCoverage}%</div></div></div></section>
 </div>;
};
export default StudentCareerDashboardV2;
