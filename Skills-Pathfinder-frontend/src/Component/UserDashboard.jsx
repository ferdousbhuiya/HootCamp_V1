import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import CareerReport from './CareerReport';
import { deletePrivateDocument, uploadPrivateDocument } from '../lib/documentStorage';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const emptyCourse = { course_name: '', provider: '', expected_completion_date: '', status: 'in_progress' };
const emptyCert = { certification_name: '', provider: '', holder_name: '', credential_id: '', verification_url: '', status: 'completed' };
const normalizeName = (value = '') => value.trim().replace(/\s+/g, ' ').toLowerCase();
const apiBase = () => (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const UserDashboard = ({ user, onLogout, onViewAnalysis, onStartOnboarding, children }) => {
  const [profile, setProfile] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [trackedSkills, setTrackedSkills] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [ongoingCourses, setOngoingCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('history');
  const [showReport, setShowReport] = useState(false);
  const [notice, setNotice] = useState(null);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [formData, setFormData] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);

  const [newSkill, setNewSkill] = useState({ skill_name: '', category: 'Domain Knowledge', proficiency_level: 'beginner', status: 'existing' });
  const [skillFilter, setSkillFilter] = useState('all');

  const [courseForm, setCourseForm] = useState(emptyCourse);
  const [editingCourseId, setEditingCourseId] = useState(null);

  const [certFiles, setCertFiles] = useState([]);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [manualCert, setManualCert] = useState(emptyCert);
  const [savingManualCert, setSavingManualCert] = useState(false);
  const [verifyingCert, setVerifyingCert] = useState(null);

  useEffect(() => {
    if (user) fetchUserData();
  }, [user]);

  useEffect(() => {
    if (profile) resetProfileForm();
  }, [profile]);

  const resetProfileForm = () => {
    setFormData({
      full_name: profile?.full_name || '',
      phone: profile?.phone || '',
      address: profile?.address || '',
      city: profile?.city || '',
      state: profile?.state || '',
      zip_code: profile?.zip_code || ''
    });
  };

  const showMessage = (message, type = 'success') => setNotice({ message, type });

  const fetchUserData = async () => {
    setLoading(true);
    try {
      const [profileResult, analysesResult, skillsResult, certsResult, coursesResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('resume_analyses').select('*').eq('user_id', user.id).order('uploaded_at', { ascending: false }),
        supabase.from('skill_tracking').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('saved_certifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('ongoing_courses').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      ]);

      for (const result of [profileResult, analysesResult, skillsResult, certsResult, coursesResult]) {
        if (result.error) throw result.error;
      }

      setProfile(profileResult.data || null);
      setAnalyses(analysesResult.data || []);
      setTrackedSkills(skillsResult.data || []);
      setCertifications(certsResult.data || []);
      setOngoingCourses(coursesResult.data || []);
    } catch (error) {
      console.error('Error fetching user data:', error);
      showMessage(`Could not load all saved profile data: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      showMessage(`Logout failed: ${error.message}`, 'error');
      return;
    }
    onLogout();
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, ...formData, updated_at: new Date().toISOString() }, { onConflict: 'id' })
        .select()
        .single();
      if (error) throw error;
      setProfile(data);
      setIsEditingProfile(false);
      showMessage('Profile saved.');
    } catch (error) {
      showMessage(`Profile could not be saved: ${error.message}`, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCancelProfile = () => {
    resetProfileForm();
    setIsEditingProfile(false);
  };

  const handleAddSkill = async (e) => {
    e.preventDefault();
    if (!newSkill.skill_name.trim()) return;

    const duplicate = trackedSkills.find((item) => normalizeName(item.skill_name) === normalizeName(newSkill.skill_name));
    if (duplicate) {
      showMessage('That skill is already in your profile. Update the existing skill instead.', 'error');
      return;
    }

    try {
      const { data, error } = await supabase.from('skill_tracking').insert({
        user_id: user.id,
        ...newSkill,
        skill_name: newSkill.skill_name.trim(),
        source: 'self_reported',
        verification_status: 'self_reported',
        confidence: 1,
        metadata: { entry_method: 'manual' }
      }).select().single();
      if (error) throw error;
      setTrackedSkills((current) => [data, ...current]);
      setNewSkill({ ...newSkill, skill_name: '' });
      showMessage('Skill added as self-reported.');
    } catch (error) {
      showMessage(`Skill could not be saved: ${error.message}`, 'error');
    }
  };

  const handleUpdateSkill = async (id, updates) => {
    try {
      const { data, error } = await supabase
        .from('skill_tracking')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      setTrackedSkills((current) => current.map((skill) => skill.id === id ? data : skill));
    } catch (error) {
      showMessage(`Skill update failed: ${error.message}`, 'error');
    }
  };

  const handleDeleteSkill = async (id) => {
    if (!window.confirm('Delete this skill from your profile?')) return;
    const { error } = await supabase.from('skill_tracking').delete().eq('id', id);
    if (error) return showMessage(`Skill could not be deleted: ${error.message}`, 'error');
    setTrackedSkills((current) => current.filter((skill) => skill.id !== id));
  };

  const handleCourseSubmit = async (e) => {
    e.preventDefault();
    if (!courseForm.course_name.trim()) return;

    try {
      if (editingCourseId) {
        const { data, error } = await supabase
          .from('ongoing_courses')
          .update({ ...courseForm, course_name: courseForm.course_name.trim() })
          .eq('id', editingCourseId)
          .select()
          .single();
        if (error) throw error;
        setOngoingCourses((current) => current.map((course) => course.id === editingCourseId ? data : course));
        showMessage('Course updated.');
      } else {
        const { data, error } = await supabase.from('ongoing_courses').insert({
          user_id: user.id,
          ...courseForm,
          course_name: courseForm.course_name.trim(),
          status: courseForm.status || 'in_progress'
        }).select().single();
        if (error) throw error;
        setOngoingCourses((current) => [data, ...current]);
        showMessage('Ongoing course saved.');
      }
      setEditingCourseId(null);
      setCourseForm(emptyCourse);
    } catch (error) {
      showMessage(`Course could not be saved: ${error.message}`, 'error');
    }
  };

  const startCourseEdit = (course) => {
    setEditingCourseId(course.id);
    setCourseForm({
      course_name: course.course_name || '',
      provider: course.provider || '',
      expected_completion_date: course.expected_completion_date || '',
      status: course.status || 'in_progress'
    });
  };

  const cancelCourseEdit = () => {
    setEditingCourseId(null);
    setCourseForm(emptyCourse);
  };

  const handleDeleteCourse = async (id) => {
    if (!window.confirm('Delete this course?')) return;
    const { error } = await supabase.from('ongoing_courses').delete().eq('id', id);
    if (error) return showMessage(`Course could not be deleted: ${error.message}`, 'error');
    setOngoingCourses((current) => current.filter((course) => course.id !== id));
    if (editingCourseId === id) cancelCourseEdit();
  };

  const verificationPayload = (cert) => ({
    certification_name: cert.certification_name || '',
    provider: cert.provider || '',
    holder_name: cert.holder_name || '',
    credential_id: cert.credential_id || '',
    verification_url: cert.verification_url || ''
  });

  const callLinkVerification = async (cert) => {
    const response = await fetch(`${apiBase()}/api/verify-certificate-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(verificationPayload(cert))
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || `Verification service returned ${response.status}`);
    }
    return response.json();
  };

  const persistCertificateSkills = async (certificateRow, extractedSkills = []) => {
    if (!extractedSkills.length) return;

    const { data: existing, error: existingError } = await supabase
      .from('skill_tracking')
      .select('*')
      .eq('user_id', user.id);
    if (existingError) throw existingError;

    const byName = new Map((existing || []).map((skill) => [normalizeName(skill.skill_name), skill]));
    for (const skill of extractedSkills) {
      if (!skill?.name) continue;
      const key = normalizeName(skill.name);
      const current = byName.get(key);
      const verified = Boolean(certificateRow.is_verified);
      const source = verified ? 'certificate_verified' : 'certificate_extracted';
      const verificationStatus = verified ? 'certificate_verified' : 'certificate_extracted_unverified';
      const confidence = Number.isFinite(Number(skill.confidence)) ? Number(skill.confidence) : 0.9;

      if (current) {
        const shouldPromote = verified && current.verification_status !== 'certificate_verified';
        const updates = {
          confidence: Math.max(Number(current.confidence || 0), confidence),
          evidence: `Certificate: ${certificateRow.certification_name}`,
          metadata: {
            ...(current.metadata || {}),
            certificate_id: certificateRow.id,
            certificate_name: certificateRow.certification_name
          },
          updated_at: new Date().toISOString()
        };
        if (shouldPromote) {
          updates.source = source;
          updates.verification_status = verificationStatus;
          updates.source_record_id = certificateRow.id;
        }
        const { error } = await supabase.from('skill_tracking').update(updates).eq('id', current.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('skill_tracking').insert({
          user_id: user.id,
          skill_name: skill.name.trim(),
          category: skill.category || 'Certification Skill',
          proficiency_level: 'unknown',
          status: 'existing',
          source,
          verification_status: verificationStatus,
          confidence,
          evidence: `Certificate: ${certificateRow.certification_name}`,
          source_record_id: certificateRow.id,
          metadata: { certificate_name: certificateRow.certification_name }
        }).select().single();
        if (error) throw error;
        byName.set(key, data);
      }
    }
  };

  const persistCertificate = async (result, rawExtraction = result, file = null) => {
    let storagePath = null;
    let storageWarning = null;
    if (file) {
      try {
        storagePath = await uploadPrivateDocument({ supabase, userId: user.id, file, bucket: 'student-certificates' });
      } catch (storageError) {
        console.error('Certificate source document storage failed:', storageError);
        storageWarning = 'Certificate findings were saved, but the original certificate file could not be stored.';
      }
    }
    const row = {
      user_id: user.id,
      certification_name: result.certification_name || 'Unknown certificate',
      provider: result.provider || 'Unknown',
      holder_name: result.holder_name || null,
      credential_id: result.credential_id || null,
      verification_url: result.verification_url || null,
      certificate_file_url: null,
      storage_bucket: 'student-certificates',
      storage_path: storagePath,
      is_verified: Boolean(result.is_verified),
      verified_at: result.is_verified ? new Date().toISOString() : null,
      verification_status: result.verification_status || 'no_verification_link',
      verification_method: result.verification_method || 'none',
      verification_message: result.verification_message || null,
      verification_evidence: result.verification_evidence || [],
      verified_url: result.verified_url || null,
      issued_at: result.issue_date || null,
      expires_at: result.expiration_date || null,
      extracted_skills: result.extracted_skills || [],
      raw_extraction: rawExtraction || {},
      status: result.status || 'completed',
      source: result.is_verified ? 'certificate_verified' : 'certificate_extracted',
      updated_at: new Date().toISOString()
    };

    const { data: saved, error } = await supabase.from('saved_certifications').insert(row).select().single();
    if (error) throw error;
    await persistCertificateSkills(saved, result.extracted_skills || []);
    return { ...saved, storage_warning: storageWarning };
  };

  const handleCertificateUpload = async (e) => {
    e.preventDefault();
    if (!certFiles.length) return;
    setUploadingCert(true);
    setNotice(null);

    const savedRows = [];
    const failures = [];
    for (const file of certFiles) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(`${apiBase()}/api/verify-certificate`, { method: 'POST', body: formData });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail || `Certificate processing returned ${response.status}`);
        }
        const result = await response.json();
        savedRows.push(await persistCertificate(result, result, file));
      } catch (error) {
        failures.push(`${file.name}: ${error.message}`);
      }
    }

    if (savedRows.length) {
      setCertifications((current) => [...savedRows.reverse(), ...current]);
      await fetchUserData();
    }
    setCertFiles([]);
    setUploadingCert(false);

    if (failures.length) {
      showMessage(`${savedRows.length} certificate(s) saved. ${failures.length} failed: ${failures.join(' | ')}`, 'error');
    } else {
      showMessage(`${savedRows.length} certificate(s) processed, classified, and saved automatically.`);
    }
  };

  const handleManualCertSave = async (e) => {
    e.preventDefault();
    if (!manualCert.certification_name.trim()) return;
    setSavingManualCert(true);
    try {
      let verification = {
        ...manualCert,
        verification_status: manualCert.verification_url ? 'verification_link_found_unconfirmed' : 'no_verification_link',
        verification_method: manualCert.verification_url ? 'manual_review' : 'none',
        verification_message: manualCert.verification_url ? 'Verification link saved for automatic checking.' : 'No verification link provided.',
        verification_evidence: [],
        is_verified: false,
        extracted_skills: []
      };
      if (manualCert.verification_url) verification = { ...verification, ...(await callLinkVerification(manualCert)) };
      const saved = await persistCertificate(verification, { entry_method: 'manual' });
      setCertifications((current) => [saved, ...current]);
      setManualCert(emptyCert);
      showMessage('Manual certificate entry saved with its verification classification.');
    } catch (error) {
      showMessage(`Certificate could not be saved: ${error.message}`, 'error');
    } finally {
      setSavingManualCert(false);
    }
  };

  const handleReverifyCertificate = async (cert) => {
    if (!cert.verification_url) return;
    setVerifyingCert(cert.id);
    try {
      const result = await callLinkVerification(cert);
      const updates = {
        verification_status: result.verification_status,
        verification_method: result.verification_method,
        verification_message: result.verification_message,
        verification_evidence: result.verification_evidence || [],
        verified_url: result.verified_url || null,
        is_verified: Boolean(result.is_verified),
        verified_at: result.is_verified ? new Date().toISOString() : null,
        source: result.is_verified ? 'certificate_verified' : cert.source,
        updated_at: new Date().toISOString()
      };
      const { data: updated, error } = await supabase.from('saved_certifications').update(updates).eq('id', cert.id).select().single();
      if (error) throw error;

      if (updated.is_verified) {
        const { error: skillError } = await supabase.from('skill_tracking').update({
          source: 'certificate_verified',
          verification_status: 'certificate_verified',
          updated_at: new Date().toISOString()
        }).eq('source_record_id', cert.id);
        if (skillError) throw skillError;
      }

      setCertifications((current) => current.map((item) => item.id === cert.id ? updated : item));
      await fetchUserData();
      showMessage(updated.is_verified ? 'Certificate electronically verified.' : updated.verification_message || 'Verification classification updated.');
    } catch (error) {
      showMessage(`Verification attempt failed: ${error.message}`, 'error');
    } finally {
      setVerifyingCert(null);
    }
  };

  const handleUpdateCertStatus = async (id, status) => {
    const { data, error } = await supabase.from('saved_certifications').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) return showMessage(`Certificate update failed: ${error.message}`, 'error');
    setCertifications((current) => current.map((cert) => cert.id === id ? data : cert));
  };

  const handleDeleteCert = async (id) => {
    if (!window.confirm('Delete this certificate record? Skills learned from other sources will remain.')) return;
    const certificate = certifications.find((cert) => cert.id === id);
    const { error } = await supabase.from('saved_certifications').delete().eq('id', id);
    if (error) return showMessage(`Certificate could not be deleted: ${error.message}`, 'error');
    setCertifications((current) => current.filter((cert) => cert.id !== id));
    if (certificate?.storage_path) {
      try {
        await deletePrivateDocument({ supabase, bucket: certificate.storage_bucket || 'student-certificates', path: certificate.storage_path });
      } catch (storageError) {
        console.error('Certificate storage cleanup failed:', storageError);
        showMessage('Certificate record deleted, but its private source file could not be removed. Please retry storage cleanup later.', 'error');
        return;
      }
    }
    showMessage('Certificate deleted.');
  };

  const getVerificationBadge = (cert) => {
    const status = cert.verification_status;
    if (cert.is_verified || status === 'electronically_verified') return <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">Electronically Verified</span>;
    if (status === 'no_verification_link') return <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">No Verification Link</span>;
    if (status === 'verification_unavailable') return <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-800">Verification Unavailable</span>;
    if (status === 'verification_page_reached_unconfirmed') return <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">Page Reached, Unconfirmed</span>;
    if (status === 'verification_link_invalid' || status === 'verification_redirect_untrusted') return <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">Verification Link Rejected</span>;
    return <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">Manual Review</span>;
  };

  const getSkillVerificationBadge = (skill) => {
    if (skill.verification_status === 'certificate_verified') return <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">Certificate Verified</span>;
    if (skill.verification_status === 'certificate_extracted_unverified') return <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">Certificate Extracted</span>;
    if (skill.verification_status === 'in_progress') return <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">In Progress</span>;
    if (skill.verification_status === 'ai_verified') return <span className="rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-800">AI Extracted</span>;
    return <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">Self-Reported</span>;
  };

  const filteredSkills = trackedSkills.filter((skill) => {
    if (skillFilter === 'all') return true;
    if (skillFilter === 'verified') return skill.verification_status === 'certificate_verified';
    if (skillFilter === 'extracted') return ['ai_verified', 'certificate_extracted_unverified'].includes(skill.verification_status);
    if (skillFilter === 'in_progress') return skill.verification_status === 'in_progress';
    if (skillFilter === 'self_reported') return skill.verification_status === 'self_reported';
    return true;
  });

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-indigo-700 to-purple-700 py-6 text-white">
        <div className="container mx-auto flex flex-col gap-4 px-4 md:flex-row md:items-center md:justify-between">
          <div><h1 className="text-2xl font-bold">Skills Pathfinder</h1><p className="mt-1 text-indigo-100">Your Career Journey</p></div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-2 text-right"><p className="font-semibold">{profile?.full_name || 'User'}</p><p className="text-sm text-indigo-200">{user.email}</p></div>
            <button onClick={onStartOnboarding} className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold hover:bg-yellow-600">Update Profile Journey</button>
            <button onClick={() => setShowReport(true)} className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold hover:bg-green-600">Generate Report</button>
            <button onClick={handleLogout} className="rounded-lg bg-white/20 px-4 py-2 hover:bg-white/30">Logout</button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {notice && <div className={`mb-5 rounded-lg border p-4 text-sm ${notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}><div className="flex justify-between gap-4"><span>{notice.message}</span><button onClick={() => setNotice(null)}>Close</button></div></div>}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <aside className="lg:col-span-1">
            <div className="rounded-xl bg-white p-6 shadow-lg">
              <h2 className="mb-4 font-semibold text-gray-800">Menu</h2>
              <nav className="space-y-2">
                {[
                  ['history', 'Resume History'], ['profile', 'My Profile'], ['skills', 'Skills & Courses'], ['certifications', 'Certifications']
                ].map(([tab, label]) => <button key={tab} onClick={() => setActiveTab(tab)} className={`w-full rounded-lg px-4 py-2 text-left ${activeTab === tab ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}>{label}</button>)}
              </nav>
            </div>
          </aside>

          <section className="lg:col-span-3">
            {activeTab === 'history' && (children || <div className="rounded-xl bg-white p-6 shadow-lg"><h2 className="mb-6 text-2xl font-bold">Resume Analysis History</h2>{analyses.length === 0 ? <div className="py-12 text-center"><p className="mb-4 text-gray-500">No resumes analyzed yet.</p><button onClick={() => onViewAnalysis()} className="rounded-lg bg-indigo-600 px-6 py-2 text-white">Upload Resume</button></div> : <div className="space-y-3">{analyses.map((analysis) => <button key={analysis.id} onClick={() => onViewAnalysis(analysis)} className="block w-full rounded-lg border p-4 text-left hover:border-indigo-300"><div className="flex justify-between"><div><h3 className="font-semibold">{analysis.filename}</h3><p className="text-sm text-gray-500">{analysis.uploaded_at ? new Date(analysis.uploaded_at).toLocaleDateString() : ''} • {analysis.skills_count || 0} skills</p></div><span className="text-indigo-600">View Details</span></div></button>)}</div>}</div>)}

            {activeTab === 'profile' && <div className="rounded-xl bg-white p-6 shadow-lg"><div className="mb-6 flex justify-between"><h2 className="text-2xl font-bold">My Profile</h2>{!isEditingProfile ? <button onClick={() => setIsEditingProfile(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-white">Edit</button> : <div className="flex gap-2"><button onClick={handleCancelProfile} className="rounded-lg bg-gray-200 px-4 py-2">Cancel</button><button onClick={handleSaveProfile} disabled={savingProfile} className="rounded-lg bg-green-600 px-4 py-2 text-white disabled:opacity-50">{savingProfile ? 'Saving...' : 'Save'}</button></div>}</div><div className="grid grid-cols-1 gap-5 md:grid-cols-2">{['full_name','phone','address','city','state','zip_code'].map((field) => <div key={field}><label className="mb-1 block text-sm font-medium capitalize">{field.replace('_',' ')}</label>{isEditingProfile ? <input value={formData[field] || ''} onChange={(e) => setFormData({ ...formData, [field]: e.target.value })} className="w-full rounded-lg border px-3 py-2" /> : <div className="min-h-10 rounded-lg border bg-gray-50 px-3 py-2">{profile?.[field] || 'Not provided'}</div>}</div>)}</div></div>}

            {activeTab === 'skills' && <div className="space-y-6">
              <div className="rounded-xl bg-white p-6 shadow-lg"><h2 className="mb-4 text-2xl font-bold">Skill Inventory</h2><form onSubmit={handleAddSkill} className="grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-4 md:grid-cols-4"><input required placeholder="Skill name" value={newSkill.skill_name} onChange={(e) => setNewSkill({ ...newSkill, skill_name: e.target.value })} className="rounded border px-3 py-2 md:col-span-2" /><select value={newSkill.category} onChange={(e) => setNewSkill({ ...newSkill, category: e.target.value })} className="rounded border px-3 py-2"><option>Domain Knowledge</option><option>Programming Language</option><option>Framework/Library</option><option>Tool/Software</option><option>Data/Analytics</option><option>Healthcare</option><option>Business</option><option>Methodology/Standard</option><option>Soft Skill</option><option>Other</option></select><button className="rounded bg-indigo-600 px-4 py-2 text-white">Add Self-Reported Skill</button></form><div className="my-5 flex flex-wrap gap-2">{[['all','All'],['verified','Verified'],['extracted','Extracted'],['in_progress','In Progress'],['self_reported','Self-Reported']].map(([key,label]) => <button key={key} onClick={() => setSkillFilter(key)} className={`rounded-lg px-3 py-2 text-sm ${skillFilter === key ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>{label}</button>)}</div><div className="space-y-3">{filteredSkills.map((skill) => <div key={skill.id} className="flex flex-col justify-between gap-3 rounded-lg border p-4 md:flex-row md:items-center"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{skill.skill_name}</h3>{getSkillVerificationBadge(skill)}</div><p className="text-sm text-gray-500">{skill.category || 'General'}{skill.evidence ? ` • ${skill.evidence}` : ''}</p></div><div className="flex items-center gap-2"><select value={skill.proficiency_level || 'unknown'} onChange={(e) => handleUpdateSkill(skill.id, { proficiency_level: e.target.value })} className="rounded border px-2 py-1 text-sm"><option value="unknown">Unknown</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option><option value="expert">Expert</option></select><button onClick={() => handleDeleteSkill(skill.id)} className="text-sm text-red-600">Delete</button></div></div>)}{filteredSkills.length === 0 && <p className="py-6 text-center text-gray-500">No skills in this category.</p>}</div></div>

              <div className="rounded-xl bg-white p-6 shadow-lg"><h2 className="mb-2 text-2xl font-bold">Ongoing Courses</h2><p className="mb-4 text-sm text-gray-600">Manual entry is expected here. These courses are used to identify skills already in progress and avoid duplicate learning recommendations.</p><form onSubmit={handleCourseSubmit} className="grid grid-cols-1 gap-3 rounded-lg bg-blue-50 p-4 md:grid-cols-4"><input required placeholder="Course name" value={courseForm.course_name} onChange={(e) => setCourseForm({ ...courseForm, course_name: e.target.value })} className="rounded border px-3 py-2 md:col-span-2" /><input placeholder="Provider" value={courseForm.provider} onChange={(e) => setCourseForm({ ...courseForm, provider: e.target.value })} className="rounded border px-3 py-2" /><input type="date" value={courseForm.expected_completion_date} onChange={(e) => setCourseForm({ ...courseForm, expected_completion_date: e.target.value })} className="rounded border px-3 py-2" /><select value={courseForm.status} onChange={(e) => setCourseForm({ ...courseForm, status: e.target.value })} className="rounded border px-3 py-2"><option value="in_progress">In Progress</option><option value="paused">Paused</option><option value="completed">Completed</option></select><div className="flex gap-2 md:col-span-3"><button className="rounded bg-blue-600 px-4 py-2 text-white">{editingCourseId ? 'Update Course' : 'Add Course'}</button>{editingCourseId && <button type="button" onClick={cancelCourseEdit} className="rounded bg-gray-200 px-4 py-2">Cancel</button>}</div></form><div className="mt-4 space-y-2">{ongoingCourses.map((course) => <div key={course.id} className="flex flex-col justify-between gap-3 rounded-lg border p-4 md:flex-row md:items-center"><div><h3 className="font-medium">{course.course_name}</h3><p className="text-sm text-gray-500">{course.provider || 'Provider not specified'}{course.expected_completion_date ? ` • Expected ${new Date(course.expected_completion_date).toLocaleDateString()}` : ''} • {course.status || 'in_progress'}</p></div><div className="flex gap-3"><button onClick={() => startCourseEdit(course)} className="text-sm text-indigo-600">Edit</button><button onClick={() => handleDeleteCourse(course.id)} className="text-sm text-red-600">Delete</button></div></div>)}</div></div>
            </div>}

            {activeTab === 'certifications' && <div className="space-y-6">
              <div className="rounded-xl bg-white p-6 shadow-lg"><h2 className="mb-2 text-2xl font-bold">Automatic Certificate Processing</h2><p className="mb-4 text-sm text-gray-600">Upload certificate files. Skills Pathfinder extracts fields and skills, attempts electronic verification when a supported link is available, classifies the result, and saves everything automatically.</p><form onSubmit={handleCertificateUpload} className="rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50 p-5"><input type="file" multiple accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" onChange={(e) => setCertFiles(Array.from(e.target.files || []))} className="block w-full rounded border bg-white p-2" /><div className="mt-3 flex flex-wrap items-center gap-3"><button disabled={uploadingCert || certFiles.length === 0} className="rounded bg-indigo-600 px-5 py-2 text-white disabled:opacity-50">{uploadingCert ? 'Processing...' : `Process & Save ${certFiles.length || ''} Certificate${certFiles.length === 1 ? '' : 's'}`}</button>{certFiles.length > 0 && <button type="button" onClick={() => setCertFiles([])} className="rounded bg-gray-200 px-4 py-2">Cancel Selection</button>}</div></form></div>

              <div className="rounded-xl bg-white p-6 shadow-lg"><h3 className="mb-2 text-xl font-bold">Manual Certificate Entry</h3><p className="mb-4 text-sm text-gray-600">Use this only when the certificate file is unavailable. LinkedIn, Udemy, Coursera, Credly and other supported verification links are checked electronically when possible.</p><form onSubmit={handleManualCertSave} className="grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-4 md:grid-cols-2"><input required placeholder="Certification name" value={manualCert.certification_name} onChange={(e) => setManualCert({ ...manualCert, certification_name: e.target.value })} className="rounded border px-3 py-2" /><input placeholder="Provider" value={manualCert.provider} onChange={(e) => setManualCert({ ...manualCert, provider: e.target.value })} className="rounded border px-3 py-2" /><input placeholder="Holder name" value={manualCert.holder_name} onChange={(e) => setManualCert({ ...manualCert, holder_name: e.target.value })} className="rounded border px-3 py-2" /><input placeholder="Credential ID" value={manualCert.credential_id} onChange={(e) => setManualCert({ ...manualCert, credential_id: e.target.value })} className="rounded border px-3 py-2" /><input type="url" placeholder="Verification URL" value={manualCert.verification_url} onChange={(e) => setManualCert({ ...manualCert, verification_url: e.target.value })} className="rounded border px-3 py-2 md:col-span-2" /><div className="flex gap-2 md:col-span-2"><button disabled={savingManualCert} className="rounded bg-indigo-600 px-5 py-2 text-white disabled:opacity-50">{savingManualCert ? 'Saving...' : 'Save Manual Entry'}</button><button type="button" onClick={() => setManualCert(emptyCert)} className="rounded bg-gray-200 px-4 py-2">Clear</button></div></form></div>

              <div className="rounded-xl bg-white p-6 shadow-lg"><h3 className="mb-4 text-xl font-bold">Saved Certifications</h3><div className="space-y-3">{certifications.map((cert) => <div key={cert.id} className="rounded-lg border p-4"><div className="flex flex-col justify-between gap-3 md:flex-row"><div><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{cert.certification_name}</h4>{getVerificationBadge(cert)}</div><p className="text-sm text-gray-500">{cert.provider || 'Unknown provider'}{cert.credential_id ? ` • ID ${cert.credential_id}` : ''}</p>{cert.verification_message && <p className="mt-1 text-sm text-gray-600">{cert.verification_message}</p>}{Array.isArray(cert.extracted_skills) && cert.extracted_skills.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{cert.extracted_skills.slice(0,12).map((skill,index) => <span key={`${skill.name}-${index}`} className="rounded-full bg-purple-50 px-2 py-1 text-xs text-purple-800">{skill.name}</span>)}</div>}</div><div className="flex flex-wrap items-center gap-2">{cert.verification_url && <><a href={cert.verification_url} target="_blank" rel="noreferrer" className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700">Open Link</a><button onClick={() => handleReverifyCertificate(cert)} disabled={verifyingCert === cert.id} className="rounded bg-blue-100 px-3 py-1 text-sm text-blue-700 disabled:opacity-50">{verifyingCert === cert.id ? 'Checking...' : 'Verify Again'}</button></>}<select value={cert.status || 'completed'} onChange={(e) => handleUpdateCertStatus(cert.id, e.target.value)} className="rounded border px-2 py-1 text-sm"><option value="recommended">Recommended</option><option value="in_progress">In Progress</option><option value="completed">Completed</option></select><button onClick={() => handleDeleteCert(cert.id)} className="text-sm text-red-600">Delete</button></div></div></div>)}{certifications.length === 0 && <p className="py-6 text-center text-gray-500">No certificates saved yet.</p>}</div></div>
            </div>}
          </section>
        </div>
      </main>

      {showReport && <CareerReport user={user} profile={profile} skills={trackedSkills} certifications={certifications} courses={ongoingCourses} onClose={() => setShowReport(false)} />}
    </div>
  );
};

export default UserDashboard;
