import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const emptyProfile = { institution: '', program_name: '', field_of_study: '', degree_level: '', academic_status: 'enrolled', credits_earned: '', credits_in_progress: '', expected_graduation_date: '', gpa: '', interests: '', notes: '' };
const emptySubject = { subject_name: '', subject_code: '', subject_area: '', credit_hours: '', grade: '', semester: '', institution: '', status: 'completed', skills_learned: '' };
const emptyGoal = { career_title: '', target_date: '', motivation: '' };
const normalize = (value = '') => String(value).trim().toLowerCase();

const subjectIdeas = {
  biology: ['General Chemistry', 'Organic Chemistry', 'Statistics for Life Sciences', 'Genetics', 'Cell Biology', 'Research Methods'],
  medicine: ['General Chemistry', 'Organic Chemistry', 'Physics', 'Biochemistry', 'Genetics', 'Psychology'],
  nursing: ['Anatomy & Physiology', 'Microbiology', 'Nutrition', 'Statistics', 'Developmental Psychology', 'Pathophysiology'],
  biotechnology: ['Genetics', 'Molecular Biology', 'Biochemistry', 'Bioinformatics', 'Statistics', 'Research Methods'],
  'data analyst': ['Statistics', 'Database Systems', 'SQL', 'Data Visualization', 'Programming with Python', 'Business Analytics'],
  cybersecurity: ['Computer Networks', 'Operating Systems', 'Cybersecurity Fundamentals', 'Linux', 'Programming', 'Cloud Security'],
  software: ['Programming Fundamentals', 'Data Structures', 'Database Systems', 'Web Development', 'Software Engineering', 'Computer Networks'],
  business: ['Accounting', 'Microeconomics', 'Statistics', 'Marketing', 'Finance', 'Business Communication'],
  finance: ['Financial Accounting', 'Economics', 'Statistics', 'Corporate Finance', 'Investments', 'Financial Modeling'],
  psychology: ['General Psychology', 'Statistics', 'Research Methods', 'Developmental Psychology', 'Abnormal Psychology', 'Social Psychology'],
  education: ['Educational Psychology', 'Curriculum Design', 'Assessment', 'Classroom Management', 'Instructional Technology', 'Special Education'],
  engineering: ['Calculus', 'Physics', 'Programming', 'Engineering Design', 'Statistics', 'Project Management'],
  electrical: ['Calculus', 'Physics', 'Circuit Analysis', 'Digital Logic', 'Electronics', 'Signals and Systems'],
  history: ['Historical Methods', 'Academic Writing', 'Research Methods', 'Digital Humanities', 'Public History', 'Statistics for Social Sciences']
};

