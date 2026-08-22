import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

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
const currency = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value)) : null;
const integer = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-US').format(Number(value)) : null;

const meaningfulMatch = (left, right) => {
  const a = normalize(left), b = normalize(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 6) return false;
  return a.includes(b) || b.includes(a);
};

const engineeringProjectManagerGuidance = {
  advancement: [
    { title: 'Document project leadership outcomes', detail: 'Turn major engineering assignments into concise project case studies with scope, budget, schedule, team size, risk controls, stakeholder coordination, and measurable results.' },
    { title: 'Strengthen U.S.-market project-management evidence', detail: 'Translate international engineering experience into terminology commonly used in U.S. project-management job descriptions, including governance, schedule control, cost control, change management, risk registers, and stakeholder reporting.' },
    { title: 'Add a recognized project-management credential if useful', detail: 'Your core fit is already strong. A credential such as PMP can strengthen market signaling, but it should be treated as an advancement credential rather than a missing core skill.' },
    { title: 'Build current digital-delivery evidence', detail: 'Show recent use of project dashboards, scheduling/reporting tools, analytics, and executive communication so the profile demonstrates both deep engineering experience and current delivery practices.' }
  ],
  certifications: [
    { name: 'Project Management Professional (PMP)', provider: 'Project Management Institute (PMI)', note: 'Optional but high-value market credential for experienced project leaders. Your experience should be reviewed against PMI eligibility requirements.', url: 'https://www.pmi.org/certifications/project-management-pmp' },
    { name: 'PMI Agile Certified Practitioner (PMI-ACP)', provider: 'Project Management Institute (PMI)', note: 'Optional if you want to demonstrate agile or hybrid delivery capability alongside traditional engineering project management.', url: 'https://www.pmi.org/certifications/agile-acp' }
  ],
  roadmap: [
    { period: '30 days', items: [
      'Create 3 to 5 project case studies from your engineering history. For each, capture scope, budget or asset value if available, schedule responsibility, team/stakeholder role, major risks, HSE controls, and final outcome.',
      'Rewrite the resume summary and project bullets around Engineering Project Manager responsibilities rather than only the Electrical Engineer job title.',
      'Build a one-page competency evidence matrix covering project management, stakeholder collaboration, budget management, HSE, team leadership, and risk management.',
      'Review current Engineering Project Manager job postings and note recurring requirements that are not yet demonstrated in your evidence.'
    ]},
    { period: '6 months', items: [
      'Complete a recognized project-management credential or structured preparation path if it materially improves your target job market.',
      'Add recent evidence of scheduling, reporting, dashboarding, change control, and executive communication through work, volunteer, academic, or portfolio projects.',
      'Develop a U.S.-focused accomplishment resume and LinkedIn profile using quantified project outcomes and leadership evidence.',
      'Apply selectively to engineering project manager, electrical project manager, utility project manager, and power-project leadership roles that align with your domain background.'
    ]},
    { period: '1 year', items: [
      'Establish a documented portfolio of project outcomes with measurable delivery, safety, cost, schedule, and stakeholder results.',
      'Build professional references and network connections in utilities, infrastructure, consulting, construction, and engineering project delivery.',
      'Target roles with increasing responsibility for portfolio governance, capital programs, multi-project delivery, or engineering management.',
      'Reassess salary, location, credentials, and role requirements using current market data and update the career plan.'
    ]}
  ],
  resources: [
    { name: 'PMI Project Management Professional (PMP)', purpose: 'Credential requirements, exam information, and official preparation guidance.', url: 'https://www.pmi.org/certifications/project-management-pmp' },
    { name: 'PMI Standards and Publications', purpose: 'Reference material for project-management practices, terminology, and standards.', url: 'https://www.pmi.org/pmbok-guide-standards' },
    { name: 'O*NET Online', purpose: 'Review occupational tasks, knowledge, skills, and related job titles for management and engineering roles.', url: 'https://www.onetonline.org/' },
    { name: 'U.S. Bureau of Labor Statistics Occupational Employment and Wage Statistics', purpose: 'Validate wage and employment information when the app has a confirmed occupational mapping.', url: 'https://www.bls.gov/oes/' }
  ]
};

