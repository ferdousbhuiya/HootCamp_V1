import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const apiBase = () => (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const newKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const suggested = [
  'Which career path fits my current profile best?',
  'What should I learn next without repeating my ongoing courses?',
  'Can I apply for jobs now, and what should I study next?',
  'What are my biggest skill gaps for my target career?'
];

const CareerAdvisorV2 = ({ user }) => {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [response, setResponse] = useState(null);
  const [history, setHistory] = useState([]);

  const loadHistory = async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('career_findings').select('*').eq('user_id', user.id).eq('finding_type', 'ai_advisor_response').order('created_at', { ascending: false }).limit(10);
    setHistory(data || []);
  };

  useEffect(() => { if (open) loadHistory(); }, [open, user?.id]);

  const getContext = async () => {
    const [profileResult, academicResult, subjectsResult, goalResult, skillsResult, certsResult, coursesResult, careersResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('academic_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('academic_subjects').select('*').eq('user_id', user.id),
      supabase.from('career_goals').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('skill_tracking').select('*').eq('user_id', user.id),
      supabase.from('saved_certifications').select('*').eq('user_id', user.id),
      supabase.from('ongoing_courses').select('*').eq('user_id', user.id),
      supabase.from('career_recommendations').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8)
    ]);
    const failure = [profileResult, academicResult, subjectsResult, goalResult, skillsResult, certsResult, coursesResult, careersResult].find((item) => item.error);
    if (failure?.error) throw failure.error;
    return {
      profile: {
        ...(profileResult.data || {}),
        academic_profile: academicResult.data || null,
        academic_subjects: subjectsResult.data || [],
        career_goal: goalResult.data || null
      },
      skills: skillsResult.data || [],
      certifications: certsResult.data || [],
      courses: coursesResult.data || [],
      career_recommendations: careersResult.data || []
    };
  };

  const ask = async (event) => {
    event?.preventDefault?.();
    const trimmed = question.trim();
    if (trimmed.length < 2 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const context = await getContext();
      const apiResponse = await fetch(`${apiBase()}/api/career-advisor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, ...context })
      });
      const body = await apiResponse.json().catch(() => ({}));
      if (!apiResponse.ok) throw new Error(body.detail || `Advisor request failed (${apiResponse.status})`);
      if (body.status !== 'success' || !body.advisor) throw new Error('Advisor returned an incomplete response.');
      setResponse(body.advisor);
      const { error: saveError } = await supabase.from('career_findings').insert({
        user_id: user.id,
        client_record_key: `advisor:${newKey()}`,
        finding_type: 'ai_advisor_response',
        source_type: 'unified_student_profile',
        title: trimmed.slice(0,180),
        status: 'completed',
        data: { question: trimmed, advisor: body.advisor, context_counts: { skills: context.skills.length, certifications: context.certifications.length, courses: context.courses.length, career_recommendations: context.career_recommendations.length, academic_subjects: context.profile.academic_subjects.length } },
        updated_at: new Date().toISOString()
      });
      if (saveError) throw saveError;
      await loadHistory();
      setQuestion('');
    } catch (err) {
      setError(err.message || 'The advisor could not answer right now.');
    } finally {
      setLoading(false);
    }
  };

  const renderList = (items) => Array.isArray(items) && items.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{items.map((item,index) => <li key={index}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>)}</ul> : null;

  return <>
    <div className="mx-auto mb-8 mt-3 flex max-w-7xl justify-end px-4 sm:px-6">
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"><span className="grid h-7 w-7 place-items-center rounded-full bg-white/10">AI</span> Career Advisor</button>
    </div>

    {open && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4"><div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"><header className="flex items-center justify-between border-b border-slate-200 bg-slate-950 px-5 py-4 text-white sm:px-6"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Unified profile guidance</p><h2 className="mt-1 text-xl font-bold">AI Career Advisor</h2></div><button onClick={() => setOpen(false)} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold">Close</button></header>
      <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[1fr_280px]"><main className="overflow-y-auto p-5 sm:p-6"><div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm leading-6 text-indigo-900">The advisor now uses academic subjects, target career, ongoing courses, certificates, tracked skills, resume evidence and saved career matches. You can ask about finding a job and continuing your studies in the same question.</div><div className="mt-4 flex flex-wrap gap-2">{suggested.map((item) => <button key={item} onClick={() => setQuestion(item)} className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:border-indigo-300">{item}</button>)}</div><form onSubmit={ask} className="mt-5"><label className="block text-sm font-semibold text-slate-700">Your question<textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={4} maxLength={1200} placeholder="Example: Which jobs can I apply for now, and which course should I take next semester?" className="mt-2 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-indigo-400" /></label><div className="mt-3 flex items-center justify-between"><span className="text-xs text-slate-400">{question.length}/1200</span><button disabled={loading || question.trim().length < 2} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Analyzing profile…' : 'Ask advisor'}</button></div></form>{error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}{response && <article className="mt-6 space-y-5 rounded-2xl border border-slate-200 p-5"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">Advisor response</p><p className="mt-2 whitespace-pre-wrap leading-7 text-slate-800">{response.answer || 'No answer returned.'}</p></div>{response.profile_evidence_used?.length > 0 && <div><h3 className="font-semibold">Profile evidence used</h3>{renderList(response.profile_evidence_used)}</div>}{response.recommended_actions?.length > 0 && <div><h3 className="font-semibold">Recommended actions</h3>{renderList(response.recommended_actions)}</div>}{response.missing_information?.length > 0 && <div><h3 className="font-semibold">Information that would improve this answer</h3>{renderList(response.missing_information)}</div>}{response.caution && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{response.caution}</div>}</article>}</main><aside className="hidden overflow-y-auto border-l border-slate-200 bg-slate-50 p-4 md:block"><h3 className="text-sm font-bold text-slate-800">Recent history</h3><div className="mt-4 space-y-2">{history.map((item) => <button key={item.id} onClick={() => { setResponse(item?.data?.advisor || null); setQuestion(item?.data?.question || ''); }} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left"><p className="line-clamp-2 text-sm font-medium text-slate-800">{item?.data?.question || item.title}</p><p className="mt-1 text-xs text-slate-400">{item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}</p></button>)}</div></aside></div></div></div>}
  </>;
};

export default CareerAdvisorV2;