const AcademicPathways = ({ user, onOpenCareerIntelligence, onBack }) => {
  const [profile, setProfile] = useState(emptyProfile);
  const [subjects, setSubjects] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [goal, setGoal] = useState(emptyGoal);
  const [subjectForm, setSubjectForm] = useState(emptySubject);
  const [certSubjectDrafts, setCertSubjectDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = async () => {
    if (!user?.id) return;
    const [profileResult, subjectResult, goalResult, certResult] = await Promise.all([
      supabase.from('academic_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('academic_subjects').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('career_goals').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('saved_certifications').select('id,certification_name,provider,subjects,credit_hours,credential_type,is_verified').eq('user_id', user.id).order('created_at', { ascending: false })
    ]);
    const failure = [profileResult, subjectResult, goalResult].find((item) => item.error);
    if (failure?.error) return setNotice({ type: 'error', message: `Academic pathway data could not load: ${failure.error.message}. Apply the academic pathway migration first.` });
    if (profileResult.data) setProfile({ ...emptyProfile, ...profileResult.data, interests: Array.isArray(profileResult.data.interests) ? profileResult.data.interests.join(', ') : '' });
    setSubjects(subjectResult.data || []);
    if (goalResult.data) setGoal({ ...emptyGoal, ...goalResult.data });
    if (!certResult.error) setCertificates(certResult.data || []);
  };

  useEffect(() => { load(); }, [user?.id]);

  const saveProfile = async (e) => {
    e.preventDefault(); setSaving(true); setNotice(null);
    const { error } = await supabase.from('academic_profiles').upsert({
      user_id: user.id, ...profile,
      credits_earned: Number(profile.credits_earned || 0), credits_in_progress: Number(profile.credits_in_progress || 0),
      gpa: profile.gpa === '' ? null : Number(profile.gpa), expected_graduation_date: profile.expected_graduation_date || null,
      interests: profile.interests.split(',').map((x) => x.trim()).filter(Boolean), updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    setSaving(false); setNotice(error ? { type: 'error', message: error.message } : { type: 'success', message: 'Academic profile saved.' });
  };

  const addSubject = async (e) => {
    e.preventDefault(); if (!subjectForm.subject_name.trim()) return;
    const { data, error } = await supabase.from('academic_subjects').insert({
      user_id: user.id, ...subjectForm, subject_name: subjectForm.subject_name.trim(), credit_hours: Number(subjectForm.credit_hours || 0),
      skills_learned: subjectForm.skills_learned.split(',').map((x) => x.trim()).filter(Boolean)
    }).select().single();
    if (error) return setNotice({ type: 'error', message: error.message });
    setSubjects((current) => [data, ...current]); setSubjectForm(emptySubject); setNotice({ type: 'success', message: 'Subject saved.' });
  };

  const saveGoal = async (e) => {
    e.preventDefault(); if (!goal.career_title.trim()) return; setSaving(true);
    await supabase.from('career_goals').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('user_id', user.id).eq('status', 'active');
    const { data, error } = await supabase.from('career_goals').insert({ user_id: user.id, career_title: goal.career_title.trim(), target_date: goal.target_date || null, motivation: goal.motivation || null, goal_type: 'primary', status: 'active' }).select().single();
    setSaving(false); if (error) return setNotice({ type: 'error', message: error.message }); setGoal({ ...emptyGoal, ...data }); setNotice({ type: 'success', message: 'Career goal saved.' });
  };

  const saveCertificateSubjects = async (certificate) => {
    const draft = certSubjectDrafts[certificate.id] || '';
    const subjectsList = draft.split(',').map((x) => x.trim()).filter(Boolean);
    const { data, error } = await supabase.from('saved_certifications').update({ subjects: subjectsList, updated_at: new Date().toISOString() }).eq('id', certificate.id).select().single();
    if (error) return setNotice({ type: 'error', message: `Certificate subjects could not be saved: ${error.message}` });
    setCertificates((current) => current.map((item) => item.id === certificate.id ? data : item));
    setNotice({ type: 'success', message: 'Certificate subjects saved.' });
  };

  const analyzeAcademicProfile = async () => {
    if (!profile.field_of_study && !profile.program_name && subjects.length === 0) return setNotice({ type: 'error', message: 'Add your program or at least one subject before generating Career Intelligence.' });
    setAnalyzing(true); setNotice(null);
    const certificateText = certificates.map((cert) => `${cert.certification_name}; provider ${cert.provider || 'unknown'}; subjects ${(cert.subjects || []).join(', ')}`).join('\n');
    const text = [
      `ACADEMIC PROGRAM\nInstitution: ${profile.institution}\nProgram: ${profile.program_name}\nField of study: ${profile.field_of_study}\nDegree level: ${profile.degree_level}\nCredits earned: ${profile.credits_earned}\nCredits in progress: ${profile.credits_in_progress}\nInterests: ${profile.interests}`,
      `CAREER GOAL\n${goal.career_title}\n${goal.motivation || ''}`,
      `ACADEMIC SUBJECTS\n${subjects.map((s) => `${s.subject_name} (${s.credit_hours || 0} credits, ${s.status}); skills: ${(s.skills_learned || []).join(', ')}`).join('\n')}`,
      `CERTIFICATES AND DIPLOMAS\n${certificateText}`
    ].join('\n\n');

    try {
      const formData = new FormData();
      formData.append('file', new File([text], 'academic-career-profile.txt', { type: 'text/plain' }));
      const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const response = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.detail || `Analysis returned ${response.status}`); }
      const result = await response.json();
      const { data: analysis, error: saveError } = await supabase.from('resume_analyses').insert({
        user_id: user.id, filename: 'Academic Career Profile', character_count: result.character_count, skills_count: result.extracted_skills?.length || 0,
        extracted_skills: result.extracted_skills || [], explanations: result.explanations || [], recommendations: result.recommendations || [], ai_failed: Boolean(result.ai_failed),
        extraction_status: result.ai_failed ? 'fallback_completed' : 'completed', document_type: 'academic_profile', raw_analysis: { ...result, academic_profile: profile, academic_subjects: subjects, career_goal: goal }
      }).select('id').single();
      if (saveError) throw saveError;

      const { data: existing } = await supabase.from('skill_tracking').select('id,skill_name,confidence').eq('user_id', user.id);
      const existingMap = new Map((existing || []).map((item) => [normalize(item.skill_name), item]));
      for (const skill of result.extracted_skills || []) {
        if (!skill?.name) continue;
        const current = existingMap.get(normalize(skill.name));
        if (current) {
          await supabase.from('skill_tracking').update({ confidence: Math.max(Number(current.confidence || 0), Number(skill.confidence || 0.75)), metadata: { academic_profile_analysis_id: analysis.id }, updated_at: new Date().toISOString() }).eq('id', current.id);
        } else {
          await supabase.from('skill_tracking').insert({ user_id: user.id, skill_name: skill.name, category: skill.category || 'Academic Evidence', proficiency_level: 'unknown', status: 'existing', source: 'self_reported', verification_status: 'ai_verified', confidence: Number(skill.confidence || 0.75), evidence: 'Academic profile, subjects, or certificate subjects', metadata: { academic_profile_analysis_id: analysis.id } });
        }
      }
      setNotice({ type: 'success', message: `Academic profile analyzed successfully. ${result.extracted_skills?.length || 0} skills and ${result.recommendations?.length || 0} career paths were generated.` });
    } catch (err) {
      setNotice({ type: 'error', message: `Academic career analysis failed: ${err.message}` });
    } finally { setAnalyzing(false); }
  };

  const completedNames = new Set(subjects.map((s) => normalize(s.subject_name)));
  const recommendations = useMemo(() => {
    const keyText = `${goal.career_title} ${profile.field_of_study} ${profile.program_name}`.toLowerCase();
    const key = Object.keys(subjectIdeas).find((item) => keyText.includes(item));
    const list = key ? subjectIdeas[key] : ['Statistics', 'Research Methods', 'Professional Communication', 'Digital Literacy', 'Project-Based Learning'];
    return list.filter((item) => !completedNames.has(normalize(item))).slice(0, 5);
  }, [goal.career_title, profile.field_of_study, profile.program_name, subjects]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-wrap justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300">Resume optional pathway</p><h2 className="mt-2 text-3xl font-black tracking-tight">Academic Profile & Career Goal</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Start with your major, subjects, credits, diplomas, trade certificates or career goal. A resume can be added later.</p></div>{onBack && <button onClick={onBack} className="h-fit rounded-xl border border-white/15 px-4 py-2 text-sm font-bold">Back to Dashboard</button>}</div>
      </section>
      {notice && <div className={`rounded-2xl border p-4 text-sm ${notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{notice.message}</div>}

      <div className="grid gap-6 xl:grid-cols-3">
        <form onSubmit={saveProfile} className="app-card p-6 xl:col-span-2"><h3 className="text-xl font-bold text-slate-900">Study profile</h3><div className="mt-5 grid gap-4 md:grid-cols-2">{[
          ['institution','Institution','text'],['program_name','Program / degree','text'],['field_of_study','Major / field of study','text'],['degree_level','Degree level','text'],['credits_earned','Credits earned','number'],['credits_in_progress','Credits in progress','number'],['gpa','GPA','number'],['expected_graduation_date','Expected graduation','date']
        ].map(([field,label,type]) => <div key={field}><label className="mb-1 block text-sm font-semibold text-slate-700">{label}</label><input type={type} step={field === 'gpa' ? '0.01' : '0.5'} value={profile[field] ?? ''} onChange={(e) => setProfile({ ...profile, [field]: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" /></div>)}<div className="md:col-span-2"><label className="mb-1 block text-sm font-semibold text-slate-700">Interests</label><input value={profile.interests || ''} onChange={(e) => setProfile({ ...profile, interests: e.target.value })} placeholder="biology, healthcare, research, technology" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" /></div></div><button disabled={saving} className="mt-5 rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white">Save academic profile</button></form>
        <form onSubmit={saveGoal} className="rounded-2xl border border-teal-200 bg-teal-50 p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Primary target</p><h3 className="mt-1 text-xl font-bold text-slate-900">Career goal</h3><input value={goal.career_title || ''} onChange={(e) => setGoal({ ...goal, career_title: e.target.value })} placeholder="Physician, Biologist, Data Analyst..." className="mt-4 w-full rounded-xl border border-teal-200 bg-white px-3 py-2.5" /><input type="date" value={goal.target_date || ''} onChange={(e) => setGoal({ ...goal, target_date: e.target.value })} className="mt-3 w-full rounded-xl border border-teal-200 bg-white px-3 py-2.5" /><textarea rows={4} value={goal.motivation || ''} onChange={(e) => setGoal({ ...goal, motivation: e.target.value })} placeholder="Why are you interested in this goal?" className="mt-3 w-full rounded-xl border border-teal-200 bg-white p-3" /><button disabled={saving} className="mt-3 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white">Save career goal</button></form>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <form onSubmit={addSubject} className="app-card p-6"><h3 className="text-xl font-bold">Add subject</h3><p className="mt-1 text-sm text-slate-500">Add unlimited completed, current or planned subjects.</p><div className="mt-4 space-y-3"><input required placeholder="Subject name" value={subjectForm.subject_name} onChange={(e) => setSubjectForm({ ...subjectForm, subject_name: e.target.value })} className="w-full rounded-xl border px-3 py-2.5" /><div className="grid grid-cols-2 gap-3"><input placeholder="Code" value={subjectForm.subject_code} onChange={(e) => setSubjectForm({ ...subjectForm, subject_code: e.target.value })} className="rounded-xl border px-3 py-2.5" /><input type="number" step="0.5" placeholder="Credits" value={subjectForm.credit_hours} onChange={(e) => setSubjectForm({ ...subjectForm, credit_hours: e.target.value })} className="rounded-xl border px-3 py-2.5" /></div><input placeholder="Subject area" value={subjectForm.subject_area} onChange={(e) => setSubjectForm({ ...subjectForm, subject_area: e.target.value })} className="w-full rounded-xl border px-3 py-2.5" /><div className="grid grid-cols-2 gap-3"><input placeholder="Semester" value={subjectForm.semester} onChange={(e) => setSubjectForm({ ...subjectForm, semester: e.target.value })} className="rounded-xl border px-3 py-2.5" /><input placeholder="Grade" value={subjectForm.grade} onChange={(e) => setSubjectForm({ ...subjectForm, grade: e.target.value })} className="rounded-xl border px-3 py-2.5" /></div><select value={subjectForm.status} onChange={(e) => setSubjectForm({ ...subjectForm, status: e.target.value })} className="w-full rounded-xl border px-3 py-2.5"><option value="completed">Completed</option><option value="in_progress">In progress</option><option value="planned">Planned</option></select><input placeholder="Skills learned, comma separated" value={subjectForm.skills_learned} onChange={(e) => setSubjectForm({ ...subjectForm, skills_learned: e.target.value })} className="w-full rounded-xl border px-3 py-2.5" /></div><button className="mt-4 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white">Add subject</button></form>
        <div className="app-card p-6 xl:col-span-2"><div className="flex justify-between"><div><h3 className="text-xl font-bold">Academic record</h3><p className="text-sm text-slate-500">{subjects.length} subjects · {subjects.reduce((sum,s) => sum + Number(s.credit_hours || 0), 0)} recorded credits</p></div></div><div className="mt-5 space-y-3">{subjects.map((s) => <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><div><p className="font-bold text-slate-900">{s.subject_name}</p><p className="text-xs text-slate-500">{s.semester || 'Semester not set'} · {s.credit_hours || 0} credits · {s.status}</p></div><button onClick={async () => { if (!window.confirm('Remove this subject?')) return; const { error } = await supabase.from('academic_subjects').delete().eq('id', s.id); if (!error) setSubjects((current) => current.filter((x) => x.id !== s.id)); }} className="text-xs font-bold text-rose-600">Remove</button></div>)}{subjects.length === 0 && <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">No subjects recorded yet.</p>}</div></div>
      </div>

      {certificates.length > 0 && <section className="app-card p-6"><p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-700">Certificate subject evidence</p><h3 className="mt-1 text-xl font-bold text-slate-950">Add subjects covered by diplomas, trade or vocational certificates</h3><div className="mt-5 grid gap-4 lg:grid-cols-2">{certificates.map((cert) => <div key={cert.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex justify-between gap-3"><div><p className="font-bold text-slate-900">{cert.certification_name}</p><p className="text-xs text-slate-500">{cert.provider || 'Provider not recorded'} {cert.is_verified ? '· verified' : ''}</p></div></div><input value={certSubjectDrafts[cert.id] ?? (cert.subjects || []).join(', ')} onChange={(e) => setCertSubjectDrafts({ ...certSubjectDrafts, [cert.id]: e.target.value })} placeholder="Subjects, comma separated" className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5" /><button onClick={() => saveCertificateSubjects(cert)} className="mt-3 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white">Save subjects</button></div>)}</div></section>}

      <section className="rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Next semester planning</p><h3 className="mt-1 text-2xl font-black text-slate-900">Subjects to consider for {goal.career_title || profile.field_of_study || 'your goal'}</h3><p className="mt-2 text-sm text-slate-600">Planning prompts only. Always check degree requirements and prerequisites with your academic advisor.</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{recommendations.map((item, i) => <div key={item} className="rounded-2xl border border-sky-100 bg-white p-4"><span className="text-xs font-bold text-sky-700">OPTION {i + 1}</span><p className="mt-1 font-bold text-slate-900">{item}</p></div>)}</div><div className="mt-6 flex flex-wrap gap-3"><button onClick={analyzeAcademicProfile} disabled={analyzing} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{analyzing ? 'Analyzing academic evidence…' : 'Generate Career Intelligence from Academic Profile'}</button><button onClick={onOpenCareerIntelligence} className="rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white">Open Career Intelligence</button></div></section>
    </div>
  );
};

export default AcademicPathways;
