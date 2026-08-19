import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { deletePrivateDocument, uploadPrivateDocument } from '../lib/documentStorage';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const ACCEPTED_DOCUMENTS = '.pdf,.docx,.txt,.png,.jpg,.jpeg';
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ACTIVE_DRAFT_KEY = 'onboarding:active';
const emptyCourse = { course_name: '', provider: '', expected_completion_date: '', status: 'in_progress' };
const normalizeName = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const createSessionKey = () => globalThis.crypto?.randomUUID?.() || `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const createItemKey = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

const statusPresentation = (status) => {
  switch (status) {
    case 'electronically_verified': return { label: 'Electronically Verified', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    case 'no_verification_link': return { label: 'No Verification Link', className: 'bg-slate-100 text-slate-700 border-slate-200' };
    case 'verification_link_found_unconfirmed': return { label: 'Link Found • Manual Review', className: 'bg-blue-100 text-blue-800 border-blue-200' };
    case 'verification_page_reached_unconfirmed': return { label: 'Page Reached • Unconfirmed', className: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 'verification_unavailable': return { label: 'Automatic Verification Unavailable', className: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 'verification_link_invalid':
    case 'verification_redirect_untrusted': return { label: 'Verification Link Not Accepted', className: 'bg-rose-100 text-rose-800 border-rose-200' };
    default: return { label: 'Not Electronically Verified', className: 'bg-slate-100 text-slate-700 border-slate-200' };
  }
};

const verificationRank = (status) => {
  const ranks = {
    certificate_verified: 4,
    ai_verified: 3,
    certificate_extracted_unverified: 2,
    self_reported: 1
  };
  return ranks[status] || 0;
};

const chooseBestSource = (sources = []) => {
  if (!sources.length) return null;
  return [...sources].sort((a, b) => verificationRank(b.verification_status) - verificationRank(a.verification_status))[0];
};

const OnboardingWizard = ({ user, onComplete, onCancel }) => {
  const [sessionKey, setSessionKey] = useState(createSessionKey);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeData, setResumeData] = useState(null);
  const [certificates, setCertificates] = useState([]);
  const [courseForm, setCourseForm] = useState(emptyCourse);
  const [courses, setCourses] = useState([]);
  const [editingCourseIndex, setEditingCourseIndex] = useState(null);

  const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  const resumeSkills = resumeData?.extracted_skills || [];

  const combinedSkills = useMemo(() => {
    const merged = new Map();

    resumeSkills.forEach((skill) => {
      if (!skill?.name) return;
      merged.set(normalizeName(skill.name), {
        ...skill,
        source: 'resume_extracted',
        verification_status: 'ai_verified',
        source_record_id: resumeData?.saved_analysis_id || null,
        evidence: skill.evidence || null
      });
    });

    certificates.forEach((cert) => {
      (cert.extracted_skills || []).forEach((skill) => {
        if (!skill?.name) return;
        const key = normalizeName(skill.name);
        const existing = merged.get(key);
        const verified = Boolean(cert.is_verified);
        merged.set(key, {
          ...(existing || {}),
          ...skill,
          name: skill.name,
          category: skill.category || existing?.category || 'Certification Skill',
          confidence: Math.max(Number(existing?.confidence || 0), Number(skill.confidence || 0.9)),
          source: verified ? 'certificate_verified' : (existing?.source || 'certificate_extracted'),
          verification_status: verified ? 'certificate_verified' : (existing?.verification_status || 'certificate_extracted_unverified'),
          source_record_id: cert.saved_id || existing?.source_record_id || null,
          evidence: `Certificate: ${cert.certification_name}`
        });
      });
    });

    return Array.from(merged.values());
  }, [resumeSkills, resumeData?.saved_analysis_id, certificates]);

  useEffect(() => {
    let active = true;

    const restoreDraft = async () => {
      if (!user?.id) return;
      try {
        const { data, error: draftError } = await supabase
          .from('career_findings')
          .select('*')
          .eq('user_id', user.id)
          .eq('client_record_key', ACTIVE_DRAFT_KEY)
          .maybeSingle();
        if (draftError) throw draftError;
        if (!active || !data?.data) return;

        const draft = data.data;
        setSessionKey(draft.session_key || createSessionKey());
        setStep(Math.min(Math.max(Number(draft.step) || 1, 1), 4));
        setResumeData(draft.resume_data || null);
        setCertificates(Array.isArray(draft.certificates) ? draft.certificates : []);
        setCourses(Array.isArray(draft.courses) ? draft.courses : []);
        if (draft.resume_data || draft.certificates?.length || draft.courses?.length) {
          setNotice('Your unfinished onboarding progress was restored from your account.');
        }
      } catch (err) {
        console.error('Onboarding draft restore failed:', err);
        setError('Your saved onboarding draft could not be restored. You can continue, but please verify the Supabase persistence migration is applied.');
      } finally {
        if (active) setRestoring(false);
      }
    };

    restoreDraft();
    return () => { active = false; };
  }, [user?.id]);

  const saveDraft = async ({ nextStep = step, nextResume = resumeData, nextCertificates = certificates, nextCourses = courses } = {}) => {
    if (!user?.id) return;
    const payload = {
      session_key: sessionKey,
      step: nextStep,
      resume_data: nextResume,
      certificates: nextCertificates,
      courses: nextCourses,
      updated_at: new Date().toISOString()
    };
    const { error: draftError } = await supabase.from('career_findings').upsert({
      user_id: user.id,
      client_record_key: ACTIVE_DRAFT_KEY,
      finding_type: 'onboarding_draft',
      source_type: 'onboarding',
      title: 'Active onboarding progress',
      status: 'in_progress',
      data: payload,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,client_record_key' });
    if (draftError) throw draftError;
  };

  const clearDraft = async () => {
    const { error: draftError } = await supabase
      .from('career_findings')
      .delete()
      .eq('user_id', user.id)
      .eq('client_record_key', ACTIVE_DRAFT_KEY);
    if (draftError) throw draftError;
  };

  const validateFile = (file) => {
    if (!file) return 'No file selected.';
    const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`;
    if (!['.pdf', '.docx', '.txt', '.png', '.jpg', '.jpeg'].includes(ext)) return 'Supported formats: PDF, DOCX, TXT, PNG, JPG and JPEG.';
    if (file.size > MAX_FILE_SIZE) return 'Maximum file size is 15MB.';
    return null;
  };

  const postDocument = async (path, file) => {
    const validationError = validateFile(file);
    if (validationError) throw new Error(validationError);
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${apiUrl}${path}`, { method: 'POST', body: formData });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || `Request failed (${response.status})`);
    }
    return response.json();
  };

  const saveSkillCandidate = async (candidate, sourceRecordId = null) => {
    if (!candidate?.name) return;
    const { data: existingRows, error: existingError } = await supabase
      .from('skill_tracking')
      .select('*')
      .eq('user_id', user.id);
    if (existingError) throw existingError;

    const existing = (existingRows || []).find((row) => normalizeName(row.skill_name) === normalizeName(candidate.name));
    const confidence = Number.isFinite(Number(candidate.confidence)) ? Number(candidate.confidence) : 0.8;
    const newSource = {
      source: candidate.source || 'resume_extracted',
      source_record_id: sourceRecordId,
      verification_status: candidate.verification_status || 'ai_verified',
      evidence: candidate.evidence || null
    };

    if (existing) {
      const currentSources = Array.isArray(existing.metadata?.sources) ? existing.metadata.sources : [];
      const withoutSameRecord = currentSources.filter((item) => !(item.source === newSource.source && item.source_record_id === newSource.source_record_id));
      const sources = [...withoutSameRecord, newSource];
      const best = chooseBestSource(sources) || newSource;
      const { error } = await supabase.from('skill_tracking').update({
        category: candidate.category || existing.category || 'General',
        confidence: Math.max(Number(existing.confidence || 0), confidence),
        evidence: best.evidence || candidate.evidence || existing.evidence || null,
        status: candidate.status || existing.status || 'existing',
        source: best.source,
        verification_status: best.verification_status,
        source_record_id: best.source_record_id,
        metadata: { ...(existing.metadata || {}), sources, onboarding_session: sessionKey },
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', existing.id);
      if (error) throw error;
      return;
    }

    const { error } = await supabase.from('skill_tracking').insert({
      user_id: user.id,
      skill_name: candidate.name.trim(),
      category: candidate.category || 'General',
      proficiency_level: 'unknown',
      status: candidate.status || 'existing',
      source: newSource.source,
      verification_status: newSource.verification_status,
      confidence,
      evidence: newSource.evidence,
      source_record_id: sourceRecordId,
      metadata: { onboarding_session: sessionKey, sources: [newSource] },
      last_seen_at: new Date().toISOString()
    });
    if (error) throw error;
  };

  const saveRecommendationSnapshots = async (analysisId, recommendations = []) => {
    if (!recommendations.length) return;
    const rows = recommendations.map((rec, index) => ({
      user_id: user.id,
      client_record_key: `${sessionKey}:career:${rec.id || index}`,
      source_analysis_id: analysisId,
      career_id: rec.id,
      career_title: rec.path,
      category: rec.category,
      match_score: rec.match_score,
      match_percentage: rec.match_percentage ?? Math.round((rec.match_score || 0) * 100),
      skill_gap_percentage: rec.skill_gap_percentage ?? null,
      matched_skills: rec.matched_skills || [],
      missing_skills: rec.missing_skills || [],
      recommendation_data: rec,
      market_data: {},
      updated_at: new Date().toISOString()
    }));
    const { error } = await supabase.from('career_recommendations').upsert(rows, { onConflict: 'user_id,client_record_key' });
    if (error) throw error;
  };

  const persistResume = async (data, file) => {
    const resumeKey = `${sessionKey}:resume`;
    let storagePath = null;
    let storageWarning = null;
    if (file) {
      try {
        storagePath = await uploadPrivateDocument({ supabase, userId: user.id, file, bucket: 'student-resumes' });
      } catch (storageError) {
        console.error('Onboarding resume source storage failed:', storageError);
        storageWarning = 'Resume analysis was saved, but the original file could not be stored.';
      }
    }
    const { data: analysis, error: analysisError } = await supabase.from('resume_analyses').upsert({
      user_id: user.id,
      client_record_key: resumeKey,
      filename: data.filename || file?.name || 'resume',
      character_count: data.character_count || 0,
      skills_count: (data.extracted_skills || []).length,
      extracted_skills: data.extracted_skills || [],
      explanations: data.explanations || [],
      recommendations: data.recommendations || [],
      ai_failed: Boolean(data.ai_failed),
      extraction_status: data.ai_failed ? 'fallback_completed' : 'completed',
      document_type: 'resume',
      raw_analysis: data,
      storage_bucket: 'student-resumes',
      storage_path: storagePath
    }, { onConflict: 'user_id,client_record_key' }).select('id').single();
    if (analysisError) throw analysisError;

    const explanationMap = new Map((data.explanations || []).map((item) => [normalizeName(item.skill), item]));
    for (const skill of data.extracted_skills || []) {
      const explanation = explanationMap.get(normalizeName(skill.name));
      await saveSkillCandidate({
        ...skill,
        source: 'resume_extracted',
        verification_status: 'ai_verified',
        evidence: explanation?.evidence || null
      }, analysis.id);
    }
    await saveRecommendationSnapshots(analysis.id, data.recommendations || []);
    return { ...data, saved_analysis_id: analysis.id, client_record_key: resumeKey, storage_path: storagePath, storage_warning: storageWarning };
  };

  const persistCertificate = async (cert, itemKey, file = null) => {
    const certKey = `${sessionKey}:cert:${itemKey}`;
    let storagePath = cert.storage_path || null;
    let storageWarning = null;
    if (file) {
      try {
        storagePath = await uploadPrivateDocument({ supabase, userId: user.id, file, bucket: 'student-certificates' });
      } catch (storageError) {
        console.error('Onboarding certificate source storage failed:', storageError);
        storageWarning = 'Certificate findings were saved, but the original file could not be stored.';
      }
    }
    const { data: saved, error: certError } = await supabase.from('saved_certifications').upsert({
      user_id: user.id,
      client_record_key: certKey,
      certification_name: cert.certification_name || 'Unknown certificate',
      provider: cert.provider || 'Unknown',
      holder_name: cert.holder_name || null,
      credential_id: cert.credential_id || null,
      verification_url: cert.verification_url || null,
      certificate_file_url: null,
      storage_bucket: 'student-certificates',
      storage_path: storagePath,
      is_verified: Boolean(cert.is_verified),
      verified_at: cert.is_verified ? new Date().toISOString() : null,
      verification_status: cert.verification_status || 'no_verification_link',
      verification_method: cert.verification_method || 'none',
      verification_message: cert.verification_message || null,
      verification_evidence: cert.verification_evidence || [],
      verified_url: cert.verified_url || null,
      issued_at: cert.issue_date || null,
      expires_at: cert.expiration_date || null,
      extracted_skills: cert.extracted_skills || [],
      raw_extraction: cert,
      status: 'completed',
      source: cert.is_verified ? 'certificate_verified' : 'certificate_extracted',
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,client_record_key' }).select('id').single();
    if (certError) throw certError;

    for (const skill of cert.extracted_skills || []) {
      await saveSkillCandidate({
        ...skill,
        source: cert.is_verified ? 'certificate_verified' : 'certificate_extracted',
        verification_status: cert.is_verified ? 'certificate_verified' : 'certificate_extracted_unverified',
        evidence: `Certificate: ${cert.certification_name}`
      }, saved.id);
    }
    return { ...cert, saved_id: saved.id, item_key: itemKey, client_record_key: certKey, storage_bucket: 'student-certificates', storage_path: storagePath, storage_warning: storageWarning };
  };

  const persistCourse = async (course) => {
    const itemKey = course.item_key || createItemKey('course');
    const courseKey = `${sessionKey}:course:${itemKey}`;
    const { data: saved, error: courseError } = await supabase.from('ongoing_courses').upsert({
      user_id: user.id,
      client_record_key: courseKey,
      course_name: course.course_name.trim(),
      provider: course.provider?.trim() || null,
      expected_completion_date: course.expected_completion_date || null,
      status: course.status || 'in_progress',
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,client_record_key' }).select().single();
    if (courseError) throw courseError;
    return { ...course, ...saved, item_key: itemKey, client_record_key: courseKey };
  };

  const handleResumeUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeFile(file);
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const processed = await postDocument('/api/upload', file);
      const saved = await persistResume(processed, file);
      setResumeData(saved);
      await saveDraft({ nextResume: saved });
      setNotice('Resume analysis, extracted skills, and career matches were saved to your account.');
    } catch (err) {
      setError(err.message || 'Could not process and save resume.');
    } finally {
      setLoading(false);
    }
  };

  const handleCertUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    const processed = [];
    const failures = [];

    for (const file of files) {
      try {
        const data = await postDocument('/api/verify-certificate', file);
        const itemKey = createItemKey('cert');
        const saved = await persistCertificate({ ...data, original_filename: file.name }, itemKey, file);
        processed.push(saved);
      } catch (err) {
        failures.push(`${file.name}: ${err.message}`);
      }
    }

    const nextCertificates = [...certificates, ...processed];
    setCertificates(nextCertificates);
    if (processed.length) {
      await saveDraft({ nextCertificates });
      setNotice(`${processed.length} certificate${processed.length === 1 ? '' : 's'} processed, classified, and saved.`);
    }
    if (failures.length) setError(`Some certificates could not be processed: ${failures.join(' | ')}`);
    e.target.value = '';
    setLoading(false);
  };

  const removeSkillSource = async (sourceRecordId) => {
    const { data: skills, error } = await supabase.from('skill_tracking').select('*').eq('user_id', user.id);
    if (error) throw error;
    for (const skill of skills || []) {
      const sources = Array.isArray(skill.metadata?.sources) ? skill.metadata.sources : [];
      if (!sources.some((source) => source.source_record_id === sourceRecordId)) continue;
      const remaining = sources.filter((source) => source.source_record_id !== sourceRecordId);
      if (!remaining.length) {
        const { error: deleteError } = await supabase.from('skill_tracking').delete().eq('id', skill.id);
        if (deleteError) throw deleteError;
      } else {
        const best = chooseBestSource(remaining);
        const { error: updateError } = await supabase.from('skill_tracking').update({
          source: best.source,
          verification_status: best.verification_status,
          source_record_id: best.source_record_id,
          evidence: best.evidence || null,
          metadata: { ...(skill.metadata || {}), sources: remaining },
          updated_at: new Date().toISOString()
        }).eq('id', skill.id);
        if (updateError) throw updateError;
      }
    }
  };

  const removeCertificate = async (index) => {
    const cert = certificates[index];
    if (!window.confirm(`Remove ${cert.certification_name || 'this certificate'} from your saved profile?`)) return;
    setLoading(true);
    setError(null);
    try {
      if (cert.saved_id) {
        await removeSkillSource(cert.saved_id);
        const { error } = await supabase.from('saved_certifications').delete().eq('id', cert.saved_id).eq('user_id', user.id);
        if (error) throw error;
        if (cert.storage_path) {
          try {
            await deletePrivateDocument({ supabase, bucket: cert.storage_bucket || 'student-certificates', path: cert.storage_path });
          } catch (storageError) {
            console.error('Certificate storage cleanup failed:', storageError);
          }
        }
      }
      const nextCertificates = certificates.filter((_, itemIndex) => itemIndex !== index);
      setCertificates(nextCertificates);
      await saveDraft({ nextCertificates });
      setNotice('Certificate removed from your saved profile.');
    } catch (err) {
      setError(`Certificate could not be removed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCourseSubmit = async (e) => {
    e.preventDefault();
    if (!courseForm.course_name.trim()) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (editingCourseIndex === null) {
        const saved = await persistCourse({ ...courseForm, item_key: createItemKey('course') });
        const nextCourses = [...courses, saved];
        setCourses(nextCourses);
        await saveDraft({ nextCourses });
        setNotice('Ongoing course saved.');
      } else {
        const current = courses[editingCourseIndex];
        const saved = await persistCourse({ ...current, ...courseForm });
        const nextCourses = courses.map((course, index) => index === editingCourseIndex ? saved : course);
        setCourses(nextCourses);
        await saveDraft({ nextCourses });
        setNotice('Course updated.');
      }
      setEditingCourseIndex(null);
      setCourseForm(emptyCourse);
    } catch (err) {
      setError(`Course could not be saved: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const editCourse = (course, index) => {
    setEditingCourseIndex(index);
    setCourseForm({ ...emptyCourse, ...course });
  };

  const cancelCourseEdit = () => {
    setEditingCourseIndex(null);
    setCourseForm(emptyCourse);
  };

  const removeCourse = async (index) => {
    const course = courses[index];
    if (!window.confirm(`Remove ${course.course_name || 'this course'} from your saved profile?`)) return;
    setLoading(true);
    setError(null);
    try {
      if (course.id) {
        const { error } = await supabase.from('ongoing_courses').delete().eq('id', course.id).eq('user_id', user.id);
        if (error) throw error;
      }
      const nextCourses = courses.filter((_, itemIndex) => itemIndex !== index);
      setCourses(nextCourses);
      await saveDraft({ nextCourses });
      if (editingCourseIndex === index) cancelCourseEdit();
      setNotice('Course removed.');
    } catch (err) {
      setError(`Course could not be removed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const navigateTo = async (nextStep) => {
    setStep(nextStep);
    try {
      await saveDraft({ nextStep });
    } catch (err) {
      setError(`Progress could not be saved before navigation: ${err.message}`);
    }
  };

  const handleFinish = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ has_completed_onboarding: true, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (profileError) throw profileError;
      await clearDraft();
      onComplete();
    } catch (err) {
      setError(`Onboarding could not be completed: ${err.message}. Your processed resume, certificates, courses, and skills remain saved and can be retried safely.`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async () => {
    try {
      await saveDraft();
      setNotice('Progress saved. You can continue onboarding later.');
      onCancel();
    } catch (err) {
      if (!window.confirm(`Your latest onboarding draft could not be saved (${err.message}). Close anyway?`)) return;
      onCancel();
    }
  };

  if (restoring) {
    return <div className="min-h-[50vh] grid place-items-center"><div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" /><p className="mt-4 text-sm text-slate-500">Restoring your saved onboarding progress...</p></div></div>;
  }

  const stepLabels = ['Resume', 'Certificates', 'Courses', 'Review'];

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-indigo-600">Student setup</p>
          <h1 className="text-2xl font-bold text-slate-900">Build your career profile</h1>
          <p className="mt-1 text-sm text-slate-500">Each completed action is saved immediately. You can safely leave and continue later.</p>
        </div>
        <button onClick={handleClose} disabled={loading} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Save & exit</button>
      </div>

      <div className="mb-7 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 grid grid-cols-4 gap-2">{stepLabels.map((label, idx) => {
          const number = idx + 1;
          const active = step === number;
          const completed = step > number;
          return <button key={label} type="button" onClick={() => navigateTo(number)} className="flex flex-col items-center gap-1 text-center"><span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${completed ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{completed ? '✓' : number}</span><span className={`text-xs font-medium ${active ? 'text-indigo-700' : 'text-slate-500'}`}>{label}</span></button>;
        })}</div>
        <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-gradient-to-r from-indigo-600 to-cyan-500 transition-all" style={{ width: `${(step / 4) * 100}%` }} /></div>
      </div>

      {notice && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

      {step === 1 && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-2xl font-bold text-slate-900">Resume</h2>
        <p className="mt-2 text-slate-600">Upload your current resume. PDF, DOCX, TXT, PNG, JPG and JPEG are supported; scanned documents use OCR.</p>
        <label className="mt-6 block rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 p-7 text-center hover:border-indigo-400">
          <span className="block font-semibold text-indigo-700">Choose a resume</span><span className="mt-1 block text-sm text-slate-500">Maximum 15MB</span>
          <input type="file" accept={ACCEPTED_DOCUMENTS} onChange={handleResumeUpload} disabled={loading} className="sr-only" />
        </label>
        {loading && <p className="mt-4 text-sm font-medium text-indigo-600">Processing and saving {resumeFile?.name || 'resume'}...</p>}
        {resumeData && <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-emerald-900">{resumeData.filename || resumeFile?.name}</p><p className="text-sm text-emerald-700">Saved • {resumeSkills.length} skills • {(resumeData.recommendations || []).length} career matches</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Persisted</span></div>{resumeSkills.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{resumeSkills.map((skill, idx) => <span key={`${skill.name}-${idx}`} className="rounded-full bg-white px-3 py-1 text-xs text-emerald-800 shadow-sm">{skill.name}</span>)}</div>}</div>}
        <div className="mt-7 flex justify-end"><button onClick={() => navigateTo(2)} disabled={loading} className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">Next: Certificates →</button></div>
      </section>}

      {step === 2 && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-2xl font-bold text-slate-900">Completed certificates</h2>
        <p className="mt-2 text-slate-600">Upload one or several certificates. Fields, skills, and verification classification are extracted automatically.</p>
        <p className="mt-2 text-sm text-slate-500">Verification supports LinkedIn Learning, Udemy, Coursera, Credly, and other recognized credential providers. A link alone never counts as verified.</p>
        <label className="mt-6 block rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/50 p-7 text-center hover:border-violet-400"><span className="block font-semibold text-violet-700">Choose certificate files</span><span className="mt-1 block text-sm text-slate-500">PDF, DOCX, TXT, PNG, JPG, JPEG • multiple files allowed</span><input type="file" multiple accept={ACCEPTED_DOCUMENTS} onChange={handleCertUpload} disabled={loading} className="sr-only" /></label>
        {loading && <p className="mt-4 text-sm font-medium text-violet-600">Extracting, checking, and saving certificates...</p>}
        <div className="mt-6 space-y-4">{certificates.map((cert, idx) => { const badge = statusPresentation(cert.verification_status); return <article key={cert.item_key || `${cert.original_filename || cert.filename}-${idx}`} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><p className="font-semibold text-slate-900">{cert.certification_name}</p><p className="text-sm text-slate-500">{cert.provider || 'Unknown provider'}</p>{cert.credential_id && <p className="mt-1 text-xs text-slate-500">Credential ID: {cert.credential_id}</p>}</div><div className="flex flex-wrap items-start gap-2"><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badge.className}`}>{badge.label}</span><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Saved</span><button onClick={() => removeCertificate(idx)} disabled={loading} className="text-sm font-semibold text-rose-600 hover:text-rose-800">Remove</button></div></div>{cert.verification_message && <p className="mt-3 text-sm text-slate-600">{cert.verification_message}</p>}{(cert.extracted_skills || []).length > 0 && <div className="mt-3 flex flex-wrap gap-2">{cert.extracted_skills.map((skill, skillIndex) => <span key={`${skill.name}-${skillIndex}`} className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs text-violet-800">{skill.name}</span>)}</div>}</article>; })}</div>
        <div className="mt-7 flex justify-between"><button onClick={() => navigateTo(1)} className="rounded-xl px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100">← Back</button><button onClick={() => navigateTo(3)} disabled={loading} className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">Next: Courses →</button></div>
      </section>}

      {step === 3 && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-2xl font-bold text-slate-900">Ongoing courses</h2>
        <p className="mt-2 text-slate-600">Manual entry is expected here. Add what you are currently learning so future recommendations do not repeat work already in progress.</p>
        <form onSubmit={handleCourseSubmit} className="mt-6 grid grid-cols-1 gap-3 rounded-xl bg-blue-50 p-4 md:grid-cols-4"><input required placeholder="Course name" value={courseForm.course_name} onChange={(e) => setCourseForm({ ...courseForm, course_name: e.target.value })} className="rounded-xl border border-blue-100 bg-white px-3 py-2.5 md:col-span-2" /><input placeholder="Provider" value={courseForm.provider} onChange={(e) => setCourseForm({ ...courseForm, provider: e.target.value })} className="rounded-xl border border-blue-100 bg-white px-3 py-2.5" /><input type="date" value={courseForm.expected_completion_date} onChange={(e) => setCourseForm({ ...courseForm, expected_completion_date: e.target.value })} className="rounded-xl border border-blue-100 bg-white px-3 py-2.5" /><select value={courseForm.status} onChange={(e) => setCourseForm({ ...courseForm, status: e.target.value })} className="rounded-xl border border-blue-100 bg-white px-3 py-2.5"><option value="in_progress">In Progress</option><option value="paused">Paused</option><option value="completed">Completed</option></select><div className="flex flex-wrap gap-2 md:col-span-3"><button disabled={loading} className="rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{editingCourseIndex === null ? 'Add & save course' : 'Update saved course'}</button>{editingCourseIndex !== null && <button type="button" onClick={cancelCourseEdit} className="rounded-xl bg-white px-4 py-2.5 font-semibold text-slate-600">Cancel edit</button>}</div></form>
        <div className="mt-5 space-y-3">{courses.map((course, index) => <article key={course.item_key || course.id || `${course.course_name}-${index}`} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center"><div><p className="font-medium text-slate-900">{course.course_name}</p><p className="text-sm text-slate-500">{course.provider || 'Provider not specified'} • {course.status}</p>{course.expected_completion_date && <p className="text-xs text-slate-400">Expected completion: {course.expected_completion_date}</p>}</div><div className="flex gap-3"><span className="text-xs font-semibold text-emerald-700">Saved</span><button onClick={() => editCourse(course, index)} className="text-sm font-semibold text-indigo-600">Edit</button><button onClick={() => removeCourse(index)} className="text-sm font-semibold text-rose-600">Remove</button></div></article>)}</div>
        <div className="mt-7 flex justify-between"><button onClick={() => navigateTo(2)} className="rounded-xl px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100">← Back</button><button onClick={() => navigateTo(4)} className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700">Next: Review →</button></div>
      </section>}

      {step === 4 && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-2xl font-bold text-slate-900">Review your saved profile</h2>
        <p className="mt-2 text-slate-600">Everything shown below is already stored. Finishing only marks onboarding complete and removes the temporary draft.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2"><div className="rounded-xl bg-slate-50 p-4"><h3 className="font-semibold text-slate-900">Resume</h3><p className="mt-1 text-sm text-slate-600">{resumeData ? `${resumeData.filename || 'Resume'} • ${resumeSkills.length} skills • ${(resumeData.recommendations || []).length} career matches` : 'No resume uploaded.'}</p></div><div className="rounded-xl bg-slate-50 p-4"><h3 className="font-semibold text-slate-900">Certificates</h3><p className="mt-1 text-sm text-slate-600">{certificates.length} saved certificate{certificates.length === 1 ? '' : 's'}</p></div><div className="rounded-xl bg-slate-50 p-4"><h3 className="font-semibold text-slate-900">Unified skills</h3><p className="mt-1 text-sm text-slate-600">{combinedSkills.length} current skill findings</p></div><div className="rounded-xl bg-slate-50 p-4"><h3 className="font-semibold text-slate-900">Ongoing courses</h3><p className="mt-1 text-sm text-slate-600">{courses.length} saved course{courses.length === 1 ? '' : 's'}</p></div></div>
        {combinedSkills.length > 0 && <div className="mt-5"><h3 className="text-sm font-semibold text-slate-700">Skill snapshot</h3><div className="mt-2 flex flex-wrap gap-2">{combinedSkills.map((skill, index) => <span key={`${skill.name}-${index}`} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-800">{skill.name}</span>)}</div></div>}
        <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">Safe to close: your processed resume, certificate findings, verification classifications, extracted skills, recommendations, and courses are already in your database.</div>
        <div className="mt-7 flex justify-between"><button onClick={() => navigateTo(3)} className="rounded-xl bg-slate-100 px-5 py-2.5 font-semibold text-slate-700">← Back</button><button onClick={handleFinish} disabled={loading} className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{loading ? 'Completing...' : 'Finish onboarding'}</button></div>
      </section>}
    </div>
  );
};

export default OnboardingWizard;
