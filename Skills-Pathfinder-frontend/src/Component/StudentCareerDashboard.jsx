import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import AcademicPathways from './AcademicPathways';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const normalize = (value = '') => String(value).trim().toLowerCase();

const percentFromRecommendation = (recommendation) => {
  if (!recommendation) return 0;
  const direct = Number(recommendation.match_percentage);
  if (Number.isFinite(direct)) return clamp(Math.round(direct));
  const score = Number(recommendation.match_score);
  return Number.isFinite(score) ? clamp(Math.round(score <= 1 ? score * 100 : score)) : 0;
};

const MiniRadar = ({ values }) => {
  const center = 70;
  const radius = 52;
  const points = values.map((value, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / values.length);
    const r = radius * clamp(value) / 100;
    return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
  }).join(' ');
  const grid = [25, 50, 75, 100].map((pct) => values.map((_, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / values.length);
    const r = radius * pct / 100;
    return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
  }).join(' '));

  return (
    <svg viewBox="0 0 140 140" className="mx-auto h-44 w-44" role="img" aria-label="Career readiness radar chart">
      {grid.map((polygon, i) => <polygon key={i} points={polygon} fill="none" stroke="currentColor" className="text-slate-200" strokeWidth="1" />)}
      {values.map((_, index) => {
        const angle = -Math.PI / 2 + index * (Math.PI * 2 / values.length);
        return <line key={index} x1={center} y1={center} x2={center + Math.cos(angle) * radius} y2={center + Math.sin(angle) * radius} stroke="currentColor" className="text-slate-200" strokeWidth="1" />;
      })}
      <polygon points={points} fill="rgba(13,148,136,0.18)" stroke="rgb(13,148,136)" strokeWidth="2.5" />
      {points.split(' ').map((point, i) => { const [x, y] = point.split(','); return <circle key={i} cx={x} cy={y} r="3" fill="rgb(13,148,136)" />; })}
    </svg>
  );
};

