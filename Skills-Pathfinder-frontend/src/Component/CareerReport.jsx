import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import html2pdf from 'html2pdf.js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const apiBase = () => (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const asList = (value) => Array.isArray(value) ? value : value ? [value] : [];

const CareerReport = ({ user, profile, skills = [], certifications = [], courses = [], onClose }) => {
  const [loading, setLoading] = useState(true);
  const [advice, setAdvice] = useState(null);
  const [error, setError] = useState(null);
  const [savedReportId, setSavedReportId] = useState(null);
  const reportRef = useRef();
  const generatedRef = useRef(false);

  useEffect(() => {
    if (!generatedRef.current) {
      generatedRef.current = true;
      fetchAdviceAndPersist();
    }
  }, []);

  const fetchAdviceAndPersist = async () => {
    setLoading(true);
    setError(null);
    try {
      const skillNames = skills.map((item) => item?.skill_name || item?.name || (typeof item === 'string' ? item : '')).filter(Boolean);
      const { data: careerRows, error: careerError } = await supabase
        .from('career_recommendations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (careerError) throw careerError;

      const response = await fetch(`${apiBase()}/api/generate-career-advice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skills: skillNames,
          certifications,
          courses,
          career_recommendations: careerRows || []
        })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `Career advice request failed (${response.status})`);
      }

      const payload = await response.json();
      if (payload.status !== 'success' || !payload.advice) throw new Error('Career advice response was incomplete.');
      setAdvice(payload.advice);

      const { data: reportRow, error: reportError } = await supabase.from('career_reports').insert({
        user_id: user.id,
        report_type: 'career_intelligence',
        report_data: payload.advice,
        profile_snapshot: profile || {},
        skills_snapshot: skills,
        certifications_snapshot: certifications,
        courses_snapshot: courses,
        updated_at: new Date().toISOString()
      }).select('id').single();
      if (reportError) throw reportError;
      setSavedReportId(reportRow.id);

      const plan = payload.advice.action_plan || {};
      const strongestPath = payload.advice.career_readiness?.strongest_path || careerRows?.[0]?.career_title || null;
      const { error: planError } = await supabase.from('learning_plans').insert({
        user_id: user.id,
        target_career_id: careerRows?.[0]?.career_id || null,
        target_career_title: strongestPath,
        plan_30_days: { items: asList(plan['30_days']) },
        plan_6_months: { items: asList(plan['6_months']) },
        plan_1_year: { items: asList(plan['1_year']) },
        recommended_skills: payload.advice.recommended_next_skills || [],
        recommended_courses: [],
        recommended_certifications: payload.advice.recommended_certifications || [],
        ongoing_course_alignment: payload.advice.ongoing_course_alignment || [],
        plan_data: payload.advice,
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

  const downloadPDF = () => {
    if (!reportRef.current) return;
    html2pdf().set({
      margin: 0.5,
      filename: `Skills_Pathfinder_Report_${user?.email || 'User'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    }).from(reportRef.current).save();
  };

  const renderList = (items, fallback = 'No item available.') => {
    const values = asList(items).filter(Boolean);
    if (!values.length) return <p className="text-sm text-gray-500">{fallback}</p>;
    return <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">{values.map((item, index) => <li key={index}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>)}</ul>;
  };

  if (loading) {
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><div className="rounded-xl bg-white p-8 text-center shadow-2xl"><div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-4 border-t-4 border-indigo-600" /><p className="text-lg font-semibold">Generating and saving your career report...</p></div></div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gray-900/80 p-4">
      <div className="my-8 flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b bg-gray-50 p-4">
          <div><h2 className="text-xl font-bold text-gray-800">Career Intelligence Report</h2><p className="text-xs text-gray-500">{savedReportId ? 'Saved to your profile history' : 'Not saved'}</p></div>
          <div className="flex gap-3"><button onClick={downloadPDF} disabled={!advice} className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50">Download PDF</button><button onClick={onClose} className="rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-800">Close</button></div>
        </div>

        {error && <div className="m-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}<button onClick={fetchAdviceAndPersist} className="ml-3 rounded bg-red-100 px-3 py-1 text-sm">Retry</button></div>}

        {advice && <div ref={reportRef} className="overflow-y-auto bg-white p-8">
          <div className="mb-8 border-b-2 border-indigo-600 pb-6"><h1 className="mb-2 text-4xl font-bold text-indigo-900">Skills Pathfinder</h1><p className="text-xl text-gray-600">Comprehensive Career Analysis Report</p><p className="mt-2 text-sm text-gray-500">Generated for: {profile?.full_name || user?.email} | {new Date().toLocaleDateString()}</p></div>

          <section className="mb-8"><h2 className="mb-3 border-l-4 border-indigo-600 pl-3 text-2xl font-bold">Executive Summary</h2><p className="text-lg leading-relaxed text-gray-700">{advice.executive_summary || 'No summary available.'}</p></section>

          <section className="mb-8"><h2 className="mb-4 border-l-4 border-indigo-600 pl-3 text-2xl font-bold">Current Profile Snapshot</h2><div className="grid grid-cols-1 gap-4 md:grid-cols-3"><div className="rounded-lg bg-gray-50 p-4 text-center"><p className="text-3xl font-bold text-indigo-600">{skills.length}</p><p className="text-sm text-gray-600">Skills</p></div><div className="rounded-lg bg-gray-50 p-4 text-center"><p className="text-3xl font-bold text-indigo-600">{certifications.length}</p><p className="text-sm text-gray-600">Certificates</p></div><div className="rounded-lg bg-gray-50 p-4 text-center"><p className="text-3xl font-bold text-indigo-600">{courses.length}</p><p className="text-sm text-gray-600">Courses</p></div></div></section>

          {advice.career_readiness && <section className="mb-8"><h2 className="mb-4 border-l-4 border-indigo-600 pl-3 text-2xl font-bold">Career Readiness</h2><div className="rounded-lg border bg-indigo-50 p-4"><p><strong>Current level:</strong> {advice.career_readiness.current_level || 'Not specified'}</p><p><strong>Strongest path:</strong> {advice.career_readiness.strongest_path || 'Not specified'}</p><div className="mt-3"><strong>Alternative paths</strong>{renderList(advice.career_readiness.alternative_paths)}</div><div className="mt-3"><strong>Major constraints</strong>{renderList(advice.career_readiness.major_constraints)}</div></div></section>}

          {advice.swot_analysis && <section className="mb-8"><h2 className="mb-4 border-l-4 border-indigo-600 pl-3 text-2xl font-bold">SWOT Analysis</h2><div className="grid grid-cols-1 gap-4 md:grid-cols-2">{[['Strengths','strengths','green'],['Weaknesses','weaknesses','red'],['Opportunities','opportunities','blue'],['Threats','threats','yellow']].map(([label,key]) => <div key={key} className="rounded-lg border bg-gray-50 p-4"><h3 className="mb-2 font-bold">{label}</h3>{renderList(advice.swot_analysis[key])}</div>)}</div></section>}

          <section className="mb-8"><h2 className="mb-4 border-l-4 border-indigo-600 pl-3 text-2xl font-bold">Career Action Plan</h2><div className="space-y-5"><div className="rounded-lg border p-4"><h3 className="mb-2 font-bold text-indigo-700">Next 30 Days</h3>{renderList(advice.action_plan?.['30_days'])}</div><div className="rounded-lg border p-4"><h3 className="mb-2 font-bold text-indigo-700">Next 6 Months</h3>{renderList(advice.action_plan?.['6_months'])}</div><div className="rounded-lg border p-4"><h3 className="mb-2 font-bold text-indigo-700">Next 1 Year</h3>{renderList(advice.action_plan?.['1_year'])}</div></div></section>

          <section className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2"><div className="rounded-lg border p-4"><h3 className="mb-2 text-lg font-bold">Next Skills</h3>{renderList(advice.recommended_next_skills)}</div><div className="rounded-lg border p-4"><h3 className="mb-2 text-lg font-bold">Recommended Certifications</h3>{renderList(advice.recommended_certifications)}</div><div className="rounded-lg border p-4"><h3 className="mb-2 text-lg font-bold">Projects</h3>{renderList(advice.recommended_projects)}</div><div className="rounded-lg border p-4"><h3 className="mb-2 text-lg font-bold">Ongoing Course Alignment</h3>{renderList((advice.ongoing_course_alignment || []).map((item) => typeof item === 'string' ? item : `${item.course || 'Course'} → ${item.career_or_skill || ''}: ${item.alignment || ''}`))}</div></section>

          {advice.application_readiness && <section className="mb-8"><h2 className="mb-4 border-l-4 border-indigo-600 pl-3 text-2xl font-bold">Application Readiness</h2><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><div className="rounded-lg border bg-green-50 p-4"><h3 className="mb-2 font-bold">Can Apply Now</h3>{renderList(advice.application_readiness.can_apply_now)}</div><div className="rounded-lg border bg-amber-50 p-4"><h3 className="mb-2 font-bold">Prepare Before Applying</h3>{renderList(advice.application_readiness.prepare_before_applying)}</div></div>{advice.application_readiness.regulated_roles_note && <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{advice.application_readiness.regulated_roles_note}</p>}</section>}

          <div className="mt-12 border-t pt-6 text-center text-sm text-gray-500"><p>Generated by Skills Pathfinder AI • Saved to the student's account</p></div>
        </div>}
      </div>
    </div>
  );
};

export default CareerReport;
