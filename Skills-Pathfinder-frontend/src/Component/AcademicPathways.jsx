import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const emptyProfile = {
  institution: '', program_name: '', field_of_study: '', degree_level: '', academic_status: 'enrolled',
  credits_earned: '', credits_in_progress: '', expected_graduation_date: '', gpa: '', interests: '', notes: ''
};
const emptySubject = { subject_name: '', subject_code: '', subject_area: '', credit_hours: '', grade: '', semester: '', institution: '', status: 'completed', skills_learned: '' };
const emptyGoal = { career_title: '', target_date: '', motivation: '' };

const subjectIdeas = {
  biology: ['General Chemistry', 'Organic Chemistry', 'Statistics for Life Sciences', 'Genetics', 'Cell Biology', 'Research Methods'],
  medicine: ['General Chemistry', 'Organic Chemistry', 'Physics', 'Biochemistry', 'Genetics', 'Psychology'],
  nursing: ['Anatomy & Physiology', 'Microbiology', 'Nutrition', 'Statistics', 'Developmental Psychology', 'Pathophysiology'],
  biotechnology: ['Genetics', 'Molecular Biology', 'Biochemistry', 'Bioinformatics', 'Statistics', 'Research Methods'],
  'data analyst': ['Statistics', 'Database Systems', 'SQL', 'Data Visualization', 'Programming with Python', 'Business Analytics'],
  'data scientist': ['Statistics', 'Linear Algebra', 'Python Programming', 'Machine Learning', 'Database Systems', 'Data Mining'],
  cybersecurity: ['Computer Networks', 'Operating Systems', 'Cybersecurity Fundamentals', 'Linux', 'Programming', 'Cloud Security'],
  software: ['Programming Fundamentals', 'Data Structures', 'Database Systems', 'Web Development', 'Software Engineering', 'Computer Networks'],
  business: ['Accounting', 'Microeconomics', 'Statistics', 'Marketing', 'Finance', 'Business Communication'],
  accounting: ['Financial Accounting', 'Managerial Accounting', 'Business Law', 'Taxation', 'Auditing', 'Accounting Information Systems'],
  finance: ['Financial Accounting', 'Economics', 'Statistics', 'Corporate Finance', 'Investments', 'Financial Modeling'],
  marketing: ['Marketing Principles', 'Consumer Behavior', 'Statistics', 'Digital Marketing', 'Market Research', 'Business Communication'],
  psychology: ['General Psychology', 'Statistics', 'Research Methods', 'Developmental Psychology', 'Abnormal Psychology', 'Social Psychology'],
  education: ['Educational Psychology', 'Curriculum Design', 'Assessment', 'Classroom Management', 'Instructional Technology', 'Special Education'],
  engineering: ['Calculus', 'Physics', 'Programming', 'Engineering Design', 'Statistics', 'Project Management'],
  electrical: ['Calculus', 'Physics', 'Circuit Analysis', 'Digital Logic', 'Electronics', 'Signals and Systems'],
  history: ['Historical Methods', 'Academic Writing', 'Research Methods', 'Digital Humanities', 'Public History', 'Statistics for Social Sciences']
};

const normalize = (value = '') => String(value).trim().toLowerCase();