const StudentCareerDashboard = ({ user, onAnalyzeResume, onOpenCareerIntelligence, onUpdateProfile }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAcademic, setShowAcademic] = useState(false);
  const [profile, setProfile] = useState(null);
  const [academicProfile, setAcademicProfile] = useState(null);
  const [academicSubjects, setAcademicSubjects] = useState([]);
  const [careerGoal, setCareerGoal] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [skills, setSkills] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    let active = true;
    const loadDashboard = async () => {
      if (!user?.id) return;
      setLoading(true);
      setError(null);
      try {
        const [profileResult, analysesResult, skillsResult, certsResult, coursesResult] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          supabase.from('resume_analyses').select('*').eq('user_id', user.id).order('uploaded_at', { ascending: false }).limit(8),
          supabase.from('skill_tracking').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
          supabase.from('saved_certifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
          supabase.from('ongoing_courses').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
        ]);
        const failure = [profileResult, analysesResult, skillsResult, certsResult, coursesResult].find((item) => item.error);
        if (failure?.error) throw failure.error;
        if (!active) return;
        setProfile(profileResult.data || null);
        setAnalyses(analysesResult.data || []);
        setSkills(skillsResult.data || []);
        setCertifications(certsResult.data || []);
        setCourses(coursesResult.data || []);

        // Academic pathway tables are optional until the new migration is applied.
        const [academicResult, subjectsResult, goalResult] = await Promise.all([
          supabase.from('academic_profiles').select('*').eq('user_id', user.id).maybeSingle(),
          supabase.from('academic_subjects').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
          supabase.from('career_goals').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()
        ]);
        if (!active) return;
        if (!academicResult.error) setAcademicProfile(academicResult.data || null);
        if (!subjectsResult.error) setAcademicSubjects(subjectsResult.data || []);
        if (!goalResult.error) setCareerGoal(goalResult.data || null);
      } catch (loadError) {
        if (active) setError(loadError.message || 'Career dashboard could not load your saved data.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadDashboard();
    return () => { active = false; };
  }, [user?.id, showAcademic]);

  if (showAcademic) {
    return <AcademicPathways user={user} onOpenCareerIntelligence={onOpenCareerIntelligence} />;
  }

  const latestAnalysis = analyses[0] || null;
  const recommendations = Array.isArray(latestAnalysis?.recommendations) ? latestAnalysis.recommendations : [];
  const topCareer = recommendations[0] || null;
  const careerMatch = percentFromRecommendation(topCareer);
  const verifiedSkills = skills.filter((skill) => skill.verification_status === 'certificate_verified');
  const evidencedSkills = skills.filter((skill) => ['certificate_verified', 'ai_verified', 'certificate_extracted_unverified'].includes(skill.verification_status));
  const activeCourses = courses.filter((course) => ['in_progress', 'active'].includes(normalize(course.status)));
  const verifiedCertificates = certifications.filter((cert) => cert.is_verified || cert.verification_status === 'electronically_verified');
  const evidenceStrength = skills.length ? Math.round((verifiedSkills.length + (evidencedSkills.length - verifiedSkills.length) * 0.65) / skills.length * 100) : 0;
  const learningProgress = activeCourses.length ? clamp(45 + Math.min(activeCourses.length, 4) * 10) : courses.some((course) => normalize(course.status) === 'completed') ? 65 : academicSubjects.length ? 45 : 20;
  const academicCoverage = academicProfile ? clamp(Math.round(35 + Math.min(Number(academicProfile.credits_earned || 0), 120) / 120 * 55 + Math.min(academicSubjects.length, 10))) : 0;
  const readinessEstimate = topCareer ? clamp(Math.round(careerMatch * 0.55 + evidenceStrength * 0.2 + learningProgress * 0.15 + academicCoverage * 0.1)) : academicProfile ? clamp(Math.round(academicCoverage * 0.55 + evidenceStrength * 0.25 + learningProgress * 0.2)) : 0;
  const missingSkills = Array.isArray(topCareer?.missing_skills) ? topCareer.missing_skills : [];
  const matchedSkills = Array.isArray(topCareer?.matched_skills) ? topCareer.matched_skills : [];

  const courseAlignment = useMemo(() => {
    if (!missingSkills.length) return [];
    return missingSkills.filter((gap) => {
      const text = normalize(gap);
      return activeCourses.some((course) => `${course.course_name || ''} ${course.subject_area || ''}`.toLowerCase().includes(text)) ||
        academicSubjects.some((subject) => `${subject.subject_name || ''} ${subject.subject_area || ''} ${(subject.skills_learned || []).join?.(' ') || ''}`.toLowerCase().includes(text));
    }).slice(0, 4);
  }, [activeCourses, academicSubjects, missingSkills]);

  const profileFields = ['full_name', 'phone', 'city', 'state'];
  const profileCompletion = Math.round(profileFields.filter((field) => String(profile?.[field] || '').trim()).length / profileFields.length * 100);

  const careerVisuals = recommendations.slice(0, 5).map((rec) => {
    const match = percentFromRecommendation(rec);
    const gaps = Array.isArray(rec.missing_skills) ? rec.missing_skills.length : 0;
    const strengths = Array.isArray(rec.matched_skills) ? rec.matched_skills.length : 0;
    const total = Math.max(1, gaps + strengths);
    return {
      ...rec,
      match,
      gap: Math.round(gaps / total * 100),
      readiness: clamp(Math.round(match * 0.6 + evidenceStrength * 0.2 + learningProgress * 0.12 + academicCoverage * 0.08))
    };
  });

  if (loading) return <div className="app-card flex min-h-[420px] items-center justify-center p-8"><div className="text-center"><div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-teal-100 border-t-teal-600" /><p className="mt-4 text-sm font-medium text-slate-500">Building your career dashboard…</p></div></div>;
  if (error) return <div className="app-card border-rose-200 p-6"><p className="font-semibold text-rose-800">Dashboard data could not be loaded.</p><p className="mt-1 text-sm text-rose-700">{error}</p><button onClick={onAnalyzeResume} className="app-button-secondary mt-4">Continue to profile entry</button></div>;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-xl">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-center">
          <div>
            <div className="flex flex-wrap gap-2"><span className="rounded-full bg-teal-400/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-teal-300">Career command center</span>{careerGoal?.career_title && <span className="rounded-full bg-sky-400/15 px-3 py-1 text-xs font-semibold text-sky-200">Goal: {careerGoal.career_title}</span>}</div>
            <h2 className="mt-5 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">{topCareer ? `Strongest current path: ${topCareer.path}` : academicProfile ? `${academicProfile.field_of_study || academicProfile.program_name || 'Your studies'} can become a career pathway.` : 'Build your career profile from any evidence you have.'}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">A resume is optional. Skills Pathfinder can combine academic subjects, credits, certificates, courses, self-reported skills and resume evidence whenever it becomes available.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => setShowAcademic(true)} className="rounded-xl bg-teal-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-teal-300">Academic Profile & Subjects</button>
              <button onClick={onAnalyzeResume} className="rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-bold text-white hover:bg-white/15">Resume / Manual Profile</button>
              <button onClick={onOpenCareerIntelligence} disabled={!latestAnalysis} className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">Career Intelligence</button>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Readiness estimate</p><div className="mt-3 flex items-end gap-2"><span className="text-6xl font-black">{readinessEstimate}</span><span className="pb-2 text-xl text-slate-400">%</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-teal-400" style={{ width: `${readinessEstimate}%` }} /></div><p className="mt-3 text-xs leading-5 text-slate-400">Combines career fit, evidence quality, active learning and academic progress. It is guidance, not a hiring probability.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Career match', topCareer ? `${careerMatch}%` : 'Pending', topCareer?.path || careerGoal?.career_title || 'Choose a goal'],
          ['Evidence strength', `${evidenceStrength}%`, `${verifiedSkills.length} certificate-verified skills`],
          ['Academic progress', academicProfile ? `${Number(academicProfile.credits_earned || 0)} cr` : 'Not added', `${academicSubjects.length} subjects recorded`],
          ['Active learning', activeCourses.length, `${courses.length} courses recorded`],
          ['Verified credentials', verifiedCertificates.length, `${certifications.length} certificates saved`]
        ].map(([label, value, detail]) => <div key={label} className="app-card p-5"><div className="mb-4 h-1.5 w-12 rounded-full bg-teal-500" /><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-2 text-3xl font-black text-slate-950">{value}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div>)}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="app-card p-6">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Career comparison</p><h3 className="mt-1 text-xl font-bold text-slate-950">Compare your leading career paths</h3></div><span className="text-xs text-slate-500">Match · readiness · remaining gap</span></div>
          {careerVisuals.length ? <div className="mt-6 space-y-5">{careerVisuals.map((career) => <div key={career.id || career.path}><div className="mb-2 flex flex-wrap justify-between gap-2"><div><p className="font-bold text-slate-900">{career.path}</p><p className="text-xs text-slate-500">{career.category}</p></div><div className="flex gap-2 text-xs font-bold"><span className="rounded-full bg-teal-50 px-2.5 py-1 text-teal-800">{career.match}% match</span><span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-800">{career.readiness}% readiness</span><span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">{career.gap}% gap</span></div></div><div className="grid grid-cols-[1fr_auto] items-center gap-3"><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-sky-500" style={{ width: `${career.readiness}%` }} /></div><span className="w-10 text-right text-xs font-bold text-slate-700">{career.readiness}%</span></div></div>)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center"><p className="font-semibold text-slate-800">Career comparisons will appear after the system has enough evidence.</p><p className="mt-1 text-sm text-slate-500">Start with academic subjects, certificates, a manual profile or a resume.</p></div>}
        </div>

        <div className="app-card p-6"><p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-700">Readiness dimensions</p><h3 className="mt-1 text-xl font-bold text-slate-950">Your current evidence shape</h3><MiniRadar values={[careerMatch, evidenceStrength, learningProgress, academicCoverage, profileCompletion]} /><div className="grid grid-cols-2 gap-2 text-xs text-slate-600"><span>Career fit: <b>{careerMatch}%</b></span><span>Evidence: <b>{evidenceStrength}%</b></span><span>Learning: <b>{learningProgress}%</b></span><span>Academic: <b>{academicCoverage}%</b></span><span>Profile: <b>{profileCompletion}%</b></span></div></div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="app-card p-6"><div className="flex justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Next best action</p><h3 className="mt-1 text-xl font-bold text-slate-950">What should you work on next?</h3></div>{missingSkills.length > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{missingSkills.length} skill gaps</span>}</div><div className="mt-5 space-y-3">{missingSkills.slice(0, 5).map((skill) => { const aligned = courseAlignment.some((item) => normalize(item) === normalize(skill)); return <div key={skill} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4"><div><p className="font-semibold text-slate-900">{skill}</p><p className="mt-1 text-xs text-slate-500">{aligned ? 'Already being addressed by a current course or academic subject.' : 'High-priority gap for your strongest path.'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${aligned ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>{aligned ? 'In progress' : 'Next'}</span></div>; })}{missingSkills.length === 0 && <div className="rounded-2xl bg-teal-50 p-5 text-sm text-teal-900">{academicProfile ? 'Keep building academic and certificate evidence. Career-specific gaps will become more precise as your profile grows.' : 'Add an academic profile or student profile to generate a clearer next action.'}</div>}</div>{matchedSkills.length > 0 && <div className="mt-6 border-t border-slate-200 pt-5"><p className="text-xs font-bold uppercase tracking-[0.13em] text-slate-400">Current strengths</p><div className="mt-3 flex flex-wrap gap-2">{matchedSkills.slice(0, 8).map((skill) => <span key={skill} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">{skill}</span>)}</div></div>}</div>

        <div className="app-card p-6"><p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Student pathway</p><h3 className="mt-1 text-xl font-bold text-slate-950">Build the profile in any order</h3><div className="mt-5 space-y-3">{[
          ['1','Academic subjects & credits', academicProfile || academicSubjects.length ? 'Started' : 'Optional start'],
          ['2','Certificates & diplomas', certifications.length ? `${certifications.length} saved` : 'Optional'],
          ['3','Ongoing courses', courses.length ? `${courses.length} saved` : 'Optional'],
          ['4','Resume or manual student profile', analyses.length ? `${analyses.length} analyses` : 'Optional'],
          ['5','Target career & next-semester plan', careerGoal ? careerGoal.career_title : 'Choose a goal']
        ].map(([number,label,status]) => <div key={number} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-slate-950 text-xs font-bold text-white">{number}</span><div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">{label}</p><p className="text-xs text-slate-500">{status}</p></div></div>)}</div><button onClick={() => setShowAcademic(true)} className="mt-5 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white hover:bg-teal-700">Update Academic Pathway</button></div>
      </section>
    </div>
  );
};

export default StudentCareerDashboard;
