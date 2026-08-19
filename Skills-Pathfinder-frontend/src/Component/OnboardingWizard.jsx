import { useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const ACCEPTED_DOCUMENTS = '.pdf,.docx,.txt,.png,.jpg,.jpeg';
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const emptyCourse = { course_name: '', provider: '', expected_completion_date: '', status: 'in_progress' };
const normalizeName = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const statusPresentation = (status) => {
  switch (status) {
    case 'electronically_verified': return { label: 'Electronically Verified', className: 'bg-green-100 text-green-800 border-green-200' };
    case 'no_verification_link': return { label: 'No Verification Link', className: 'bg-gray-100 text-gray-700 border-gray-200' };
    case 'verification_link_found_unconfirmed': return { label: 'Link Found • Manual Review', className: 'bg-blue-100 text-blue-800 border-blue-200' };
    case 'verification_page_reached_unconfirmed': return { label: 'Page Reached • Unconfirmed', className: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 'verification_unavailable': return { label: 'Automatic Verification Unavailable', className: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 'verification_link_invalid':
    case 'verification_redirect_untrusted': return { label: 'Verification Link Not Accepted', className: 'bg-red-100 text-red-800 border-red-200' };
    default: return { label: 'Not Electronically Verified', className: 'bg-gray-100 text-gray-700 border-gray-200' };
  }
};

const OnboardingWizard = ({ user, onComplete, onCancel }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
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
        certificate_id: null
      });
    });

    certificates.forEach((cert, certIndex) => {
      (cert.extracted_skills || []).forEach((skill) => {
        if (!skill?.name) return;
        const key = normalizeName(skill.name);
        const existing = merged.get(key);
        const verified = Boolean(cert.is_verified);
        const incomingConfidence = Number(skill.confidence || 0.9);
        const existingConfidence = Number(existing?.confidence || 0);
        merged.set(key, {
          ...(existing || {}),
          ...skill,
          name: skill.name,
          category: skill.category || existing?.category || 'Certification Skill',
          confidence: Math.max(existingConfidence, incomingConfidence),
          source: verified ? 'certificate_verified' : (existing?.source || 'certificate_extracted'),
          verification_status: verified ? 'certificate_verified' : (existing?.verification_status || 'certificate_extracted_unverified'),
          certificate_index: certIndex,
          evidence: `Certificate: ${cert.certification_name}`
        });
      });
    });

    return Array.from(merged.values());
  }, [resumeSkills, certificates]);

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

  const handleResumeUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeFile(file);
    setLoading(true);
    setError(null);
    try {
      setResumeData(await postDocument('/api/upload', file));
    } catch (err) {
      setResumeData(null);
      setError(err.message || 'Could not process resume.');
    } finally {
      setLoading(false);
    }
  };

  const handleCertUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setLoading(true);
    setError(null);
    const processed = [];
    const failures = [];
    for (const file of files) {
      try {
        const data = await postDocument('/api/verify-certificate', file);
        processed.push({ ...data, original_filename: file.name });
      } catch (err) {
        failures.push(`${file.name}: ${err.message}`);
      }
    }
    setCertificates((current) => [...current, ...processed]);
    if (failures.length) setError(`Some certificates could not be processed: ${failures.join(' | ')}`);
    e.target.value = '';
    setLoading(false);
  };

  const removeCertificate = (index) => setCertificates((current) => current.filter((_, itemIndex) => itemIndex !== index));

  const handleCourseSubmit = (e) => {
    e.preventDefault();
    if (!courseForm.course_name.trim()) return;
    if (editingCourseIndex === null) {
      setCourses((current) => [...current, { ...courseForm, course_name: courseForm.course_name.trim() }]);
    } else {
      setCourses((current) => current.map((course, index) => index === editingCourseIndex ? { ...courseForm, course_name: courseForm.course_name.trim() } : course));
    }
    setEditingCourseIndex(null);
    setCourseForm(emptyCourse);
  };

  const editCourse = (course, index) => {
    setEditingCourseIndex(index);
    setCourseForm({ ...emptyCourse, ...course });
  };

  const cancelCourseEdit = () => {
    setEditingCourseIndex(null);
    setCourseForm(emptyCourse);
  };

  const removeCourse = (index) => {
    setCourses((current) => current.filter((_, itemIndex) => itemIndex !== index));
    if (editingCourseIndex === index) cancelCourseEdit();
  };

  const saveSkillCandidate = async (candidate, sourceRecordId = null) => {
    const { data: existingRows, error: existingError } = await supabase
      .from('skill_tracking')
      .select('*')
      .eq('user_id', user.id);
    if (existingError) throw existingError;

    const existing = (existingRows || []).find((row) => normalizeName(row.skill_name) === normalizeName(candidate.name));
    const confidence = Number.isFinite(Number(candidate.confidence)) ? Number(candidate.confidence) : 0.8;

    if (existing) {
      const verifiedPromotion = candidate.verification_status === 'certificate_verified' && existing.verification_status !== 'certificate_verified';
      const updates = {
        category: candidate.category || existing.category,
        confidence: Math.max(Number(existing.confidence || 0), confidence),
        evidence: candidate.evidence || existing.evidence || null,
        status: candidate.status || existing.status || 'existing',
        metadata: { ...(existing.metadata || {}), onboarding_updated: true },
        updated_at: new Date().toISOString()
      };
      if (verifiedPromotion) {
        updates.source = 'certificate_verified';
        updates.verification_status = 'certificate_verified';
        updates.source_record_id = sourceRecordId;
      }
      const { error } = await supabase.from('skill_tracking').update(updates).eq('id', existing.id);
      if (error) throw error;
      return;
    }

    const { error } = await supabase.from('skill_tracking').insert({
      user_id: user.id,
      skill_name: candidate.name,
      category: candidate.category || 'General',
      proficiency_level: 'unknown',
      status: candidate.status || 'existing',
      source: candidate.source || 'resume_extracted',
      verification_status: candidate.verification_status || 'ai_verified',
      confidence,
      evidence: candidate.evidence || null,
      source_record_id: sourceRecordId,
      metadata: { onboarding_created: true }
    });
    if (error) throw error;
  };

  const handleFinish = async () => {
    setLoading(true);
    setError(null);
    try {
      let analysisId = null;
      if (resumeData) {
        const { data: analysis, error: analysisError } = await supabase.from('resume_analyses').insert({
          user_id: user.id,
          filename: resumeData.filename || resumeFile?.name || 'resume',
          character_count: resumeData.character_count || 0,
          skills_count: resumeSkills.length,
          extracted_skills: resumeSkills,
          explanations: resumeData.explanations || [],
          recommendations: resumeData.recommendations || []
        }).select('id').single();
        if (analysisError) throw analysisError;
        analysisId = analysis.id;

        if ((resumeData.recommendations || []).length) {
          const recommendationRows = resumeData.recommendations.map((rec) => ({
            user_id: user.id,
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
            market_data: {}
          }));
          const { error: recommendationError } = await supabase.from('career_recommendations').insert(recommendationRows);
          if (recommendationError) throw recommendationError;
        }
      }

      const savedCertificateIds = new Map();
      for (let index = 0; index < certificates.length; index += 1) {
        const cert = certificates[index];
        const { data: savedCert, error: certError } = await supabase.from('saved_certifications').insert({
          user_id: user.id,
          certification_name: cert.certification_name,
          provider: cert.provider || 'Unknown',
          holder_name: cert.holder_name || null,
          credential_id: cert.credential_id || null,
          verification_url: cert.verification_url || null,
          certificate_file_url: null,
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
        }).select('id').single();
        if (certError) throw certError;
        savedCertificateIds.set(index, savedCert.id);
      }

      for (const skill of combinedSkills) {
        const courseMatch = courses.find((course) => {
          const courseName = normalizeName(course.course_name);
          const skillName = normalizeName(skill.name);
          return courseName && skillName && (courseName.includes(skillName) || skillName.includes(courseName));
        });
        const candidate = {
          ...skill,
          status: courseMatch ? 'learning' : 'existing',
          evidence: skill.evidence || (courseMatch ? `Ongoing course: ${courseMatch.course_name}` : null)
        };
        const sourceRecordId = skill.source === 'resume_extracted' ? analysisId : savedCertificateIds.get(skill.certificate_index) || null;
        await saveSkillCandidate(candidate, sourceRecordId);
      }

      if (courses.length) {
        const { error: coursesError } = await supabase.from('ongoing_courses').insert(courses.map((course) => ({
          user_id: user.id,
          course_name: course.course_name,
          provider: course.provider || null,
          expected_completion_date: course.expected_completion_date || null,
          status: course.status || 'in_progress'
        })));
        if (coursesError) throw coursesError;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ has_completed_onboarding: true, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (profileError) throw profileError;

      onComplete();
    } catch (err) {
      setError(`Error saving profile data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    const hasWork = Boolean(resumeData || certificates.length || courses.length);
    if (hasWork && !window.confirm('Close onboarding without saving these changes?')) return;
    onCancel();
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-2 flex justify-end"><button onClick={handleClose} className="rounded-lg px-3 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700">Close without saving</button></div>
      <div className="mb-8"><div className="mb-2 flex justify-between">{['Resume', 'Certificates', 'Courses', 'Review'].map((label, idx) => <div key={label} className={`flex flex-col items-center ${step > idx ? 'text-indigo-600' : 'text-gray-400'}`}><div className={`mb-1 flex h-8 w-8 items-center justify-center rounded-full font-bold ${step > idx ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>{step > idx ? '✓' : idx + 1}</div><span className="text-xs font-medium">{label}</span></div>)}</div><div className="h-2 rounded-full bg-gray-200"><div className="h-2 rounded-full bg-indigo-600 transition-all" style={{ width: `${(step / 4) * 100}%` }} /></div></div>
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {step === 1 && <div className="rounded-xl bg-white p-6 shadow-lg"><h2 className="mb-2 text-2xl font-bold">Upload Your Resume</h2><p className="mb-6 text-gray-600">PDF, DOCX, TXT, PNG, JPG and JPEG are supported. Scanned documents use OCR.</p><input type="file" accept={ACCEPTED_DOCUMENTS} onChange={handleResumeUpload} className="block w-full text-sm text-gray-500" />{loading && <p className="mt-4 text-indigo-600">Processing {resumeFile?.name || 'resume'}...</p>}{resumeSkills.length > 0 && <div className="mt-6"><h3 className="mb-2 font-semibold">Resume Skills ({resumeSkills.length})</h3><div className="flex flex-wrap gap-2">{resumeSkills.map((skill, idx) => <span key={`${skill.name}-${idx}`} className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">{skill.name}</span>)}</div></div>}<button onClick={() => setStep(2)} disabled={loading} className="mt-6 rounded-lg bg-indigo-600 px-6 py-2 text-white disabled:opacity-50">Next: Certificates →</button></div>}

      {step === 2 && <div className="rounded-xl bg-white p-6 shadow-lg"><h2 className="mb-2 text-2xl font-bold">Upload Completed Certificates</h2><p className="mb-2 text-gray-600">Upload one or several files. Fields, skills and verification are handled automatically.</p><p className="mb-6 text-sm text-gray-500">Accepted: PDF, DOCX, TXT, PNG, JPG, JPEG. Supported verification hosts include LinkedIn, Udemy, Coursera, Credly and other major credential providers.</p><input type="file" multiple accept={ACCEPTED_DOCUMENTS} onChange={handleCertUpload} className="block w-full text-sm text-gray-500" />{loading && <p className="mt-4 text-indigo-600">Extracting and checking certificates...</p>}<div className="mt-6 space-y-4">{certificates.map((cert, idx) => { const badge = statusPresentation(cert.verification_status); return <div key={`${cert.original_filename || cert.filename}-${idx}`} className="rounded-lg border p-4"><div className="flex flex-col justify-between gap-3 md:flex-row"><div><p className="font-semibold">{cert.certification_name}</p><p className="text-sm text-gray-500">{cert.provider || 'Unknown provider'}</p>{cert.credential_id && <p className="text-xs text-gray-500">ID: {cert.credential_id}</p>}</div><div className="flex items-start gap-2"><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badge.className}`}>{badge.label}</span><button onClick={() => removeCertificate(idx)} className="text-sm text-red-600">Remove</button></div></div>{cert.verification_message && <p className="mt-2 text-sm text-gray-600">{cert.verification_message}</p>}{(cert.extracted_skills || []).length > 0 && <div className="mt-3 flex flex-wrap gap-2">{cert.extracted_skills.map((skill, skillIndex) => <span key={`${skill.name}-${skillIndex}`} className="rounded-full border border-purple-200 bg-purple-50 px-2 py-1 text-xs text-purple-800">{skill.name}</span>)}</div>}</div>; })}</div><div className="mt-6 flex justify-between"><button onClick={() => setStep(1)} className="text-gray-600 hover:text-indigo-600">← Back</button><button onClick={() => setStep(3)} disabled={loading} className="rounded-lg bg-indigo-600 px-6 py-2 text-white disabled:opacity-50">Next: Courses →</button></div></div>}

      {step === 3 && <div className="rounded-xl bg-white p-6 shadow-lg"><h2 className="mb-2 text-2xl font-bold">Ongoing Courses</h2><p className="mb-6 text-gray-600">Manual entry is expected here. You can add, edit, remove, go back, or continue without a course.</p><form onSubmit={handleCourseSubmit} className="grid grid-cols-1 gap-3 rounded-lg bg-blue-50 p-4 md:grid-cols-4"><input required placeholder="Course name" value={courseForm.course_name} onChange={(e) => setCourseForm({ ...courseForm, course_name: e.target.value })} className="rounded border px-3 py-2 md:col-span-2" /><input placeholder="Provider" value={courseForm.provider} onChange={(e) => setCourseForm({ ...courseForm, provider: e.target.value })} className="rounded border px-3 py-2" /><input type="date" value={courseForm.expected_completion_date} onChange={(e) => setCourseForm({ ...courseForm, expected_completion_date: e.target.value })} className="rounded border px-3 py-2" /><select value={courseForm.status} onChange={(e) => setCourseForm({ ...courseForm, status: e.target.value })} className="rounded border px-3 py-2"><option value="in_progress">In Progress</option><option value="paused">Paused</option><option value="completed">Completed</option></select><div className="flex gap-2 md:col-span-3"><button className="rounded bg-blue-600 px-4 py-2 text-white">{editingCourseIndex === null ? 'Add Course' : 'Update Course'}</button>{editingCourseIndex !== null && <button type="button" onClick={cancelCourseEdit} className="rounded bg-gray-200 px-4 py-2">Cancel Edit</button>}</div></form><div className="mt-4 space-y-2">{courses.map((course, index) => <div key={`${course.course_name}-${index}`} className="flex flex-col justify-between gap-2 rounded-lg border p-3 md:flex-row md:items-center"><div><p className="font-medium">{course.course_name}</p><p className="text-sm text-gray-500">{course.provider || 'Provider not specified'} • {course.status}</p></div><div className="flex gap-3"><button onClick={() => editCourse(course, index)} className="text-sm text-indigo-600">Edit</button><button onClick={() => removeCourse(index)} className="text-sm text-red-600">Remove</button></div></div>)}</div><div className="mt-6 flex justify-between"><button onClick={() => setStep(2)} className="text-gray-600 hover:text-indigo-600">← Back</button><button onClick={() => setStep(4)} className="rounded-lg bg-indigo-600 px-6 py-2 text-white">Next: Review →</button></div></div>}

      {step === 4 && <div className="rounded-xl bg-white p-6 shadow-lg"><h2 className="mb-5 text-2xl font-bold">Review & Save</h2><div className="space-y-5"><div><h3 className="font-semibold">Resume</h3><p className="text-sm text-gray-600">{resumeData ? `${resumeData.filename || resumeFile?.name}: ${resumeSkills.length} skills, ${(resumeData.recommendations || []).length} career recommendations` : 'No resume uploaded in this onboarding session.'}</p></div><div><h3 className="font-semibold">Certificates ({certificates.length})</h3>{certificates.map((cert, index) => <p key={index} className="text-sm text-gray-600">{cert.certification_name} • {statusPresentation(cert.verification_status).label} • {(cert.extracted_skills || []).length} skills</p>)}</div><div><h3 className="font-semibold">Unified Skill Findings ({combinedSkills.length})</h3><div className="mt-2 flex flex-wrap gap-2">{combinedSkills.map((skill, index) => <span key={`${skill.name}-${index}`} className="rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-800">{skill.name}</span>)}</div></div><div><h3 className="font-semibold">Ongoing Courses ({courses.length})</h3>{courses.map((course, index) => <p key={index} className="text-sm text-gray-600">{course.course_name} • {course.status}</p>)}</div></div><div className="mt-7 flex justify-between"><button onClick={() => setStep(3)} className="rounded-lg bg-gray-200 px-5 py-2">← Back</button><button onClick={handleFinish} disabled={loading} className="rounded-lg bg-green-600 px-6 py-2 text-white disabled:opacity-50">{loading ? 'Saving all findings...' : 'Finish & Save Everything'}</button></div></div>}
    </div>
  );
};

export default OnboardingWizard;
