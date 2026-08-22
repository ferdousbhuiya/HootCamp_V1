import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { uploadPrivateDocument } from '../lib/documentStorage';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const apiBase = () => (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const safe = (value) => Array.isArray(value) ? value : [];
const norm = (value = '') => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const degreePattern = /\b(ph\.?d|doctor|master|m\.?s\.?|m\.?sc|mba|bachelor|b\.?s\.?|b\.?sc|associate|a\.?s\.?)\b/i;

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
        .from('resume_analyses').select('*').eq('user_id', user.id).eq('document_type', 'resume')
        .order('uploaded_at', { ascending: false }).limit(1).maybeSingle();
      if (loadError) setError(loadError.message);
      if (data) setResume({ ...data, ...(data.raw_analysis || {}), saved_analysis_id: data.id });
      setLoading(false);
    })();
  }, [user?.id]);

  const skills = safe(resume?.extracted_skills);
  const rawEducation = safe(resume?.education || resume?.structured_evidence?.education);
  const rawCourses = safe(resume?.courses_from_resume || resume?.structured_evidence?.courses);
  const experience = safe(resume?.experience || resume?.structured_evidence?.experience);
  const rawProjects = safe(resume?.projects || resume?.structured_evidence?.projects);
  const publications = safe(resume?.publications || resume?.structured_evidence?.publications);
  const resumeCertifications = safe(resume?.certifications_from_resume || resume?.structured_evidence?.certifications);
  const recommendations = safe(resume?.recommendations);
  const totalYears = Number(resume?.total_experience_years || resume?.structured_evidence?.total_experience_years || 0);

  const formalEducation = useMemo(() => rawEducation.filter((item) => degreePattern.test(`${item?.program_or_degree || ''} ${item?.field_of_study || ''}`)), [rawEducation]);
  const educationTraining = useMemo(() => rawEducation.filter((item) => !formalEducation.includes(item)), [rawEducation, formalEducation]);
  const training = useMemo(() => {
    const seen = new Set();
    return [...educationTraining, ...rawCourses].filter((item) => {
      const key = norm(item?.program_or_degree || item?.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [educationTraining, rawCourses]);

  const professionalEvidence = useMemo(() => {
    const trainingKeys = new Set(training.map((item) => norm(item?.program_or_degree || item?.name)));
    return resumeCertifications.filter((item) => !trainingKeys.has(norm(item?.name)));
  }, [resumeCertifications, training]);

  const projectAccomplishments = useMemo(() => {
    if (rawProjects.length) return rawProjects;
    const actionPattern = /(project|commission|install|implement|design|startup|start-up|acceptance|integrat|upgrade|deploy|construct|dismantl|supervis|coordinate)/i;
    const seen = new Set();
    const derived = [];
    experience.forEach((role) => safe(role?.responsibilities).forEach((responsibility) => {
      const value = String(responsibility || '').trim();
      const key = norm(value);
      if (!value || !actionPattern.test(value) || seen.has(key)) return;
      seen.add(key);
      derived.push({
        name: role?.role ? `${role.role} project accomplishment` : 'Project accomplishment',
        employer: role?.employer || '',
        description: value,
        evidence: value,
        derived_from_work_history: true
      });
    }));
    return derived.slice(0, 8);
  }, [rawProjects, experience]);

  const summary = useMemo(() => ({
    skills: skills.length,
    formalEducation: formalEducation.length,
    training: training.length,
    experience: experience.length,
    projects: projectAccomplishments.length,
    publications: publications.length,
    recommendations: recommendations.length
  }), [skills, formalEducation, training, experience, projectAccomplishments, publications, recommendations]);

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
        category: skill.category || old.category || 'General', confidence: Math.max(Number(old.confidence || 0), confidence),
        source: 'resume_extracted', verification_status: 'ai_verified', source_record_id: analysisId,
        evidence: skill.evidence || old.evidence || null, metadata: { ...(old.metadata || {}), sources }, updated_at: new Date().toISOString()
      }).eq('id', old.id).eq('user_id', user.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('skill_tracking').insert({
        user_id: user.id, skill_name: String(skill.name).trim(), category: skill.category || 'General',
        proficiency_level: 'unknown', status: 'existing', source: 'resume_extracted', verification_status: 'ai_verified',
        confidence, evidence: skill.evidence || null, source_record_id: analysisId, metadata: { sources: [source] }
      });
      if (error) throw error;
    }
  };

  const saveEducation = async (items, analysisId) => {
    for (const item of items) {
      if (!item?.institution && !item?.program_or_degree) continue;
      if (item.status === 'in_progress') {
        const { error } = await supabase.from('academic_profiles').upsert({
          user_id: user.id, institution: item.institution || null, program_name: item.program_or_degree || null,
          field_of_study: item.field_of_study || null, academic_status: 'enrolled',
          notes: `Imported from resume analysis ${analysisId}`, updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        if (error) throw error;
      } else {
        const { data: existing, error: existingError } = await supabase.from('education_history').select('id')
          .eq('user_id', user.id).eq('institution', item.institution || '').eq('program_name', item.program_or_degree || '').limit(1);
        if (existingError) throw existingError;
        if (!existing?.length) {
          const { error } = await supabase.from('education_history').insert({
            user_id: user.id, institution: item.institution || null, program_name: item.program_or_degree || null,
            field_of_study: item.field_of_study || null, notes: `Imported from resume analysis ${analysisId}`
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
      try { storagePath = await uploadPrivateDocument({ supabase, userId: user.id, file, bucket: 'student-resumes' }); }
      catch (storageError) { console.warn('Resume source file could not be stored:', storageError); }

      const { data: analysis, error: saveError } = await supabase.from('resume_analyses').insert({
        user_id: user.id, filename: result.filename || file.name, character_count: result.character_count || 0,
        skills_count: safe(result.extracted_skills).length, extracted_skills: safe(result.extracted_skills),
        explanations: safe(result.explanations), recommendations: safe(result.recommendations), ai_failed: Boolean(result.ai_failed),
        extraction_status: result.extraction_status || 'completed', document_type: 'resume', raw_analysis: result,
        storage_bucket: 'student-resumes', storage_path: storagePath
      }).select('id').single();
      if (saveError) throw saveError;
      for (const skill of safe(result.extracted_skills)) await saveSkill(skill, analysis.id);
      await saveEducation(safe(result.education), analysis.id);
      setResume({ ...result, saved_analysis_id: analysis.id });
      setNotice('Resume analyzed and saved. Review every evidence section below before opening Career Intelligence.');
    } catch (err) { setError(err.message || 'Resume could not be analyzed.'); }
    finally { setUploading(false); event.target.value = ''; }
  };

  const openCareer = async () => {
    if (!resume) return;
    try {
      await supabase.from('profiles').update({ has_completed_onboarding: true, updated_at: new Date().toISOString() }).eq('id', user.id);
      if (onOpenCareerIntelligence) onOpenCareerIntelligence(resume); else onComplete?.();
    } catch (err) { setError(`Could not continue to Career Intelligence: ${err.message}`); }
  };

  if (loading) return <div className="app-card p-8 text-center text-slate-500">Loading your latest saved resume evidence…</div>;

  const educationCard = (item) => <><p className="font-bold">{item.program_or_degree || item.name || item.field_of_study || 'Education record'}</p><p className="text-sm text-slate-600">{item.institution || item.institution_or_provider || 'Institution not detected'}{item.end_or_expected_date ? ` · ${item.end_or_expected_date}` : ''}</p></>;

  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <section className="rounded-3xl bg-slate-950 p-7 text-white shadow-xl">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-teal-300">Resume Evidence Builder</p>
      <h1 className="mt-2 text-3xl font-black">Resume → evidence review → Career Intelligence</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Review skills, formal education, completed training, work history, total experience, project accomplishments and publications before opening Career Intelligence.</p>
      <button onClick={onCancel} className="mt-5 rounded-xl border border-white/20 px-4 py-2 text-sm font-bold">Save & exit</button>
    </section>

    {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}

    <section className="app-card p-6"><h2 className="text-2xl font-black">1. Upload resume</h2><p className="mt-2 text-sm text-slate-600">Upload one resume. Re-upload only when you intentionally want a new analysis.</p><label className="mt-5 block cursor-pointer rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50 p-7 text-center"><b>{uploading ? 'Analyzing…' : 'Choose resume'}</b><input disabled={uploading} type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" onChange={uploadResume} className="sr-only" /></label></section>

    {resume && <>
      <section className="app-card p-6"><h2 className="text-2xl font-black">2. Evidence summary</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {[
          ['Skills', summary.skills], ['Formal education', summary.formalEducation], ['Training', summary.training], ['Work roles', summary.experience],
          ['Project accomplishments', summary.projects], ['Publications', summary.publications], ['Career matches', summary.recommendations]
        ].map(([label,value]) => <div key={label} className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-3xl font-black">{value}</p></div>)}
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-4"><p className="text-xs font-bold uppercase text-teal-700">Experience</p><p className="mt-1 text-3xl font-black text-teal-950">{totalYears ? `${totalYears}y` : 'N/A'}</p></div>
      </div></section>

      <section className="app-card p-6"><h2 className="text-xl font-black">Skills</h2><p className="mt-1 text-sm text-slate-500">All evidence-backed skills are preserved. Equivalent skills are normalized only during career scoring.</p><div className="mt-3 flex flex-wrap gap-2">{skills.map((skill,index)=><span key={`${skill.name}-${index}`} title={skill.evidence || ''} className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-800">{skill.name}</span>)}</div></section>

      <section className="app-card p-6"><h2 className="text-xl font-black">Formal education</h2><EvidenceList items={formalEducation} render={educationCard} /></section>
      <section className="app-card p-6"><h2 className="text-xl font-black">Completed training & courses</h2><EvidenceList items={training} render={educationCard} /></section>

      <section className="app-card p-6"><h2 className="text-xl font-black">Work experience</h2><EvidenceList items={experience} render={(item)=><><p className="font-bold">{item.role || 'Role not detected'}</p><p className="text-sm text-slate-600">{item.employer || 'Employer not detected'} · {item.start_date || '?'} to {item.end_date || '?'}</p>{safe(item.responsibilities).length>0&&<ul className="mt-2 list-disc pl-5 text-sm text-slate-600">{safe(item.responsibilities).slice(0,5).map((x,i)=><li key={i}>{x}</li>)}</ul>}</>} /></section>

      <section className="app-card p-6"><h2 className="text-xl font-black">Project accomplishments</h2><p className="mt-1 text-sm text-slate-500">Includes explicit projects and substantial project work described inside employment history.</p><EvidenceList items={projectAccomplishments} render={(item)=><><p className="font-bold">{item.name || 'Project accomplishment'}</p>{item.employer&&<p className="text-xs font-semibold uppercase text-slate-400">{item.employer}</p>}<p className="mt-1 text-sm text-slate-600">{item.description || item.evidence || 'Project evidence detected.'}</p></>} /></section>

      <section className="app-card p-6"><h2 className="text-xl font-black">Publications</h2><EvidenceList items={publications} render={(item)=><><p className="font-bold">{item.title || 'Publication'}</p>{item.citation && item.citation !== item.title && <p className="mt-1 text-sm text-slate-600">{item.citation}</p>}</>} /></section>

      {professionalEvidence.length>0&&<section className="app-card p-6"><h2 className="text-xl font-black">Professional credentials, membership & recognition</h2><EvidenceList items={professionalEvidence} render={(item)=><><p className="font-bold">{item.name}</p><p className="text-sm text-slate-600">{item.provider || 'Provider not detected'} · {item.status || 'unknown'}</p></>} /></section>}

      <section className="app-card p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black">3. Career Intelligence</h2><p className="mt-1 text-sm text-slate-600">Use this reviewed resume evidence to generate career matches and skill gaps.</p></div><button onClick={openCareer} className="rounded-xl bg-teal-600 px-6 py-3 font-bold text-white hover:bg-teal-700">Open Career Intelligence</button></div>{recommendations.length>0&&<div className="mt-4 grid gap-3 md:grid-cols-2">{recommendations.slice(0,4).map((rec)=><div key={rec.id||rec.path} className="rounded-xl border border-slate-200 p-4"><p className="font-bold">{rec.path}</p><p className="text-sm text-slate-600">{Math.round(Number(rec.match_percentage||0))}% match · {safe(rec.matched_skills).length} mapped competencies</p></div>)}</div>}</section>
    </>}
  </div>;
};

export default ResumeEvidenceFlow;
