import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY);
const apiBase=()=>String(import.meta.env.VITE_API_URL||'').replace(/\/$/,'');
const safe=v=>Array.isArray(v)?v:[];
const pct=r=>{const d=Number(r?.match_percentage);if(Number.isFinite(d))return Math.round(d);const s=Number(r?.match_score);return Number.isFinite(s)?Math.round(s<=1?s*100:s):0;};
const money=v=>Number.isFinite(Number(v))?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v)):null;
const num=v=>Number.isFinite(Number(v))?new Intl.NumberFormat('en-US').format(Number(v)):null;
const relationLabel=r=>({current_profession:'Current profession',specialization:'Specialization',advancement:'Advancement path',adjacent:'Adjacent opportunity'}[r?.candidate_relation]||'Career path');
const blueprint=r=>r?.career_blueprint||r?.blueprint||{};

function CareerRecommendationsV2({skills,user,onBack}){
  const [recs,setRecs]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [market,setMarket]=useState({}),[marketLoading,setMarketLoading]=useState(false);
  const [selected,setSelected]=useState(null),[tab,setTab]=useState('overview');
  const [courses,setCourses]=useState([]);

  useEffect(()=>{let live=true;(async()=>{try{const saved=safe(skills?.recommendations);if(saved.length){if(live)setRecs(saved);return;}const evidence=safe(skills?.extracted_skills);if(!evidence.length){if(live)setRecs([]);return;}const res=await fetch(`${apiBase()}/api/recommendations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({extracted_skills:evidence})});const body=await res.json();if(!res.ok)throw new Error(body.detail||'Career request failed');if(live)setRecs(safe(body.recommendations));}catch(e){if(live)setError(e.message||'Career Intelligence failed');}finally{if(live)setLoading(false);}})();return()=>{live=false};},[skills]);

  useEffect(()=>{if(!user?.id)return;let live=true;(async()=>{const {data}=await supabase.from('ongoing_courses').select('*').eq('user_id',user.id);if(live)setCourses(data||[]);})();return()=>{live=false};},[user?.id]);

  useEffect(()=>{if(!recs.length)return;let live=true;(async()=>{setMarketLoading(true);const next={};await Promise.all(recs.slice(0,5).map(async r=>{const key=r.id||r.path;try{const title=r.path||r.career_title||'';const res=await fetch(`${apiBase()}/api/market-data?career_title=${encodeURIComponent(title)}`);const body=await res.json().catch(()=>({}));if(res.ok&&body.status==='success')next[key]=body.market_data;}catch{}}));if(live){setMarket(m=>({...m,...next}));setMarketLoading(false);}})();return()=>{live=false};},[recs]);

  const best=recs[0]||null;
  const marketFor=r=>market[r?.id||r?.path]||r?.market_data||{};
  const salaryFor=r=>{const b=marketFor(r)?.bls;return b?.available?money(b.mean_annual_wage):null;};
  const selectedRec=selected||best;
  const selectedMarket=marketFor(selectedRec);
  const bp=blueprint(selectedRec);

  const existingCredentials=useMemo(()=>safe(skills?.certifications_from_resume).length?safe(skills?.certifications_from_resume):safe(skills?.structured_evidence?.certifications),[skills]);
  const existingNames=new Set(existingCredentials.map(c=>String(typeof c==='string'?c:c?.name||'').trim().toLowerCase()).filter(Boolean));
  const recommendedCredentials=safe(selectedRec?.recommended_certifications).filter(c=>!existingNames.has(String(typeof c==='string'?c:c?.name||'').trim().toLowerCase()));
  const educationEvidence=safe(skills?.education||skills?.structured_evidence?.education);
  const hasPostSecondaryDegree=educationEvidence.some(e=>/associate|bachelor|master|doctor|juris|ph\.?d|a\.s|b\.s|m\.s|dds|dmd|jd/i.test(`${e?.program_or_degree||''} ${e?.field_of_study||''}`));
  const hasHighSchoolDiploma=educationEvidence.some(e=>/high school diploma|secondary school diploma/i.test(`${e?.program_or_degree||''} ${e?.field_of_study||''}`));
  const degreeGuidance=hasPostSecondaryDegree
    ?'Your resume already contains a post-secondary degree. An additional degree is not treated as a default requirement; further study should be a strategic choice tied to a specific role or employer.'
    :hasHighSchoolDiploma
      ?'A high school diploma is present in your resume. No post-secondary degree was detected; review the education, licensing, or training requirements for the selected career before choosing further study.'
      :educationEvidence.length
        ?'Formal education evidence is present in your resume, but no post-secondary degree was identified. Review the selected career requirements before choosing further study.'
        :'No formal education was detected in this analysis. Review employer and licensing requirements for the selected career before choosing further education.';

  const roadmap=[
    ['30 days',safe(bp?.actions_30_days).length?safe(bp.actions_30_days):safe(selectedRec?.next_steps).slice(0,3)],
    ['6 months',safe(bp?.actions_6_months)],
    ['1 year',safe(bp?.actions_1_year)]
  ].filter(([,items])=>items.length);

  const alignedCourses=useMemo(()=>{const gaps=safe(selectedRec?.missing_skills).map(x=>String(x).toLowerCase());return courses.filter(c=>{const text=`${c.course_name||''} ${c.subject_area||''} ${safe(c.extracted_skills).map(x=>x?.name||x).join(' ')}`.toLowerCase();return gaps.some(g=>g&&text.includes(g));});},[courses,selectedRec]);

  const resources=useMemo(()=>{
    if(!selectedRec)return[];
    const title=selectedRec.path||selectedRec.career_title||'career';
    const out=[];
    const onet=selectedMarket?.onet||{};
    const bls=selectedMarket?.bls||{};

    if(onet.onet_soc_code){
      out.push({
        name:`O*NET occupation profile: ${onet.occupation_title||title}`,
        purpose:'Official occupation tasks, knowledge, skills and related titles for the mapped O*NET occupation.',
        url:`https://www.onetonline.org/link/summary/${encodeURIComponent(onet.onet_soc_code)}`,
        type:'Official occupation source'
      });
    }else{
      out.push({
        name:`Search O*NET for ${title}`,
        purpose:'Search the official O*NET occupation database when a confirmed occupation mapping is not yet available.',
        url:`https://www.onetonline.org/find/quick?s=${encodeURIComponent(title)}`,
        type:'Official occupation search'
      });
    }

    if(bls.available&&bls.source_url){
      out.push({
        name:`BLS/OEWS: ${bls.mapped_occupation||bls.occupation_title||title}`,
        purpose:`Official wage and employment source${bls.source_period?` (${bls.source_period})`:''} for the confirmed occupation mapping.`,
        url:bls.source_url,
        type:'Official market source'
      });
    }

    for(const c of recommendedCredentials){
      const obj=typeof c==='string'?{name:c}:c;
      if(obj?.url)out.push({name:obj.name||'Credential resource',purpose:'Official or provider-supplied credential information.',url:obj.url,type:'Credential resource'});
    }

    const seen=new Set();
    return out.filter(item=>{const key=String(item.url||'').trim();if(!key||seen.has(key))return false;seen.add(key);return true;});
  },[selectedRec,selectedMarket,recommendedCredentials]);

  if(loading)return <div className="app-card p-8 text-center">Building Career Intelligence from your resume evidence…</div>;
  if(error)return <div className="app-card p-8 text-center text-rose-700">{error}<div><button onClick={onBack} className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-white">Back</button></div></div>;
  if(!best)return <div className="app-card p-8 text-center">No evidence-supported career paths were produced.</div>;

  return <div className="space-y-6">
    <section className="rounded-3xl bg-slate-950 p-6 text-white sm:p-8"><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-300">Career Intelligence</p><div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="text-3xl font-black">{relationLabel(best)==='Current profession'?`Current profession: ${best.path}`:`Best current fit: ${best.path}`}</h2><p className="mt-2 max-w-3xl text-sm text-slate-300">Professional identity is preserved first; readiness scores compare fit within current, specialization, advancement and adjacent paths.</p></div><button onClick={onBack} className="rounded-xl border border-white/20 px-4 py-2">Back</button></div></section>

    <section className="grid gap-4 lg:grid-cols-4"><div className="app-card p-5 lg:col-span-2"><p className="text-xs font-bold uppercase text-indigo-600">{relationLabel(best)}</p><h3 className="mt-2 text-2xl font-black">{best.path}</h3><p className="mt-2 text-sm text-slate-600">{best.match_reason}</p></div><div className="app-card p-5"><p className="text-xs uppercase text-slate-400">Readiness</p><p className="mt-2 text-4xl font-black text-indigo-700">{pct(best)}%</p></div><div className="app-card p-5"><p className="text-xs uppercase text-slate-400">Annual wage</p><p className="mt-2 text-2xl font-black">{salaryFor(best)||'Not available'}</p><p className="mt-1 text-xs text-slate-500">{salaryFor(best)?'Confirmed BLS/OEWS mapping':'No confirmed official market mapping yet'}</p></div></section>

    <section className="app-card overflow-hidden"><div className="border-b p-6"><div className="flex justify-between gap-3"><div><p className="text-xs font-bold uppercase text-teal-700">Career comparison</p><h3 className="mt-1 text-xl font-bold">Leading paths from your current evidence</h3></div>{marketLoading&&<span className="text-xs text-slate-400">Refreshing market data…</span>}</div></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-4">Career</th><th className="p-4">Relationship</th><th className="p-4">Match</th><th className="p-4">Matched</th><th className="p-4">Gaps</th><th className="p-4">Wage</th></tr></thead><tbody>{recs.slice(0,5).map(r=><tr key={r.id||r.path} className="border-t"><td className="p-4 font-bold">{r.path}</td><td className="p-4">{relationLabel(r)}</td><td className="p-4">{pct(r)}%</td><td className="p-4">{safe(r.matched_skills).length}</td><td className="p-4">{safe(r.missing_skills).length}</td><td className="p-4">{salaryFor(r)||'Not available'}</td></tr>)}</tbody></table></div></section>

    <section className="space-y-4">{recs.map((r,i)=><article key={r.id||r.path} className={`app-card p-6 ${i===0?'border-indigo-200':''}`}><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><p className="text-xs font-bold uppercase text-indigo-600">{relationLabel(r)}</p><h3 className="mt-1 text-xl font-black">{r.path}</h3><p className="mt-2 text-sm text-slate-600">{r.match_reason}</p><p className="mt-3 text-sm"><b>Matching evidence:</b> {safe(r.matched_skills).join(' · ')||'None mapped'}</p><p className="mt-2 text-sm"><b>Core gaps:</b> {safe(r.missing_skills).join(' · ')||'No mapped core gaps'}</p></div><div className="text-right"><div className="text-3xl font-black text-indigo-700">{pct(r)}%</div><button onClick={()=>{setSelected(r);setTab('overview')}} className="mt-3 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">View details & roadmap</button></div></div></article>)}</section>

    {selectedRec&&<section className="app-card overflow-hidden"><div className="border-b p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-indigo-600">Career details</p><h3 className="text-2xl font-black">{selectedRec.path}</h3></div><div className="flex flex-wrap gap-2">{['overview','market','certifications','degrees','roadmap','resources'].map(t=><button key={t} onClick={()=>setTab(t)} className={`rounded-xl px-3 py-2 text-sm font-semibold ${tab===t?'bg-slate-950 text-white':'bg-slate-100 text-slate-700'}`}>{t}</button>)}</div></div></div><div className="p-6">
      {tab==='overview'&&<div><h4 className="font-bold">Why this career fits</h4><p className="mt-2 text-sm text-slate-600">{bp.career_summary||selectedRec.match_reason}</p>{safe(selectedRec.missing_skills).length>0&&<div className="mt-6"><h4 className="font-bold">Priority development areas</h4><div className="mt-3 grid gap-3 md:grid-cols-2">{safe(selectedRec.missing_skills).map(g=><div key={g} className="rounded-xl border p-4"><b>Strengthen {g}</b><p className="mt-1 text-sm text-slate-600">Build recent, profession-appropriate evidence for this competency.</p></div>)}</div></div>}</div>}
      {tab==='market'&&<div>{selectedMarket?.bls?.available?<div className="grid gap-4 md:grid-cols-2"><div className="rounded-xl border p-5"><p className="text-xs uppercase text-slate-400">Annual wage</p><p className="mt-2 text-3xl font-black">{money(selectedMarket.bls.mean_annual_wage)}</p></div><div className="rounded-xl border p-5"><p className="text-xs uppercase text-slate-400">National employment</p><p className="mt-2 text-3xl font-black">{num(selectedMarket.bls.employment)}</p></div><div className="md:col-span-2 rounded-xl bg-slate-50 p-5"><p className="text-xs font-bold uppercase text-slate-400">Official occupation used for market statistics</p><b>{selectedMarket.bls.mapped_occupation||selectedMarket.bls.occupation_title}</b>{selectedMarket?.onet?.occupation_title&&<p className="mt-1 text-sm text-slate-600">O*NET occupation: {selectedMarket.onet.occupation_title}</p>}<p className="mt-2 text-sm text-slate-600">Mapped through {selectedMarket?.title_resolution?.method||selectedMarket.bls.mapping_method||'validated occupation mapping'}. Specialty titles may use a broader official SOC occupation for wage and employment statistics.</p></div></div>:<div><p className="text-sm text-slate-600">No confirmed BLS/OEWS mapping is available yet for this specialty title. The app will not invent salary or employment figures.</p>{selectedMarket?.onet?.available&&<div className="mt-4 rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-400">Closest confirmed O*NET occupation</p><b>{selectedMarket.onet.occupation_title}</b><p className="mt-1 text-sm text-slate-600">Official occupation detail is available even though a wage/employment crosswalk was not confirmed.</p></div>}</div>}</div>}
      {tab==='certifications'&&<div><h4 className="font-bold">Credentials already evidenced</h4><div className="mt-3 space-y-2">{existingCredentials.length?existingCredentials.map((c,i)=><div key={i} className="rounded-xl border p-4"><b>{typeof c==='string'?c:c?.name}</b><p className="text-xs text-slate-500">Resume evidence, not independent verification</p></div>):<p className="text-sm text-slate-500">No resume credential detected.</p>}</div><h4 className="mt-6 font-bold">Recommended credentials</h4><div className="mt-3 space-y-2">{recommendedCredentials.length?recommendedCredentials.map((c,i)=><div key={i} className="rounded-xl border p-4"><b>{typeof c==='string'?c:c?.name}</b>{typeof c!=='string'&&c?.provider&&<p className="text-sm text-slate-600">{c.provider}</p>}</div>):<p className="text-sm text-slate-500">No additional credential is currently suggested.</p>}</div></div>}
      {tab==='degrees'&&<div><h4 className="font-bold">Degree guidance</h4><p className="mt-2 text-sm text-slate-600">{degreeGuidance}</p></div>}
      {tab==='roadmap'&&<div>{roadmap.length?roadmap.map(([period,items])=><div key={period} className="mb-5"><h4 className="font-bold">{period}</h4><ol className="mt-2 space-y-2">{items.map((x,i)=><li key={i} className="rounded-xl border p-3 text-sm"><b>{i+1}.</b> {x}</li>)}</ol></div>):<p className="text-sm text-slate-500">No roadmap actions were returned for this career.</p>}{alignedCourses.length>0&&<div className="mt-6"><h4 className="font-bold">Your ongoing courses that address gaps</h4>{alignedCourses.map(c=><div key={c.id} className="mt-2 rounded-xl border p-3 text-sm">{c.course_name}</div>)}</div>}</div>}
      {tab==='resources'&&<div><h4 className="font-bold">Career-specific official resources</h4><p className="mt-1 text-sm text-slate-500">Resources are tied to the selected career and confirmed occupation mapping. Unconfirmed wage sources are not shown as if they were validated.</p><div className="mt-4 grid gap-3 md:grid-cols-2">{resources.map((r,i)=><div key={i} className="rounded-xl border p-4"><p className="text-xs font-bold uppercase text-indigo-600">{r.type}</p><b>{r.name}</b><p className="mt-1 text-sm text-slate-600">{r.purpose}</p><a href={r.url} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-lg bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100">Open official resource</a></div>)}</div>{!resources.length&&<p className="mt-4 text-sm text-slate-500">No validated external resource is available for this career yet.</p>}</div>}
    </div></section>}
  </div>;
}
export default CareerRecommendationsV2;
