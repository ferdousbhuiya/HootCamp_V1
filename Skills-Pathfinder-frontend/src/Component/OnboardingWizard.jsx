import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const OnboardingWizard = ({ user, onComplete }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Data States
  const [resumeFile, setResumeFile] = useState(null);
  const [extractedSkills, setExtractedSkills] = useState([]);
  
  const [certFile, setCertFile] = useState(null);
  const [extractedCerts, setExtractedCerts] = useState([]);
  
  const [newCourse, setNewCourse] = useState({ course_name: '', provider: '', expected_completion_date: '' });
  const [courses, setCourses] = useState([]);

  // --- Step 1: Resume Upload ---
  const handleResumeUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setResumeFile(file);
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:8000/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Failed to process resume');
      const data = await res.json();
      setExtractedSkills(data.extracted_skills || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Step 2: Certificate Upload ---
  const handleCertUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCertFile(file);
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:8000/api/verify-certificate', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Failed to process certificate');
      const data = await res.json();
      setExtractedCerts([...extractedCerts, { ...data, auto_verified: data.auto_verified || false }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Step 3: Add Course ---
  const handleAddCourse = (e) => {
    e.preventDefault();
    if (!newCourse.course_name) return;
    setCourses([...courses, { ...newCourse, id: Date.now() }]);
    setNewCourse({ course_name: '', provider: '', expected_completion_date: '' });
  };

  // --- Step 4: Save Everything to Database ---
  const handleFinish = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Save Skills (Marked as resume_extracted)
      if (extractedSkills.length > 0) {
        const skillsToInsert = extractedSkills.map(s => ({
          user_id: user.id,
          skill_name: s.name,
          category: s.category || 'General',
          proficiency_level: 'intermediate',
          verification_status: 'ai_verified',
          source: 'resume_extracted'
        }));
        await supabase.from('skill_tracking').insert(skillsToInsert);
      }

      // 2. Save Certifications
      if (extractedCerts.length > 0) {
        const certsToInsert = extractedCerts.map(c => ({
          user_id: user.id,
          certification_name: c.certification_name,
          provider: c.provider,
          credential_id: c.credential_id,
          verification_url: c.verification_url,
          verification_status: c.auto_verified ? 'auto_verified' : 'url_provided',
          is_verified: c.auto_verified || false,
          source: 'certificate_verified'
        }));
        await supabase.from('saved_certifications').insert(certsToInsert);
      }

      // 3. Save Courses
      if (courses.length > 0) {
        const coursesToInsert = courses.map(c => ({
          user_id: user.id,
          course_name: c.course_name,
          provider: c.provider,
          expected_completion_date: c.expected_completion_date,
          status: 'in_progress'
        }));
        await supabase.from('ongoing_courses').insert(coursesToInsert);
      }

      onComplete(); // Go back to dashboard
    } catch (err) {
      setError('Error saving profile data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between mb-2">
          {['Resume', 'Certificates', 'Courses', 'Review'].map((label, idx) => (
            <div key={idx} className={`flex flex-col items-center ${step > idx ? 'text-indigo-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 ${step > idx ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>
                {step > idx ? '✓' : idx + 1}
              </div>
              <span className="text-xs font-medium">{label}</span>
            </div>
          ))}
        </div>
        <div className="h-2 bg-gray-200 rounded-full">
          <div className="h-2 bg-indigo-600 rounded-full transition-all" style={{ width: `${(step / 4) * 100}%` }}></div>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {/* Step 1: Resume */}
      {step === 1 && (
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold mb-4">Upload Your Resume</h2>
          <p className="text-gray-600 mb-6">We'll extract your skills automatically using AI.</p>
          <input type="file" accept=".pdf,.docx,.txt" onChange={handleResumeUpload} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"/>
          
          {loading && <p className="mt-4 text-indigo-600">Processing resume... Please wait.</p>}
          
          {extractedSkills.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold mb-2">Extracted Skills ({extractedSkills.length}):</h3>
              <div className="flex flex-wrap gap-2">
                {extractedSkills.map((skill, idx) => (
                  <span key={idx} className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
                    {skill.name} <span className="text-xs opacity-75">({skill.category})</span>
                  </span>
                ))}
              </div>
              <button onClick={() => setStep(2)} className="mt-6 bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">Next: Certificates →</button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Certificates */}
      {step === 2 && (
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold mb-4">Upload Certificates (Optional)</h2>
          <p className="text-gray-600 mb-6">Upload PDFs or images of your certifications. We'll try to auto-verify them.</p>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleCertUpload} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"/>
          
          {loading && <p className="mt-4 text-indigo-600">Processing certificate...</p>}
          
          {extractedCerts.length > 0 && (
            <div className="mt-6 space-y-3">
              {extractedCerts.map((cert, idx) => (
                <div key={idx} className="border p-3 rounded-lg flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{cert.certification_name}</p>
                    <p className="text-sm text-gray-500">{cert.provider} {cert.auto_verified && <span className="text-green-600 ml-2">✓ Auto-Verified</span>}</p>
                  </div>
                </div>
              ))}
              <button onClick={() => setStep(3)} className="mt-4 bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">Next: Courses →</button>
            </div>
          )}
          {extractedCerts.length === 0 && !loading && (
            <button onClick={() => setStep(3)} className="mt-6 text-gray-500 hover:text-indigo-600">Skip this step →</button>
          )}
        </div>
      )}

      {/* Step 3: Ongoing Courses */}
      {step === 3 && (
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold mb-4">Add Ongoing Courses</h2>
          <p className="text-gray-600 mb-6">What are you currently learning? We'll use this for pathfinding.</p>
          
          <form onSubmit={handleAddCourse} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <input type="text" placeholder="Course Name" value={newCourse.course_name} onChange={(e) => setNewCourse({...newCourse, course_name: e.target.value})} className="border p-2 rounded" required />
            <input type="text" placeholder="Provider (e.g., Coursera)" value={newCourse.provider} onChange={(e) => setNewCourse({...newCourse, provider: e.target.value})} className="border p-2 rounded" />
            <input type="date" value={newCourse.expected_completion_date} onChange={(e) => setNewCourse({...newCourse, expected_completion_date: e.target.value})} className="border p-2 rounded" />
            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 md:col-span-3">Add Course</button>
          </form>

          {courses.length > 0 && (
            <div className="space-y-2 mb-6">
              {courses.map((c, idx) => (
                <div key={idx} className="bg-gray-50 p-3 rounded flex justify-between">
                  <span>{c.course_name} - {c.provider}</span>
                  <button onClick={() => setCourses(courses.filter((_, i) => i !== idx))} className="text-red-500">Remove</button>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setStep(4)} className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">Next: Review →</button>
        </div>
      )}

      {/* Step 4: Review & Finish */}
      {step === 4 && (
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-bold mb-4">Review Your Profile</h2>
          
          <div className="mb-6">
            <h3 className="font-semibold text-lg mb-2">Skills ({extractedSkills.length})</h3>
            <div className="flex flex-wrap gap-2">
              {extractedSkills.map((s, i) => <span key={i} className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">{s.name}</span>)}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-semibold text-lg mb-2">Certifications ({extractedCerts.length})</h3>
            {extractedCerts.map((c, i) => <div key={i} className="mb-1">{c.certification_name} ({c.provider})</div>)}
          </div>

          <div className="mb-6">
            <h3 className="font-semibold text-lg mb-2">Ongoing Courses ({courses.length})</h3>
            {courses.map((c, i) => <div key={i} className="mb-1">{c.course_name} - Expected: {c.expected_completion_date}</div>)}
          </div>

          <div className="flex gap-4">
            <button onClick={() => setStep(3)} className="bg-gray-300 text-gray-800 px-6 py-2 rounded-lg hover:bg-gray-400">← Back</button>
            <button onClick={handleFinish} disabled={loading} className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50">
              {loading ? 'Saving...' : 'Finish & Save Profile'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnboardingWizard;