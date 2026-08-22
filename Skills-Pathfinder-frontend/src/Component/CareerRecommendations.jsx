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
const currency = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value)) : null;
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

const careerGuidance = {
  'industrial engineer': {
    advancement: [
      { title: 'Build a measurable process-improvement case study', detail: 'Use an internship, academic project or portfolio project to show the current process, baseline metrics, analysis, proposed changes and measurable improvement in time, cost, quality, capacity or accuracy.' },
      { title: 'Strengthen process-mapping and root-cause evidence', detail: 'Document how you map a workflow, identify bottlenecks or waste, investigate root causes and recommend a redesigned process. Connect the work to the process and data evidence already present in your resume.' },
      { title: 'Turn analytics into operational decisions', detail: 'Use Excel, Power BI, Tableau or another analysis tool to build an operations-focused example such as cycle-time, capacity, quality, inventory, staffing or productivity analysis, then explain the decision supported by the data.' },
      { title: 'Add exposure to industrial-engineering methods used by target employers', detail: 'Compare target postings for recurring requirements such as Lean, Six Sigma, DMAIC, statistical process control, quality systems, simulation, optimization, ERP/MRP, supply chain or production planning. Strengthen only the areas that repeatedly appear in the roles you want.' }
    ],
    certifications: [
      { name: 'Lean Six Sigma Green Belt', provider: 'IISE or another recognized training provider', note: 'Optional, not a missing core competency. Consider it when target Industrial Engineer or process-improvement roles repeatedly request Lean/Six Sigma or when you can pair the credential with a real improvement project.', url: 'https://www.iise.org/TrainingCenter/' }
    ],
    roadmap: [
      { period: '30 days', items: [
        'Turn the strongest business-process or internship accomplishment into a one-page Industrial Engineering case study with baseline, method, analysis, recommendation and measurable result.',
        'Create one process map or workflow analysis that identifies bottlenecks, waste, handoffs, controls and improvement opportunities.',
        'Review 15 to 20 entry-level Industrial Engineer, Process Engineer and Operations Improvement postings and record recurring requirements such as Lean/Six Sigma, quality, simulation, optimization, ERP/MRP or supply-chain knowledge.',
        'Rewrite resume bullets so Excel, project planning and process work show measurable operational outcomes rather than tools alone.'
      ] },
      { period: '6 months', items: [
        'Complete one end-to-end improvement project using a structured method such as DMAIC or another evidence-based process-improvement approach and document before/after results.',
        'Build an operations analytics project using Excel, Power BI, Tableau, Python or another appropriate tool to analyze capacity, cycle time, quality, inventory, staffing or productivity.',
        'Strengthen the one or two technical areas that recur most often in target postings, such as statistical process control, simulation, optimization, Lean/Six Sigma, quality systems or ERP/MRP.',
        'Seek internship, co-op, campus, volunteer or consulting work where you can measure and improve a real process.'
      ] },
      { period: '1 year', items: [
        'Maintain a portfolio of two to four Industrial Engineering case studies with process maps, analysis, decisions and quantified outcomes.',
        'Target Industrial Engineer, Process Engineer, Continuous Improvement, Operations Analyst and related roles that match your strongest evidence.',
        'Build references from internship supervisors, project leads, faculty or clients who can validate your analytical and process-improvement work.',
        'Reassess target roles, recurring skill requirements, compensation and credential value using current job postings and verified market data.'
      ] }
    ],
    resources: [
      { name: 'Institute of Industrial and Systems Engineers (IISE)', purpose: 'Industrial and systems engineering professional development, technical communities, career resources and training.', url: 'https://www.iise.org/' },
      { name: 'IISE Training Center', purpose: 'Training in Lean, Six Sigma and other industrial-engineering methods. Use it to evaluate optional learning that matches recurring requirements in target jobs.', url: 'https://www.iise.org/TrainingCenter/' },
      ...commonResources
    ]
  },
  'manufacturing engineer': {
    advancement: [
      { title: 'Build recent manufacturing evidence', detail: 'Turn academic and project work into concise case studies that show fabrication, manufacturability, process decisions, quality checks and measurable outcomes.' },
      { title: 'Strengthen design-for-manufacturing evidence', detail: 'Show how CAD decisions affect producibility, assembly, material choice, tolerances, cost and repeatability.' },
      { title: 'Add process-improvement exposure', detail: 'Use an internship, co-op, lab, capstone or portfolio project to demonstrate workflow analysis, root-cause thinking and continuous improvement.' },
      { title: 'Document shop-floor and safety awareness', detail: 'Connect welding, 3D printing, power tools and fabrication work to safe procedures, inspection, quality and production constraints.' }
    ],
    certifications: [{ name: 'Lean / Six Sigma training', provider: 'Employer, university or recognized training provider', note: 'Optional. Useful when target manufacturing roles repeatedly ask for process improvement, quality or continuous-improvement knowledge.' }],
    roadmap: [
      { period: '30 days', items: ['Create two manufacturing-focused project case studies showing design decisions, fabrication steps and measurable results.', 'Update the resume so CAD, 3D printing, welding, troubleshooting and project coordination are tied to outcomes.', 'Review 15 to 20 Manufacturing Engineer postings and record recurring requirements such as DFM, quality, Lean, GD&T, ERP/MRP or process validation.'] },
      { period: '6 months', items: ['Complete a manufacturing, quality or process-improvement project that produces measurable before/after evidence.', 'Gain recent internship, co-op, lab, maker-space or volunteer exposure to real production constraints.', 'Close the most common technical gap found in target postings, such as GD&T, Lean/Six Sigma, quality systems or process documentation.'] },
      { period: '1 year', items: ['Maintain a portfolio of manufacturing projects with drawings, process choices, inspection/quality evidence and outcomes.', 'Target entry-level Manufacturing Engineer, Process Engineer and Design-for-Manufacturing roles aligned with the strongest project evidence.', 'Reassess market requirements and update the career plan using current job postings and verified wage data.'] }
    ],
    resources: [{ name: 'SME', purpose: 'Manufacturing career, technical and professional-development resources.', url: 'https://www.sme.org/' }, { name: 'ASME', purpose: 'Mechanical engineering standards, professional development and career resources.', url: 'https://www.asme.org/' }, ...commonResources]
  },
  'mechanical engineer': {
    advancement: [
      { title: 'Turn projects into engineering case studies', detail: 'Document requirements, calculations, CAD/modeling choices, testing, troubleshooting and final results for each major mechanical project.' },
      { title: 'Strengthen analysis-to-design evidence', detail: 'Connect MATLAB, simulation, thermodynamics, heat transfer and CAD work to engineering decisions rather than listing tools alone.' },
      { title: 'Build recent professional exposure', detail: 'Use internship, co-op, research, capstone or portfolio work to demonstrate current engineering practice and collaboration.' },
      { title: 'Show verification and testing', detail: 'Add examples of how designs were checked through simulation, calculation, prototype testing, inspection or root-cause analysis.' }
    ],
    certifications: [],
    roadmap: [
      { period: '30 days', items: ['Create a portfolio page for the strongest mechanical projects with drawings, calculations, tools used and outcomes.', 'Rewrite resume bullets around engineering decisions, not only software names.', 'Compare current Mechanical Engineer postings and identify recurring gaps such as GD&T, FEA, thermal analysis, testing or specific CAD platforms.'] },
      { period: '6 months', items: ['Complete one recent mechanical design/analysis project that includes requirements, calculations, CAD, analysis and validation.', 'Gain current internship, co-op, lab or research evidence if possible.', 'Strengthen the most repeated technical gap from target job postings.'] },
      { period: '1 year', items: ['Maintain a focused mechanical engineering portfolio with quantified project outcomes.', 'Build references from instructors, project leads, internship supervisors or engineering collaborators.', 'Reassess target industries, salary and role requirements using current market data.'] }
    ],
    resources: [{ name: 'ASME', purpose: 'Mechanical engineering standards, technical communities and career resources.', url: 'https://www.asme.org/' }, ...commonResources]
  },
  'mechanical design engineer': {
    advancement: [
      { title: 'Build a design portfolio', detail: 'Present Siemens NX, Creo, AutoCAD and other CAD work with design intent, constraints, iterations and final outcomes.' },
      { title: 'Show engineering drawing quality', detail: 'Include drawings, dimensions, tolerances, assemblies and manufacturing considerations where appropriate.' },
      { title: 'Connect simulation to design choices', detail: 'Explain how MATLAB, ANSYS or other analysis changed the design, reduced risk or improved performance.' },
      { title: 'Add recent design validation evidence', detail: 'Use prototype testing, fabrication, fit checks or structured design reviews to show that designs were verified.' }
    ],
    certifications: [],
    roadmap: [
      { period: '30 days', items: ['Create a small portfolio with 3 to 5 design examples.', 'For each project, show problem, constraints, CAD tool, analysis, design iterations and outcome.', 'Review Mechanical Design Engineer postings for recurring requirements such as GD&T, tolerance analysis, DFM/DFA and PLM.'] },
      { period: '6 months', items: ['Complete one polished end-to-end design project from requirements through CAD, drawing, analysis and prototype/validation.', 'Strengthen GD&T, tolerance analysis or DFM/DFA if they recur in target postings.', 'Seek recent design-team, internship, research or freelance/volunteer engineering evidence.'] },
      { period: '1 year', items: ['Maintain an employer-ready design portfolio and update it with current work.', 'Target Mechanical Design Engineer, CAD Engineer and Product Design Engineer roles that match the strongest evidence.', 'Reassess tools, industries and market requirements using current job postings.'] }
    ],
    resources: [{ name: 'ASME', purpose: 'Mechanical design, standards and professional-development resources.', url: 'https://www.asme.org/' }, ...commonResources]
  },
  'product design engineer': {
    advancement: [
      { title: 'Show user-to-design reasoning', detail: 'Document how requirements, use cases and constraints became design decisions and prototypes.' },
      { title: 'Strengthen prototyping evidence', detail: 'Use CAD, 3D printing, fabrication and testing to show iterative product development.' },
      { title: 'Document tradeoffs', detail: 'Explain performance, manufacturability, cost, weight, reliability and usability tradeoffs.' },
      { title: 'Build cross-functional evidence', detail: 'Show collaboration with manufacturing, testing, customers, instructors or project teammates.' }
    ],
    certifications: [],
    roadmap: [
      { period: '30 days', items: ['Turn the strongest design projects into product-development case studies.', 'Add photos, drawings or diagrams where available and describe design iterations and validation.', 'Review Product Design Engineer postings for recurring gaps.'] },
      { period: '6 months', items: ['Complete one new prototype-driven project with documented requirements, iterations and testing.', 'Build evidence of DFM/DFA, tolerance decisions or supplier/manufacturing constraints.', 'Seek recent product-development teamwork through internship, lab, competition or portfolio work.'] },
      { period: '1 year', items: ['Maintain a portfolio that demonstrates several complete design cycles.', 'Target product, mechanical design and development roles aligned with the portfolio.', 'Reassess market requirements and update the plan.'] }
    ],
    resources: [{ name: 'ASME', purpose: 'Engineering design and professional-development resources.', url: 'https://www.asme.org/' }, ...commonResources]
  },
  'hvac engineer': {
    advancement: [
      { title: 'Strengthen HVAC calculation evidence', detail: 'Document load calculations, assumptions, building inputs and engineering recommendations from HVAC work.' },
      { title: 'Connect coursework to building systems', detail: 'Show how thermodynamics and heat-transfer knowledge supports HVAC analysis and equipment decisions.' },
      { title: 'Add current codes and standards exposure', detail: 'Identify the codes, standards and design practices most often requested in target HVAC roles.' },
      { title: 'Build recent building-systems experience', detail: 'Use an internship, academic project or portfolio case study to demonstrate current HVAC design and analysis.' }
    ],
    certifications: [],
    roadmap: [
      { period: '30 days', items: ['Create an HVAC case study from the strongest building analysis, including assumptions, calculations and recommendations.', 'Review target HVAC Engineer postings and note recurring requirements such as Revit, AutoCAD, energy codes, ASHRAE knowledge and load software.', 'Make heat transfer and thermodynamics evidence explicit if present in academic records.'] },
      { period: '6 months', items: ['Complete one recent HVAC/building-systems analysis or design project.', 'Strengthen the most common tool or standards gap from target postings.', 'Seek recent internship, co-op or project exposure to building mechanical systems.'] },
      { period: '1 year', items: ['Maintain a small HVAC portfolio with load calculations, drawings and design rationale.', 'Target HVAC/Mechanical Engineer and building-systems roles aligned with the evidence.', 'Reassess salary, codes, tools and market requirements using current sources.'] }
    ],
    resources: [{ name: 'ASHRAE', purpose: 'Building-systems, HVAC standards, education and technical resources.', url: 'https://www.ashrae.org/' }, { name: 'ASME', purpose: 'Mechanical engineering professional resources.', url: 'https://www.asme.org/' }, ...commonResources]
  }
};

