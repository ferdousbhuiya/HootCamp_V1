import { useMemo, useState } from 'react';

const safe=v=>Array.isArray(v)?v:[];
const text=v=>String(v||'').trim();
const pct=v=>{const n=Number(v);return Number.isFinite(n)?Math.round(n<=1?n*100:n):0;};
const degreePattern=/\b(ph\.?d|doctor|juris|master|m\.?s|mba|bachelor|b\.?s|associate|a\.?s)\b/i;
const relationLabel=r=>({current_profession:'Current profession',specialization:'Specialization',advancement:'Advancement path',adjacent:'Adjacent opportunity'}[r?.candidate_relation]||r?.category||'Career path');

export default function SkillDashboardV2({results,onBack,onRecommendations}){
  const [tab,setTab]=useState('resume');
  const [selectedSkill,setSelectedSkill]=useState(null);
  const skills=safe(results?.extracted_skills);
  const explanations=safe(results?.explanations);
  const structured=results?.structured_evidence||{};
  const education=safe(results?.education||structured.education);
  const experience=safe(results?.experience||structured.experience);
  const projects=safe(results?.projects||structured.projects);
  const publications=safe(results?.publications||structured.publications);
  const credentials=safe(results?.certifications_from_resume||structured.certifications);
  const courses=safe(results?.courses_from_resume||structured.courses);
  const years=Number(results?.total_experience_years??structured.total_experience_years??0);
  const recommendations=safe(results?.recommendations); // Backend order is intentional. Never re-sort by score here.
  const best=recommendations[0]||null;

  const formalEducation=useMemo(()=>education.filter(e=>degreePattern.test(`${e?.program_or_degree||''} ${e?.field_of_study||''}`)),[education]);
  const categories=useMemo(()=>{const out={};for(const s of skills){const c=s?.category||'Other';out[c]=(out[c]||0)+1;}return out;},[skills]);
  const summaries=[['Skills',skills.length],['Formal education',formalEducation.length],['Work roles',experience.length],['Experience',years?`${years.toFixed(1)} yrs`:null],['Projects',projects.length],['Publications',publications.length]].filter(([,v])=>v!==0&&v!==null);
  const Card=({title,children})=><div className="rounded-2xl border border-slate-200 bg-white p-5"><h4 className="font-bold text-slate-950">{title}</h4><div className="mt-2 text-sm leading-6 text-slate-600">{children}</div></div>;

  return <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
    <header className="bg-slate-950 px-6 py-8 text-white md:px-8"><div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-cyan-200">Resume analysis complete</p><h1 className="mt-2 text-3xl font-bold">Review your resume evidence</h1><p className="mt-2 text-sm text-slate-300">Review the evidence found in your resume before exploring your career options.</p></div><button onClick={onBack} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold">Analyze another document</button></div><div className="mt-7 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{summaries.map(([l,v])=><div key={l} className="rounded-2xl border border-white/10 bg-white/10 p-4"><p className="text-xs uppercase text-slate-300">{l}</p><p className="mt-1 text-2xl font-bold">{v}</p></div>)}</div></header>

    <nav className="border-b px-6 md:px-8"><div className="flex flex-wrap gap-2 py-3">{[['resume','Resume Evidence'],['skills','Skill Inventory'],['evidence','Skill Evidence'],['careers','Career Snapshot']].map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab===id?'bg-slate-950 text-white':'text-slate-600'}`}>{label}</button>)}</div></nav>

    <main className="p-6 md:p-8">
      {tab==='resume'&&<div className="space-y-7"><div><h3 className="text-xl font-bold">Structured resume evidence</h3><p className="mt-1 text-sm text-slate-500">Only evidence categories found in this resume are shown below.</p></div>
        {formalEducation.length>0&&<section><h3 className="font-bold">Formal education ({formalEducation.length})</h3><div className="mt-3 grid gap-3 md:grid-cols-2">{formalEducation.map((e,i)=><Card key={i} title={text(e.program_or_degree)||'Education'}><p>{text(e.institution)||'Institution not detected'}</p>{e.field_of_study&&<p>Field: {e.field_of_study}</p>}{e.end_or_expected_date&&<p>Completed: {e.end_or_expected_date}</p>}</Card>)}</div></section>}
        {experience.length>0&&<section><h3 className="font-bold">Work experience ({experience.length} roles)</h3>{years>0&&<p className="mt-1 text-sm text-indigo-700">{years.toFixed(1)} total non-overlapping years</p>}<div className="mt-3 grid gap-3 md:grid-cols-2">{experience.map((e,i)=><Card key={i} title={text(e.role)||'Work role'}><p>{text(e.employer)||'Employer not detected'}</p>{(e.start_date||e.end_date)&&<p>{text(e.start_date)} → {text(e.end_date)}</p>}{safe(e.responsibilities).length>0&&<p className="mt-2">{safe(e.responsibilities).slice(0,2).join(' ')}</p>}</Card>)}</div></section>}
        {projects.length>0&&<section><h3 className="font-bold">Project accomplishments ({projects.length})</h3><div className="mt-3 grid gap-3 md:grid-cols-2">{projects.map((p,i)=><Card key={i} title={text(p.name)||'Project accomplishment'}><p>{text(p.description)||text(p.evidence)}</p></Card>)}</div></section>}
        {credentials.length>0&&<section><h3 className="font-bold">Professional credentials, membership & recognition</h3><div className="mt-3 grid gap-3 md:grid-cols-2">{credentials.map((c,i)=><Card key={i} title={text(c.name)||'Professional credential'}><p>{text(c.provider)||text(c.evidence)||'Resume evidence'}</p></Card>)}</div></section>}
        {courses.length>0&&<section><h3 className="font-bold">Courses & training</h3><div className="mt-3 grid gap-3 md:grid-cols-2">{courses.map((c,i)=><Card key={i} title={text(c.name)||'Course'}><p>{text(c.institution_or_provider)||text(c.provider)}</p></Card>)}</div></section>}
        {publications.length>0&&<section><h3 className="font-bold">Publications</h3><div className="mt-3 space-y-3">{publications.map((p,i)=><Card key={i} title={text(p.title)||'Publication'}>{text(p.citation)||text(p.evidence)}</Card>)}</div></section>}
      </div>}

      {tab==='skills'&&<div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]"><div className="rounded-2xl border bg-slate-50 p-5"><h3 className="font-bold">Skill distribution</h3><div className="mt-4 space-y-3">{Object.entries(categories).map(([c,n])=><div key={c}><div className="flex justify-between text-sm"><span>{c}</span><span>{n}</span></div><div className="mt-1 h-2 rounded-full bg-slate-200"><div className="h-full rounded-full bg-indigo-600" style={{width:`${skills.length?(n/skills.length)*100:0}%`}}/></div></div>)}</div></div><div><h3 className="font-bold">Extracted skills</h3><p className="mt-1 text-sm text-slate-500">Confidence shows how strongly the uploaded resume supports each skill.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{skills.map((s,i)=><button key={i} onClick={()=>setSelectedSkill(s)} className="rounded-2xl border p-4 text-left"><div className="flex justify-between gap-3"><div><b>{s?.name}</b><p className="text-xs text-slate-500">{s?.category||'Other'}</p></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs text-emerald-700">{pct(s?.confidence)}%</span></div></button>)}</div></div>{selectedSkill&&<div className="xl:col-span-2 rounded-2xl border border-indigo-100 bg-indigo-50 p-5"><b>{selectedSkill.name}</b><p className="mt-2 text-sm text-slate-700">{explanations.find(e=>e?.skill===selectedSkill.name)?.evidence||selectedSkill.evidence||'Evidence text not available.'}</p></div>}</div>}

      {tab==='evidence'&&<div className="grid gap-4 md:grid-cols-2">{explanations.map((e,i)=><div key={i} className="rounded-2xl border p-5"><b>{e?.skill||'Skill evidence'}</b><p className="mt-3 text-sm text-slate-600">{e?.reasoning}</p><div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">{e?.evidence||'Not available'}</div></div>)}</div>}

      {tab==='careers'&&<div className="space-y-5">{best&&<div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5"><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">{relationLabel(best)}</p><div className="mt-2 flex flex-wrap items-center gap-3"><h2 className="text-2xl font-bold">{best.path}</h2><span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">{pct(best.match_percentage??best.match_score)}% readiness</span></div><p className="mt-2 text-sm text-slate-600">{best.match_reason}</p></div>}<div className="grid gap-4 lg:grid-cols-2">{recommendations.map((r,i)=><div key={r?.id||i} className="rounded-2xl border p-5"><p className="text-xs font-bold uppercase text-indigo-600">{relationLabel(r)}</p><div className="mt-1 flex justify-between gap-3"><h4 className="text-lg font-bold">{r.path}</h4><b>{pct(r.match_percentage??r.match_score)}%</b></div><p className="mt-3 text-sm text-slate-600">{r.match_reason}</p><p className="mt-3 text-xs text-slate-500">Core competencies evidenced: {safe(r.matched_skills).length} · Core gaps: {safe(r.missing_skills).length}</p></div>)}</div></div>}

      {best&&<div className="mt-8 rounded-2xl border border-indigo-100 bg-indigo-50 p-5"><p className="font-bold text-indigo-950">Ready to explore your strongest career options?</p><p className="mt-2 text-sm text-indigo-900">Open Career Intelligence to compare current profession, specializations, advancement paths, market information and practical next steps.</p><button onClick={()=>onRecommendations(results)} className="mt-4 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Open Career Intelligence</button></div>}
    </main>
  </div>;
}
