import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import AcademicPathwaysV2 from './AcademicPathwaysV2';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const safe = (value) => Array.isArray(value) ? value : [];
const normalize = (value) => String(value || '').trim().toLowerCase();
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const degreePattern = /\b(ph\.?d|doctor|master|m\.?s\.?|m\.?sc|mba|bachelor|b\.?s\.?|b\.?sc|associate|a\.?s\.?)\b/i;

const recommendationPercent = (recommendation) => {
  const direct = Number(recommendation?.match_percentage);
  if (Number.isFinite(direct)) return clamp(Math.round(direct));
  const score = Number(recommendation?.match_score);
  if (!Number.isFinite(score)) return 0;
  return clamp(Math.round(score <= 1 ? score * 100 : score));
};

const StudentCareerDashboardV2 = ({ user, onAnalyzeResume, onOpenCareerIntelligence, onUpdateProfile }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAcademic, setShowAcademic] = useState(false);
  const [data, setData] = useState({
    profile: null,
    academic: null,
    subjects: [],
    goal: null,
    analyses: [],
    careerRows: [],
    skills: [],
    certs: [],
    courses: [],
    history: []
  });

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
          supabase.from('academic_subjects').select('*').eq('user_id', user.id),
          supabase.from('career_goals').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('resume_analyses').select('*').eq('user_id', user.id).order('uploaded_at', { ascending: false }).limit(10),
          supabase.from('career_recommendations').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
          supabase.from('skill_tracking').select('*').eq('user_id', user.id),
          supabase.from('saved_certifications').select('*').eq('user_id', user.id),
          supabase.from('ongoing_courses').select('*').eq('user_id', user.id),
          supabase.from('education_history').select('*').eq('user_id', user.id)
        ]);
        const failed = results.find((item) => item.error);
        if (failed?.error) throw failed.error;
        if (!active) return;
        setData({
          profile: results[0].data || null,
          academic: results[1].data || null,
          subjects: results[2].data || [],
          goal: results[3].data || null,
          analyses: results[4].data || [],
          careerRows: results[5].data || [],
          skills: results[6].data || [],
          certs: results[7].data || [],
          courses: results[8].data || [],
          history: results[9].data || []
        });
      } catch (loadError) {
        if (active) setError(loadError.message || 'Dashboard could not load saved evidence.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [user?.id, showAcademic]);

  if (showAcademic) {
    return <AcademicPathwaysV2 user={user} onOpenCareerIntelligence={onOpenCareerIntelligence} onBack={() => setShowAcademic(false)} />;
  }
  if (loading) return <div className="app-card p-8 text-center text-slate-500">Building your career dashboard…</div>;
  if (error) return <div className="app-card border-rose-200 p-6 text-rose-800">{error}</div>;

  const latestAnalysis = data.analyses.find((row) => safe(row.recommendations).length || safe(row.extracted_skills).length) || data.analyses[0] || null;
  const resumePayload = latestAnalysis?.raw_analysis || latestAnalysis || {};
  const resumeEducation = safe(resumePayload.education);
  const resumeCourses = safe(resumePayload.courses_from_resume || resumePayload.structured_evidence?.courses);
  const resumeFormal = resumeEducation.filter((item) => degreePattern.test(`${item?.program_or_degree || ''} ${item?.field_of_study || ''}`));
  const resumeTraining = [...resumeEducation.filter((item) => !resumeFormal.includes(item)), ...resumeCourses];

  const formalEducationCount = Math.max(data.history.length, resumeFormal.length);
  const completedTrainingCount = resumeTraining.length;
  const academicEvidenceCount = formalEducationCount + completedTrainingCount;

  const analysisRecommendations = safe(latestAnalysis?.recommendations);
  const savedRecommendations = [];
  const seenCareers = new Set();
  data.careerRows.forEach((row) => {
    const title = row.career_title || row.recommendation_data?.path;
    const key = normalize(title || row.career_id || row.id);
    if (!key || seenCareers.has(key)) return;
    seenCareers.add(key);
    savedRecommendations.push({
      ...(row.recommendation_data || {}),
      id: row.career_id || row.id,
      path: title,
      match_score: row.match_score ?? row.recommendation_data?.match_score,
      match_percentage: row.match_percentage ?? row.recommendation_data?.match_percentage,
      matched_skills: safe(row.matched_skills).length ? row.matched_skills : safe(row.recommendation_data?.matched_skills),
      missing_skills: safe(row.missing_skills).length ? row.missing_skills : safe(row.recommendation_data?.missing_skills),
      match_reason: row.recommendation_data?.match_reason
    });
  });

  const recommendations = analysisRecommendations.length ? analysisRecommendations : savedRecommendations;
  const topCareer = [...recommendations].sort((a, b) => recommendationPercent(b) - recommendationPercent(a))[0] || null;
  const careerFit = recommendationPercent(topCareer);

  const skills = safe(data.skills);
  const verifiedSkills = skills.filter((skill) => skill.verification_status === 'certificate_verified');
  const evidencedSkills = skills.filter((skill) => ['certificate_verified', 'ai_verified', 'certificate_extracted_unverified'].includes(skill.verification_status));
  const evidenceStrength = skills.length
    ? Math.round((verifiedSkills.length + Math.max(0, evidencedSkills.length - verifiedSkills.length) * 0.65) / skills.length * 100)
    : 0;

  const activeCourses = safe(data.courses).filter((course) => ['in_progress', 'active'].includes(normalize(course.status)));
  const completedCourses = safe(data.courses).filter((course) => normalize(course.status) === 'completed').length;
  const learningProgress = activeCourses.length
    ? clamp(45 + Math.min(activeCourses.length, 4) * 10)
    : completedCourses + completedTrainingCount > 0
      ? clamp(55 + Math.min(completedCourses + completedTrainingCount, 3) * 10)
      : safe(data.subjects).length ? 45 : 0;

  const manualAcademicBase = data.academic ? 35 : 0;
  const formalEducationCredit = formalEducationCount ? 45 : 0;
  const creditsEarned = Number(data.academic?.credits_earned || 0);
  const academicCoverage = clamp(Math.round(
    Math.max(manualAcademicBase, formalEducationCredit) +
    Math.min(creditsEarned, 120) / 120 * 30 +
    Math.min(safe(data.subjects).length, 10) * 3 +
    Math.min(completedTrainingCount, 3) * 10
  ));

  const profileFields = ['full_name', 'phone', 'city', 'state'];
  const profileCompletion = Math.round(profileFields.filter((field) => String(data.profile?.[field] || '').trim()).length / profileFields.length * 100);
  const hasEvidence = Boolean(data.academic || academicEvidenceCount || data.subjects.length || skills.length || data.certs.length || data.courses.length || data.analyses.length);
  const readiness = !hasEvidence && !topCareer
    ? 0
    : topCareer
      ? clamp(Math.round(careerFit * 0.55 + evidenceStrength * 0.20 + learningProgress * 0.15 + academicCoverage * 0.10))
      : clamp(Math.round(academicCoverage * 0.45 + evidenceStrength * 0.30 + learningProgress * 0.15));

  const dimensions = [
    ['Career Fit', careerFit, 'Generate or refine Career Intelligence for your target role.'],
    ['Evidence', evidenceStrength, 'Add verified certificates, stronger resume evidence, or documented skill sources.'],
    ['Learning', learningProgress, 'Add or complete learning tied to a priority skill gap.'],
    ['Academic', academicCoverage, academicEvidenceCount ? 'Resume education and completed training are included.' : 'Add formal education, subjects, credits, or academic progress.'],
    ['Profile', profileCompletion, 'Complete the missing profile fields so reports and job guidance are stronger.']
  ];
  const priority = [...dimensions].filter((item) => item[0] !== 'Profile' || hasEvidence).sort((a, b) => a[1] - b[1])[0];

  return <div className="space-y-6">
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-6 text-white shadow-xl sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-center">
        <div>
          <span className="rounded-full bg-teal-400/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-teal-300">Career command center</span>
          <h2 className="mt-5 text-3xl font-black sm:text-4xl">{topCareer ? `Strongest current path: ${topCareer.path}` : 'Build your career profile from any evidence you have.'}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">All saved evidence, including education and training extracted from your resume, feeds one Career Intelligence profile.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => setShowAcademic(true)} className="rounded-xl bg-teal-400 px-5 py-3 text-sm font-bold text-slate-950">Academic Profile & Subjects</button>
            <button onClick={onAnalyzeResume} className="rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-bold text-white">Resume & Work Experience</button>
            <button onClick={() => onOpenCareerIntelligence?.()} className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-white">Career Intelligence</button>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Readiness estimate</p>
          <div className="mt-3 flex items-end gap-2"><span className="text-6xl font-black">{readiness}</span><span className="pb-2 text-xl text-slate-400">%</span></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-teal-400" style={{ width: `${readiness}%` }} /></div>
          <p className="mt-3 text-xs text-slate-400">Resume-derived academic evidence is included. Empty categories contribute 0%.</p>
          <p className="mt-4 rounded-xl bg-white/[0.07] p-3 text-xs text-slate-300"><strong className="text-white">Best way to improve:</strong> {priority?.[2]}</p>
        </div>
      </div>
    </section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {dimensions.map(([label, value, action]) => <div key={label} className="app-card p-5"><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-2 text-3xl font-black">{value}%</p><p className="mt-1 text-xs text-slate-500">{action}</p></div>)}
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
      <div className="app-card p-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Career snapshot</p>
        <h3 className="mt-1 text-xl font-bold">Current career outcomes</h3>
        <div className="mt-5 space-y-3">
          {recommendations.length ? recommendations.slice(0, 5).map((rec) => <div key={rec.id || rec.path} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><strong>{rec.path}</strong><span className="text-sm font-bold text-teal-700">{recommendationPercent(rec)}%</span></div><p className="mt-2 text-xs text-slate-500">{rec.match_reason || `${safe(rec.matched_skills).length} matched strengths · ${safe(rec.missing_skills).length} identified gaps`}</p></div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No career outcomes yet.</p>}
        </div>
      </div>
      <div className="app-card p-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-700">Academic evidence recognized</p>
        <h3 className="mt-1 text-xl font-bold">Resume + saved profile</h3>
        <div className="mt-5 space-y-3 text-sm">
          <div className="rounded-xl bg-slate-50 p-4"><strong>Formal education:</strong> {formalEducationCount}</div>
          <div className="rounded-xl bg-slate-50 p-4"><strong>Completed training:</strong> {completedTrainingCount}</div>
          <div className="rounded-xl bg-slate-50 p-4"><strong>Academic readiness:</strong> {academicCoverage}%</div>
        </div>
      </div>
    </section>
  </div>;
};

export default StudentCareerDashboardV2;