const epmStrongGuidance = {
  advancement: [
    { title: 'Document project leadership outcomes', detail: 'Turn major engineering assignments into concise project case studies with scope, budget, schedule, team size, risk controls, stakeholder coordination and measurable results.' },
    { title: 'Strengthen U.S.-market project-management evidence', detail: 'Translate experience into governance, schedule control, cost control, change management, risk-register and stakeholder-reporting language used in target postings.' },
    { title: 'Add a recognized project-management credential if useful', detail: 'A credential such as PMP can strengthen market signaling, but it is an advancement credential rather than a substitute for evidence.' },
    { title: 'Build current digital-delivery evidence', detail: 'Show recent use of project dashboards, scheduling/reporting tools, analytics and executive communication.' }
  ],
  certifications: [{ name: 'Project Management Professional (PMP)', provider: 'Project Management Institute (PMI)', note: 'Optional for a strong-fit experienced project leader. Review current PMI eligibility requirements before planning for the exam.', url: 'https://www.pmi.org/certifications/project-management-pmp' }],
  roadmap: [
    { period: '30 days', items: ['Create 3 to 5 quantified engineering project case studies.', 'Rewrite the resume around project outcomes, governance, cost, schedule, risk and stakeholders.', 'Build a competency evidence matrix for the mapped core skills.'] },
    { period: '6 months', items: ['Add recent scheduling, reporting, dashboarding and change-control evidence.', 'Pursue a project-management credential only if it materially improves the target market.', 'Apply selectively to roles aligned with the engineering domain background.'] },
    { period: '1 year', items: ['Maintain a documented portfolio of project outcomes.', 'Build professional references and network connections in the target industry.', 'Reassess salary, credentials and advancement requirements using current market data.'] }
  ],
  resources: [{ name: 'PMI Project Management Professional (PMP)', purpose: 'Official credential requirements and exam information.', url: 'https://www.pmi.org/certifications/project-management-pmp' }, ...commonResources]
};

