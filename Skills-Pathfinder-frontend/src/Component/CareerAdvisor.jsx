import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const apiBase = () => (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const newQuestionKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const suggestedQuestions = [
  'Which career path fits my current profile best?',
  'What should I learn next without repeating my ongoing courses?',
  'Can I apply for jobs now, and which titles should I target?',
  'What are my biggest skill gaps for my strongest career match?'
];

const CareerAdvisor = ({ user }) => {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [response, setResponse] = useState(null);
  const [history, setHistory] = useState([]);

  const loadHistory = async () => {
    if (!user?.id) return;
    const { data, error: historyError } = await supabase
      .from('career_findings')
      .select('*')
      .eq('user_id', user.id)
      .eq('finding_type', 'ai_advisor_response')
      .order('created_at', { ascending: false })
      .limit(10);
    if (historyError) {
      console.error('Advisor history could not be loaded:', historyError);
      return;
    }
    setHistory(data || []);
  };

  useEffect(() => {
    if (open) loadHistory();
  }, [open, user?.id]);

  const getContext = async () => {
    const [profileResult, skillsResult, certsResult, coursesResult, careersResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('skill_tracking').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
      supabase.from('saved_certifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('ongoing_courses').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('career_recommendations').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8)
    ]);

    for (const result of [profileResult, skillsResult, certsResult, coursesResult, careersResult]) {
      if (result.error) throw result.error;
    }

    return {
      profile: profileResult.data || {},
      skills: skillsResult.data || [],
      certifications: certsResult.data || [],
      courses: coursesResult.data || [],
      career_recommendations: careersResult.data || []
    };
  };

  const askAdvisor = async (e) => {
    e?.preventDefault?.();
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    try {
      const context = await getContext();
      const apiResponse = await fetch(`${apiBase()}/api/career-advisor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, ...context })
      });
      if (!apiResponse.ok) {
        const body = await apiResponse.json().catch(() => ({}));
        throw new Error(body.detail || `Advisor request failed (${apiResponse.status})`);
      }

      const payload = await apiResponse.json();
      if (payload.status !== 'success' || !payload.advisor) throw new Error('Advisor returned an incomplete response.');
      setResponse(payload.advisor);

      const clientKey = `advisor:${newQuestionKey()}`;
      const { error: saveError } = await supabase.from('career_findings').insert({
        user_id: user.id,
        client_record_key: clientKey,
        finding_type: 'ai_advisor_response',
        source_type: 'structured_student_profile',
        title: trimmed.slice(0, 180),
        status: 'completed',
        data: {
          question: trimmed,
          advisor: payload.advisor,
          context_counts: {
            skills: context.skills.length,
            certifications: context.certifications.length,
            courses: context.courses.length,
            career_recommendations: context.career_recommendations.length
          }
        },
        updated_at: new Date().toISOString()
      });
      if (saveError) throw saveError;

      await loadHistory();
      setQuestion('');
    } catch (err) {
      setError(err?.message || 'The advisor could not answer right now.');
    } finally {
      setLoading(false);
    }
  };

  const viewHistoryItem = (item) => {
    setResponse(item?.data?.advisor || null);
    setQuestion(item?.data?.question || '');
    setError(null);
  };

  const renderList = (items = []) => {
    if (!Array.isArray(items) || items.length === 0) return null;
    return <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{items.map((item, index) => <li key={index}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>)}</ul>;
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-2xl shadow-slate-900/25 transition hover:-translate-y-0.5 hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200"
        aria-label="Open AI Career Advisor"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10" aria-hidden="true">AI</span>
        Career Advisor
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <header className="flex items-center justify-between border-b border-slate-200 bg-slate-950 px-5 py-4 text-white sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Profile-aware guidance</p>
                <h2 className="mt-1 text-xl font-bold">AI Career Advisor</h2>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20">Close</button>
            </header>

            <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[1fr_280px]">
              <main className="overflow-y-auto p-5 sm:p-6">
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm leading-6 text-indigo-900">
                  Ask about career fit, job readiness, skill gaps, certifications, or what to learn next. Answers use your saved Skills Pathfinder profile instead of generic chat context.
                </div>

                <div className="mt-4 flex flex-wrap gap-2">{suggestedQuestions.map((item) => <button key={item} type="button" onClick={() => setQuestion(item)} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700">{item}</button>)}</div>

                <form onSubmit={askAdvisor} className="mt-5">
                  <label className="block text-sm font-semibold text-slate-700">Your question</label>
                  <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={4} maxLength={1200} placeholder="Example: Does my current Power BI course close one of my Data Analyst skill gaps?" className="mt-2 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
                  <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-slate-400">{question.length}/1200</span><button disabled={loading || question.trim().length < 2} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{loading ? 'Analyzing profile...' : 'Ask advisor'}</button></div>
                </form>

                {error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}

                {response && <article className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">Advisor response</p><p className="mt-2 whitespace-pre-wrap leading-7 text-slate-800">{response.answer || 'No answer returned.'}</p></div>{response.profile_evidence_used?.length > 0 && <div><h3 className="font-semibold text-slate-900">Profile evidence used</h3>{renderList(response.profile_evidence_used)}</div>}{response.recommended_actions?.length > 0 && <div><h3 className="font-semibold text-slate-900">Recommended actions</h3>{renderList(response.recommended_actions)}</div>}{response.missing_information?.length > 0 && <div><h3 className="font-semibold text-slate-900">Information that would improve this answer</h3>{renderList(response.missing_information)}</div>}{response.caution && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{response.caution}</div>}<p className="text-xs text-slate-400">This response is saved automatically to your account.</p></article>}
              </main>

              <aside className="hidden overflow-y-auto border-l border-slate-200 bg-slate-50 p-4 md:block">
                <h3 className="text-sm font-bold text-slate-800">Recent advisor history</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">Your latest saved questions and answers.</p>
                <div className="mt-4 space-y-2">{history.map((item) => <button key={item.id} onClick={() => viewHistoryItem(item)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-indigo-300"><p className="line-clamp-2 text-sm font-medium text-slate-800">{item?.data?.question || item.title || 'Advisor question'}</p><p className="mt-1 text-xs text-slate-400">{item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}</p></button>)}{history.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">No advisor history yet.</p>}</div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CareerAdvisor;
