import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import html2pdf from 'html2pdf.js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const apiBase = () => (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const asList = (value) => Array.isArray(value) ? value : value ? [value] : [];
const safe = (value) => Array.isArray(value) ? value : [];

const CareerReportV2 = ({ user, profile, skills = [], certifications = [], courses = [], onClose }) => {
  const [loading, setLoading] = useState(true);
  const [advice, setAdvice] = useState(null);
  const [error, setError] = useState(null);
  const [savedReportId, setSavedReportId] = useState(null);
  const [academic, setAcademic] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [goal, setGoal] = useState(null);
  const [careerRows, setCareerRows] = useState([]);
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef(null);
  const generatedRef = useRef(false);

  useEffect(() => {
    if (generatedRef.current) return;
    generatedRef.current = true;
    generate();
  }, []);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const [academicResult, subjectResult, goalResult, careerResult] = await Promise.all([
        supabase.from('academic_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('academic_subjects').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('career_goals').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('career_recommendations').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8)
      ]);
      const failure = [academicResult, subjectResult, goalResult, careerResult].find((item) => item.error);
      if (failure?.error) throw failure.error;
      setAcademic(academicResult.data || null);
      setSubjects(subjectResult.data || []);
      setGoal(goalResult.data || null);
      setCareerRows(careerResult.data || []);

      const skillNames = skills.map((item) => item?.skill_name || item?.name || (typeof item === 'string' ? item : '')).filter(Boolean);
      const response = await fetch(`${apiBase()}/api/generate-career-advice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: skillNames, certifications, courses, career_recommendations: careerResult.data || [] })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || `Career advice request failed (${response.status})`);
      if (body.status !== 'success' || !body.advice) throw new Error('Career advice response was incomplete.');

      const enrichedAdvice = {
        ...body.advice,
        academic_profile: academicResult.data || null,
        academic_subjects: subjectResult.data || [],
        career_goal: goalResult.data || null,
        career_comparison: careerResult.data || []
      };
      setAdvice(enrichedAdvice);

      const { data: reportRow, error: reportError } = await supabase.from('career_reports').insert({
        user_id: user.id,
        report_type: 'career_intelligence',
        report_data: enrichedAdvice,
        profile_snapshot: { ...(profile || {}), academic_profile: academicResult.data || null, academic_subjects: subjectResult.data || [], career_goal: goalResult.data || null },
        skills_snapshot: skills,
        certifications_snapshot: certifications,
        courses_snapshot: courses,
        updated_at: new Date().toISOString()
      }).select('id').single();
      if (reportError) throw reportError;
      setSavedReportId(reportRow.id);

      const plan = body.advice.action_plan || {};
      const strongestPath = body.advice.career_readiness?.strongest_path || goalResult.data?.career_title || careerResult.data?.[0]?.career_title || null;
      const { error: planError } = await supabase.from('learning_plans').insert({
        user_id: user.id,
        target_career_id: careerResult.data?.[0]?.career_id || null,
        target_career_title: strongestPath,
        plan_30_days: { items: asList(plan['30_days']) },
        plan_6_months: { items: asList(plan['6_months']) },
        plan_1_year: { items: asList(plan['1_year']) },
        recommended_skills: body.advice.recommended_next_skills || [],
        recommended_courses: [],
        recommended_certifications: body.advice.recommended_certifications || [],
        ongoing_course_alignment: body.advice.ongoing_course_alignment || [],
        plan_data: { ...body.advice, progress: { '30_days': [], '6_months': [], '1_year': [] } },
        status: 'active',
        updated_at: new Date().toISOString()
      });
      if (planError) throw planError;
    } catch (err) {
      console.error('Career report error:', err);
      setError(err.message || 'Could not generate and save the report.');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    if (!reportRef.current || exporting) return;
    setExporting(true);
    let host = null;
    try {
      const clone = reportRef.current.cloneNode(true);
      clone.style.width = '794px';
      clone.style.maxWidth = '794px';
      clone.style.height = 'auto';
      clone.style.maxHeight = 'none';
      clone.style.overflow = 'visible';
      clone.style.position = 'relative';
      clone.style.background = '#ffffff';
      clone.querySelectorAll('*').forEach((node) => {
        if (node instanceof HTMLElement) {
          if (node.style.overflowY === 'auto' || node.style.overflow === 'auto') node.style.overflow = 'visible';
          node.style.maxHeight = 'none';
        }
      });
      host = document.createElement('div');
      host.style.position = 'fixed';
      host.style.left = '-10000px';
      host.style.top = '0';
      host.style.width = '794px';
      host.style.background = '#ffffff';
      host.appendChild(clone);
      document.body.appendChild(host);

      await html2pdf().set({
        margin: [0.45, 0.45, 0.5, 0.45],
        filename: `Skills_Pathfinder_Report_${(user?.email || 'Student').replace(/[^a-z0-9._-]+/gi, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.96 },
        html2canvas: { scale: 1.5, useCORS: true, scrollX: 0, scrollY: 0, windowWidth: 794 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait', compress: true },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['.avoid-break'] }
      }).from(clone).save();
    } catch (err) {
      setError(`PDF export failed: ${err.message}`);
    } finally {
      if (host?.parentNode) host.parentNode.removeChild(host);
      setExporting(false);
    }
  };

  const renderList = (items, fallback = 'No item available.') => {
    const values = asList(items).filter(Boolean);
    if (!values.length) return <p className="text-sm text-gray-500">{fallback}</p>;
    return <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">{values.map((item,index) => <li key={index}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>)}</ul>;
  };

  if (loading) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><div className="rounded-xl bg-white p-8 text-center shadow-2xl"><div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" /><p className="text-lg font-semibold">Generating and saving your career report…</p></div></div>;

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gray-900/80 p-4"><div className="my-8 flex max-h-[92vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-2xl"><div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b bg-gray-50 p-4"><div><h2 className="text-xl font-bold text-gray-800">Career Intelligence Report</h2><p className="text-xs text-gray-500">{savedReportId ? 'Saved to your profile history' : 'Not saved yet'}</p></div><div className="flex gap-3"><button onClick={downloadPDF} disabled={!advice || exporting} className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50">{exporting ? 'Preparing all pages…' : 'Download PDF'}</button><button onClick={onClose} className="rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-800">Close</button></div></div>
    {error && <div className="m-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}<button onClick={generate} className="ml-3 rounded bg-red-100 px-3 py-1 text-sm">Retry</button></div>}
    <div className="overflow-y-auto">{advice && <article ref={reportRef} className="bg-white p-8 text-slate-800"><header className="mb-8 border-b-2 border-indigo-600 pb-6"><h1 className="text-4xl font-bold text-indigo-900">Skills Pathfinder</h1><p className="mt-2 text-xl text-gray-600">Comprehensive Career Development Report</p><p className="mt-2 text-sm text-gray-500">Generated for: {profile?.full_name || user?.email} · {new Date().toLocaleDateString()}</p></header>
      <section className="mb-8 avoid-break"><h2 className="mb-3 border-l-4 border-indigo-600 pl-3 text-2xl font-bold">Executive Summary</h2><p className="text-base leading-7 text-gray-700">{advice.executive_summary || 'No summary available.'}</p></section>
      <section className="mb-8 avoid-break"><h2 className="mb-4 border-l-4 border-indigo-600 pl-3 text-2xl font-bold">Student Profile Snapshot</h2><div className="grid grid-cols-2 gap-4 md:grid-cols-4"><div className="rounded-lg bg-gray-50 p-4 text-center"><p className="text-3xl font-bold text-indigo-600">{skills.length}</p><p className="text-sm text-gray-600">Skills</p></div><div className="rounded-lg bg-gray-50 p-4 text-center"><p className="text-3xl font-bold text-indigo-600">{certifications.length}</p><p className="text-sm text-gray-600">Certificates</p></div><div className="rounded-lg bg-gray-50 p-4 text-center"><p className="text-3xl font-bold text-indigo-600">{courses.length}</p><p className="text-sm text-gray-600">Courses</p></div><div className="rounded-lg bg-gray-50 p-4 text-center"><p className="text-3xl font-bold text-indigo-600">{subjects.length}</p><p className="text-sm text-gray-600">Subjects</p></div></div></section>
      {(academic || goal) && <section className="mb-8 avoid-break"><h2 className="mb-4 border-l-4 border-indigo-600 pl-3 text-2xl font-bold">Academic & Career Direction</h2><div className="rounded-lg border bg-sky-50 p-4 text-sm leading-6">{academic && <><p><strong>Institution:</strong> {academic.institution || 'Not recorded'}</p><p><strong>Program:</strong> {academic.program_name || academic.field_of_study || 'Not recorded'}</p><p><strong>Credits earned:</strong> {academic.credits_earned || 0}</p>{academic.expected_graduation_date && <p><strong>Expected graduation:</strong> {academic.expected_graduation_date}</p>}</>}{goal?.career_title && <p className="mt-2"><strong>Target career:</strong> {goal.career_title}</p>}</div>{subjects.length > 0 && <div className="mt-4"><h3 className="font-bold">Academic subjects</h3>{renderList(subjects.map((item) => `${item.subject_name} · ${item.credit_hours || 0} credits · ${item.status}`))}</div>}</section>}
      {advice.career_readiness && <section className="mb-8 avoid-break"><h2 className="mb-4 border-l-4 border-indigo-600 pl-3 text-2xl font-bold">Career Readiness</h2><div className="rounded-lg border bg-indigo-50 p-4"><p><strong>Current level:</strong> {advice.career_readiness.current_level || 'Not specified'}</p><p><strong>Strongest path:</strong> {advice.career_readiness.strongest_path || 'Not specified'}</p><div className="mt-3"><strong>Alternative paths</strong>{renderList(advice.career_readiness.alternative_paths)}</div><div className="mt-3"><strong>Major constraints</strong>{renderList(advice.career_readiness.major_constraints)}</div></div></section>}
      {careerRows.length > 0 && <section className="mb-8"><h2 className="mb-4 border-l-4 border-indigo-600 pl-3 text-2xl font-bold">Career Comparison</h2><div className="space-y-3">{careerRows.slice(0,5).map((row) => <div key={row.id} className="avoid-break rounded-lg border p-4"><div className="flex justify-between gap-4"><p className="font-bold">{row.career_title}</p><p className="font-bold text-indigo-700">{Math.round(Number(row.match_percentage ?? (Number(row.match_score || 0) * 100)))}%</p></div><p className="mt-1 text-sm text-gray-600">Matched skills: {safe(row.matched_skills).length} · Remaining gaps: {safe(row.missing_skills).length}</p>{row.market_data?.bls?.available && <p className="mt-1 text-sm text-gray-600">BLS annual wage: {new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(row.market_data.bls.mean_annual_wage || 0))}</p>}</div>)}</div></section>}
      {advice.swot_analysis && <section className="mb-8"><h2 className="mb-4 border-l-4 border-indigo-600 pl-3 text-2xl font-bold">SWOT Analysis</h2><div className="grid grid-cols-1 gap-4 md:grid-cols-2">{[['Strengths','strengths'],['Weaknesses','weaknesses'],['Opportunities','opportunities'],['Threats','threats']].map(([label,key]) => <div key={key} className="avoid-break rounded-lg border bg-gray-50 p-4"><h3 className="mb-2 font-bold">{label}</h3>{renderList(advice.swot_analysis[key])}</div>)}</div></section>}
      <section className="mb-8"><h2 className="mb-4 border-l-4 border-indigo-600 pl-3 text-2xl font-bold">Career Action Plan</h2><div className="space-y-5"><div className="avoid-break rounded-lg border p-4"><h3 className="mb-2 font-bold text-indigo-700">Next 30 Days</h3>{renderList(advice.action_plan?.['30_days'])}</div><div className="avoid-break rounded-lg border p-4"><h3 className="mb-2 font-bold text-indigo-700">Next 6 Months</h3>{renderList(advice.action_plan?.['6_months'])}</div><div className="avoid-break rounded-lg border p-4"><h3 className="mb-2 font-bold text-indigo-700">Next 1 Year</h3>{renderList(advice.action_plan?.['1_year'])}</div></div></section>
      <section className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2"><div className="avoid-break rounded-lg border p-4"><h3 className="mb-2 text-lg font-bold">Next Skills</h3>{renderList(advice.recommended_next_skills)}</div><div className="avoid-break rounded-lg border p-4"><h3 className="mb-2 text-lg font-bold">Recommended Certifications</h3>{renderList(advice.recommended_certifications)}</div><div className="avoid-break rounded-lg border p-4"><h3 className="mb-2 text-lg font-bold">Projects</h3>{renderList(advice.recommended_projects)}</div><div className="avoid-break rounded-lg border p-4"><h3 className="mb-2 text-lg font-bold">Ongoing Course Alignment</h3>{renderList((advice.ongoing_course_alignment || []).map((item) => typeof item === 'string' ? item : `${item.course || 'Course'} → ${item.career_or_skill || ''}: ${item.alignment || ''}`))}</div></section>
      {advice.application_readiness && <section className="mb-8"><h2 className="mb-4 border-l-4 border-indigo-600 pl-3 text-2xl font-bold">Application Readiness</h2><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><div className="avoid-break rounded-lg border bg-green-50 p-4"><h3 className="mb-2 font-bold">Can Apply Now</h3>{renderList(advice.application_readiness.can_apply_now)}</div><div className="avoid-break rounded-lg border bg-amber-50 p-4"><h3 className="mb-2 font-bold">Prepare Before Applying</h3>{renderList(advice.application_readiness.prepare_before_applying)}</div></div>{advice.application_readiness.regulated_roles_note && <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">{advice.application_readiness.regulated_roles_note}</p>}</section>}
      <footer className="mt-12 border-t pt-6 text-center text-sm text-gray-500">Generated by Skills Pathfinder · Saved to the student's account</footer>
    </article>}</div></div></div>;
};

export default CareerReportV2;