const genericGuidance = (rec) => {
  const missing = safeArray(rec?.missing_skills);
  return {
    advancement: missing.length ? missing.map((skill) => ({ title: `Build evidence for ${skill}`, detail: `Use coursework, a project, internship, certification or recent work to demonstrate ${skill} in a way that can be reviewed by an employer.` })) : [{ title: 'Strengthen evidence quality', detail: 'The mapped competencies are present. Focus next on recent, quantified and independently reviewable evidence, especially professional or project outcomes.' }],
    certifications: safeArray(rec?.recommended_certifications),
    roadmap: [
      { period: '30 days', items: ['Document the strongest career-relevant accomplishments and update the resume evidence.', 'Review current job requirements and compare them with the saved evidence.'] },
      { period: '6 months', items: ['Close the most repeated evidence or credential gaps in target job postings.', 'Build recent project, internship, portfolio or professional evidence for the target role.'] },
      { period: '1 year', items: ['Reassess career fit, market demand, salary and advancement options using updated evidence.'] }
    ],
    resources: commonResources
  };
};

const guidanceFor = (rec) => {
  const key = normalize(rec?.path || rec?.career_title);
  if (careerGuidance[key]) return careerGuidance[key];
  if (key === 'engineering project manager' && matchPercent(rec) >= 75 && safeArray(rec?.missing_skills).length <= 1) return epmStrongGuidance;
  return genericGuidance(rec);
};

