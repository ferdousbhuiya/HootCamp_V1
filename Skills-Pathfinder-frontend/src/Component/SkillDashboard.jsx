import { useMemo, useState } from 'react';

const safeArray = v => Array.isArray(v) ? v : [];
const pct = v => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n <= 1 ? n * 100 : n) : 0;
};
const text = v => String(v || '').trim();
const norm = v => text(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const SkillDashboard = ({ results, onBack, onRecommendations }) => {
  const [activeTab, setActiveTab] = useState('resume');
  const [selectedSkill, setSelectedSkill] = useState(null);

  const skills = safeArray(results?.extracted_skills);
  const explanations = safeArray(results?.explanations);
  const education = safeArray(results?.education || results?.structured_evidence?.education);
  const experience = safeArray(results?.experience || results?.structured_evidence?.experience);
  const rawProjects = safeArray(results?.projects || results?.structured_evidence?.projects);
  const publications = safeArray(results?.publications || results?.structured_evidence?.publications);
  const credentials = safeArray(results?.certifications_from_resume || results?.structured_evidence?.certifications);
  const rawCourses = safeArray(results?.courses_from_resume || results?.structured_evidence?.courses);
  const years = Number(results?.total_experience_years ?? results?.structured_evidence?.total_experience_years ?? 0);

  const educationKeys = useMemo(() => new Set(education.map(e => norm(e?.program_or_degree))), [education]);
  const courses = useMemo(
    () => rawCourses.filter(c => !educationKeys.has(norm(c?.name))),
    [rawCourses, educationKeys]
  );

  const projectAccomplishments = useMemo(() => {
    if (rawProjects.length) return rawProjects;
    const actionPattern = /(project|commission|install|implement|design|startup|start-up|acceptance|integrat|upgrade|deploy|construct|dismantl|supervis|coordinate)/i;
    const seen = new Set();
    const derived = [];
    experience.forEach(role => {
      safeArray(role?.responsibilities).forEach(item => {
        const value = text(item);
        if (!value || !actionPattern.test(value)) return;
        const key = norm(value);
        if (seen.has(key)) return;
        seen.add(key);
        derived.push({
          name: text(role?.role) ? `${role.role} project accomplishment` : 'Project accomplishment',
          description: value,
          evidence: value,
          employer: text(role?.employer),
          derived_from_work_history: true,
        });
      });
    });
    return derived.slice(0, 8);
  }, [rawProjects, experience]);

  const recommendations = useMemo(
    () => [...safeArray(results?.recommendations)].sort((a, b) => (Number(b.match_score) || 0) - (Number(a.match_score) || 0)),
    [results?.recommendations]
  );
  const bestCareer = recommendations[0] || null;
  const categories = useMemo(() => {
    const d = {};
    skills.forEach(s => {
      const c = s?.category || 'Other';
      d[c] = (d[c] || 0) + 1;
    });
    return d;
  }, [skills]);
  const selected = Boolean(bestCareer?.target_selected);
  const domain = safeArray(bestCareer?.domain_evidence);

  const summary = [
    ['Skills', skills.length],
    ['Education', education.length],
    ['Work roles', experience.length],
    ['Experience', years ? `${years.toFixed(1)} yrs` : '0 yrs'],
    ['Project accomplishments', projectAccomplishments.length],
    ['Publications', publications.length],
  ];

  const EvidenceCard = ({ title, children }) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h4 className="font-bold text-slate-900">{title}</h4>
      <div className="mt-2 text-sm leading-6 text-slate-600">{children}</div>
    </div>
  );

  return <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_24px_70px_-30px_rgba(15,23,42,0.35)]">
    <div className="bg-slate-950 px-6 py-8 text-white md:px-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[.16em] text-cyan-200">Resume analysis complete</div>
          <h1 className="text-3xl font-bold md:text-4xl">Review your resume evidence</h1>
          <p className="mt-2 text-sm text-slate-300">Verify skills, education, work history, experience, project accomplishments and publications before Career Intelligence.</p>
        </div>
        <button onClick={onBack} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold">Analyze another document</button>
      </div>
      <div className="mt-7 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {summary.map(([l, v]) => <div key={l} className="rounded-2xl border border-white/10 bg-white/10 p-4"><p className="text-xs uppercase text-slate-300">{l}</p><p className="mt-1 text-2xl font-bold">{v}</p></div>)}
      </div>
    </div>

    <div className="border-b px-6 md:px-8">
      <div className="flex flex-wrap gap-2 py-3">
        {[
          ['resume', 'Resume Evidence'],
          ['skills', 'Skill Inventory'],
          ['explanations', 'Skill Evidence'],
          ['recommendations', 'Career Snapshot'],
        ].map(([t, l]) => <button key={t} onClick={() => setActiveTab(t)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${activeTab === t ? 'bg-slate-950 text-white' : 'text-slate-600'}`}>{l}</button>)}
      </div>
    </div>

    <div className="p-6 md:p-8">
      {activeTab === 'resume' && <div className="space-y-7">
        <div>
          <h3 className="text-xl font-bold">Structured resume evidence</h3>
          <p className="mt-1 text-sm text-slate-500">These records came from this uploaded resume. Missing or incorrect sections should be fixed before relying on career scores.</p>
        </div>

        <section>
          <h3 className="font-bold">Education & completed training <span className="text-slate-400">({education.length})</span></h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {education.length ? education.map((e, i) => <EvidenceCard key={i} title={text(e.program_or_degree) || 'Education record'}>
              <p>{text(e.institution) || 'Institution not detected'}</p>
              {text(e.field_of_study) && <p>Field: {e.field_of_study}</p>}
              {text(e.end_or_expected_date) && <p>Completed: {e.end_or_expected_date}</p>}
            </EvidenceCard>) : <p className="text-sm text-amber-700">No education records were detected.</p>}
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-bold">Work experience <span className="text-slate-400">({experience.length} roles)</span></h3>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{years ? `${years.toFixed(1)} total non-overlapping years` : 'Experience duration not detected'}</span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {experience.length ? experience.map((e, i) => <EvidenceCard key={i} title={text(e.role) || 'Work role'}>
              <p>{text(e.employer) || 'Employer not detected'}</p>
              {(e.start_date || e.end_date) && <p>{text(e.start_date)}{e.start_date || e.end_date ? ' → ' : ''}{text(e.end_date)}</p>}
              {safeArray(e.responsibilities).length > 0 && <p className="mt-2">{safeArray(e.responsibilities).slice(0, 2).join(' ')}</p>}
            </EvidenceCard>) : <p className="text-sm text-amber-700">No work records were detected.</p>}
          </div>
        </section>

        <section>
          <h3 className="font-bold">Project accomplishments <span className="text-slate-400">({projectAccomplishments.length})</span></h3>
          <p className="mt-1 text-sm text-slate-500">This includes explicit project records and substantial project work described inside employment history.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {projectAccomplishments.length ? projectAccomplishments.map((p, i) => <EvidenceCard key={i} title={text(p.name) || 'Project accomplishment'}>
              {text(p.employer) && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{p.employer}</p>}
              <p>{text(p.description) || text(p.evidence) || 'Project evidence detected.'}</p>
            </EvidenceCard>) : <p className="text-sm text-slate-500">No explicit or work-history project accomplishments were detected in this resume.</p>}
          </div>
        </section>

        <section>
          <h3 className="font-bold">Publications <span className="text-slate-400">({publications.length})</span></h3>
          <div className="mt-3 grid gap-3">
            {publications.length ? publications.map((p, i) => <EvidenceCard key={i} title={text(p.title) || 'Publication'}>{text(p.citation) || text(p.evidence)}</EvidenceCard>) : <p className="text-sm text-slate-500">No publications were detected.</p>}
          </div>
        </section>

        {(credentials.length > 0 || courses.length > 0) && <section>
          <h3 className="font-bold">Other professional evidence</h3>
          <p className="mt-1 text-sm text-slate-500">Education/training already listed above is not repeated here.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {credentials.map((c, i) => <EvidenceCard key={`c${i}`} title={text(c.name) || 'Credential'}>{text(c.provider) || text(c.evidence)}</EvidenceCard>)}
            {courses.map((c, i) => <EvidenceCard key={`q${i}`} title={text(c.name) || 'Course'}>{text(c.institution_or_provider) || text(c.evidence)}</EvidenceCard>)}
          </div>
        </section>}

        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
          <p className="font-bold text-indigo-950">Next: Career Intelligence</p>
          <p className="mt-1 text-sm text-indigo-900">Continue only after the resume evidence above looks correct. Career matching should be based on this evidence, not on manually re-entering resume information.</p>
          {bestCareer && <button onClick={() => onRecommendations(results)} className="mt-4 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Open Career Intelligence</button>}
        </div>
      </div>}

      {activeTab === 'skills' && <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-2xl border bg-slate-50 p-5">
          <h3 className="font-bold">Skill distribution</h3>
          <p className="mt-1 text-sm text-slate-500">Where your current evidence is concentrated.</p>
          <div className="mt-5 space-y-4">{Object.entries(categories).map(([c, n]) => <div key={c}><div className="flex justify-between text-sm"><span>{c}</span><span>{n}</span></div><div className="mt-1 h-2 rounded-full bg-slate-200"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${skills.length ? n / skills.length * 100 : 0}%` }} /></div></div>)}</div>
        </div>
        <div>
          <h3 className="font-bold">Extracted skills</h3>
          <p className="mt-1 text-sm text-slate-500">Confidence means how certain the extractor is that the evidence is present.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{skills.map((s, i) => <button key={i} onClick={() => setSelectedSkill(s)} className="rounded-2xl border p-4 text-left"><div className="flex justify-between"><div><b>{s?.name || 'Unnamed skill'}</b><p className="text-xs text-slate-500">{s?.category || 'Other'}</p></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs text-emerald-700">{pct(s?.confidence)}%</span></div></button>)}</div>
        </div>
        {selectedSkill && <div className="xl:col-span-2 rounded-2xl border border-indigo-100 bg-indigo-50 p-5"><b>{selectedSkill.name}</b><p className="mt-2 text-sm text-slate-700">{explanations.find(e => e?.skill === selectedSkill.name)?.evidence || selectedSkill.evidence || 'Evidence text not available.'}</p></div>}
      </div>}

      {activeTab === 'explanations' && <div className="grid gap-4 md:grid-cols-2">{explanations.map((e, i) => <div key={i} className="rounded-2xl border p-5"><b>{e?.skill || 'Skill evidence'}</b><p className="mt-3 text-sm text-slate-600">{e?.reasoning}</p><div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">{e?.evidence || 'Not available'}</div></div>)}</div>}

      {activeTab === 'recommendations' && <div className="space-y-5">
        {bestCareer && <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5"><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">{selected ? 'Your selected career target' : 'Best current match'}</p><div className="mt-2 flex flex-wrap items-center gap-3"><h2 className="text-2xl font-bold">{bestCareer.path}</h2><span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">{pct(bestCareer.match_score)}% readiness</span></div><p className="mt-2 text-sm text-slate-600">{bestCareer.match_reason}</p>{domain.length > 0 && <p className="mt-3 text-xs text-slate-500">Relevant evidence: {domain.map(d => d.evidence_skill).join(', ')}.</p>}</div>}
        <div className="grid gap-4 lg:grid-cols-2">{recommendations.map((r, i) => <div key={r?.id || i} className="rounded-2xl border p-5"><p className="text-xs font-bold uppercase text-indigo-600">{r.target_selected ? 'Selected target' : i === 0 ? 'Best current match' : r.category}</p><div className="flex justify-between"><h4 className="text-lg font-bold">{r.path}</h4><b>{pct(r.match_score)}%</b></div><p className="mt-3 text-sm text-slate-600">{r.match_reason}</p><p className="mt-3 text-xs text-slate-500">Core competencies evidenced: {safeArray(r.matched_skills).length} · Core gaps: {safeArray(r.missing_skills).length}</p></div>)}</div>
      </div>}
    </div>
  </div>;
};

export default SkillDashboard;
