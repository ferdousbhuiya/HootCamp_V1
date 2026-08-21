import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import StudentCareerDashboardV3 from './StudentCareerDashboardV3';
import StudentCareerDashboardV2 from './StudentCareerDashboardV2';
import AcademicPathwaysV4 from './AcademicPathwaysV4';

const supabase=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY);
const safe=v=>Array.isArray(v)?v:[];

const StudentCareerDashboardV4=(props)=>{
 const {user,onUpdateProfile,onOpenCareerIntelligence}=props;
 const [loading,setLoading]=useState(true),[data,setData]=useState(null),[showAcademic,setShowAcademic]=useState(false);
 useEffect(()=>{let active=true;(async()=>{if(!user?.id)return;setLoading(true);const q=await Promise.all([
   supabase.from('academic_profiles').select('*').eq('user_id',user.id).maybeSingle(),
   supabase.from('education_history').select('*').eq('user_id',user.id).order('completion_date',{ascending:false}),
   supabase.from('academic_subjects').select('*').eq('user_id',user.id).order('created_at',{ascending:false}),
   supabase.from('resume_analyses').select('*').eq('user_id',user.id).order('uploaded_at',{ascending:false}),
   supabase.from('skill_tracking').select('*').eq('user_id',user.id).order('updated_at',{ascending:false}),
   supabase.from('saved_certifications').select('*').eq('user_id',user.id).order('created_at',{ascending:false}),
   supabase.from('ongoing_courses').select('*').eq('user_id',user.id).order('created_at',{ascending:false}),
   supabase.from('career_goals').select('*').eq('user_id',user.id).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle()
 ]);if(!active)return;setData({academic:q[0].data||null,history:q[1].data||[],subjects:q[2].data||[],resumes:q[3].data||[],skills:q[4].data||[],certs:q[5].data||[],courses:q[6].data||[],goal:q[7].data||null,errors:q.filter(x=>x.error).map(x=>x.error.message)});setLoading(false);})();return()=>{active=false;};},[user?.id]);
 if(showAcademic)return <AcademicPathwaysV4 user={user} onOpenCareerIntelligence={onOpenCareerIntelligence} onBack={()=>setShowAcademic(false)}/>;
 if(loading||!data)return <StudentCareerDashboardV3 {...props}/>;
 const hasEvidence=Boolean(data.academic||data.history.length||data.subjects.length||data.resumes.length||data.skills.length||data.certs.length||data.courses.length||data.goal);
 if(!hasEvidence)return <StudentCareerDashboardV3 {...props}/>;
 const completedSubjects=data.subjects.filter(x=>String(x.status||'completed').toLowerCase()==='completed');
 const ongoing=data.courses.filter(x=>['in_progress','active'].includes(String(x.status||'').toLowerCase()));
 const latestResume=data.resumes[0];
 const cards=[
   ['Resume',data.resumes.length,latestResume?.filename||'No resume saved'],
   ['Completed education',data.history.length,data.history[0]?.program_name||data.history[0]?.field_of_study||'None saved'],
   ['Current education',data.academic?1:0,data.academic?.program_name||data.academic?.field_of_study||'None saved'],
   ['Completed subjects',completedSubjects.length,completedSubjects.slice(0,3).map(x=>x.subject_name).join(', ')||'None saved'],
   ['Ongoing learning',ongoing.length,ongoing.slice(0,3).map(x=>x.course_name).join(', ')||'None saved'],
   ['Certificates',data.certs.length,data.certs.slice(0,2).map(x=>x.certification_name).join(', ')||'None saved'],
   ['Tracked skills',data.skills.length,data.skills.slice(0,4).map(x=>x.skill_name).join(', ')||'None saved'],
   ['Career target',data.goal?1:0,data.goal?.career_title||'Not selected']
 ];
 return <div className="space-y-6">
   <section className="rounded-3xl border border-teal-200 bg-gradient-to-r from-teal-50 via-white to-sky-50 p-6 shadow-sm">
     <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[.16em] text-teal-700">Your saved evidence</p><h2 className="mt-2 text-2xl font-black text-slate-950">Everything you have added, in one place</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Leaving a setup path does not erase your work. Resume, education, subjects, courses, certificates and skills remain separate evidence types and are combined only when Career Intelligence analyzes your profile.</p></div><div className="flex flex-wrap gap-2"><button onClick={onUpdateProfile} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">Continue Evidence Builder</button><button onClick={()=>setShowAcademic(true)} className="rounded-xl border border-teal-300 bg-white px-4 py-2.5 text-sm font-bold text-teal-800">Academic evidence</button><button onClick={onOpenCareerIntelligence} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white">Career Intelligence</button></div></div>
     <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label,count,detail])=><div key={label} className="rounded-2xl border border-white bg-white/90 p-4"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[.12em] text-slate-500">{label}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{count}</span></div><p className="mt-2 truncate text-sm font-semibold text-slate-900" title={detail}>{detail}</p></div>)}</div>
     {data.errors.length>0&&<p className="mt-3 text-xs text-amber-700">Some evidence categories could not be loaded: {data.errors.join(' | ')}</p>}
   </section>
   <StudentCareerDashboardV2 {...props}/>
 </div>;
};
export default StudentCareerDashboardV4;
