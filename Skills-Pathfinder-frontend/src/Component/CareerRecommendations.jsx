import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const safeArray = (value) => Array.isArray(value) ? value : [];
const normalize = (value = '') => String(value).trim().toLowerCase().replace(/[^a-z0-9+#./ -]+/g, ' ').replace(/\s+/g, ' ');
const apiBase = () => (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const clamp = (value) => Math.max(0, Math.min(100, value));

const matchPercent = (rec) => {
  const direct = Number(rec?.match_percentage);
  if (Number.isFinite(direct)) return clamp(Math.round(direct));
  const score = Number(rec?.match_score);
  return Number.isFinite(score) ? clamp(Math.round(score <= 1 ? score * 100 : score)) : 0;
};

const currency = (value) => Number.isFinite(Number(value))
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value))
  : null;
const integer = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-US').format(Number(value)) : null;

const meaningfulMatch = (left, right) => {
  const a = normalize(left), b = normalize(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 6) return false;
  return a.includes(b) || b.includes(a);
};

const commonResources = [
  { name: 'O*NET Online', purpose: 'Review occupational tasks, knowledge, skills and related job titles.', url: 'https://www.onetonline.org/' },
  { name: 'U.S. Bureau of Labor Statistics Occupational Employment and Wage Statistics', purpose: 'Validate wage and employment information when the app has a confirmed occupational mapping.', url: 'https://www.bls.gov/oes/' }
];

const displayReason = (rec) => {
  const reason = String(rec?.match_reason || '').trim();
  if (!reason) return '';
  return reason.replace(
    'relevant education/training evidence but no detected professional experience in this career domain',
    'relevant academic, project, and transferable skill evidence but no detected professional experience in this career domain'
  );
};

const blueprintFor = (rec) => rec?.career_blueprint || rec?.blueprint || {};

const dynamicGuidance = (rec) => {
  const blueprint = blueprintFor(rec);
  const missing = safeArray(rec?.missing_skills);
  const actions30 = safeArray(blueprint?.actions_30_days || blueprint?.['30_day_actions']);
  const actions6 = safeArray(blueprint?.actions_6_months || blueprint?.['6_month_actions']);
  const actions1 = safeArray(blueprint?.actions_1_year || blueprint?.['1_year_actions']);
  const nextSteps = safeArray(rec?.next_steps);

  const advancement = missing.length
    ? missing.map((skill) => ({
        title: `Strengthen ${skill}`,
        detail: `Build clear, recent evidence for ${skill} through relevant work, learning, supervised practice, projects or other profession-appropriate experience.`
      }))
    : (actions30.length
        ? actions30.slice(0, 4).map((step, index) => ({ title: `Advancement priority ${index + 1}`, detail: step }))
        : [{
            title: 'Strengthen evidence quality',
            detail: 'The mapped competencies are present. Focus next on recent, quantified and independently reviewable evidence that is appropriate for this profession.'
          }]);

  const roadmap = [
    { period: '30 days', items: actions30.length ? actions30 : nextSteps.slice(0, 3) },
    { period: '6 months', items: actions6.length ? actions6 : ['Strengthen the most repeated evidence, skill or credential gaps found in target roles.'] },
    { period: '1 year', items: actions1.length ? actions1 : ['Reassess career fit, market demand, compensation and advancement options using updated evidence.'] }
  ].filter((group) => group.items.length);

  return {
    advancement,
    certifications: safeArray(rec?.recommended_certifications),
    roadmap,
    resources: commonResources,
    careerSummary: blueprint?.career_summary || ''
  };
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
    (async () => {
      if (!user?.id) return;
      const [skillResult, courseResult] = await Promise.all([
        supabase.from('skill_tracking').select('*').eq('user_id', user.id),
        supabase.from('ongoing_courses').select('*').eq('user_id', user.id)
      ]);
      if (!active) return;
      if (!skillResult.error) setUserSkills(skillResult.data || []);
      if (!courseResult.error) setUserCourses(courseResult.data || []);
    })();
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const saved = safeArray(skills?.recommendations);
        if (saved.length) {
          if (!cancelled) setRecommendations(saved);
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
        if (!cancelled) setRecommendations(safeArray(body.recommendations));
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Unable to calculate Career Intelligence.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [skills]);

  // The backend deliberately orders careers by professional relationship first
  // (current profession -> specialization -> advancement -> adjacent) and readiness
  // within those groups. Preserve that order here instead of re-sorting by percentage.
  const rankedRecommendations = useMemo(() => [...recommendations], [recommendations]);
  const bestCareer = rankedRecommendations[0] || null;

  useEffect(() => {
    if (!rankedRecommendations.length) return;
    let cancelled = false;
    (async () => {
      setMarketLoading(true);
      const next = {};
      await Promise.all(rankedRecommendations.slice(0, 5).map(async (career) => {
        if (career?.market_data?.bls?.available || career?.market_data?.onet?.available) {
          next[career.id || career.path || career.career_title] = career.market_data;
          return;
        }
        try {
          const title = career.path || career.career_title || '';
          const response = await fetch(`${apiBase()}/api/market-data?career_title=${encodeURIComponent(title)}`);
          const body = await response.json().catch(() => ({}));
          if (response.ok && body.status === 'success') next[career.id || title] = body.market_data;
        } catch (err) {
          console.warn('Market enrichment unavailable:', err);
        }
      }));
      if (!cancelled) {
        setMarketData((current) => ({ ...current, ...next }));
        setMarketLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rankedRecommendations]);

  const marketFor = (rec) => marketData[rec?.id || rec?.path || rec?.career_title] || rec?.market_data || null;
  const salaryFor = (rec) => {
    const bls = marketFor(rec)?.bls;
    return bls?.available && bls.mean_annual_wage ? currency(bls.mean_annual_wage) : (rec?.median_salary || 'Not available');
  };
  const salarySource = (rec) => marketFor(rec)?.bls?.available
    ? 'Current BLS/OEWS mapping returned by the market service'
    : 'Catalog/reference estimate. Verify before making a salary decision.';

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
    if (!item) return null;
    if (item.verification_status === 'certificate_verified') return 'Verified';
    if (item.verification_status === 'ai_verified') return 'AI evidence';
    if (item.verification_status === 'certificate_extracted_unverified') return 'Certificate evidence';
    return 'Tracked';
  };

  const resumeCredentials = useMemo(() => {
    const raw = safeArray(skills?.certifications_from_resume).length
      ? safeArray(skills?.certifications_from_resume)
      : safeArray(skills?.structured_evidence?.certifications);
    const seen = new Set();
    return raw.filter((item) => {
      const name = typeof item === 'string' ? item : item?.name;
      const key = normalize(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [skills]);

  const existingCredentialNames = useMemo(
    () => new Set(resumeCredentials.map((item) => normalize(typeof item === 'string' ? item : item?.name))),
    [resumeCredentials]
  );

  const hasFormalDegree = safeArray(skills?.education || skills?.structured_evidence?.education)
    .some((item) => /bachelor|b\.sc|bsc|master|m\.sc|phd|doctor/i.test(`${item?.program_or_degree || ''} ${item?.field_of_study || ''}`));

  if (loading) return <div className="app-card flex min-h-[420px] items-center justify-center p-8"><p className="font-semibold text-slate-600">Building Career Intelligence from your saved evidence…</p></div>;
  if (error) return <div className="app-card border-rose-200 p-8 text-center"><h3 className="text-lg font-bold text-rose-800">Career Intelligence could not be calculated</h3><p className="mt-2 text-sm text-rose-700">{error}</p><button onClick={onBack} className="mt-5 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">Go back</button></div>;

  return <div className="space-y-6">
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-950 to-teal-950 p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300">Career Intelligence</p>
          <h2 className="mt-2 text-3xl font-black">{bestCareer ? `Best current fit: ${bestCareer.path || bestCareer.career_title}` : 'Build a stronger evidence profile'}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Compare current fit, evidence, market information and practical next steps for each career path.</p>
        </div>
        <button onClick={onBack} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold">Back</button>
      </div>
    </section>

    {bestCareer && <>
      <section className="grid gap-4 lg:grid-cols-4">
        <div className="app-card p-5 lg:col-span-2"><p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">Career snapshot</p><h3 className="mt-2 text-2xl font-black text-slate-950">{bestCareer.path}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{displayReason(bestCareer)}</p></div>
        <div className="app-card p-5"><p className="text-xs font-bold uppercase text-slate-400">Match</p><p className="mt-2 text-4xl font-black text-indigo-700">{matchPercent(bestCareer)}%</p><p className="mt-1 text-xs text-slate-500">Evidence-based fit</p></div>
        <div className="app-card p-5"><p className="text-xs font-bold uppercase text-slate-400">Annual wage</p><p className="mt-2 text-2xl font-black text-slate-950">{salaryFor(bestCareer)}</p><p className="mt-1 text-xs text-slate-500">{salarySource(bestCareer)}</p></div>
      </section>

      <section className="app-card overflow-hidden">
        <div className="border-b p-6"><div className="flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Career comparison</p><h3 className="mt-1 text-xl font-bold">Leading paths from your current evidence</h3></div>{marketLoading && <span className="text-xs text-slate-400">Refreshing market data…</span>}</div></div>
        <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-4">Career</th><th className="p-4">Match</th><th className="p-4">Matched</th><th className="p-4">Core gaps</th><th className="p-4">Wage</th></tr></thead><tbody>{rankedRecommendations.slice(0,5).map((rec)=><tr key={rec.id||rec.path} className="border-t"><td className="p-4 font-bold">{rec.path}</td><td className="p-4">{matchPercent(rec)}%</td><td className="p-4">{safeArray(rec.matched_skills).length}</td><td className="p-4">{safeArray(rec.missing_skills).length}</td><td className="p-4">{salaryFor(rec)}</td></tr>)}</tbody></table></div>
      </section>

      <section className="space-y-4">{rankedRecommendations.map((rec,index)=>{
        const matched = safeArray(rec.matched_skills);
        const missing = safeArray(rec.missing_skills);
        const aligned = courseAlignment(rec);
        const market = marketFor(rec);
        const guidance = dynamicGuidance(rec);
        const open = selectedCareer?.id===rec.id || (!rec.id && selectedCareer?.path===rec.path);
        const strongCore = missing.length === 0;
        const recommendedCredentials = safeArray(guidance.certifications).filter((item) => {
          const name = typeof item === 'string' ? item : item?.name;
          return !existingCredentialNames.has(normalize(name));
        });

        return <article key={rec.id||rec.path} className={`app-card overflow-hidden ${index===0?'border-indigo-200':''}`}>
          <div className="p-6">
            <div className="flex flex-col gap-4 md:flex-row md:justify-between"><div><div className="flex flex-wrap items-center gap-2">{index===0&&<span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">Top match</span>}<h3 className="text-xl font-black">{rec.path}</h3></div><p className="mt-2 text-sm text-slate-600">{displayReason(rec)}</p></div><p className="text-3xl font-black text-indigo-700">{matchPercent(rec)}%</p></div>
            <div className="mt-5 grid gap-4 md:grid-cols-2"><div><p className="text-xs font-bold uppercase text-slate-400">Matching evidence</p><div className="mt-2 flex flex-wrap gap-2">{matched.length?matched.map((skill)=><span key={skill} className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">{skill}{verificationBadge(skill)&&<small className="ml-1 text-[10px] text-emerald-500">· {verificationBadge(skill)}</small>}</span>):<span className="text-sm text-slate-500">No mapped core competency is currently evidenced.</span>}</div></div><div><p className="text-xs font-bold uppercase text-slate-400">Core competency gaps</p><div className="mt-2 flex flex-wrap gap-2">{missing.length?missing.map((skill)=><span key={skill} className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">{skill}</span>):<span className="text-sm text-emerald-700">No mapped core competency gaps. The next focus is stronger evidence, experience and market readiness.</span>}</div></div></div>
            <button onClick={()=>{setSelectedCareer(open?null:rec);setActiveTab('overview');}} className="mt-5 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">{open?'Hide details':'View details & roadmap'}</button>
          </div>
          {open&&<div className="border-t bg-slate-50/60 p-6"><div className="flex gap-2 overflow-x-auto pb-2">{['overview','market','certifications','degrees','roadmap','resources'].map((tab)=><button key={tab} onClick={()=>setActiveTab(tab)} className={`rounded-full px-4 py-2 text-sm font-bold capitalize ${activeTab===tab?'bg-indigo-700 text-white':'bg-white text-slate-600'}`}>{tab}</button>)}</div>
            <div className="mt-5">
              {activeTab==='overview'&&<div><h4 className="font-bold">Why this career fits</h4><p className="mt-2 text-sm leading-6 text-slate-600">{displayReason(rec)} Your current evidence-based fit is {matchPercent(rec)}%.</p>{guidance.careerSummary&&<p className="mt-2 text-sm leading-6 text-slate-600">{guidance.careerSummary}</p>}<h4 className="mt-5 font-bold">{missing.length?'Priority development areas':'Career advancement opportunities'}</h4><div className="mt-3 grid gap-3 md:grid-cols-2">{guidance.advancement.map((item,i)=><div key={i} className="rounded-xl border bg-white p-4"><b className="text-sm">{item.title}</b><p className="mt-1 text-sm text-slate-600">{item.detail}</p></div>)}</div></div>}
              {activeTab==='market'&&<div className="grid gap-4 md:grid-cols-2"><div className="rounded-xl border bg-white p-4"><p className="text-xs font-bold uppercase text-slate-400">Annual wage</p><p className="mt-2 text-2xl font-black">{salaryFor(rec)}</p><p className="mt-1 text-xs text-slate-500">{salarySource(rec)}</p></div><div className="rounded-xl border bg-white p-4"><p className="text-xs font-bold uppercase text-slate-400">National employment</p><p className="mt-2 text-2xl font-black">{market?.bls?.available?integer(market.bls.employment):'Not available'}</p></div>{market?.onet?.available&&<div className="md:col-span-2 rounded-xl border bg-white p-4"><h4 className="font-bold">{market.onet.occupation_title}</h4><p className="mt-2 text-sm leading-6 text-slate-600">{market.onet.description}</p></div>}<p className="md:col-span-2 text-xs leading-5 text-slate-500">Market figures are shown only when the backend returns a confirmed BLS/O*NET mapping. Specialty careers may use a broader official SOC occupation for wage and employment statistics.</p></div>}
              {activeTab==='certifications'&&<div className="space-y-5">{resumeCredentials.length>0&&<div><h4 className="font-bold">Credentials already evidenced</h4><p className="mt-1 text-xs text-slate-500">These credentials were found in the saved resume. Resume evidence is not the same as independent credential verification.</p><div className="mt-3 grid gap-3 md:grid-cols-2">{resumeCredentials.map((item,i)=>{const name=typeof item==='string'?item:item?.name;const provider=typeof item==='string'?'':item?.provider;return <div key={`${name}-${i}`} className="rounded-xl border bg-white p-4"><b>{name}</b>{provider&&<p className="mt-1 text-sm text-slate-500">{provider}</p>}<span className="mt-2 inline-block rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase text-amber-700">Resume evidence</span></div>;})}</div></div>}<div><h4 className="font-bold">Recommended credentials</h4><p className="mt-1 text-xs text-slate-500">Only additional credentials suggested for this career are shown here. Existing resume credentials are not repeated as recommendations.</p>{recommendedCredentials.length?<div className="mt-3 grid gap-3 md:grid-cols-2">{recommendedCredentials.map((cert,i)=><div key={i} className="rounded-xl border bg-white p-4"><b>{typeof cert==='string'?cert:cert.name}</b>{typeof cert==='object'&&cert.provider&&<p className="mt-1 text-sm text-slate-500">{cert.provider}</p>}</div>)}</div>:<p className="mt-3 text-sm text-slate-500">No additional credential is currently suggested by this evidence model.</p>}</div></div>}
              {activeTab==='degrees'&&<div className="rounded-xl border bg-white p-5">{hasFormalDegree?<><h4 className="font-bold">Degree guidance</h4><p className="mt-2 text-sm leading-6 text-slate-600">Your saved resume already contains a formal degree. An additional degree is not being treated as a requirement for this career match. Further study may still be useful for a specific employer, specialization or long-term goal, but it should be a strategic choice rather than a default recommendation.</p></>:<><h4 className="font-bold">Education / training pathways</h4><div className="mt-3 space-y-2">{safeArray(rec.recommended_degrees).length?safeArray(rec.recommended_degrees).map((degree,i)=><div key={i} className="rounded-xl bg-slate-50 p-3 text-sm"><b>{degree.name||degree}</b></div>):<p className="text-sm text-slate-500">No degree requirement is being asserted from the current evidence model.</p>}</div></>}</div>}
              {activeTab==='roadmap'&&<div className="grid gap-4 md:grid-cols-3">{guidance.roadmap.map((group)=><div key={group.period} className="rounded-xl border bg-white p-4"><h4 className="font-bold text-indigo-700">{group.period}</h4><ol className="mt-3 space-y-3">{group.items.map((item,i)=><li key={i} className="flex gap-2 text-sm text-slate-600"><span className="font-bold text-indigo-700">{i+1}</span><span>{typeof item==='string'?item:item?.name||item?.title||JSON.stringify(item)}</span></li>)}</ol></div>)}</div>}
              {activeTab==='resources'&&<div className="grid gap-4 md:grid-cols-2">{guidance.resources.map((resource)=><div key={resource.name} className="rounded-xl border bg-white p-4"><b>{resource.name}</b><p className="mt-1 text-sm text-slate-600">{resource.purpose}</p><a href={resource.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-bold text-indigo-700">Open resource</a></div>)}</div>}
            </div>
          </div>}
        </article>;
      })}</section>
    </>}
  </div>;
};

export default CareerRecommendations;
