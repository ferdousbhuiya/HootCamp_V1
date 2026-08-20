import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import AcademicPathwaysV2 from './AcademicPathwaysV2';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const normalize = (value = '') => String(value).trim().toLowerCase();
const safeArray = (value) => Array.isArray(value) ? value : [];
const percentFromRecommendation = (rec) => {
  const direct = Number(rec?.match_percentage);
  if (Number.isFinite(direct)) return clamp(Math.round(direct));
  const score = Number(rec?.match_score);
  return Number.isFinite(score) ? clamp(Math.round(score <= 1 ? score * 100 : score)) : 0;
};

const ReadinessRadar = ({ dimensions }) => {
  const center = 92;
  const radius = 56;
  const labelRadius = 78;
  const count = dimensions.length;
  const point = (r, i) => {
    const angle = -Math.PI / 2 + i * (Math.PI * 2 / count);
    return [center + Math.cos(angle) * r, center + Math.sin(angle) * r];
  };
  const polygon = (pct) => dimensions.map((_, i) => point(radius * pct / 100, i).join(',')).join(' ');
  const values = dimensions.map((item, i) => point(radius * clamp(item.value) / 100, i).join(',')).join(' ');
  return <div><svg viewBox="0 0 184 184" className="mx-auto h-56 w-56" role="img" aria-label="Readiness chart labeled Career Fit, Evidence, Learning, Academic, and Profile">
    {[25,50,75,100].map((pct) => <polygon key={pct} points={polygon(pct)} fill="none" stroke="currentColor" className="text-slate-200" strokeWidth="1" />)}
    {dimensions.map((item, i) => { const [x,y] = point(radius,i); const [lx,ly] = point(labelRadius,i); return <g key={item.label}><line x1={center} y1={center} x2={x} y2={y} stroke="currentColor" className="text-slate-200" /><text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-slate-600 text-[8px] font-semibold">{item.short}</text></g>; })}
    <polygon points={values} fill="rgba(13,148,136,0.18)" stroke="rgb(13,148,136)" strokeWidth="2.5" />
    {values.split(' ').map((p,i) => { const [x,y] = p.split(','); return <circle key={i} cx={x} cy={y} r="3" fill="rgb(13,148,136)" />; })}
  </svg><div className="grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-3">{dimensions.map((item) => <div key={item.label} className="rounded-lg bg-slate-50 px-2 py-1.5"><strong>{item.label}</strong>: {item.value}%</div>)}</div></div>;
};

const StudentCareerDashboardV2 = ({ user, onAnalyzeResume, onOpenCareerIntelligence, onUpdateProfile }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAcademic, setShowAcademic] = useState(false);
  const [profile, setProfile] = useState(null);
  const [academicProfile, setAcademicProfile] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [goal, setGoal] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [careerRows, setCareerRows] = useState([]);
  const [skills, setSkills] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user?.id) return;
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          supabase.from('academic_profiles').select('*').eq('user_id', user.id).maybeSingle(),
          supabase.from('academic_subjects').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
          supabase.from('career_goals').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('resume_analyses').select('*').eq('user_id', user.id).order('uploaded_at', { ascending: false }).limit(10),
          supabase.from('career_recommendations').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
          supabase.from('skill_tracking').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
          supabase.from('saved_certifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
          supabase.from('ongoing_courses').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
        ]);
        const failure = results.find((item) => item.error);
        if (failure?.error) throw failure.error;
        if (!active) return;
        setProfile(results[0].data || null);
        setAcademicProfile(results[1].data || null);
        setSubjects(results[2].data || []);
        setGoal(results[3].data || null);
        setAnalyses(results[4].data || []);
        setCareerRows(results[5].data || []);
        setSkills(results[6].data || []);
        setCertifications(results[7].data || []);
        setCourses(results[8].data || []);
      } catch (err) {
        if (active) setError(err.message || 'Dashboard could not load saved evidence.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [user?.id, showAcademic]);

  const latestAnalysis = analyses.find((row) => safeArray(row.recommendations).length || safeArray(row.extracted_skills).length) || analyses[0] || null;
  const analysisRecs = safeArray(latestAnalysis?.recommendations);
  const savedRecs = useMemo(() => {
    const seen = new Set();
    return careerRows.map((row) => ({
      ...(row.recommendation_data || {}),
      id: row.career_id || row.recommendation_data?.id || row.id,
      path: row.career_title || row.recommendation_data?.path,
      category: row.category || row.recommendation_data?.category,
      match_score: row.match_score ?? row.recommendation_data?.match_score,
      match_percentage: row.match_percentage ?? row.recommendation_data?.match_percentage,
      matched_skills: safeArray(row.matched_skills).length ? row.matched_skills : safeArray(row.recommendation_data?.matched_skills),
      missing_skills: safeArray(row.missing_skills).length ? row.missing_skills : safeArray(row.recommendation_data?.missing_skills)
    })).filter((item) => { const key = normalize(item.path || item.id); if (!key || seen.has(key)) return false; seen.add(key); return true; });
  }, [careerRows]);
  const recommendations = analysisRecs.length ? analysisRecs : savedRecs;
  const topCareer = [...recommendations].sort((a,b) => percentFromRecommendation(b) - percentFromRecommendation(a))[0] || null;
  const careerMatch = percentFromRecommendation(topCareer);
  const activeCourses = courses.filter((course) => ['in_progress','active'].includes(normalize(course.status)));
  const verifiedSkills = skills.filter((skill) => skill.verification_status === 'certificate_verified');
  const evidencedSkills = skills.filter((skill) => ['certificate_verified','ai_verified','certificate_extracted_unverified'].includes(skill.verification_status));
  const verifiedCerts = certifications.filter((cert) => cert.is_verified || cert.verification_status === 'electronically_verified');
  const evidenceStrength = skills.length ? Math.round((verifiedSkills.length + Math.max(0, evidencedSkills.length - verifiedSkills.length) * 0.65) / skills.length * 100) : 0;
  const learningProgress = activeCourses.length ? clamp(45 + Math.min(activeCourses.length,4) * 10) : courses.some((course) => normalize(course.status) === 'completed') ? 65 : subjects.length ? 45 : 20;
  const academicCoverage = academicProfile ? clamp(Math.round(35 + Math.min(Number(academicProfile.credits_earned || 0),120) / 120 * 55 + Math.min(subjects.length,10))) : subjects.length ? clamp(25 + subjects.length * 5) : 0;
  const profileFields = ['full_name','phone','city','state'];
  const profileCompletion = Math.round(profileFields.filter((field) => String(profile?.[field] || '').trim()).length / profileFields.length * 100);
  const readiness = topCareer ? clamp(Math.round(careerMatch * .55 + evidenceStrength * .2 + learningProgress * .15 + academicCoverage * .1)) : clamp(Math.round(academicCoverage * .45 + evidenceStrength * .3 + learningProgress * .15 + profileCompletion * .1));
  const missingSkills = safeArray(topCareer?.missing_skills);
  const matchedSkills = safeArray(topCareer?.matched_skills);
  const hasEvidence = Boolean(academicProfile || subjects.length || skills.length || certifications.length || courses.length || analyses.length);

  const radar = [
    { label: 'Career Fit', short: 'Career', value: careerMatch },
    { label: 'Evidence', short: 'Evidence', value: evidenceStrength },
    { label: 'Learning', short: 'Learning', value: learningProgress },
    { label: 'Academic', short: 'Academic', value: academicCoverage },
    { label: 'Profile', short: 'Profile', value: profileCompletion }
  ];

  if (showAcademic) return <AcademicPathwaysV2 user={user} onOpenCareerIntelligence={onOpenCareerIntelligence} onBack={() => setShowAcademic(false)} />;
  if (loading) return <div className="app-card flex min-h-[420px] items-center justify-center p-8"><div className="text-center"><div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-teal-100 border-t-teal-600" /><p className="mt-4 text-sm text-slate-500">Building your career dashboard…</p></div></div>;
  if (error) return <div className="app-card border-rose-200 p-6 text-rose-800">{error}</div>;

  return <div className="space-y-6">
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-xl"><div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-center"><div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-teal-400/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-teal-300">Career command center</span>{goal?.career_title && <span className="rounded-full bg-sky-400/15 px-3 py-1 text-xs font-semibold text-sky-200">Goal: {goal.career_title}</span>}</div><h2 className="mt-5 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">{topCareer ? `Strongest current path: ${topCareer.path}` : academicProfile ? `${academicProfile.field_of_study || academicProfile.program_name || 'Your studies'} can become a career pathway.` : 'Build your career profile from any evidence you have.'}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Employment preparation and further study can happen at the same time. Academic subjects, ongoing courses, certificates, tracked skills and resume evidence all feed one Career Intelligence profile.</p><div className="mt-6 flex flex-wrap gap-3"><button onClick={() => setShowAcademic(true)} className="rounded-xl bg-teal-400 px-5 py-3 text-sm font-bold text-slate-950">Academic Profile & Subjects</button><button onClick={onAnalyzeResume} className="rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-bold text-white">Job Profile / Resume</button><button onClick={() => onOpenCareerIntelligence?.()} disabled={!hasEvidence} className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">Career Intelligence</button></div></div><div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Readiness estimate</p><div className="mt-3 flex items-end gap-2"><span className="text-6xl font-black">{readiness}</span><span className="pb-2 text-xl text-slate-400">%</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-teal-400" style={{ width: `${readiness}%` }} /></div><p className="mt-3 text-xs leading-5 text-slate-400">Guidance based on fit, evidence quality, learning, academic progress and profile completeness.</p></div></div></section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[
      ['Career match', topCareer ? `${careerMatch}%` : 'Pending', topCareer?.path || goal?.career_title || 'Generate Career Intelligence'],
      ['Evidence strength', `${evidenceStrength}%`, `${skills.length} tracked skills · ${verifiedSkills.length} verified`],
      ['Academic progress', academicProfile ? `${Number(academicProfile.credits_earned || 0)} cr` : subjects.length ? 'Subjects saved' : 'Not added', `${subjects.length} subjects recorded`],
      ['Active learning', activeCourses.length, `${courses.length} saved courses`],
      ['Verified credentials', verifiedCerts.length, `${certifications.length} certificates saved`]
    ].map(([label,value,detail]) => <div key={label} className="app-card p-5"><div className="mb-4 h-1.5 w-12 rounded-full bg-teal-500" /><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-2 text-3xl font-black text-slate-950">{value}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div>)}</section>

    <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]"><div className="app-card p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Career snapshot</p><h3 className="mt-1 text-xl font-bold text-slate-950">Current career outcomes</h3></div>{topCareer && <button onClick={() => onOpenCareerIntelligence?.()} className="text-sm font-bold text-teal-700">Open full Career Intelligence</button>}</div>{recommendations.length ? <div className="mt-6 space-y-5">{recommendations.slice(0,5).map((rec) => { const match = percentFromRecommendation(rec); const gaps = safeArray(rec.missing_skills).length; const strengths = safeArray(rec.matched_skills).length; const total = Math.max(1,gaps+strengths); return <div key={rec.id || rec.path}><div className="mb-2 flex flex-wrap justify-between gap-2"><div><p className="font-bold text-slate-900">{rec.path}</p><p className="text-xs text-slate-500">{rec.category}</p></div><div className="flex gap-2 text-xs font-bold"><span className="rounded-full bg-teal-50 px-2.5 py-1 text-teal-800">{match}% match</span><span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">{Math.round(gaps/total*100)}% gap</span></div></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-sky-500" style={{ width: `${match}%` }} /></div></div>; })}</div> : <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center"><p className="font-semibold text-slate-800">Your saved evidence has not been converted into career outcomes yet.</p><p className="mt-1 text-sm text-slate-500">Career Intelligence can now calculate from subjects, courses, certificates and skills even without a resume.</p><button onClick={() => onOpenCareerIntelligence?.()} disabled={!hasEvidence} className="mt-4 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">Generate Career Intelligence</button></div>}</div><div className="app-card p-6"><p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-700">Your current evidence shape</p><h3 className="mt-1 text-xl font-bold text-slate-950">Five readiness dimensions</h3><p className="mt-1 text-xs text-slate-500">The five arms are labeled so the graph is easier to interpret.</p><ReadinessRadar dimensions={radar} /></div></section>

    <section className="grid gap-6 xl:grid-cols-2"><div className="app-card p-6"><p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Next best action</p><h3 className="mt-1 text-xl font-bold text-slate-950">What should you work on next?</h3><div className="mt-5 space-y-3">{missingSkills.slice(0,5).map((skill) => <div key={skill} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="font-semibold text-slate-900">{skill}</p><p className="mt-1 text-xs text-slate-500">Priority gap for your strongest path. Check current courses before adding duplicate learning.</p></div>)}{!missingSkills.length && <div className="rounded-2xl bg-teal-50 p-5 text-sm text-teal-900">{hasEvidence ? 'Generate Career Intelligence to create career-specific gaps and next actions.' : 'Add evidence first.'}</div>}</div>{matchedSkills.length > 0 && <div className="mt-6 border-t pt-5"><p className="text-xs font-bold uppercase tracking-[0.13em] text-slate-400">Current strengths</p><div className="mt-3 flex flex-wrap gap-2">{matchedSkills.slice(0,8).map((skill) => <span key={skill} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">{skill}</span>)}</div></div>}</div>

      <div className="app-card p-6"><p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Two paths, one profile</p><h3 className="mt-1 text-xl font-bold text-slate-950">Employment and further study belong together</h3><p className="mt-2 text-sm leading-6 text-slate-600"><strong>Job Profile / Resume</strong> is for resume, work history, certificates and job-search evidence. <strong>Academic Profile & Subjects</strong> is for subjects, credits and future study planning. Both feed the same career recommendations.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><button onClick={onUpdateProfile} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left"><p className="font-bold text-slate-900">Job Profile / Resume</p><p className="mt-1 text-xs text-slate-500">Employment evidence and practical experience</p></button><button onClick={() => setShowAcademic(true)} className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-left"><p className="font-bold text-teal-950">Academic Study Pathway</p><p className="mt-1 text-xs text-teal-700">Subjects, credits, next-semester and future-study planning</p></button></div><div className="mt-4 rounded-xl bg-sky-50 p-4 text-sm text-sky-900"><strong>Ongoing courses already saved:</strong> {courses.length ? courses.map((course) => course.course_name).slice(0,5).join(', ') : 'none yet'}. These courses are used in both paths and in Career Intelligence.</div></div></section>
  </div>;
};

export default StudentCareerDashboardV2;
