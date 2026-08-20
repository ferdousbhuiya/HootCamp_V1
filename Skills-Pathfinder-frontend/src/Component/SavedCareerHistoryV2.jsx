import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const list = (value) => Array.isArray(value) ? value : value ? [value] : [];
const phases = [
  ['30_days', 'Next 30 days', 'plan_30_days'],
  ['6_months', 'Next 6 months', 'plan_6_months'],
  ['1_year', 'Next 1 year', 'plan_1_year']
];

const SavedCareerHistoryV2 = ({ user }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
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
      if (selected?.kind === 'plan') {
        const row = (planResult.data || []).find((item) => item.id === selected.row.id);
        if (row) setSelected({ kind: 'plan', row });
      }
    } catch (err) {
      setError(err.message || 'Saved career history could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) loadHistory(); }, [open, user?.id]);

  const planProgress = useMemo(() => {
    if (selected?.kind !== 'plan') return { completed: 0, total: 0, percent: 0 };
    const progress = selected.row.plan_data?.progress || {};
    let completed = 0;
    let total = 0;
    phases.forEach(([key,,column]) => {
      const items = list(selected.row[column]?.items);
      const checks = list(progress[key]);
      total += items.length;
      completed += items.filter((_item,index) => checks[index]).length;
    });
    return { completed, total, percent: total ? Math.round(completed / total * 100) : 0 };
  }, [selected]);

  const togglePlanItem = async (phaseKey, column, index) => {
    if (selected?.kind !== 'plan' || savingProgress) return;
    const row = selected.row;
    const currentProgress = row.plan_data?.progress || {};
    const items = list(row[column]?.items);
    const checks = [...list(currentProgress[phaseKey])];
    while (checks.length < items.length) checks.push(false);
    checks[index] = !checks[index];
    const nextProgress = { ...currentProgress, [phaseKey]: checks };
    const allChecks = phases.flatMap(([key,,col]) => {
      const phaseItems = list(row[col]?.items);
      const phaseChecks = key === phaseKey ? checks : list(nextProgress[key]);
      return phaseItems.map((_item,itemIndex) => Boolean(phaseChecks[itemIndex]));
    });
    const allComplete = allChecks.length > 0 && allChecks.every(Boolean);
    setSavingProgress(true);
    try {
      const { data, error: updateError } = await supabase.from('learning_plans').update({
        plan_data: { ...(row.plan_data || {}), progress: nextProgress },
        status: allComplete ? 'completed' : 'active',
        updated_at: new Date().toISOString()
      }).eq('id', row.id).eq('user_id', user.id).select('*').single();
      if (updateError) throw updateError;
      setPlans((current) => current.map((item) => item.id === data.id ? data : item));
      setSelected({ kind: 'plan', row: data });
      await supabase.from('career_findings').upsert({
        user_id: user.id,
        client_record_key: `plan-progress:${row.id}`,
        finding_type: 'learning_plan_progress',
        source_type: 'learning_plans',
        source_id: row.id,
        title: row.target_career_title || 'Career learning plan',
        status: allComplete ? 'completed' : 'active',
        data: { target_career_title: row.target_career_title || null, progress: nextProgress, completed_items: allChecks.filter(Boolean).length, total_items: allChecks.length, percent_complete: allChecks.length ? Math.round(allChecks.filter(Boolean).length / allChecks.length * 100) : 0 },
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,client_record_key' });
    } catch (err) {
      setError(err.message || 'Plan progress could not be saved.');
    } finally {
      setSavingProgress(false);
    }
  };

  const renderItems = (items) => {
    const values = list(items).filter(Boolean);
    if (!values.length) return <p className="mt-2 text-sm text-slate-400">No items saved.</p>;
    return <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{values.map((item,index) => <li key={index}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>)}</ul>;
  };

  const renderPhase = (row, phaseKey, title, column) => {
    const items = list(row[column]?.items).filter(Boolean);
    const checks = list(row.plan_data?.progress?.[phaseKey]);
    return <section className="rounded-xl border border-slate-200 p-4"><div className="flex justify-between gap-3"><h4 className="font-bold text-slate-800">{title}</h4><span className="text-xs text-slate-400">{items.filter((_item,index) => checks[index]).length}/{items.length}</span></div><div className="mt-3 space-y-2">{items.map((item,index) => <label key={`${phaseKey}-${index}`} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${checks[index] ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}><input type="checkbox" checked={Boolean(checks[index])} disabled={savingProgress} onChange={() => togglePlanItem(phaseKey,column,index)} className="mt-1 h-4 w-4" /><span className={`text-sm ${checks[index] ? 'text-emerald-800 line-through' : 'text-slate-700'}`}>{typeof item === 'string' ? item : JSON.stringify(item)}</span></label>)}</div></section>;
  };

  return <>
    <div className="mx-auto mt-4 flex max-w-7xl justify-end px-4 sm:px-6">
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-indigo-300 hover:text-indigo-700"><span aria-hidden="true">▤</span> Saved Plans & Reports</button>
    </div>

    {open && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4"><div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"><header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Saved student history</p><h2 className="mt-1 text-xl font-bold text-slate-900">Career Reports & Trackable Plans</h2></div><button onClick={() => setOpen(false)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600">Close</button></header>
      {error && <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[320px_1fr]"><aside className="overflow-y-auto border-r border-slate-200 bg-slate-50 p-4">{loading ? <p className="py-8 text-center text-sm text-slate-500">Loading saved history…</p> : <><h3 className="mb-2 text-sm font-bold text-slate-700">Career reports</h3><div className="space-y-2">{reports.map((row) => <button key={row.id} onClick={() => setSelected({ kind: 'report', row })} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-indigo-300"><p className="text-sm font-semibold text-slate-800">Career Intelligence Report</p><p className="mt-1 text-xs text-slate-400">{new Date(row.created_at).toLocaleString()}</p></button>)}</div><h3 className="mb-2 mt-5 text-sm font-bold text-slate-700">Learning plans</h3><div className="space-y-2">{plans.map((row) => <button key={row.id} onClick={() => setSelected({ kind: 'plan', row })} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-indigo-300"><p className="text-sm font-semibold text-slate-800">{row.target_career_title || 'Career Learning Plan'}</p><p className="mt-1 text-xs text-slate-400">{row.status || 'active'}</p></button>)}</div></>}</aside>
      <main className="overflow-y-auto p-5 sm:p-6">{!selected && <div className="grid min-h-[300px] place-items-center text-center text-sm text-slate-500">Select a saved report or learning plan.</div>}{selected?.kind === 'plan' && <div className="space-y-5"><div><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">Learning plan</p><h3 className="mt-1 text-2xl font-bold text-slate-900">{selected.row.target_career_title || 'Career Development Plan'}</h3></div><div className="text-right"><p className="text-3xl font-black text-indigo-700">{planProgress.percent}%</p><p className="text-xs text-slate-400">{planProgress.completed}/{planProgress.total} complete</p></div></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${planProgress.percent}%` }} /></div></div>{phases.map(([key,title,column]) => <div key={key}>{renderPhase(selected.row,key,title,column)}</div>)}<div className="grid gap-4 sm:grid-cols-2"><section className="rounded-xl bg-indigo-50 p-4"><h4 className="font-bold text-indigo-900">Recommended skills</h4>{renderItems(selected.row.recommended_skills)}</section><section className="rounded-xl bg-violet-50 p-4"><h4 className="font-bold text-violet-900">Recommended certifications</h4>{renderItems(selected.row.recommended_certifications)}</section></div></div>}{selected?.kind === 'report' && <div className="space-y-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">Saved Career Intelligence</p><section className="rounded-xl border border-slate-200 p-4"><h4 className="font-bold">Executive summary</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.row.report_data?.executive_summary || 'No summary saved.'}</p></section>{selected.row.report_data?.career_readiness && <section className="rounded-xl bg-indigo-50 p-4"><p className="text-sm"><strong>Strongest path:</strong> {selected.row.report_data.career_readiness.strongest_path || 'Not specified'}</p></section>}<div className="grid gap-4 sm:grid-cols-3">{[['30_days','30 days'],['6_months','6 months'],['1_year','1 year']].map(([key,label]) => <section key={key} className="rounded-xl border p-4"><h4 className="font-bold">{label}</h4>{renderItems(selected.row.report_data?.action_plan?.[key])}</section>)}</div></div>}</main></div></div></div>}
  </>;
};

export default SavedCareerHistoryV2;
