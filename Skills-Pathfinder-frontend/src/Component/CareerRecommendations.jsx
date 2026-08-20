import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const safeArray = (value) => Array.isArray(value) ? value : [];
const normalize = (value = '') => String(value).trim().toLowerCase().replace(/[^a-z0-9+#./ -]+/g, ' ').replace(/\s+/g, ' ');
const apiBase = () => (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const matchPercent = (rec) => {
  const direct = Number(rec?.match_percentage);
  if (Number.isFinite(direct)) return Math.max(0, Math.min(100, Math.round(direct)));
  const score = Number(rec?.match_score);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score <= 1 ? score * 100 : score)));
};
const currency = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value)) : null;
const integer = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-US').format(Number(value)) : null;

const meaningfulMatch = (left, right) => {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 6) return false;
  return a.includes(b) || b.includes(a);
};

const CareerRecommendations = ({ skills, user, onBack }) => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCareer, setSelectedCareer] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [userSkills, setUserSkills] = useState([]);
  const [userCourses, setUserCourses] = useState([]);
  const [marketData, setMarketData] = useState({});
  const [marketLoading, setMarketLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const loadSavedEvidence = async () => {
      if (!user?.id) return;
      const [skillResult, courseResult] = await Promise.all([
        supabase.from('skill_tracking').select('*').eq('user_id', user.id),
        supabase.from('ongoing_courses').select('*').eq('user_id', user.id)
      ]);
      if (!active) return;
      if (!skillResult.error) setUserSkills(skillResult.data || []);
      if (!courseResult.error) setUserCourses(courseResult.data || []);
    };
    loadSavedEvidence();
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const calculate = async () => {
      setLoading(true);
      setError(null);
      try {
        const savedRecommendations = safeArray(skills?.recommendations);
        if (savedRecommendations.length) {
          if (!cancelled) setRecommendations(savedRecommendations);
          return;
        }

        const evidence = safeArray(skills?.extracted_skills);
        if (!evidence.length) {
          if (!cancelled) setRecommendations([]);
          return;
        }

        const response = await fetch(`${apiBase()}/api/recommendations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ extracted_skills: evidence })
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.detail || `Career recommendation request failed (${response.status})`);
        const calculated = safeArray(body.recommendations);
        if (!cancelled) setRecommendations(calculated);

        if (user?.id && calculated.length) {
          if (skills?.analysis_id) {
            const { error: analysisError } = await supabase.from('resume_analyses')
              .update({ recommendations: calculated })
              .eq('id', skills.analysis_id)
              .eq('user_id', user.id);
            if (analysisError) console.error('Could not attach calculated recommendations to analysis:', analysisError);
          }

          const sourceKey = skills?.analysis_id || `unified-${Date.now()}`;
          const rows = calculated.map((rec, index) => ({
            user_id: user.id,
            client_record_key: `career-intelligence:${sourceKey}:${rec.id || index}`,
            source_analysis_id: skills?.analysis_id || null,
            career_id: rec.id || null,
            career_title: rec.path || rec.career_title || 'Career path',
            category: rec.category || null,
            match_score: rec.match_score ?? null,
            match_percentage: rec.match_percentage ?? matchPercent(rec),
            skill_gap_percentage: rec.skill_gap_percentage ?? null,
            matched_skills: rec.matched_skills || [],
            missing_skills: rec.missing_skills || [],
            recommendation_data: rec,
            market_data: {},
            updated_at: new Date().toISOString()
          }));
          const { error: persistError } = await supabase.from('career_recommendations').upsert(rows, { onConflict: 'user_id,client_record_key' });
          if (persistError) console.error('Could not persist calculated recommendations:', persistError);

          const { error: findingError } = await supabase.from('career_findings').upsert({
            user_id: user.id,
            client_record_key: `career-intelligence:${sourceKey}`,
            finding_type: 'career_intelligence_snapshot',
            source_type: skills?.evidence_only ? 'unified_saved_profile' : 'analysis',
            source_id: skills?.analysis_id || null,
            title: calculated[0]?.path ? `Career Intelligence: ${calculated[0].path}` : 'Career Intelligence',
            status: 'active',
            data: {
              recommendations: calculated,
              evidence_count: evidence.length,
              career_goal: skills?.career_goal || null,
              generated_at: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id,client_record_key' });
          if (findingError) console.error('Could not persist Career Intelligence finding:', findingError);
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Unable to calculate Career Intelligence.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    calculate();
    return () => { cancelled = true; };
  }, [skills, user?.id]);

  const rankedRecommendations = useMemo(
    () => [...recommendations].sort((a, b) => matchPercent(b) - matchPercent(a)),
    [recommendations]
  );
  const bestCareer = rankedRecommendations[0] || null;

  useEffect(() => {
    if (!rankedRecommendations.length) return;
    let cancelled = false;
    const loadMarket = async () => {
      setMarketLoading(true);
      const next = {};
      await Promise.all(rankedRecommendations.slice(0, 5).map(async (career) => {
        try {
          const response = await fetch(`${apiBase()}/api/market-data?career_title=${encodeURIComponent(career.path || career.career_title || '')}`);
          const body = await response.json().catch(() => ({}));
          if (!response.ok || body.status !== 'success') return;
          const key = career.id || career.path || career.career_title;
          next[key] = body.market_data;
          if (user?.id) {
            await supabase.from('career_findings').upsert({
              user_id: user.id,
              client_record_key: `market:${career.id || normalize(career.path || career.career_title)}`,
              finding_type: 'market_snapshot',
              source_type: 'BLS_OEWS_AND_ONET',
              title: career.path || career.career_title,
              status: body.market_data?.available ? 'current_data_available' : 'current_data_unavailable',
              data: { career_id: career.id || null, career_title: career.path || career.career_title, market_data: body.market_data },
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,client_record_key' });
          }
        } catch (err) {
          console.warn('Market enrichment unavailable:', err);
        }
      }));
      if (!cancelled) {
        setMarketData((current) => ({ ...current, ...next }));
        setMarketLoading(false);
      }
    };
    loadMarket();
    return () => { cancelled = true; };
  }, [rankedRecommendations, user?.id]);

  const marketFor = (rec) => marketData[rec?.id || rec?.path || rec?.career_title] || null;
  const salaryFor = (rec) => {
    const bls = marketFor(rec)?.bls;
    return bls?.available && bls.mean_annual_wage ? currency(bls.mean_annual_wage) : (rec?.median_salary || 'Not available');
  };

  const courseAlignment = (rec) => {
    const missing = safeArray(rec?.missing_skills);
    return userCourses.map((course) => {
      const signals = [course.course_name, course.subject_area, ...safeArray(course.extracted_skills).map((item) => item?.name || item)].filter(Boolean);
      const addressed = missing.filter((gap) => signals.some((signal) => meaningfulMatch(gap, signal)));
      return { ...course, addressed };
    }).filter((course) => course.addressed.length > 0);
  };

  const verificationBadge = (skillName) => {
    const item = userSkills.find((skill) => normalize(skill.skill_name) === normalize(skillName));
    if (!item) return '';
    if (item.verification_status === 'certificate_verified') return 'Verified';
    if (item.verification_status === 'ai_verified') return 'AI evidence';
    if (item.verification_status === 'certificate_extracted_unverified') return 'Certificate evidence';
    return 'Tracked';
  };

  if (loading) return <div className="app-card flex min-h-[420px] items-center justify-center p-8"><div className="text-center"><div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" /><p className="mt-4 font-semibold text-slate-600">Building Career Intelligence from your saved evidence…</p></div></div>;

  if (error) return <div className="app-card border-rose-200 p-8 text-center"><h3 className="text-lg font-bold text-rose-800">Career Intelligence could not be calculated</h3><p className="mt-2 text-sm text-rose-700">{error}</p><button onClick={onBack} className="mt-5 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">Go back</button></div>;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-950 to-teal-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300">Career Intelligence</p><h2 className="mt-2 text-3xl font-black">{bestCareer ? `Best current fit: ${bestCareer.path || bestCareer.career_title}` : 'Build a stronger evidence profile'}</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Uses saved skills, academic subjects, courses, certificates, and resume evidence. A resume is not required.</p>{skills?.career_goal?.career_title && <p className="mt-3 text-sm font-semibold text-sky-200">Student target: {skills.career_goal.career_title}</p>}</div>
          <button onClick={onBack} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold">Back</button>
        </div>
      </section>

      {!bestCareer ? (
        <section className="app-card p-8 text-center"><h3 className="text-xl font-bold text-slate-900">No career match yet</h3><p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">Your saved evidence was loaded correctly, but it did not match enough career requirements. Add more specific subjects, skills learned, certificate subjects, or course skills and generate again.</p></section>
      ) : <>
        <section className="grid gap-4 lg:grid-cols-4">
          <div className="app-card p-5 lg:col-span-2"><p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">Career snapshot</p><h3 className="mt-2 text-2xl font-black text-slate-950">{bestCareer.path || bestCareer.career_title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{bestCareer.match_reason || `You currently match ${safeArray(bestCareer.matched_skills).length} core skills and have ${safeArray(bestCareer.missing_skills).length} priority gaps.`}</p></div>
          <div className="app-card p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Match</p><p className="mt-2 text-4xl font-black text-indigo-700">{matchPercent(bestCareer)}%</p><p className="mt-1 text-xs text-slate-500">Evidence-based fit</p></div>
          <div className="app-card p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Annual wage</p><p className="mt-2 text-2xl font-black text-slate-950">{salaryFor(bestCareer)}</p><p className="mt-1 text-xs text-slate-500">{marketFor(bestCareer)?.bls?.available ? 'Current BLS mapping' : 'Catalog/reference data'}</p></div>
        </section>

        <section className="app-card overflow-hidden">
          <div className="border-b border-slate-200 p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Career comparison</p><h3 className="mt-1 text-xl font-bold text-slate-950">Leading paths from your current evidence</h3></div>{marketLoading && <span className="text-xs text-slate-400">Refreshing market data…</span>}</div></div>
          <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-4">Career</th><th className="p-4">Match</th><th className="p-4">Matched</th><th className="p-4">Gaps</th><th className="p-4">Wage</th></tr></thead><tbody>{rankedRecommendations.slice(0, 5).map((rec) => <tr key={rec.id || rec.path} className="border-t border-slate-100"><td className="p-4 font-bold text-slate-900">{rec.path || rec.career_title}</td><td className="p-4">{matchPercent(rec)}%</td><td className="p-4">{safeArray(rec.matched_skills).length}</td><td className="p-4">{safeArray(rec.missing_skills).length}</td><td className="p-4">{salaryFor(rec)}</td></tr>)}</tbody></table></div>
        </section>

        <section className="space-y-4">
          {rankedRecommendations.map((rec, index) => {
            const matched = safeArray(rec.matched_skills);
            const missing = safeArray(rec.missing_skills);
            const aligned = courseAlignment(rec);
            const market = marketFor(rec);
            const open = selectedCareer?.id === rec.id || (!rec.id && selectedCareer?.path === rec.path);
            return <article key={rec.id || rec.path} className={`app-card overflow-hidden ${index === 0 ? 'border-indigo-200' : ''}`}>
              <div className="p-6"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-bold text-slate-950">{rec.path || rec.career_title}</h3>{index === 0 && <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-800">Top match</span>}</div><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{rec.match_reason || 'Match calculated from your current saved evidence.'}</p></div><span className="text-3xl font-black text-indigo-700">{matchPercent(rec)}%</span></div>
                <div className="mt-5 grid gap-5 md:grid-cols-2"><div><p className="text-sm font-bold text-emerald-800">Matching evidence</p><div className="mt-2 flex flex-wrap gap-2">{matched.length ? matched.map((item) => <span key={item} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{item}{verificationBadge(item) ? ` · ${verificationBadge(item)}` : ''}</span>) : <span className="text-sm text-slate-400">No explicit matched skills returned.</span>}</div></div><div><p className="text-sm font-bold text-amber-800">Priority gaps</p><div className="mt-2 flex flex-wrap gap-2">{missing.length ? missing.map((item) => <span key={item} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{item}</span>) : <span className="text-sm text-slate-400">No major skill gaps returned.</span>}</div></div></div>
                {aligned.length > 0 && <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4"><p className="text-sm font-bold text-sky-900">Your current courses are already closing gaps</p>{aligned.map((course) => <p key={course.id || course.course_name} className="mt-1 text-sm text-sky-800"><strong>{course.course_name}</strong> addresses: {course.addressed.join(', ')}</p>)}</div>}
                <button onClick={() => { setSelectedCareer(open ? null : rec); setActiveTab('overview'); }} className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white">{open ? 'Hide details' : 'View details & roadmap'}</button>
              </div>
              {open && <div className="border-t border-slate-200 bg-slate-50/60 p-6"><div className="flex gap-2 overflow-x-auto">{['overview','market','certifications','degrees','next-steps','resources'].map((tab) => <button key={tab} onClick={() => setActiveTab(tab)} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold ${activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>{tab.replace('-', ' ')}</button>)}</div>
                {activeTab === 'overview' && <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm leading-6 text-indigo-900">Start with {missing.slice(0, 3).join(', ') || 'documenting and demonstrating your strongest existing skills'}. Add evidence as you complete subjects, courses, projects, or certificates.</div>}
                {activeTab === 'market' && <div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-white p-4"><p className="text-xs font-bold uppercase text-slate-400">Annual wage</p><p className="mt-1 text-xl font-bold">{salaryFor(rec)}</p></div><div className="rounded-xl bg-white p-4"><p className="text-xs font-bold uppercase text-slate-400">National employment</p><p className="mt-1 text-xl font-bold">{market?.bls?.available ? integer(market.bls.employment) : 'Not available'}</p></div>{market?.onet?.available && <div className="rounded-xl bg-white p-4 md:col-span-2"><p className="font-bold">{market.onet.occupation_title}</p><p className="mt-2 text-sm leading-6 text-slate-600">{market.onet.description}</p></div>}</div>}
                {activeTab === 'certifications' && <div className="mt-4 space-y-3">{safeArray(rec.recommended_certifications).length ? safeArray(rec.recommended_certifications).map((item, i) => <div key={`${item.name || item}-${i}`} className="rounded-xl bg-white p-4"><p className="font-bold">{item.name || item}</p>{item.provider && <p className="text-sm text-slate-500">{item.provider}</p>}{item.url && <a className="mt-2 inline-block text-sm font-semibold text-indigo-600" href={item.url} target="_blank" rel="noreferrer">Official page</a>}</div>) : <p className="mt-4 text-sm text-slate-500">No certification recommendation is required for this path yet.</p>}</div>}
                {activeTab === 'degrees' && <div className="mt-4 space-y-3">{safeArray(rec.recommended_degrees).length ? safeArray(rec.recommended_degrees).map((item, i) => <div key={`${item.name || item}-${i}`} className="rounded-xl bg-white p-4"><p className="font-bold">{item.name || item}</p><p className="text-sm text-slate-500">{[item.type,item.duration,item.format].filter(Boolean).join(' · ')}</p></div>) : <p className="mt-4 text-sm text-slate-500">No additional degree recommendation is specified.</p>}</div>}
                {activeTab === 'next-steps' && <div className="mt-4 space-y-2">{safeArray(rec.next_steps).length ? safeArray(rec.next_steps).map((step, i) => <div key={`${step}-${i}`} className="flex gap-3 rounded-xl bg-white p-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-600 text-xs font-bold text-white">{i + 1}</span><p className="text-sm text-slate-700">{step}</p></div>) : <p className="text-sm text-slate-500">Use the skill-gap list above as the next-step sequence.</p>}</div>}
                {activeTab === 'resources' && <div className="mt-4 space-y-3">{safeArray(rec.learning_resources).length ? safeArray(rec.learning_resources).map((item, i) => <div key={`${item.name || item}-${i}`} className="rounded-xl bg-white p-4"><p className="font-bold">{item.name || item}</p>{item.url && <a className="mt-2 inline-block text-sm font-semibold text-indigo-600" href={item.url} target="_blank" rel="noreferrer">Open resource</a>}</div>) : <p className="text-sm text-slate-500">No learning resources are attached to this career yet.</p>}</div>}
              </div>}
            </article>;
          })}
        </section>
      </>}
    </div>
  );
};

export default CareerRecommendations;