const AcademicPathways = ({ user, onOpenCareerIntelligence }) => {
  const [profile, setProfile] = useState(emptyProfile);
  const [subjects, setSubjects] = useState([]);
  const [goal, setGoal] = useState(emptyGoal);
  const [subjectForm, setSubjectForm] = useState(emptySubject);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = async () => {
    if (!user?.id) return;
    const [profileResult, subjectResult, goalResult] = await Promise.all([
      supabase.from('academic_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('academic_subjects').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('career_goals').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()
    ]);
    const failure = [profileResult, subjectResult, goalResult].find((item) => item.error);
    if (failure?.error) {
      setNotice({ type: 'error', message: `Academic pathway data could not load: ${failure.error.message}. Apply the academic pathway migration first if this is a new deployment.` });
      return;
    }
    if (profileResult.data) setProfile({
      ...emptyProfile,
      ...profileResult.data,
      interests: Array.isArray(profileResult.data.interests) ? profileResult.data.interests.join(', ') : ''
    });
    setSubjects(subjectResult.data || []);
    if (goalResult.data) setGoal({ ...emptyGoal, ...goalResult.data });
  };

  useEffect(() => { load(); }, [user?.id]);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    const payload = {
      user_id: user.id,
      ...profile,
      credits_earned: profile.credits_earned === '' ? 0 : Number(profile.credits_earned),
      credits_in_progress: profile.credits_in_progress === '' ? 0 : Number(profile.credits_in_progress),
      gpa: profile.gpa === '' ? null : Number(profile.gpa),
      expected_graduation_date: profile.expected_graduation_date || null,
      interests: profile.interests.split(',').map((item) => item.trim()).filter(Boolean),
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from('academic_profiles').upsert(payload, { onConflict: 'user_id' });
    setSaving(false);
    setNotice(error ? { type: 'error', message: `Academic profile could not be saved: ${error.message}` } : { type: 'success', message: 'Academic profile saved.' });
  };

  const addSubject = async (e) => {
    e.preventDefault();
    if (!subjectForm.subject_name.trim()) return;
    const payload = {
      user_id: user.id,
      ...subjectForm,
      subject_name: subjectForm.subject_name.trim(),
      credit_hours: subjectForm.credit_hours === '' ? 0 : Number(subjectForm.credit_hours),
      skills_learned: subjectForm.skills_learned.split(',').map((item) => item.trim()).filter(Boolean)
    };
    const { data, error } = await supabase.from('academic_subjects').insert(payload).select().single();
    if (error) return setNotice({ type: 'error', message: `Subject could not be saved: ${error.message}` });
    setSubjects((current) => [data, ...current]);
    setSubjectForm(emptySubject);
    setNotice({ type: 'success', message: 'Subject and credits saved.' });
  };

  const deleteSubject = async (id) => {
    if (!window.confirm('Remove this subject from your academic record?')) return;
    const { error } = await supabase.from('academic_subjects').delete().eq('id', id);
    if (!error) setSubjects((current) => current.filter((item) => item.id !== id));
  };

  const saveGoal = async (e) => {
    e.preventDefault();
    if (!goal.career_title.trim()) return;
    setSaving(true);
    await supabase.from('career_goals').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('user_id', user.id).eq('status', 'active');
    const { data, error } = await supabase.from('career_goals').insert({
      user_id: user.id,
      career_title: goal.career_title.trim(),
      target_date: goal.target_date || null,
      motivation: goal.motivation || null,
      goal_type: 'primary',
      status: 'active'
    }).select().single();
    setSaving(false);
    if (error) return setNotice({ type: 'error', message: `Career goal could not be saved: ${error.message}` });
    setGoal({ ...emptyGoal, ...data });
    setNotice({ type: 'success', message: 'Primary career goal saved.' });
  };

  const creditsFromSubjects = subjects.reduce((sum, item) => sum + Number(item.credit_hours || 0), 0);
  const completedNames = new Set(subjects.map((item) => normalize(item.subject_name)));

  const recommendations = useMemo(() => {
    const keyText = `${goal.career_title} ${profile.field_of_study} ${profile.program_name}`.toLowerCase();
    const matchedKey = Object.keys(subjectIdeas).find((key) => keyText.includes(key));
    const ideas = matchedKey ? subjectIdeas[matchedKey] : ['Statistics', 'Research Methods', 'Professional Communication', 'Digital Literacy', 'Project-Based Learning'];
    return ideas.filter((subject) => !completedNames.has(normalize(subject))).slice(0, 5);
  }, [goal.career_title, profile.field_of_study, profile.program_name, subjects]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-6 text-white shadow-xl sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300">Resume optional pathway</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight">Academic Profile & Career Goal</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Designed for students who may not have a resume yet. Record your program, subjects, credits, certificates and target career. Skills Pathfinder can use this evidence alongside any resume you add later.</p>
      </section>

      {notice && <div className={`rounded-2xl border p-4 text-sm ${notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{notice.message}</div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <form onSubmit={saveProfile} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <h3 className="text-xl font-bold text-slate-900">Study profile</h3>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              ['institution','Institution'], ['program_name','Program / degree name'], ['field_of_study','Major / field of study'], ['degree_level','Degree level'],
              ['credits_earned','Credits earned'], ['credits_in_progress','Credits in progress'], ['gpa','GPA'], ['expected_graduation_date','Expected graduation']
            ].map(([field,label]) => <div key={field}><label className="mb-1 block text-sm font-semibold text-slate-700">{label}</label><input type={field.includes('credits') || field === 'gpa' ? 'number' : field === 'expected_graduation_date' ? 'date' : 'text'} step={field === 'gpa' ? '0.01' : '0.5'} value={profile[field] ?? ''} onChange={(e) => setProfile({ ...profile, [field]: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" /></div>)}
            <div className="md:col-span-2"><label className="mb-1 block text-sm font-semibold text-slate-700">Interests</label><input value={profile.interests || ''} onChange={(e) => setProfile({ ...profile, interests: e.target.value })} placeholder="biology, healthcare, research, technology" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" /></div>
          </div>
          <button disabled={saving} className="mt-5 rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">Save academic profile</button>
        </form>

        <form onSubmit={saveGoal} className="rounded-2xl border border-teal-200 bg-teal-50 p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Primary target</p>
          <h3 className="mt-1 text-xl font-bold text-slate-900">Career goal</h3>
          <label className="mt-4 block text-sm font-semibold text-slate-700">Career or professional goal</label>
          <input value={goal.career_title || ''} onChange={(e) => setGoal({ ...goal, career_title: e.target.value })} placeholder="Physician, Research Scientist, Data Analyst..." className="mt-1 w-full rounded-xl border border-teal-200 bg-white px-3 py-2.5" />
          <label className="mt-4 block text-sm font-semibold text-slate-700">Target date</label>
          <input type="date" value={goal.target_date || ''} onChange={(e) => setGoal({ ...goal, target_date: e.target.value })} className="mt-1 w-full rounded-xl border border-teal-200 bg-white px-3 py-2.5" />
          <label className="mt-4 block text-sm font-semibold text-slate-700">Why this goal?</label>
          <textarea rows={4} value={goal.motivation || ''} onChange={(e) => setGoal({ ...goal, motivation: e.target.value })} className="mt-1 w-full rounded-xl border border-teal-200 bg-white p-3" />
          <button disabled={saving} className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white">Save career goal</button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <form onSubmit={addSubject} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-bold text-slate-900">Add subject or course</h3>
          <p className="mt-1 text-sm text-slate-500">Add as many completed or current subjects as you need.</p>
          <div className="mt-4 space-y-3">
            <input required placeholder="Subject name" value={subjectForm.subject_name} onChange={(e) => setSubjectForm({ ...subjectForm, subject_name: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" />
            <div className="grid grid-cols-2 gap-3"><input placeholder="Code" value={subjectForm.subject_code} onChange={(e) => setSubjectForm({ ...subjectForm, subject_code: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5" /><input type="number" step="0.5" placeholder="Credits" value={subjectForm.credit_hours} onChange={(e) => setSubjectForm({ ...subjectForm, credit_hours: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5" /></div>
            <input placeholder="Subject area" value={subjectForm.subject_area} onChange={(e) => setSubjectForm({ ...subjectForm, subject_area: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" />
            <div className="grid grid-cols-2 gap-3"><input placeholder="Semester" value={subjectForm.semester} onChange={(e) => setSubjectForm({ ...subjectForm, semester: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5" /><input placeholder="Grade" value={subjectForm.grade} onChange={(e) => setSubjectForm({ ...subjectForm, grade: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5" /></div>
            <select value={subjectForm.status} onChange={(e) => setSubjectForm({ ...subjectForm, status: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5"><option value="completed">Completed</option><option value="in_progress">In progress</option><option value="planned">Planned</option></select>
            <input placeholder="Skills learned, comma separated" value={subjectForm.skills_learned} onChange={(e) => setSubjectForm({ ...subjectForm, skills_learned: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" />
          </div>
          <button className="mt-4 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white">Add subject</button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-xl font-bold text-slate-900">Academic record</h3><p className="text-sm text-slate-500">{subjects.length} subjects · {creditsFromSubjects} recorded credits</p></div><span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-800">Profile credits: {Number(profile.credits_earned || 0)} earned + {Number(profile.credits_in_progress || 0)} in progress</span></div>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3">Subject</th><th className="pb-3">Semester</th><th className="pb-3">Credits</th><th className="pb-3">Status</th><th className="pb-3">Grade</th><th /></tr></thead><tbody>{subjects.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="py-3"><p className="font-semibold text-slate-900">{item.subject_name}</p><p className="text-xs text-slate-500">{item.subject_code || item.subject_area || ''}</p></td><td>{item.semester || '—'}</td><td>{item.credit_hours || 0}</td><td><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium">{item.status}</span></td><td>{item.grade || '—'}</td><td><button onClick={() => deleteSubject(item.id)} className="text-xs font-semibold text-rose-600">Remove</button></td></tr>)}</tbody></table>{subjects.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No subjects recorded yet.</p>}</div>
        </div>
      </div>

      <section className="rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6 shadow-sm sm:p-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Next semester planning</p><h3 className="mt-1 text-2xl font-black text-slate-900">Subjects to consider for {goal.career_title || profile.field_of_study || 'your goal'}</h3><p className="mt-2 text-sm leading-6 text-slate-600">These are planning prompts, not registration requirements. Check prerequisites and degree requirements with your academic advisor before enrolling.</p><div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">{recommendations.map((item, index) => <div key={item} className="rounded-2xl border border-sky-100 bg-white p-4"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-sky-100 text-sm font-black text-sky-800">{index + 1}</span><span className="font-bold text-slate-900">{item}</span></div></div>)}</div></div>
          <div className="rounded-2xl bg-slate-950 p-5 text-white"><p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-300">Use all your evidence</p><p className="mt-2 text-sm leading-6 text-slate-300">Career Intelligence can combine resume evidence, certificates, academic subjects, self-reported skills and ongoing courses. A student can start here with no resume and add one later.</p><button onClick={onOpenCareerIntelligence} className="mt-5 w-full rounded-xl bg-teal-400 px-4 py-3 text-sm font-bold text-slate-950">Open Career Intelligence</button></div>
        </div>
      </section>
    </div>
  );
};

export default AcademicPathways;