const guidanceFor = (rec) => {
  if (normalize(rec?.path || rec?.career_title) === 'engineering project manager') return engineeringProjectManagerGuidance;
  return {
    advancement: safeArray(rec?.missing_skills).length
      ? safeArray(rec.missing_skills).map((skill) => ({ title: `Build stronger evidence for ${skill}`, detail: `Add coursework, project evidence, certification evidence, or recent work demonstrating ${skill}.` }))
      : [{ title: 'Strengthen evidence quality', detail: 'You already demonstrate the mapped core competencies. Focus on recent, quantified, and independently verifiable evidence rather than inventing additional skill gaps.' }],
    certifications: safeArray(rec?.recommended_certifications),
    roadmap: [
      { period: '30 days', items: ['Document your strongest career-relevant accomplishments and update your resume evidence.', 'Review current job requirements and compare them with your evidence.'] },
      { period: '6 months', items: ['Close any evidence or credential gaps that appear repeatedly in target job postings.', 'Build recent project or portfolio evidence for the target role.'] },
      { period: '1 year', items: ['Reassess career fit, market demand, salary, and advancement options using updated evidence.'] }
    ],
    resources: safeArray(rec?.learning_resources)
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
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extracted_skills: evidence })
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

  const rankedRecommendations = useMemo(() => [...recommendations].sort((a, b) => matchPercent(b) - matchPercent(a)), [recommendations]);
  const bestCareer = rankedRecommendations[0] || null;

  useEffect(() => {
    if (!rankedRecommendations.length) return;
    let cancelled = false;
    (async () => {
      setMarketLoading(true);
      const next = {};
      await Promise.all(rankedRecommendations.slice(0, 5).map(async (career) => {
        try {
          const response = await fetch(`${apiBase()}/api/market-data?career_title=${encodeURIComponent(career.path || career.career_title || '')}`);
          const body = await response.json().catch(() => ({}));
          if (response.ok && body.status === 'success') next[career.id || career.path || career.career_title] = body.market_data;
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

  const marketFor = (rec) => marketData[rec?.id || rec?.path || rec?.career_title] || null;
  const salaryFor = (rec) => {
    const bls = marketFor(rec)?.bls;
    return bls?.available && bls.mean_annual_wage ? currency(bls.mean_annual_wage) : (rec?.median_salary || 'Not available');
  };
  const salarySource = (rec) => marketFor(rec)?.bls?.available ? 'Current BLS/OEWS mapping returned by the market service' : 'Catalog/reference estimate. Verify before making a salary decision.';

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

  const hasFormalDegree = safeArray(skills?.education || skills?.structured_evidence?.education).some((item) => /bachelor|b\.sc|bsc|master|m\.sc|phd|doctor/i.test(`${item?.program_or_degree || ''} ${item?.field_of_study || ''}`));

  if (loading) return <div className="app-card flex min-h-[420px] items-center justify-center p-8"><p className="font-semibold text-slate-600">Building Career Intelligence from your saved evidence…</p></div>;
  if (error) return <div className="app-card border-rose-200 p-8 text-center"><h3 className="text-lg font-bold text-rose-800">Career Intelligence could not be calculated</h3><p className="mt-2 text-sm text-rose-700">{error}</p><button onClick={onBack} className="mt-5 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">Go back</button></div>;

  return <div className="space-y-6">
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-950 to-teal-950 p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300">Career Intelligence</p><h2 className="mt-2 text-3xl font-black">{bestCareer ? `Best current fit: ${bestCareer.path || bestCareer.career_title}` : 'Build a stronger evidence profile'}</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Core career fit and career-development opportunities are shown separately. A strong fit does not mean there is nothing left to strengthen.</p></div><button onClick={onBack} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold">Back</button></div>
    </section>

    {bestCareer && <>
      <section className="grid gap-4 lg:grid-cols-4">
        <div className="app-card p-5 lg:col-span-2"><p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">Career snapshot</p><h3 className="mt-2 text-2xl font-black text-slate-950">{bestCareer.path}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{bestCareer.match_reason}</p></div>
        <div className="app-card p-5"><p className="text-xs font-bold uppercase text-slate-400">Match</p><p className="mt-2 text-4xl font-black text-indigo-700">{matchPercent(bestCareer)}%</p><p className="mt-1 text-xs text-slate-500">Evidence-based fit</p></div>
        <div className="app-card p-5"><p className="text-xs font-bold uppercase text-slate-400">Annual wage</p><p className="mt-2 text-2xl font-black text-slate-950">{salaryFor(bestCareer)}</p><p className="mt-1 text-xs text-slate-500">{salarySource(bestCareer)}</p></div>
      </section>

      <section className="app-card overflow-hidden"><div className="border-b p-6"><div className="flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Career comparison</p><h3 className="mt-1 text-xl font-bold">Leading paths from your current evidence</h3></div>{marketLoading && <span className="text-xs text-slate-400">Refreshing market data…</span>}</div></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-4">Career</th><th className="p-4">Match</th><th className="p-4">Matched</th><th className="p-4">Core gaps</th><th className="p-4">Wage</th></tr></thead><tbody>{rankedRecommendations.slice(0,5).map((rec)=><tr key={rec.id||rec.path} className="border-t"><td className="p-4 font-bold">{rec.path}</td><td className="p-4">{matchPercent(rec)}%</td><td className="p-4">{safeArray(rec.matched_skills).length}</td><td className="p-4">{safeArray(rec.missing_skills).length}</td><td className="p-4">{salaryFor(rec)}</td></tr>)}</tbody></table></div></section>

      <section className="space-y-4">{rankedRecommendations.map((rec,index)=>{
        const matched=safeArray(rec.matched_skills), missing=safeArray(rec.missing_skills), aligned=courseAlignment(rec), market=marketFor(rec), guidance=guidanceFor(rec);
        const open=selectedCareer?.id===rec.id||(!rec.id&&selectedCareer?.path===rec.path);
        return <article key={rec.id||rec.path} className={`app-card overflow-hidden ${index===0?'border-indigo-200':''}`}>
          <div className="p-6"><div className="flex flex-col gap-4 md:flex-row md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-bold">{rec.path}</h3>{index===0&&<span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-800">Top match</span>}</div><p className="mt-2 text-sm text-slate-600">{rec.match_reason}</p></div><span className="text-3xl font-black text-indigo-700">{matchPercent(rec)}%</span></div>
          <div className="mt-5 grid gap-5 md:grid-cols-2"><div><p className="text-sm font-bold text-emerald-800">Matching evidence</p><div className="mt-2 flex flex-wrap gap-2">{matched.map((item)=><span key={item} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"><span>{item}</span>{verificationBadge(item)&&<span className="text-emerald-600">· {verificationBadge(item)}</span>}</span>)}</div></div><div><p className="text-sm font-bold text-amber-800">Core competency gaps</p><div className="mt-2 flex flex-wrap gap-2">{missing.length?missing.map((item)=><span key={item} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{item}</span>):<span className="text-sm text-slate-500">No mapped core competency gaps. See Career advancement for the next level of development.</span>}</div></div></div>
          {aligned.length>0&&<div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4"><p className="text-sm font-bold text-sky-900">Current courses already address gaps</p>{aligned.map((course)=><p key={course.id||course.course_name} className="mt-1 text-sm text-sky-800"><strong>{course.course_name}</strong>: {course.addressed.join(', ')}</p>)}</div>}
          <button onClick={()=>{setSelectedCareer(open?null:rec);setActiveTab('overview');}} className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white">{open?'Hide details':'View details & roadmap'}</button></div>

          {open&&<div className="border-t bg-slate-50/60 p-6"><div className="flex gap-2 overflow-x-auto">{['overview','market','certifications','degrees','next-steps','resources'].map((tab)=><button key={tab} onClick={()=>setActiveTab(tab)} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold ${activeTab===tab?'bg-indigo-600 text-white':'bg-white text-slate-600'}`}>{tab==='next-steps'?'roadmap':tab}</button>)}</div>

          {activeTab==='overview'&&<div className="mt-5 space-y-4"><div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4"><h4 className="font-bold text-indigo-950">Why this career fits</h4><p className="mt-2 text-sm leading-6 text-indigo-900">{rec.match_reason} Your core-fit score remains {matchPercent(rec)}%. The items below are advancement opportunities, not invented missing competencies.</p></div><div><h4 className="font-bold">Career advancement opportunities</h4><div className="mt-3 grid gap-3 md:grid-cols-2">{guidance.advancement.map((item)=><div key={item.title} className="rounded-xl bg-white p-4"><p className="font-bold">{item.title}</p><p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p></div>)}</div></div></div>}

          {activeTab==='market'&&<div className="mt-5 grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-white p-4"><p className="text-xs font-bold uppercase text-slate-400">Annual wage</p><p className="mt-1 text-xl font-bold">{salaryFor(rec)}</p><p className="mt-2 text-xs text-slate-500">{salarySource(rec)}</p></div><div className="rounded-xl bg-white p-4"><p className="text-xs font-bold uppercase text-slate-400">National employment</p><p className="mt-1 text-xl font-bold">{market?.bls?.available?integer(market.bls.employment):'Not available'}</p></div>{market?.onet?.available&&<div className="rounded-xl bg-white p-4 md:col-span-2"><p className="font-bold">{market.onet.occupation_title}</p><p className="mt-2 text-sm leading-6 text-slate-600">{market.onet.description}</p></div>}<div className="rounded-xl border border-sky-100 bg-sky-50 p-4 md:col-span-2"><p className="text-sm text-sky-900">Market figures are shown only when the backend returns a confirmed BLS/O*NET mapping. Catalog estimates are labeled separately and should be verified before salary or relocation decisions.</p></div></div>}

          {activeTab==='certifications'&&<div className="mt-5 space-y-3"><div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">Certifications are treated as market-signaling and advancement credentials. They do not reduce your current core-fit score when the six mapped competencies are already evidenced.</div>{safeArray(guidance.certifications).length?guidance.certifications.map((item,i)=><div key={`${item.name||item}-${i}`} className="rounded-xl bg-white p-4"><p className="font-bold">{item.name||item}</p>{item.provider&&<p className="mt-1 text-sm text-slate-500">{item.provider}</p>}{item.note&&<p className="mt-2 text-sm leading-6 text-slate-600">{item.note}</p>}{item.url&&<a className="mt-3 inline-block text-sm font-semibold text-indigo-600" href={item.url} target="_blank" rel="noreferrer">Official page</a>}</div>):<p className="text-sm text-slate-500">No certification recommendation is required for this path.</p>}</div>}

          {activeTab==='degrees'&&<div className="mt-5 rounded-xl bg-white p-5"><h4 className="font-bold">Degree guidance</h4>{normalize(rec.path)==='engineering project manager'&&hasFormalDegree?<p className="mt-2 text-sm leading-6 text-slate-600">Your saved resume already contains a formal engineering degree. An additional degree is not being treated as a requirement for this career match. Further graduate study may still be useful for a specific employer, leadership track, or long-term goal, but it should be a strategic choice rather than a default recommendation.</p>:safeArray(rec.recommended_degrees).length?<div className="mt-3 space-y-3">{safeArray(rec.recommended_degrees).map((item,i)=><div key={`${item.name||item}-${i}`}><p className="font-semibold">{item.name||item}</p><p className="text-sm text-slate-500">{[item.type,item.duration,item.format].filter(Boolean).join(' · ')}</p></div>)}</div>:<p className="mt-2 text-sm text-slate-600">No additional degree is specified as necessary from the current evidence.</p>}</div>}

          {activeTab==='next-steps'&&<div className="mt-5 grid gap-4 lg:grid-cols-3">{guidance.roadmap.map((group)=><div key={group.period} className="rounded-xl bg-white p-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-indigo-600">{group.period}</p><div className="mt-3 space-y-3">{group.items.map((step,i)=><div key={`${group.period}-${i}`} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{i+1}</span><p className="text-sm leading-6 text-slate-700">{step}</p></div>)}</div></div>)}</div>}

          {activeTab==='resources'&&<div className="mt-5 space-y-3">{safeArray(guidance.resources).length?guidance.resources.map((item,i)=><div key={`${item.name||item}-${i}`} className="rounded-xl bg-white p-4"><p className="font-bold">{item.name||item}</p>{item.purpose&&<p className="mt-2 text-sm text-slate-600">{item.purpose}</p>}{item.url&&<a className="mt-3 inline-block text-sm font-semibold text-indigo-600" href={item.url} target="_blank" rel="noreferrer">Open resource</a>}</div>):<p className="text-sm text-slate-500">No learning resources are attached to this career yet.</p>}</div>}
          </div>}
        </article>;
      })}</section>
    </>}
  </div>;
};

export default CareerRecommendations;
