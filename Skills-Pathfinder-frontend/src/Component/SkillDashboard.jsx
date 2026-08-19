import { useMemo, useState } from 'react';

const safeArray = (value) => (Array.isArray(value) ? value : []);
const pct = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
};

const SkillDashboard = ({ results, onBack, onRecommendations }) => {
  const [activeTab, setActiveTab] = useState('skills');
  const [selectedSkill, setSelectedSkill] = useState(null);

  const skills = safeArray(results?.extracted_skills);
  const explanations = safeArray(results?.explanations);
  const recommendations = useMemo(
    () => [...safeArray(results?.recommendations)].sort((a, b) => (Number(b.match_score) || 0) - (Number(a.match_score) || 0)),
    [results?.recommendations]
  );
  const bestCareer = recommendations[0] || null;

  const skillCategories = useMemo(() => {
    const distribution = {};
    skills.forEach((skill) => {
      const category = skill?.category || 'Other';
      distribution[category] = (distribution[category] || 0) + 1;
    });
    return distribution;
  }, [skills]);

  const confidenceAverage = skills.length
    ? Math.round((skills.reduce((sum, skill) => sum + (Number(skill?.confidence) || 0), 0) / skills.length) * 100)
    : 0;

  const tabs = [
    ['skills', 'Skill Inventory'],
    ['explanations', 'Evidence'],
    ['recommendations', 'Career Snapshot']
  ];

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_24px_70px_-30px_rgba(15,23,42,0.35)]">
      <div className="relative overflow-hidden bg-slate-950 px-6 py-8 text-white md:px-8">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
              Analysis complete
            </div>
            <h1 className="max-w-3xl text-3xl font-bold tracking-tight md:text-4xl">Your skill profile is ready</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300 md:text-base">
              {results?.filename || 'Document'} produced {skills.length} skills from {Number(results?.character_count || 0).toLocaleString()} characters of evidence.
            </p>
          </div>
          <button
            onClick={onBack}
            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Analyze another document
          </button>
        </div>

        <div className="relative mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-300">Skills found</p>
            <p className="mt-1 text-3xl font-bold">{skills.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-300">Average confidence</p>
            <p className="mt-1 text-3xl font-bold">{confidenceAverage}%</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-300">Career matches</p>
            <p className="mt-1 text-3xl font-bold">{recommendations.length}</p>
          </div>
        </div>
      </div>

      {bestCareer && (
        <div className="border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-white to-cyan-50 px-6 py-6 md:px-8">
          <div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Your strongest career signal</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold text-slate-900">{bestCareer.path}</h2>
                <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">{pct(bestCareer.match_score)}% match</span>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {bestCareer.match_reason || `Your profile matches ${safeArray(bestCareer.matched_skills).length} core skills for this path.`}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700">{safeArray(bestCareer.matched_skills).length} strengths aligned</span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 font-medium text-amber-700">{safeArray(bestCareer.missing_skills).length} priority gaps</span>
                {bestCareer.median_salary && <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700">Salary reference: {bestCareer.median_salary}</span>}
              </div>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700">Career readiness</span>
                <span className="font-bold text-indigo-700">{pct(bestCareer.match_score)}%</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500" style={{ width: `${pct(bestCareer.match_score)}%` }} />
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">Gap remaining: {pct(bestCareer.skill_gap_percentage ?? (100 - pct(bestCareer.match_score)))}%. Open Career Intelligence for salary evidence, related roles, required skills, learning steps, and course alignment.</p>
              <button
                onClick={() => onRecommendations(results)}
                className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                Open Career Intelligence
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border-b border-slate-200 bg-white px-6 md:px-8">
        <div className="flex gap-2 overflow-x-auto py-3">
          {tabs.map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === tab ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 md:p-8">
        {activeTab === 'skills' && (
          <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="font-bold text-slate-900">Skill distribution</h3>
              <p className="mt-1 text-sm text-slate-500">Where your current evidence is concentrated.</p>
              <div className="mt-5 space-y-4">
                {Object.entries(skillCategories).map(([category, count]) => (
                  <div key={category}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{category}</span>
                      <span className="text-slate-500">{count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500" style={{ width: `${skills.length ? (count / skills.length) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
                {!skills.length && <p className="py-6 text-center text-sm text-slate-500">No skills were extracted.</p>}
              </div>
            </div>

            <div>
              <div className="mb-4 flex items-end justify-between gap-3">
                <div><h3 className="font-bold text-slate-900">Extracted skills</h3><p className="mt-1 text-sm text-slate-500">Select a skill to inspect its evidence.</p></div>
              </div>
              <div className="grid max-h-[520px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                {skills.map((skill, index) => {
                  const confidence = pct(skill?.confidence);
                  const active = selectedSkill?.name === skill?.name;
                  return (
                    <button
                      key={`${skill?.name || 'skill'}-${index}`}
                      onClick={() => setSelectedSkill(skill)}
                      className={`rounded-2xl border p-4 text-left transition ${active ? 'border-indigo-400 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div><h4 className="font-semibold text-slate-900">{skill?.name || 'Unnamed skill'}</h4><p className="mt-1 text-xs text-slate-500">{skill?.category || 'Other'}</p></div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${confidence >= 85 ? 'bg-emerald-100 text-emerald-700' : confidence >= 70 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{confidence}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedSkill && (
              <div className="xl:col-span-2 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Skill</p><p className="mt-1 font-bold text-slate-900">{selectedSkill.name}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</p><p className="mt-1 font-medium text-slate-800">{selectedSkill.category || 'Other'}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence</p><p className="mt-1 text-sm text-slate-700">{explanations.find((e) => e?.skill === selectedSkill.name)?.evidence || selectedSkill.evidence || 'Evidence was not returned for this item.'}</p></div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'explanations' && (
          <div className="grid gap-4 md:grid-cols-2">
            {explanations.map((exp, index) => (
              <div key={`${exp?.skill || 'evidence'}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3"><h4 className="font-bold text-slate-900">{exp?.skill || 'Skill evidence'}</h4><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">Evidence</span></div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{exp?.reasoning || 'Detected from the uploaded document.'}</p>
                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><span className="font-semibold">Source text:</span> {exp?.evidence || 'Not available'}</div>
              </div>
            ))}
            {!explanations.length && <div className="md:col-span-2 rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">No detailed evidence was returned for this analysis.</div>}
          </div>
        )}

        {activeTab === 'recommendations' && (
          <div>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-xl font-bold text-slate-900">Career snapshot</h3><p className="mt-1 text-sm text-slate-500">A quick preview before opening the full career intelligence workspace.</p></div>{recommendations.length > 0 && <button onClick={() => onRecommendations(results)} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">View full comparison</button>}</div>
            <div className="grid gap-4 lg:grid-cols-2">
              {recommendations.map((rec, index) => (
                <div key={rec?.id || index} className={`rounded-2xl border p-5 ${index === 0 ? 'border-indigo-200 bg-gradient-to-br from-indigo-50 to-cyan-50' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{index === 0 ? 'Best match' : rec?.category || 'Career path'}</p><h4 className="mt-1 text-lg font-bold text-slate-900">{rec?.path}</h4></div><span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white">{pct(rec?.match_score)}%</span></div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{rec?.match_reason || 'Career alignment based on your current skill evidence.'}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-white/80 p-3"><p className="text-xs text-slate-500">Matched skills</p><p className="mt-1 text-xl font-bold text-emerald-600">{safeArray(rec?.matched_skills).length}</p></div><div className="rounded-xl bg-white/80 p-3"><p className="text-xs text-slate-500">Skill gaps</p><p className="mt-1 text-xl font-bold text-amber-600">{safeArray(rec?.missing_skills).length}</p></div></div>
                  {safeArray(rec?.missing_skills).length > 0 && <p className="mt-4 text-xs text-slate-500"><span className="font-semibold text-slate-700">Priority gap:</span> {safeArray(rec.missing_skills).slice(0, 3).join(', ')}</p>}
                </div>
              ))}
            </div>
            {!recommendations.length && <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center"><h4 className="font-bold text-slate-800">No career matches yet</h4><p className="mt-2 text-sm text-slate-500">Add more resume, certificate, course, or self-reported evidence and analyze again.</p></div>}
          </div>
        )}
      </div>
    </div>
  );
};

export default SkillDashboard;
