import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const list = (value) => Array.isArray(value) ? value : value ? [value] : [];

const SavedCareerHistory = ({ user }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reports, setReports] = useState([]);
  const [plans, setPlans] = useState([]);
  const [selected, setSelected] = useState(null);

  const loadHistory = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [reportResult, planResult] = await Promise.all([
        supabase.from('career_reports').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('learning_plans').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)
      ]);
      if (reportResult.error) throw reportResult.error;
      if (planResult.error) throw planResult.error;
      setReports(reportResult.data || []);
      setPlans(planResult.data || []);
    } catch (err) {
      setError(err?.message || 'Saved career history could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadHistory();
  }, [open, user?.id]);

  const renderItems = (items) => {
    const values = list(items).filter(Boolean);
    if (!values.length) return <p className="text-sm text-slate-400">No items saved.</p>;
    return <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{values.map((item, index) => <li key={index}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>)}</ul>;
  };

  const selectedData = selected?.kind === 'report' ? selected.row.report_data : selected?.row?.plan_data;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[5.25rem] right-5 z-40 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xl transition hover:-translate-y-0.5 hover:border-indigo-300 hover:text-indigo-700"
      >
        <span aria-hidden="true">▤</span> Saved Plans
      </button>

      {open && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4">
        <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
          <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Saved student history</p><h2 className="mt-1 text-xl font-bold text-slate-900">Career Reports & Learning Plans</h2></div>
            <button onClick={() => setOpen(false)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200">Close</button>
          </header>

          {error && <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}

          <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[320px_1fr]">
            <aside className="overflow-y-auto border-r border-slate-200 bg-slate-50 p-4">
              {loading && <p className="py-8 text-center text-sm text-slate-500">Loading saved history...</p>}
              {!loading && <>
                <h3 className="mb-2 text-sm font-bold text-slate-700">Career reports</h3>
                <div className="space-y-2">{reports.map((row) => <button key={row.id} onClick={() => setSelected({ kind: 'report', row })} className={`w-full rounded-xl border p-3 text-left ${selected?.row?.id === row.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-200'}`}><p className="text-sm font-semibold text-slate-800">Career Intelligence Report</p><p className="mt-1 text-xs text-slate-400">{row.created_at ? new Date(row.created_at).toLocaleString() : ''}</p></button>)}{reports.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-400">No saved reports yet.</p>}</div>
                <h3 className="mb-2 mt-5 text-sm font-bold text-slate-700">Learning plans</h3>
                <div className="space-y-2">{plans.map((row) => <button key={row.id} onClick={() => setSelected({ kind: 'plan', row })} className={`w-full rounded-xl border p-3 text-left ${selected?.row?.id === row.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-200'}`}><p className="text-sm font-semibold text-slate-800">{row.target_career_title || 'Career Learning Plan'}</p><p className="mt-1 text-xs text-slate-400">{row.created_at ? new Date(row.created_at).toLocaleString() : ''}</p></button>)}{plans.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-400">No saved plans yet.</p>}</div>
              </>}
            </aside>

            <main className="overflow-y-auto p-5 sm:p-6">
              {!selected && <div className="grid min-h-[300px] place-items-center text-center"><div><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-2xl text-indigo-600">▤</div><h3 className="mt-4 font-bold text-slate-800">Select a saved report or plan</h3><p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">Your generated career reports and 30-day, 6-month, and 1-year plans remain available here after you return to the application.</p></div></div>}

              {selected?.kind === 'plan' && <div className="space-y-5"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Learning plan</p><h3 className="mt-1 text-2xl font-bold text-slate-900">{selected.row.target_career_title || 'Career Development Plan'}</h3><p className="mt-1 text-sm text-slate-400">Status: {selected.row.status || 'active'}</p></div><section className="rounded-xl border border-slate-200 p-4"><h4 className="font-bold text-slate-800">Next 30 days</h4>{renderItems(selected.row.plan_30_days?.items)}</section><section className="rounded-xl border border-slate-200 p-4"><h4 className="font-bold text-slate-800">Next 6 months</h4>{renderItems(selected.row.plan_6_months?.items)}</section><section className="rounded-xl border border-slate-200 p-4"><h4 className="font-bold text-slate-800">Next 1 year</h4>{renderItems(selected.row.plan_1_year?.items)}</section><div className="grid gap-4 sm:grid-cols-2"><section className="rounded-xl bg-indigo-50 p-4"><h4 className="font-bold text-indigo-900">Recommended skills</h4>{renderItems(selected.row.recommended_skills)}</section><section className="rounded-xl bg-violet-50 p-4"><h4 className="font-bold text-violet-900">Recommended certifications</h4>{renderItems(selected.row.recommended_certifications)}</section></div></div>}

              {selected?.kind === 'report' && <div className="space-y-5"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Career report</p><h3 className="mt-1 text-2xl font-bold text-slate-900">Saved Career Intelligence</h3></div><section className="rounded-xl border border-slate-200 p-4"><h4 className="font-bold text-slate-800">Executive summary</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedData?.executive_summary || 'No summary saved.'}</p></section>{selectedData?.career_readiness && <section className="rounded-xl bg-indigo-50 p-4"><h4 className="font-bold text-indigo-900">Career readiness</h4><p className="mt-2 text-sm text-indigo-800"><strong>Current level:</strong> {selectedData.career_readiness.current_level || 'Not specified'}</p><p className="mt-1 text-sm text-indigo-800"><strong>Strongest path:</strong> {selectedData.career_readiness.strongest_path || 'Not specified'}</p></section>}<div className="grid gap-4 sm:grid-cols-3"><section className="rounded-xl border border-slate-200 p-4"><h4 className="font-bold text-slate-800">30 days</h4>{renderItems(selectedData?.action_plan?.['30_days'])}</section><section className="rounded-xl border border-slate-200 p-4"><h4 className="font-bold text-slate-800">6 months</h4>{renderItems(selectedData?.action_plan?.['6_months'])}</section><section className="rounded-xl border border-slate-200 p-4"><h4 className="font-bold text-slate-800">1 year</h4>{renderItems(selectedData?.action_plan?.['1_year'])}</section></div></div>}
            </main>
          </div>
        </div>
      </div>}
    </>
  );
};

export default SavedCareerHistory;
