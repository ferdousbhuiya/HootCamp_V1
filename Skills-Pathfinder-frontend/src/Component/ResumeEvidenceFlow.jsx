import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { uploadPrivateDocument } from '../lib/documentStorage';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const apiBase = () => (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const safe = (value) => Array.isArray(value) ? value : [];
const norm = (value = '') => String(value).trim().toLowerCase().replace(/\s+/g, ' ');

const EvidenceList = ({ items, render }) => items.length
  ? <div className="mt-3 space-y-3">{items.map((item, index) => <div key={index} className="rounded-xl border border-slate-200 bg-white p-4">{render(item, index)}</div>)}</div>
  : <p className="mt-2 text-sm text-slate-500">Nothing detected in this section.</p>;

const ResumeEvidenceFlow = ({ user, onComplete, onCancel, onOpenCareerIntelligence }) => {
  const [resume, setResume] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      const { data, error: loadError } = await supabase
        .from('resume_analyses')
        .select('*')
        .eq('user_id', user.id)
        .eq('document_type', 'resume')
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (loadError) setError(loadError.message);
      if (data) setResume({ ...data, ...(data.raw_analysis || {}), saved_analysis_id: data.id });
      setLoading(false);
    })();
  }, [user?.id]);

  const skills = safe(resume?.extracted_skills);
  const education = safe(resume?.education);
  const experience = safe(resume?.experience);
  const projects = safe(resume?.projects);
  const publications = safe(resume?.publications);
  const resumeCertifications = safe(resume?.certifications_from_resume);
  const recommendations = safe(resume?.recommendations);

  const totalYears = Number(resume?.total_experience_years || 0);
  const summary = useMemo(() => ({
    skills: skills.length,
    education: education.length,
    experience: experience.length,
    projects: projects.length,
    publications: publications.length,
    recommendations: recommendations.length
  }), [skills, education, experience, projects, publications, recommendations]);

  const saveSkill = async (skill, analysisId) => {
    if (!skill?.name || String(skill.name).trim().length < 2) return;
    const { data: rows, error: readError } = await supabase.from('skill_tracking').select('*').eq('user_id', user.id);
    if (readError) throw readError;
    const old = (rows || []).find((row) => norm(row.skill_name) === norm(skill.name));
    const confidence = Number(skill.confidence || 0.8);
    const source = { source: 'resume_extracted', source_record_id: analysisId, verification_status: 'ai_verified', evidence: skill.evidence || null };
    if (old) {
      const sources = [...safe(old.metadata?.sources).filter((x) => !(x.source === source.source && x.source_record_id === analysisId)), source];
      const { error } = await supabase.from('skill_tracking').update({
        category: skill.category || old.category || 'General',
        confidence: Math.max(Number(old.confidence || 0), confidence),
        source: 'resume_extracted',
        verification_status: 'ai_verified',
        source_record_id: analysisId,
        evidence: skill.evidence || old.evidence || null,
        metadata: { ...(old.metadata || {}), sources },
        updated_at: new Date().toISOString()
      }).eq('id', old.id).eq('user_id', user.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('skill_tracking').insert({
        user_id: user.id,
        skill_name: String(skill.name).trim(),
        category: skill.category || 'General',
        proficiency_level: 'unknown',
        status: 'existing',
        source: 'resume_extracted',
        verification_status: 'ai_verified',
        confidence,
        evidence: skill.evidence || null,
        source_record_id: analysisId,
        metadata: { sources: [source] }
      });
      if (error) throw error;
    }
  };

  const saveEducation = async (items, analysisId) => {
    for (const item of items) {
      if (!item?.institution && !item?.program_or_degree) continue;
      if (item.status === 'in_progress') {
        const { error } = await supabase.from('academic_profiles').upsert({
          user_id: user.id,
          institution: item.institution || null,
          program_name: item.program_or_degree || null,
          field_of_study: item.field_of_study || null,
          academic_status: 'enrolled',
          notes: `Imported from resume analysis ${analysisId}`,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        if (error) throw error;
      } else {
        const { data: existing, error: existingError } = await supabase
          .from('education_history').select('id').eq('user_id', user.id)
          .eq('institution', item.institution || '').eq('program_name', item.program_or_degree || '').limit(1);
        if (existingError) throw existingError;
        if (!existing?.length) {
          const { error } = await supabase.from('education_history').insert({
            user_id: user.id,
            institution: item.institution || null,
            program_name: item.program_or_degree || null,
            field_of_study: item.field_of_study || null,
            notes: `Imported from resume analysis ${analysisId}`
          });
          if (error) throw error;
        }
      }
    }
  };

  const uploadResume = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null); setNotice(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${apiBase()}/api/resume-evidence`, { method: 'POST', body: formData });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `Resume analysis failed (${response.status})`);
      }
      const result = await response.json();
      let storagePath = null;
      try {
        storagePath = await uploadPrivateDocument({ supabase, userId: user.id, file, bucket: 'student-resumes' });
      } catch (storageError) {
        console.warn('Resume source file could not be stored:', storageError);
      }

      const { data: analysis, error: saveError } = await supabase.from('resume_analyses').insert({
        user_id: user.id,
        filename: result.filename || file.name,
        character_count: result.character_count || 0,
        skills_count: safe(result.extracted_skills).length,
        extracted_skills: safe(result.extracted_skills),
        explanations: safe(result.explanations),
        recommendations: safe(result.recommendations),
        ai_failed: Boolean(result.ai_failed),
        extraction_status: result.extraction_status || 'completed',
        document_type: 'resume',
        raw_analysis: result,
        storage_bucket: 'student-resumes',
        storage_path: storagePath
      }).select('id').single();
      if (saveError) throw saveError;

      for (const skill of safe(result.extracted_skills)) await saveSkill(skill, analysis.id);
      await saveEducation(safe(result.education), analysis.id);

      setResume({ ...result, saved_analysis_id: analysis.id });
      setNotice('Resume analyzed and saved. Review every evidence section below before opening Career Intelligence.');
    } catch (err) {
      setError(err.message || 'Resume could not be analyzed.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const openCareer = async () => {
    if (!resume) return;
    try {
      await supabase.from('profiles').update({ has_completed_onboarding: true, updated_at: new Date().toISOString() }).eq('id', user.id);
      if (onOpenCareerIntelligence) onOpenCareerIntelligence(resume);
      else onComplete?.();
    } catch (err) {
      setError(`Could not continue to Career Intelligence: ${err.message}`);
    }
  };

  if (loading) return <div className="app-card p-8 text-center text-slate-500">Loading your latest saved resume evidence…</div>;

  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <section className="rounded-3xl bg-slate-950 p-7 text-white shadow-xl">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-teal-300">Resume Evidence Builder</p>
      <h1 className="mt-2 text-3xl font-black">Resume → evidence review → Career Intelligence</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">This test path focuses on one resume and verifies skills, education, work history, total experience, projects, publications and career matches before we reuse the engine elsewhere.</p>
      <button onClick={onCancel} className="mt-5 rounded-xl border border-white/20 px-4 py-2 text-sm font-bold">Save & exit</button>
    </section>

    {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}

    <section className="app-card p-6">
      <h2 className="text-2xl font-black">1. Upload resume</h2>
      <p className="mt-2 text-sm text-slate-600">Upload one resume. Re-upload only when you intentionally want a new analysis.</p>
      <label className="mt-5 block cursor-pointer rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50 p-7 text-center">
        <b>{uploading ? 'Analyzing…' : 'Choose resume'}</b>
        <input disabled={uploading} type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" onChange={uploadResume} className="sr-only" />
      </label>
    </section>

    {resume && <>
      <section className="app-card p-6">
        <h2 className="text-2xl font-black">2. Evidence summary</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {[
            ['Skills', summary.skills], ['Education', summary.education], ['Work roles', summary.experience],
            ['Projects', summary.projects], ['Publications', summary.publications], ['Career matches', summary.recommendations]
          ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-3xl font-black">{value}</p></div>)}
        </div>
        <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-4"><span className="text-sm text-teal-800">Total non-overlapping experience detected</span><p className="text-3xl font-black text-teal-950">{totalYears ? `${totalYears} years` : 'Not calculated'}</p></div>
      </section>

      <section className="app-card p-6"><h2 className="text-xl font-black">Skills</h2><div className="mt-3 flex flex-wrap gap-2">{skills.map((skill) => <span key={skill.name} title={skill.evidence || ''} className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-800">{skill.name}</span>)}</div></section>

      <section className="app-card p-6"><h2 className="text-xl font-black">Education and training</h2><EvidenceList items={education} render={(item) => <><p className="font-bold">{item.program_or_degree || item.field_of_study || 'Education record'}</p><p className="text-sm text-slate-600">{item.institution || 'Institution not detected'}{item.end_or_expected_date ? ` · ${item.end_or_expected_date}` : ''}</p></>} /></section>

      <section className="app-card p-6"><h2 className="text-xl font-black">Work experience</h2><EvidenceList items={experience} render={(item) => <><p className="font-bold">{item.role || 'Role not detected'}</p><p className="text-sm text-slate-600">{item.employer || 'Employer not detected'} · {item.start_date || '?'} to {item.end_date || '?'}</p>{safe(item.responsibilities).length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">{safe(item.responsibilities).slice(0,5).map((x,i)=><li key={i}>{x}</li>)}</ul>}</>} /></section>

      <section className="app-card p-6"><h2 className="text-xl font-black">Finished projects</h2><EvidenceList items={projects} render={(item) => <><p className="font-bold">{item.name || 'Project'}</p><p className="text-sm text-slate-600">{item.description || item.evidence || 'Project evidence detected.'}</p></>} /></section>

      <section className="app-card p-6"><h2 className="text-xl font-black">Publications</h2><EvidenceList items={publications} render={(item) => <><p className="font-bold">{item.title || 'Publication'}</p>{item.citation && item.citation !== item.title && <p className="mt-1 text-sm text-slate-600">{item.citation}</p>}</>} /></section>

      {resumeCertifications.length > 0 && <section className="app-card p-6"><h2 className="text-xl font-black">Credentials mentioned in resume</h2><EvidenceList items={resumeCertifications} render={(item) => <><p className="font-bold">{item.name}</p><p className="text-sm text-slate-600">{item.provider || 'Provider not detected'} · {item.status || 'unknown'}</p></>} /></section>}

      <section className="app-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-xl font-black">3. Career Intelligence</h2><p className="mt-1 text-sm text-slate-600">Use this reviewed resume evidence to generate career matches and skill gaps.</p></div>
          <button onClick={openCareer} className="rounded-xl bg-teal-600 px-6 py-3 font-bold text-white hover:bg-teal-700">Open Career Intelligence</button>
        </div>
        {recommendations.length > 0 && <div className="mt-4 grid gap-3 md:grid-cols-2">{recommendations.slice(0,4).map((rec) => <div key={rec.id || rec.path} className="rounded-xl border border-slate-200 p-4"><p className="font-bold">{rec.path}</p><p className="text-sm text-slate-600">{Math.round(Number(rec.match_percentage || 0))}% match · {safe(rec.matched_skills).length} mapped competencies</p></div>)}</div>}
      </section>
    </>}
  </div>;
};

export default ResumeEvidenceFlow;
