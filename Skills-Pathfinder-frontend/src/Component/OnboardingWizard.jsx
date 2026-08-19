import { useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const ACCEPTED_DOCUMENTS = '.pdf,.docx,.txt,.png,.jpg,.jpeg';
const MAX_FILE_SIZE = 15 * 1024 * 1024;

const normalizeName = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const statusPresentation = (status) => {
  switch (status) {
    case 'electronically_verified':
      return { label: 'Electronically Verified', className: 'bg-green-100 text-green-800 border-green-200' };
    case 'no_verification_link':
      return { label: 'No Verification Link', className: 'bg-gray-100 text-gray-700 border-gray-200' };
    case 'verification_link_found_unconfirmed':
      return { label: 'Link Found • Manual Review', className: 'bg-blue-100 text-blue-800 border-blue-200' };
    case 'verification_page_reached_unconfirmed':
      return { label: 'Page Reached • Unconfirmed', className: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 'verification_unavailable':
      return { label: 'Automatic Verification Unavailable', className: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 'verification_link_invalid':
    case 'verification_redirect_untrusted':
      return { label: 'Verification Link Not Accepted', className: 'bg-red-100 text-red-800 border-red-200' };
    default:
      return { label: 'Not Electronically Verified', className: 'bg-gray-100 text-gray-700 border-gray-200' };
  }
};

const OnboardingWizard = ({ user, onComplete }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeSkills, setResumeSkills] = useState([]);
  const [extractedCerts, setExtractedCerts] = useState([]);
  const [newCourse, setNewCourse] = useState({ course_name: '', provider: '', expected_completion_date: '' });
  const [courses, setCourses] = useState([]);

  const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

  const allSkills = useMemo(() => {
    const merged = new Map();

    resumeSkills.forEach((skill) => {
      if (!skill?.name) return;
      merged.set(normalizeName(skill.name), {
        ...skill,
        source: 'resume_extracted',
        certificate_verified: false,
      });
    });

    extractedCerts.forEach((cert) => {
      (cert.extracted_skills || []).forEach((skill) => {
        if (!skill?.name) return;
        const key = normalizeName(skill.name);
        const existing = merged.get(key);
        const verified = Boolean(cert.is_verified);
        const next = {
          ...(existing || {}),
          ...skill,
          name: skill.name,
          category: skill.category || existing?.category || 'Certification Skill',
          confidence: Math.max(Number(existing?.confidence || 0), Number(skill.confidence || 0.9)),
          source: verified ? 'certificate_verified' : (existing?.source || 'certificate_verified'),
          certificate_verified: Boolean(existing?.certificate_verified || verified),
          certificate_status: cert.verification_status,
        };
        merged.set(key, next);
      });
    });

    return Array.from(merged.values());
  }, [resumeSkills, extractedCerts]);

  const validateFile = (file) => {
    if (!file) return 'No file selected.';
    const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`;
    const supported = ['.pdf', '.docx', '.txt', '.png', '.jpg', '.jpeg'];
    if (!supported.includes(ext)) return 'Supported formats: PDF, DOCX, TXT, PNG, JPG and JPEG.';
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
      const data = await postDocument('/api/upload', file);
      setResumeSkills(data.extracted_skills || []);
    } catch (err) {
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

    try {
      const processed = [];
      for (const file of files) {
        const data = await postDocument('/api/verify-certificate', file);
        processed.push({ ...data, original_filename: file.name });
      }
      setExtractedCerts((current) => [...current, ...processed]);
      e.target.value = '';
    } catch (err) {
      setError(err.message || 'Could not process certificate.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCourse = (e) => {
    e.preventDefault();
    if (!newCourse.course_name.trim()) return;
    setCourses((current) => [...current, { ...newCourse, id: `${Date.now()}-${current.length}` }]);
    setNewCourse({ course_name: '', provider: '', expected_completion_date: '' });
  };

  const handleFinish = async () => {
    setLoading(true);
    setError(null);

    try {
      if (allSkills.length > 0) {
        const skillsToInsert = allSkills.map((skill) => {
          const learningInCourse = courses.some((course) => {
            const courseName = normalizeName(course.course_name);
            const skillName = normalizeName(skill.name);
            return courseName && skillName && (courseName.includes(skillName) || skillName.includes(courseName));
          });

          let verificationStatus = skill.certificate_verified ? 'certificate_verified' : 'ai_verified';
          let source = skill.certificate_verified ? 'certificate_verified' : (skill.source || 'resume_extracted');

          if (!skill.certificate_verified && learningInCourse) {
            verificationStatus = 'in_progress';
            source = 'ongoing_course';
          } else if (!skill.certificate_verified && skill.source === 'certificate_verified') {
            verificationStatus = 'certificate_unverified';
          }

          return {
            user_id: user.id,
            skill_name: skill.name,
            category: skill.category || 'General',
            proficiency_level: 'intermediate',
            status: learningInCourse ? 'learning' : 'existing',
            verification_status: verificationStatus,
            source,
          };
        });

        const { error: skillsError } = await supabase.from('skill_tracking').insert(skillsToInsert);
        if (skillsError) throw skillsError;
      }

      if (extractedCerts.length > 0) {
        const certsToInsert = extractedCerts.map((cert) => ({
          user_id: user.id,
          certification_name: cert.certification_name,
          provider: cert.provider,
          credential_id: cert.credential_id || null,
          verification_url: cert.verification_url || null,
          verification_status: cert.verification_status || 'not_electronically_verified',
          is_verified: Boolean(cert.is_verified),
          verified_at: cert.is_verified ? new Date().toISOString() : null,
          status: 'completed',
          source: 'certificate_upload',
        }));

        const { error: certError } = await supabase.from('saved_certifications').insert(certsToInsert);
        if (certError) throw certError;
      }

      if (courses.length > 0) {
        const coursesToInsert = courses.map((course) => ({
          user_id: user.id,
          course_name: course.course_name,
          provider: course.provider || null,
          expected_completion_date: course.expected_completion_date || null,
          status: 'in_progress',
        }));

        const { error: courseError } = await supabase.from('ongoing_courses').insert(coursesToInsert);
        if (courseError) throw courseError;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ has_completed_onboarding: true })
        .eq('id', user.id);
      if (profileError) throw profileError;

      onComplete();
    } catch (err) {
      setError(`Error saving profile data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-end mb-2">
        <button onClick={onComplete} className="text-gray-500 hover:text-gray-700 px-3 py-1 rounded-lg hover:bg-gray-100">
          Close
        </button>
      </div>

      <div className="mb-8">
        <div className="flex justify-between mb-2">
          {['Resume', 'Certificates', 'Courses', 'Review'].map((label, idx) => (
            <div key={label} className={`flex flex-col items-center ${step > idx ? 'text-indigo-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 ${step > idx ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>
                {step > idx ? '✓' : idx + 1}
              </div>
              <span className="text-xs font-medium">{label}</span>
            </div>
          ))}
        </div>
        <div className="h-2 bg-gray-200 rounded-full">
          <div className="h-2 bg-indigo-600 rounded-full transition-all" style={{ width: `${(step / 4) * 100}%` }} />
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      {step === 1 && (
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold mb-2">Upload Your Resume</h2>
          <p className="text-gray-600 mb-6">PDF, DOCX, TXT, PNG, JPG and JPEG are supported. Scanned PDFs and images use OCR.</p>
          <input type="file" accept={ACCEPTED_DOCUMENTS} onChange={handleResumeUpload} className="block w-full text-sm text-gray-500" />
          {loading && <p className="mt-4 text-indigo-600">Processing {resumeFile?.name || 'resume'}...</p>}
          {resumeSkills.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold mb-2">Resume Skills ({resumeSkills.length})</h3>
              <div className="flex flex-wrap gap-2">
                {resumeSkills.map((skill, idx) => (
                  <span key={`${skill.name}-${idx}`} className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
                    {skill.name} <span className="text-xs opacity-75">({skill.category || 'General'})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <button onClick={() => setStep(2)} disabled={loading} className="mt-6 bg-indigo-600 text-white px-6 py-2 rounded-lg disabled:opacity-50">
            Next: Certificates →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold mb-2">Upload Completed Certificates</h2>
          <p className="text-gray-600 mb-2">Upload one or several certificates. We extract the credential fields and skills, then attempt electronic verification automatically when a supported verification link exists.</p>
          <p className="text-sm text-gray-500 mb-6">Accepted: PDF, DOCX, TXT, PNG, JPG, JPEG. Maximum 15MB each.</p>
          <input type="file" multiple accept={ACCEPTED_DOCUMENTS} onChange={handleCertUpload} className="block w-full text-sm text-gray-500" />
          {loading && <p className="mt-4 text-indigo-600">Extracting and verifying certificate...</p>}

          {extractedCerts.length > 0 && (
            <div className="mt-6 space-y-4">
              {extractedCerts.map((cert, idx) => {
                const badge = statusPresentation(cert.verification_status);
                return (
                  <div key={`${cert.original_filename || cert.filename}-${idx}`} className="border border-gray-200 p-4 rounded-lg">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3">
                      <div>
                        <p className="font-semibold text-gray-800">{cert.certification_name}</p>
                        <p className="text-sm text-gray-500">{cert.provider || 'Unknown provider'}</p>
                        {cert.credential_id && <p className="text-xs text-gray-500 mt-1">Credential ID: {cert.credential_id}</p>}
                      </div>
                      <span className={`inline-flex px-3 py-1 rounded-full border text-xs font-semibold ${badge.className}`}>{badge.label}</span>
                    </div>
                    {cert.verification_message && <p className="text-sm text-gray-600 mt-3">{cert.verification_message}</p>}
                    {cert.verification_url && (
                      <a href={cert.verification_url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:underline mt-2 inline-block">
                        Open verification page
                      </a>
                    )}
                    {(cert.extracted_skills || []).length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-gray-600 mb-2">Skills from certificate</p>
                        <div className="flex flex-wrap gap-2">
                          {cert.extracted_skills.map((skill, skillIndex) => (
                            <span key={`${skill.name}-${skillIndex}`} className="bg-purple-50 text-purple-800 border border-purple-200 px-2 py-1 rounded-full text-xs">{skill.name}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-between mt-6">
            <button onClick={() => setStep(1)} className="text-gray-600 hover:text-indigo-600">← Back</button>
            <button onClick={() => setStep(3)} disabled={loading} className="bg-indigo-600 text-white px-6 py-2 rounded-lg disabled:opacity-50">Next: Courses →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold mb-2">Add Ongoing Courses</h2>
          <p className="text-gray-600 mb-6">Current courses will be used to identify skill gaps that are already in progress.</p>
          <form onSubmit={handleAddCourse} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <input type="text" placeholder="Course Name" value={newCourse.course_name} onChange={(e) => setNewCourse({ ...newCourse, course_name: e.target.value })} className="border p-2 rounded" required />
            <input type="text" placeholder="Provider" value={newCourse.provider} onChange={(e) => setNewCourse({ ...newCourse, provider: e.target.value })} className="border p-2 rounded" />
            <input type="date" value={newCourse.expected_completion_date} onChange={(e) => setNewCourse({ ...newCourse, expected_completion_date: e.target.value })} className="border p-2 rounded" />
            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded md:col-span-3">Add Course</button>
          </form>
          {courses.map((course, idx) => (
            <div key={course.id} className="bg-gray-50 p-3 rounded flex justify-between mb-2">
              <span>{course.course_name}{course.provider ? ` - ${course.provider}` : ''}</span>
              <button onClick={() => setCourses(courses.filter((_, i) => i !== idx))} className="text-red-500">Remove</button>
            </div>
          ))}
          <div className="flex justify-between mt-6">
            <button onClick={() => setStep(2)} className="text-gray-600 hover:text-indigo-600">← Back</button>
            <button onClick={() => setStep(4)} className="bg-indigo-600 text-white px-6 py-2 rounded-lg">Next: Review →</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold mb-6">Review Your Student Profile</h2>
          <div className="mb-6">
            <h3 className="font-semibold text-lg mb-2">Unified Skills ({allSkills.length})</h3>
            <div className="flex flex-wrap gap-2">
              {allSkills.map((skill, idx) => (
                <span key={`${skill.name}-${idx}`} className={`px-2 py-1 rounded text-sm ${skill.certificate_verified ? 'bg-green-100 text-green-800' : 'bg-indigo-100 text-indigo-800'}`}>
                  {skill.certificate_verified ? '✓ ' : ''}{skill.name}
                </span>
              ))}
            </div>
          </div>
          <div className="mb-6">
            <h3 className="font-semibold text-lg mb-2">Completed Certificates ({extractedCerts.length})</h3>
            {extractedCerts.length === 0 ? <p className="text-gray-500">None uploaded.</p> : extractedCerts.map((cert, idx) => (
              <div key={`${cert.certification_name}-${idx}`} className="mb-2 flex items-center gap-2">
                <span>{cert.certification_name} ({cert.provider})</span>
                <span className={`text-xs px-2 py-1 rounded-full border ${statusPresentation(cert.verification_status).className}`}>
                  {statusPresentation(cert.verification_status).label}
                </span>
              </div>
            ))}
          </div>
          <div className="mb-6">
            <h3 className="font-semibold text-lg mb-2">Ongoing Courses ({courses.length})</h3>
            {courses.length === 0 ? <p className="text-gray-500">None added.</p> : courses.map((course) => <div key={course.id}>{course.course_name}</div>)}
          </div>
          <div className="flex gap-4">
            <button onClick={() => setStep(3)} className="bg-gray-300 text-gray-800 px-6 py-2 rounded-lg">← Back</button>
            <button onClick={handleFinish} disabled={loading} className="bg-green-600 text-white px-6 py-2 rounded-lg disabled:opacity-50">
              {loading ? 'Saving...' : 'Finish & Save Profile'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnboardingWizard;
