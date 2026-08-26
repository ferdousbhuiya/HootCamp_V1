import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import StudentCareerDashboardV3 from './StudentCareerDashboardV3';
import StudentCareerDashboardV2 from './StudentCareerDashboardV2';
import AcademicPathwaysV4 from './AcademicPathwaysV4';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const safe = (value) => Array.isArray(value) ? value : [];
const norm = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const degreePattern = /\b(ph\.?d|doctor|master|m\.?s\.?|m\.?sc|mba|bachelor|b\.?s\.?|b\.?sc|associate|a\.?s\.?)\b/i;

const StudentCareerDashboardV4 = (props) => {
  const { user, onUpdateProfile, onOpenCareerIntelligence } = props;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [showAcademic, setShowAcademic] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user?.id) return;
      setLoading(true);
      const results = await Promise.all([
        supabase.from('academic_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('education_history').select('*').eq('user_id', user.id).order('completion_date', { ascending: false }),
        supabase.from('academic_subjects').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('resume_analyses').select('*').eq('user_id', user.id).order('uploaded_at', { ascending: false }),
        supabase.from('skill_tracking').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
        supabase.from('saved_certifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('ongoing_courses').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('career_goals').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()
      ]);
      if (!active) return;
      setData({
        academic: results[0].data || null,
        history: results[1].data || [],
        subjects: results[2].data || [],
        resumes: results[3].data || [],
        skills: results[4].data || [],
        certs: results[5].data || [],
        courses: results[6].data || [],
        goal: results[7].data || null,
        errors: results.filter((item) => item.error).map((item) => item.error.message)
      });
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, [user?.id]);

  if (showAcademic) {
    return <AcademicPathwaysV4 user={user} onOpenCareerIntelligence={onOpenCareerIntelligence} onBack={() => setShowAcademic(false)} />;
  }
  if (loading || !data) return <StudentCareerDashboardV3 {...props} />;

  const latestResume = data.resumes[0] || null;
  const resumePayload = latestResume?.raw_analysis || latestResume || {};
  const resumeEducation = safe(resumePayload.education || resumePayload.structured_evidence?.education);
  const resumeCourses = safe(resumePayload.courses_from_resume || resumePayload.structured_evidence?.courses);
  const resumeFormal = resumeEducation.filter((item) => degreePattern.test(`${item?.program_or_degree || ''} ${item?.field_of_study || ''}`));
  const formalInstitutions = new Set(resumeFormal.map((item) => norm(item?.institution)).filter(Boolean));
  const resumeAcademicSubjects = resumeCourses.filter((item) => {
    const provider = norm(item?.institution_or_provider || item?.institution);
    return item?.course_type === 'academic_subject' || item?.type === 'academic_subject' || (provider && formalInstitutions.has(provider));
  });
  const academicKeys = new Set(resumeAcademicSubjects.map((item) => norm(item?.name || item?.program_or_degree)).filter(Boolean));
  const resumeTraining = [...resumeEducation.filter((item) => !resumeFormal.includes(item)), ...resumeCourses].filter((item, index, all) => {
    const key = norm(item?.name || item?.program_or_degree);
    if (!key || academicKeys.has(key)) return false;
    return all.findIndex((other) => norm(other?.name || other?.program_or_degree) === key) === index;
  });

  const mergedCompletedEducation = [];
  const educationSeen = new Set();
  [...data.history, ...resumeFormal].forEach((item) => {
    const title = item?.program_name || item?.program_or_degree || item?.field_of_study || '';
    const institution = item?.institution || '';
    const key = `${norm(title)}|${norm(institution)}`;
    if (!title || educationSeen.has(key)) return;
    educationSeen.add(key);
    mergedCompletedEducation.push(item);
  });

  const mergedTraining = [];
  const trainingSeen = new Set();
  resumeTraining.forEach((item) => {
    const title = item?.name || item?.program_or_degree || '';
    const provider = item?.institution_or_provider || item?.institution || '';
    const key = `${norm(title)}|${norm(provider)}`;
    if (!title || trainingSeen.has(key)) return;
    trainingSeen.add(key);
    mergedTraining.push(item);
  });

  const completedSubjects = data.subjects.filter((item) => String(item.status || 'completed').toLowerCase() === 'completed');
  const ongoing = data.courses.filter((item) => ['in_progress', 'active'].includes(String(item.status || '').toLowerCase()));
  const totalAcademicSubjects = completedSubjects.length + resumeAcademicSubjects.length;

  const hasEvidence = Boolean(
    data.academic || mergedCompletedEducation.length || mergedTraining.length || totalAcademicSubjects ||
    data.resumes.length || data.skills.length || data.certs.length || data.courses.length || data.goal
  );
  if (!hasEvidence) return <StudentCareerDashboardV3 {...props} />;

  const cards = [
    ['Resume', data.resumes.length, latestResume?.filename || 'Resume saved'],
    ['Completed education', mergedCompletedEducation.length, mergedCompletedEducation[0]?.program_name || mergedCompletedEducation[0]?.program_or_degree || mergedCompletedEducation[0]?.field_of_study || 'Education saved'],
    ['Academic subjects', totalAcademicSubjects, [...resumeAcademicSubjects, ...completedSubjects].slice(0, 3).map((item) => item?.name || item?.subject_name || item?.program_or_degree).filter(Boolean).join(', ') || 'Academic coursework saved'],
    ['Completed training', mergedTraining.length, mergedTraining.slice(0, 2).map((item) => item.name || item.program_or_degree).join(', ') || 'Professional training saved'],
    ['Current education', data.academic ? 1 : 0, data.academic?.program_name || data.academic?.field_of_study || 'Current education saved'],
    ['Ongoing learning', ongoing.length, ongoing.slice(0, 3).map((item) => item.course_name).join(', ') || 'Ongoing learning saved'],
    ['Certificates', data.certs.length, data.certs.slice(0, 2).map((item) => item.certification_name).join(', ') || 'Certificates saved'],
    ['Tracked skills', data.skills.length, data.skills.slice(0, 4).map((item) => item.skill_name).join(', ') || 'Skills saved'],
    ['Career target', data.goal ? 1 : 0, data.goal?.career_title || 'Career target selected']
  ].filter(([, count]) => Number(count) > 0);

  return <div className="space-y-6">
    <section className="rounded-3xl border border-teal-200 bg-gradient-to-r from-teal-50 via-white to-sky-50 p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-teal-700">Your saved evidence</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">Everything you have added, in one place</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Only evidence categories currently present in your saved profile are shown. Resume coursework is kept separate from professional training.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onUpdateProfile} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">Continue Evidence Builder</button>
          <button onClick={() => setShowAcademic(true)} className="rounded-xl border border-teal-300 bg-white px-4 py-2.5 text-sm font-bold text-teal-800">Academic evidence</button>
          <button onClick={onOpenCareerIntelligence} className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white">Career Intelligence</button>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map(([label, count, detail]) => <div key={label} className="rounded-2xl border border-white bg-white/90 p-4"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[.12em] text-slate-500">{label}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{count}</span></div><p className="mt-2 truncate text-sm font-semibold text-slate-900" title={detail}>{detail}</p></div>)}
      </div>
      {data.errors.length > 0 && <p className="mt-3 text-xs text-amber-700">Some evidence categories could not be loaded: {data.errors.join(' | ')}</p>}
    </section>
    <StudentCareerDashboardV2 {...props} />
  </div>;
};

export default StudentCareerDashboardV4;
