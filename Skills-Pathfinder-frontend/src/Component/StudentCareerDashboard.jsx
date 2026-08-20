import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

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
  if (Number.isFinite(score)) return clamp(Math.round(score <= 1 ? score * 100 : score));
  return 0;
};

const StudentCareerDashboard = ({ user, onAnalyzeResume, onOpenCareerIntelligence, onUpdateProfile }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState(null);
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

        const results = [profileResult, analysesResult, skillsResult, certsResult, coursesResult];
        const firstFailure = results.find((result) => result.error);
        if (firstFailure?.error) throw firstFailure.error;
        if (!active) return;

        setProfile(profileResult.data || null);
        setAnalyses(analysesResult.data || []);
        setSkills(skillsResult.data || []);
        setCertifications(certsResult.data || []);
        setCourses(coursesResult.data || []);
      } catch (loadError) {
        console.error('Career dashboard could not load:', loadError);
        if (active) setError(loadError.message || 'Career dashboard could not load your saved data.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadDashboard();
    return () => { active = false; };
  }, [user?.id]);

  const latestAnalysis = analyses[0] || null;
  const recommendations = Array.isArray(latestAnalysis?.recommendations) ? latestAnalysis.recommendations : [];
  const topCareer = recommendations[0] || null;
  const careerMatch = percentFromRecommendation(topCareer);

  const verifiedSkills = skills.filter((skill) => skill.verification_status === 'certificate_verified');
  const evidencedSkills = skills.filter((skill) => ['certificate_verified', 'ai_verified', 'certificate_extracted_unverified'].includes(skill.verification_status));
  const activeCourses = courses.filter((course) => ['in_progress', 'active'].includes(normalize(course.status)));
  const verifiedCertificates = certifications.filter((cert) => cert.is_verified || cert.verification_status === 'electronically_verified');

  const evidenceStrength = skills.length
    ? Math.round((verifiedSkills.length + (evidencedSkills.length - verifiedSkills.length) * 0.65) / skills.length * 100)
    : 0;

  const learningProgress = activeCourses.length
    ? clamp(45 + Math.min(activeCourses.length, 4) * 10)
    : courses.some((course) => normalize(course.status) === 'completed') ? 65 : 20;

  const readinessEstimate = topCareer
    ? clamp(Math.round(careerMatch * 0.65 + evidenceStrength * 0.2 + learningProgress * 0.15))
    : 0;

  const missingSkills = Array.isArray(topCareer?.missing_skills) ? topCareer.missing_skills : [];
  const matchedSkills = Array.isArray(topCareer?.matched_skills) ? topCareer.matched_skills : [];

  const courseAlignment = useMemo(() => {
    if (!missingSkills.length || !activeCourses.length) return [];
    return missingSkills.filter((gap) => {
      const gapName = normalize(gap);
      return activeCourses.some((course) => {
        const courseText = `${course.course_name || ''} ${course.provider || ''} ${(course.extracted_skills || []).map?.((skill) => skill?.name || skill)?.join?.(' ') || ''}`.toLowerCase();
        const gapWords = gapName.split(/\s+/).filter((word) => word.length > 3);
        return courseText.includes(gapName) || gapWords.some((word) => courseText.includes(word));
      });
    }).slice(0, 4);
  }, [activeCourses, missingSkills]);

  const profileFields = ['full_name', 'phone', 'address', 'city', 'state', 'zip_code'];
  const completedProfileFields = profileFields.filter((field) => String(profile?.[field] || '').trim()).length;
  const profileCompletion = Math.round(completedProfileFields / profileFields.length * 100);

  const trend = analyses.slice(0, 4).map((analysis) => {
    const recs = Array.isArray(analysis.recommendations) ? analysis.recommendations : [];
    return {
      id: analysis.id,
      date: analysis.uploaded_at,
      filename: analysis.filename,
      match: percentFromRecommendation(recs[0]),
      career: recs[0]?.path || 'Career analysis'
    };
  });

  if (loading) {
    return (
      <div className="app-card flex min-h-[420px] items-center justify-center p-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-teal-100 border-t-teal-600" />
          <p className="mt-4 text-sm font-medium text-slate-500">Building your career dashboard…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-card border-rose-200 p-6">
        <p className="text-sm font-semibold text-rose-800">Dashboard data could not be loaded.</p>
        <p className="mt-1 text-sm text-rose-700">{error}</p>
        <button onClick={onAnalyzeResume} className="app-button-secondary mt-4">Continue to Resume Analysis</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-[0_24px_70px_-42px_rgba(15,23,42,0.8)]">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-teal-400/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-teal-300">Career command center</span>
              {latestAnalysis && <span className="rounded-full bg-white/8 px-3 py-1 text-xs text-slate-300">Latest evidence: {latestAnalysis.filename}</span>}
            </div>
            <h2 className="mt-5 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">
              {topCareer ? `Your strongest current path: ${topCareer.path}` : 'Build your career profile from evidence, not guesswork.'}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              {topCareer
                ? `Your latest analysis matches ${careerMatch}% of the modeled requirements. The readiness estimate also considers evidence strength and active learning.`
                : 'Analyze a resume to establish your first career match. Certificates, tracked skills, and ongoing courses will strengthen the picture over time.'}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={onOpenCareerIntelligence} disabled={!latestAnalysis} className="inline-flex items-center justify-center rounded-xl bg-teal-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-40">
                Open Career Intelligence
              </button>
              <button onClick={onAnalyzeResume} className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/8 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15">
                Analyze New Resume
              </button>
              <button onClick={onUpdateProfile} className="inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/8 hover:text-white">
                Update Profile
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Readiness estimate</p>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-6xl font-black tracking-tight text-white">{readinessEstimate}</span>
              <span className="pb-2 text-xl font-semibold text-slate-400">%</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-teal-400" style={{ width: `${readinessEstimate}%` }} /></div>
            <p className="mt-3 text-xs leading-5 text-slate-400">65% career match, 20% evidence strength, 15% learning activity. This is guidance, not a hiring probability.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Career match', topCareer ? `${careerMatch}%` : 'Not analyzed', topCareer?.path || 'Upload a resume to begin', 'teal'],
          ['Evidence strength', `${evidenceStrength}%`, `${verifiedSkills.length} certificate-verified · ${evidencedSkills.length} evidenced skills`, 'sky'],
          ['Active learning', activeCourses.length, activeCourses.length ? `${activeCourses.length} course${activeCourses.length === 1 ? '' : 's'} in progress` : 'Add an ongoing course', 'amber'],
          ['Verified credentials', verifiedCertificates.length, `${certifications.length} total certificate record${certifications.length === 1 ? '' : 's'}`, 'emerald']
        ].map(([label, value, detail, tone]) => (
          <div key={label} className="app-card p-5">
            <div className={`mb-4 h-1.5 w-12 rounded-full ${tone === 'teal' ? 'bg-teal-500' : tone === 'sky' ? 'bg-sky-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-slate-400">{label}</p>
            <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="app-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Priority career gap</p>
              <h3 className="mt-1 text-xl font-bold text-slate-950">What to work on next</h3>
            </div>
            {topCareer && <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">{missingSkills.length} gap{missingSkills.length === 1 ? '' : 's'}</span>}
          </div>

          {!topCareer ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <p className="font-semibold text-slate-800">No career gap yet.</p>
              <p className="mt-1 text-sm text-slate-500">Analyze a resume and Skills Pathfinder will compare your evidence against recommended paths.</p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {missingSkills.slice(0, 5).map((skill) => {
                const inProgress = courseAlignment.some((aligned) => normalize(aligned) === normalize(skill));
                return (
                  <div key={skill} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <div>
                      <p className="font-semibold text-slate-800">{skill}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{inProgress ? 'Already being addressed by an ongoing course.' : 'Recommended development priority.'}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${inProgress ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>{inProgress ? 'In progress' : 'Gap'}</span>
                  </div>
                );
              })}
              {missingSkills.length === 0 && <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-medium text-emerald-800">All modeled core skills for this path are currently represented in your evidence.</div>}
            </div>
          )}

          {matchedSkills.length > 0 && (
            <div className="mt-6 border-t border-slate-200 pt-5">
              <p className="text-xs font-bold uppercase tracking-[0.13em] text-slate-400">Current strengths</p>
              <div className="mt-3 flex flex-wrap gap-2">{matchedSkills.slice(0, 8).map((skill) => <span key={skill} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">{skill}</span>)}</div>
            </div>
          )}
        </div>

        <div className="app-card p-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-700">Profile health</p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">Evidence and profile coverage</h3>
          <div className="mt-5 space-y-4">
            {[
              ['Profile completion', profileCompletion],
              ['Career evidence', evidenceStrength],
              ['Latest career match', careerMatch]
            ].map(([label, value]) => (
              <div key={label}>
                <div className="mb-1.5 flex justify-between text-sm"><span className="font-medium text-slate-600">{label}</span><span className="font-bold text-slate-900">{value}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-500" style={{ width: `${value}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-2xl font-black text-slate-950">{skills.length}</p><p className="text-xs text-slate-500">Tracked skills</p></div>
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-2xl font-black text-slate-950">{analyses.length}</p><p className="text-xs text-slate-500">Recent analyses</p></div>
          </div>
        </div>
      </section>

      <section className="app-card p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Progress history</p>
            <h3 className="mt-1 text-xl font-bold text-slate-950">Recent career signals</h3>
          </div>
          <p className="text-xs text-slate-500">Use repeated analyses when your resume or experience materially changes.</p>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {trend.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-slate-500">{item.date ? new Date(item.date).toLocaleDateString() : 'Saved analysis'}</span><span className="text-lg font-black text-teal-700">{item.match}%</span></div>
              <p className="mt-3 font-semibold text-slate-900">{item.career}</p>
              <p className="mt-1 truncate text-xs text-slate-500" title={item.filename}>{item.filename}</p>
            </div>
          ))}
          {trend.length === 0 && <div className="md:col-span-2 xl:col-span-4 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Your analysis history will appear here after the first resume is processed.</div>}
        </div>
      </section>
    </div>
  );
};

export default StudentCareerDashboard;