const displayReason = (rec) => {
  const reason = String(rec?.match_reason || '').trim();
  if (!reason) return '';
  return reason.replace('relevant education/training evidence but no detected professional experience in this career domain', 'relevant academic, project, and transferable skill evidence but no detected professional experience in this career domain');
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
      setLoading(true); setError(null);
      try {
        const saved = safeArray(skills?.recommendations);
        if (saved.length) { if (!cancelled) setRecommendations(saved); return; }
        const evidence = safeArray(skills?.extracted_skills);
        if (!evidence.length) { if (!cancelled) setRecommendations([]); return; }
        const response = await fetch(`${apiBase()}/api/recommendations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extracted_skills: evidence }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.detail || `Career recommendation request failed (${response.status})`);
        if (!cancelled) setRecommendations(safeArray(body.recommendations));
      } catch (err) { if (!cancelled) setError(err?.message || 'Unable to calculate Career Intelligence.'); }
      finally { if (!cancelled) setLoading(false); }
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
        } catch (err) { console.warn('Market enrichment unavailable:', err); }
      }));
      if (!cancelled) { setMarketData((current) => ({ ...current, ...next })); setMarketLoading(false); }
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
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300">Career Intelligence</p><h2 className="mt-2 text-3xl font-black">{bestCareer ? `Best current fit: ${bestCareer.path || bestCareer.career_title}` : 'Build a stronger evidence profile'}</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Compare current fit, evidence, market information and practical next steps for each career path.</p></div><button onClick={onBack} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold">Back</button></div>
    </section>

    {bestCareer && <>
      <section className="grid gap-4 lg:grid-cols-4">
        <div className="app-card p-5 lg:col-span-2"><p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">Career snapshot</p><h3 className="mt-2 text-2xl font-black text-slate-950">{bestCareer.path}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{displayReason(bestCareer)}</p></div>
        <div className="app-card p-5"><p className="text-xs font-bold uppercase text-slate-400">Match</p><p className="mt-2 text-4xl font-black text-indigo-700">{matchPercent(bestCareer)}%</p><p className="mt-1 text-xs text-slate-500">Evidence-based fit</p></div>
        <div className="app-card p-5"><p className="text-xs font-bold uppercase text-slate-400">Annual wage</p><p className="mt-2 text-2xl font-black text-slate-950">{salaryFor(bestCareer)}</p><p className="mt-1 text-xs text-slate-500">{salarySource(bestCareer)}</p></div>
      </section>

      <section className="app-card overflow-hidden"><div className="border-b p-6"><div className="flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Career comparison</p><h3 className="mt-1 text-xl font-bold">Leading paths from your current evidence</h3></div>{marketLoading && <span className="text-xs text-slate-400">Refreshing market data…</span>}</div></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-4">Career</th><th className="p-4">Match</th><th className="p-4">Matched</th><th className="p-4">Core gaps</th><th className="p-4">Wage</th></tr></thead><tbody>{rankedRecommendations.slice(0,5).map((rec)=><tr key={rec.id||rec.path} className="border-t"><td className="p-4 font-bold">{rec.path}</td><td className="p-4">{matchPercent(rec)}%</td><td className="p-4">{safeArray(rec.matched_skills).length}</td><td className="p-4">{safeArray(rec.missing_skills).length}</td><td className="p-4">{salaryFor(rec)}</td></tr>)}</tbody></table></div></section>

      <section className="space-y-4">{rankedRecommendations.map((rec,index)=>{
        const matched=safeArray(rec.matched_skills), missing=safeArray(rec.missing_skills), aligned=courseAlignment(rec), market=marketFor(rec), guidance=guidanceFor(rec);
        const open=selectedCareer?.id===rec.id||(!rec.id&&selectedCareer?.path===rec.path);
        const strongCore = missing.length === 0;
        return <article key={rec.id||rec.path} className={`app-card overflow-hidden ${index===0?'border-indigo-200':''}`}>
          <div className="p-6"><div className="flex flex-col gap-4 md:flex-row md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-bold">{rec.path}</h3>{index===0&&<span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-800">Top match</span>}</div><p className="mt-2 text-sm text-slate-600">{displayReason(rec)}</p></div><span className="text-3xl font-black text-indigo-700">{matchPercent(rec)}%</span></div>
          <div className="mt-5 grid gap-5 md:grid-cols-2"><div><p className="text-sm font-bold text-emerald-800">Matching evidence</p><div className="mt-2 flex flex-wrap gap-2">{matched.map((item)=><span key={item} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"><span>{item}</span>{verificationBadge(item)&&<span className="text-emerald-600">· {verificationBadge(item)}</span>}</span>)}</div></div><div><p className="text-sm font-bold text-amber-800">Core competency gaps</p><div className="mt-2 flex flex-wrap gap-2">{missing.length?missing.map((item)=><span key={item} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{item}</span>):<span className="text-sm text-slate-500">No mapped core competency gaps. The next focus is stronger evidence, experience and market readiness.</span>}</div></div></div>
          {aligned.length>0&&<div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4"><p className="text-sm font-bold text-sky-900">Current courses already address gaps</p>{aligned.map((course)=><p key={course.id||course.course_name} className="mt-1 text-sm text-sky-800"><strong>{course.course_name}</strong>: {course.addressed.join(', ')}</p>)}</div>}
          <button onClick={()=>{setSelectedCareer(open?null:rec);setActiveTab('overview');}} className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white">{open?'Hide details':'View details & roadmap'}</button></div>

          {open&&<div className="border-t bg-slate-50/60 p-6"><div className="flex gap-2 overflow-x-auto">{['overview','market','certifications','degrees','next-steps','resources'].map((tab)=><button key={tab} onClick={()=>setActiveTab(tab)} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold ${activeTab===tab?'bg-indigo-600 text-white':'bg-white text-slate-600'}`}>{tab==='next-steps'?'roadmap':tab}</button>)}</div>

          {activeTab==='overview'&&<div className="mt-5 space-y-4"><div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4"><h4 className="font-bold text-indigo-950">Why this career fits</h4><p className="mt-2 text-sm leading-6 text-indigo-900">{displayReason(rec)} Your current evidence-based fit is {matchPercent(rec)}%.</p></div><div><h4 className="font-bold">{strongCore ? 'Career advancement opportunities' : 'Priority development areas'}</h4><div className="mt-3 grid gap-3 md:grid-cols-2">{guidance.advancement.map((item)=><div key={item.title} className="rounded-xl bg-white p-4"><p className="font-bold">{item.title}</p><p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p></div>)}</div></div></div>}

          {activeTab==='market'&&<div className="mt-5 grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-white p-4"><p className="text-xs font-bold uppercase text-slate-400">Annual wage</p><p className="mt-1 text-xl font-bold">{salaryFor(rec)}</p><p className="mt-2 text-xs text-slate-500">{salarySource(rec)}</p></div><div className="rounded-xl bg-white p-4"><p className="text-xs font-bold uppercase text-slate-400">National employment</p><p className="mt-1 text-xl font-bold">{market?.bls?.available?integer(market.bls.employment):'Not available'}</p></div>{market?.onet?.available&&<div className="rounded-xl bg-white p-4 md:col-span-2"><p className="font-bold">{market.onet.occupation_title}</p><p className="mt-2 text-sm leading-6 text-slate-600">{market.onet.description}</p></div>}<div className="rounded-xl border border-sky-100 bg-sky-50 p-4 md:col-span-2"><p className="text-sm text-sky-900">Market figures are shown only when the backend returns a confirmed BLS/O*NET mapping. Catalog estimates are labeled separately and should be verified before salary or relocation decisions.</p></div></div>}

          {activeTab==='certifications'&&<div className="mt-5 space-y-3"><div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">{strongCore ? 'Certifications can strengthen market signaling, but they are not being treated as missing core competencies.' : 'Certifications may help with specific gaps or employer requirements, but they should support real skill evidence rather than replace it.'}</div>{safeArray(guidance.certifications).length?guidance.certifications.map((item,i)=><div key={`${item.name||item}-${i}`} className="rounded-xl bg-white p-4"><p className="font-bold">{item.name||item}</p>{item.provider&&<p className="mt-1 text-sm text-slate-500">{item.provider}</p>}{item.note&&<p className="mt-2 text-sm leading-6 text-slate-600">{item.note}</p>}{item.url&&<a className="mt-3 inline-block text-sm font-semibold text-indigo-600" href={item.url} target="_blank" rel="noreferrer">Official page</a>}</div>):<p className="text-sm text-slate-500">No certification is currently required by this evidence model. Review target job postings before choosing a credential.</p>}</div>}

          {activeTab==='degrees'&&<div className="mt-5 rounded-xl bg-white p-5"><h4 className="font-bold">Degree guidance</h4>{hasFormalDegree?<p className="mt-2 text-sm leading-6 text-slate-600">Your saved resume already contains a formal degree. An additional degree is not being treated as a requirement for this career match. Further study may still be useful for a specific employer, specialization or long-term goal, but it should be a strategic choice rather than a default recommendation.</p>:safeArray(rec.recommended_degrees).length?<div className="mt-3 space-y-3">{safeArray(rec.recommended_degrees).map((item,i)=><div key={`${item.name||item}-${i}`}><p className="font-semibold">{item.name||item}</p><p className="text-sm text-slate-500">{[item.type,item.duration,item.format].filter(Boolean).join(' · ')}</p></div>)}</div>:<p className="mt-2 text-sm text-slate-600">No additional degree is specified as necessary from the current evidence.</p>}</div>}

          {activeTab==='next-steps'&&<div className="mt-5 grid gap-4 lg:grid-cols-3">{guidance.roadmap.map((group)=><div key={group.period} className="rounded-xl bg-white p-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-indigo-600">{group.period}</p><div className="mt-3 space-y-3">{group.items.map((step,i)=><div key={`${group.period}-${i}`} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{i+1}</span><p className="text-sm leading-6 text-slate-700">{step}</p></div>)}</div></div>)}</div>}

          {activeTab==='resources'&&<div className="mt-5 space-y-3">{safeArray(guidance.resources).map((item,i)=><div key={`${item.name||item}-${i}`} className="rounded-xl bg-white p-4"><p className="font-bold">{item.name||item}</p>{item.purpose&&<p className="mt-2 text-sm text-slate-600">{item.purpose}</p>}{item.url&&<a className="mt-3 inline-block text-sm font-semibold text-indigo-600" href={item.url} target="_blank" rel="noreferrer">Open resource</a>}</div>)}</div>}
          </div>}
        </article>;
      })}</section>
    </>}
  </div>;
};

export default CareerRecommendations;