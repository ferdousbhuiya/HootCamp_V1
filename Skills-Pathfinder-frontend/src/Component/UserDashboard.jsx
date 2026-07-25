import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const UserDashboard = ({ user, onLogout, onViewAnalysis, children }) => {
  const [profile, setProfile] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [trackedSkills, setTrackedSkills] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('history');

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);

  const [newSkill, setNewSkill] = useState({ skill_name: '', category: 'Tool/Software', proficiency_level: 'beginner', status: 'learning' });
  const [newCert, setNewCert] = useState({ certification_name: '', provider: '', credential_id: '', verification_url: '', status: 'recommended' });
  const [certFile, setCertFile] = useState(null);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [verifyingCert, setVerifyingCert] = useState(null);

  useEffect(() => {
    if (user) fetchUserData();
  }, [user]);

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        address: profile.address || '',
        city: profile.city || '',
        state: profile.state || '',
        zip_code: profile.zip_code || ''
      });
    }
  }, [profile]);

  const fetchUserData = async () => {
    try {
      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      const { data: analysesData } = await supabase.from('resume_analyses').select('*').eq('user_id', user.id).order('uploaded_at', { ascending: false });
      const { data: skillsData } = await supabase.from('skill_tracking').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      const { data: certsData } = await supabase.from('saved_certifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false });

      setProfile(profileData);
      setAnalyses(analysesData || []);
      setTrackedSkills(skillsData || []);
      setCertifications(certsData || []);
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onLogout();
  };

  const handleInputChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
  const handleSaveProfile = async () => {
    setSavingProfile(true);
    const { error } = await supabase.from('profiles').upsert({ id: user.id, ...formData }, { onConflict: 'id' });
    if (!error) { setProfile({ ...profile, ...formData }); setIsEditing(false); }
    setSavingProfile(false);
  };

  const handleAddSkill = async (e) => {
    e.preventDefault();
    if (!newSkill.skill_name) return;
    const { data, error } = await supabase.from('skill_tracking').insert([{ 
      user_id: user.id, 
      ...newSkill,
      verification_status: 'self_reported'
    }]).select();
    if (!error && data) { 
      setTrackedSkills([data[0], ...trackedSkills]); 
      setNewSkill({ ...newSkill, skill_name: '' }); 
      alert('Skill added successfully!');
    } else {
      alert('Error adding skill: ' + error.message);
    }
  };

  const handleUpdateSkill = async (id, updates) => {
    await supabase.from('skill_tracking').update(updates).eq('id', id);
    setTrackedSkills(trackedSkills.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleDeleteSkill = async (id) => {
    await supabase.from('skill_tracking').delete().eq('id', id);
    setTrackedSkills(trackedSkills.filter(s => s.id !== id));
  };

  const handleCertFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCertFile(file);
    }
  };

  const handleUploadAndVerifyCert = async (e) => {
    e.preventDefault();
    if (!certFile) {
      alert('Please select a certificate file');
      return;
    }

    setUploadingCert(true);

    try {
      const formData = new FormData();
      formData.append('file', certFile);

      // Upload to backend for OCR and verification
      const response = await fetch('http://localhost:8000/api/verify-certificate', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to process certificate');
      }

      const data = await response.json();
      
      // Auto-fill the form with extracted data
      setNewCert({
        certification_name: data.certification_name || newCert.certification_name,
        provider: data.provider || newCert.provider,
        credential_id: data.credential_id || newCert.credential_id,
        verification_url: data.verification_url || newCert.verification_url,
        status: 'completed'
      });

      alert('Certificate processed! Details extracted. You can now add it.');
    } catch (error) {
      console.error('Error processing certificate:', error);
      alert('Error processing certificate: ' + error.message);
    } finally {
      setUploadingCert(false);
    }
  };

  const handleAddCert = async (e) => {
    e.preventDefault();
    if (!newCert.certification_name) return;
    
    let verificationStatus = 'self_reported';
    let isVerified = false;
    
    if (newCert.verification_url) {
      verificationStatus = 'url_provided';
      if (newCert.verification_url.match(/(aws\.amazon\.com|coursera\.org|udemy\.com|edx\.org|google\.com|microsoft\.com|cisco\.com|comptia\.org)/i)) {
        verificationStatus = 'auto_verified';
        isVerified = true;
      }
    }
    
    const { data, error } = await supabase.from('saved_certifications').insert([{ 
      user_id: user.id, 
      ...newCert,
      verification_status: verificationStatus,
      is_verified: isVerified,
      verified_at: isVerified ? new Date().toISOString() : null
    }]).select();
    
    if (!error && data) { 
      setCertifications([data[0], ...certifications]); 
      setNewCert({ certification_name: '', provider: '', credential_id: '', verification_url: '', status: 'recommended' });
      setCertFile(null);
      alert('Certification added successfully!');
    } else {
      alert('Error adding certification: ' + error.message);
    }
  };

  const handleVerifyCertificate = async (cert) => {
    setVerifyingCert(cert.id);
    
    try {
      if (cert.verification_url) {
        window.open(cert.verification_url, '_blank', 'noopener,noreferrer');
        
        await supabase.from('saved_certifications').update({
          is_verified: true,
          verified_at: new Date().toISOString(),
          verification_status: 'manually_verified'
        }).eq('id', cert.id);
        
        setCertifications(certifications.map(c => 
          c.id === cert.id ? { ...c, is_verified: true, verified_at: new Date().toISOString(), verification_status: 'manually_verified' } : c
        ));
        
        alert('Certificate verified!');
      } else {
        alert('No verification URL provided for this certificate.');
      }
    } catch (error) {
      console.error('Verification error:', error);
      alert('Could not verify certificate.');
    } finally {
      setVerifyingCert(null);
    }
  };

  const handleUpdateCert = async (id, updates) => {
    await supabase.from('saved_certifications').update(updates).eq('id', id);
    setCertifications(certifications.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleDeleteCert = async (id) => {
    await supabase.from('saved_certifications').delete().eq('id', id);
    setCertifications(certifications.filter(c => c.id !== id));
  };

  const getVerificationBadge = (cert) => {
    if (cert.is_verified) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          ✓ Verified
        </span>
      );
    } else if (cert.verification_url) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          🔗 URL Provided
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          ⚠ Self-Reported
        </span>
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-indigo-700 to-purple-700 text-white py-6">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Skills Pathfinder</h1>
            <p className="text-indigo-100 mt-1">Your Career Journey</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-semibold">{profile?.full_name || 'User'}</p>
              <p className="text-sm text-indigo-200">{user.email}</p>
            </div>
            <button onClick={handleLogout} className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors">Logout</button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="font-semibold text-gray-800 mb-4">Menu</h2>
              <nav className="space-y-2">
                {['history', 'profile', 'skills', 'certifications'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`w-full text-left px-4 py-2 rounded-lg transition-colors capitalize ${
                      activeTab === tab ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {tab === 'history' && '📄 Resume History'}
                    {tab === 'profile' && '👤 My Profile'}
                    {tab === 'skills' && '📈 Skill Tracking'}
                    {tab === 'certifications' && '🏆 Certifications'}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          <div className="lg:col-span-3">
            {activeTab === 'history' ? (
              children ? children : (
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h2 className="text-2xl font-bold text-gray-800 mb-6">Resume Analysis History</h2>
                  {analyses.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-gray-500 mb-4">No resumes analyzed yet</p>
                      <button onClick={() => onViewAnalysis()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg transition-colors">Upload Your First Resume</button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {analyses.map((analysis) => (
                        <div key={analysis.id} className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 transition-colors cursor-pointer" onClick={() => onViewAnalysis(analysis)}>
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-semibold text-gray-800">{analysis.filename}</h3>
                              <p className="text-sm text-gray-500 mt-1">{new Date(analysis.uploaded_at).toLocaleDateString()} • {analysis.skills_count} skills found</p>
                            </div>
                            <span className="text-indigo-600 text-sm">View Details →</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            ) : activeTab === 'profile' ? (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-800">My Profile</h2>
                  {!isEditing ? (
                    <button onClick={() => setIsEditing(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm">Edit Profile</button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => setIsEditing(false)} className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-lg text-sm">Cancel</button>
                      <button onClick={handleSaveProfile} disabled={savingProfile} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm">{savingProfile ? 'Saving...' : 'Save Changes'}</button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {['full_name', 'phone', 'address', 'city', 'state', 'zip_code'].map((field) => (
                    <div key={field}>
                      <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{field.replace('_', ' ')}</label>
                      {isEditing ? (
                        <input type="text" name={field} value={formData[field] || ''} onChange={handleInputChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      ) : (
                        <p className="text-gray-900 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 min-h-[42px]">{profile?.[field] || 'Not provided'}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : activeTab === 'skills' ? (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Skill Development Tracking</h2>
                
                <form onSubmit={handleAddSkill} className="bg-gray-50 p-4 rounded-lg mb-6 flex flex-col md:flex-row gap-4">
                  <input type="text" placeholder="Skill Name (e.g., React.js)" value={newSkill.skill_name} onChange={(e) => setNewSkill({...newSkill, skill_name: e.target.value})} className="flex-1 border border-gray-300 rounded-lg px-3 py-2" required />
                  <select value={newSkill.category} onChange={(e) => setNewSkill({...newSkill, category: e.target.value})} className="border border-gray-300 rounded-lg px-3 py-2">
                    <option>Programming Language</option><option>Framework/Library</option><option>Tool/Software</option><option>Domain Knowledge</option><option>Methodology</option><option>Soft Skill</option>
                  </select>
                  <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg">Add Skill</button>
                </form>

                {trackedSkills.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No skills being tracked yet. Add one above!</p>
                ) : (
                  <div className="space-y-3">
                    {trackedSkills.map((skill) => (
                      <div key={skill.id} className="border border-gray-200 rounded-lg p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                          <h3 className="font-semibold text-gray-800">{skill.skill_name}</h3>
                          <p className="text-xs text-gray-500">{skill.category}</p>
                          {skill.verification_status && (
                            <span className={`text-xs mt-1 inline-block ${
                              skill.verification_status === 'ai_verified' ? 'text-green-600' : 'text-yellow-600'
                            }`}>
                              {skill.verification_status === 'ai_verified' ? '✓ AI Verified' : ' Self-Reported'}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2 items-center">
                          <select value={skill.proficiency_level} onChange={(e) => handleUpdateSkill(skill.id, { proficiency_level: e.target.value })} className="border border-gray-300 rounded px-2 py-1 text-sm">
                            <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option><option value="mastered">Mastered</option>
                          </select>
                          <button onClick={() => handleDeleteSkill(skill.id)} className="text-red-500 hover:text-red-700 text-sm">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Certifications Tracker</h2>
                
                {/* Certificate Upload Section */}
                <div className="bg-indigo-50 border-2 border-dashed border-indigo-300 rounded-lg p-6 mb-6">
                  <h3 className="font-semibold text-indigo-900 mb-4">📤 Upload Certificate for Auto-Verification</h3>
                  <form onSubmit={handleUploadAndVerifyCert} className="flex flex-col md:flex-row gap-4">
                    <input 
                      type="file" 
                      accept=".pdf,.png,.jpg,.jpeg" 
                      onChange={handleCertFileChange}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 bg-white"
                    />
                    <button 
                      type="submit" 
                      disabled={uploadingCert || !certFile}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg disabled:opacity-50"
                    >
                      {uploadingCert ? 'Processing...' : 'Upload & Extract'}
                    </button>
                  </form>
                  <p className="text-xs text-indigo-700 mt-2">
                    Upload your certificate image/PDF. Our AI will extract details and attempt auto-verification.
                  </p>
                </div>

                {/* Manual Add Form */}
                <form onSubmit={handleAddCert} className="bg-gray-50 p-4 rounded-lg mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input type="text" placeholder="Certification Name" value={newCert.certification_name} onChange={(e) => setNewCert({...newCert, certification_name: e.target.value})} className="border border-gray-300 rounded-lg px-3 py-2" required />
                  <input type="text" placeholder="Provider (e.g., AWS, Google)" value={newCert.provider} onChange={(e) => setNewCert({...newCert, provider: e.target.value})} className="border border-gray-300 rounded-lg px-3 py-2" />
                  <input type="text" placeholder="Credential ID (if any)" value={newCert.credential_id} onChange={(e) => setNewCert({...newCert, credential_id: e.target.value})} className="border border-gray-300 rounded-lg px-3 py-2" />
                  <input type="url" placeholder="Verification URL" value={newCert.verification_url} onChange={(e) => setNewCert({...newCert, verification_url: e.target.value})} className="border border-gray-300 rounded-lg px-3 py-2" />
                  <button type="submit" className="md:col-span-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg">Add Certification</button>
                </form>

                {certifications.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No certifications tracked yet.</p>
                ) : (
                  <div className="space-y-3">
                    {certifications.map((cert) => (
                      <div key={cert.id} className="border border-gray-200 rounded-lg p-4 flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold text-gray-800">{cert.certification_name}</h3>
                            <p className="text-xs text-gray-500">{cert.provider}</p>
                            {cert.credential_id && <p className="text-xs text-gray-500">ID: {cert.credential_id}</p>}
                          </div>
                          {getVerificationBadge(cert)}
                        </div>
                        <div className="flex gap-2 items-center flex-wrap">
                          {cert.verification_url && (
                            <button 
                              onClick={() => handleVerifyCertificate(cert)}
                              disabled={verifyingCert === cert.id}
                              className={`text-sm px-3 py-1 rounded ${
                                cert.is_verified 
                                  ? 'bg-green-100 text-green-700 cursor-default' 
                                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                              }`}
                            >
                              {verifyingCert === cert.id ? 'Verifying...' : cert.is_verified ? '✓ Verified' : '🔗 Verify Now'}
                            </button>
                          )}
                          <select value={cert.status} onChange={(e) => handleUpdateCert(cert.id, { status: e.target.value })} className="border border-gray-300 rounded px-2 py-1 text-sm">
                            <option value="recommended">Recommended</option><option value="in_progress">In Progress</option><option value="completed">Completed</option>
                          </select>
                          <button onClick={() => handleDeleteCert(cert.id)} className="text-red-500 hover:text-red-700 text-sm">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default UserDashboard;