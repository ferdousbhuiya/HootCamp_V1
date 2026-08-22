import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const emptyProfile = {
  institution: '',
  program_name: '',
  field_of_study: '',
  degree_level: '',
  academic_status: 'enrolled',
  credits_earned: '',
  credits_in_progress: '',
  expected_graduation_date: '',
  gpa: '',
  interests: '',
  notes: ''
};

const emptySubject = {
  subject_name: '',
  subject_code: '',
  subject_area: '',
  credit_hours: '',
  grade: '',
  semester: '',
  institution: '',
  status: 'completed',
  skills_learned: ''
};

const emptyGoal = { career_title: '', target_date: '', motivation: '' };
const normalize = (value = '') => String(value).trim().replace(/\s+/g, ' ').toLowerCase();
const toList = (value) => Array.isArray(value) ? value : [];
const parseCommaList = (value = '') => String(value).split(',').map((item) => item.trim()).filter(Boolean);

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
  const [courses, setCourses] = useState([]);
  const [goal, setGoal] = useState(emptyGoal);
  const [subjectForm, setSubjectForm] = useState(emptySubject);
  const [certSubjectDrafts, setCertSubjectDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    setNotice(null);
    try {
      const [profileResult, subjectResult, goalResult, certResult, courseResult] = await Promise.all([
        supabase.from('academic_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('academic_subjects').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('career_goals').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('saved_certifications').select('id,certification_name,provider,subjects,credit_hours,credential_type,is_verified,verification_status').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('ongoing_courses').select('id,course_name,provider,status,subject_area,credit_hours,semester,institution,extracted_skills').eq('user_id', user.id).order('created_at', { ascending: false })
      ]);

      const failure = [profileResult, subjectResult, goalResult, certResult, courseResult].find((item) => item.error);
      if (failure?.error) throw failure.error;

      if (profileResult.data) {
        setProfile({
          ...emptyProfile,
          ...profileResult.data,
          interests: toList(profileResult.data.interests).join(', ')
        });
      } else {
        setProfile(emptyProfile);
      }
      setSubjects(subjectResult.data || []);
      setCertificates(certResult.data || []);
      setCourses(courseResult.data || []);
      setGoal(goalResult.data ? { ...emptyGoal, ...goalResult.data } : emptyGoal);
    } catch (error) {
      setNotice({
        type: 'error',
        message: `Academic pathway data could not load: ${error.message}`
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.id]);

  const saveProfile = async (event) => {
    event.preventDefault();
    if (!user?.id) return;
    setSaving(true);
    setNotice(null);
    try {
      const payload = {
        user_id: user.id,
        institution: profile.institution || null,
        program_name: profile.program_name || null,
        field_of_study: profile.field_of_study || null,
        degree_level: profile.degree_level || null,
        academic_status: profile.academic_status || 'enrolled',
        credits_earned: Number(profile.credits_earned || 0),
        credits_in_progress: Number(profile.credits_in_progress || 0),
        expected_graduation_date: profile.expected_graduation_date || null,
        gpa: profile.gpa === '' ? null : Number(profile.gpa),
        interests: parseCommaList(profile.interests),
        notes: profile.notes || null,
        updated_at: new Date().toISOString()
      };
      const { error } = await supabase.from('academic_profiles').upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;
      setNotice({ type: 'success', message: 'Academic profile saved.' });
    } catch (error) {
      setNotice({ type: 'error', message: `Academic profile could not be saved: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const addSubject = async (event) => {
    event.preventDefault();
    if (!user?.id || !subjectForm.subject_name.trim()) return;
    setNotice(null);
    try {
      const { data, error } = await supabase.from('academic_subjects').insert({
        user_id: user.id,
        subject_name: subjectForm.subject_name.trim(),
        subject_code: subjectForm.subject_code || null,
        subject_area: subjectForm.subject_area || null,
        credit_hours: Number(subjectForm.credit_hours || 0),
        grade: subjectForm.grade || null,
        semester: subjectForm.semester || null,
        institution: subjectForm.institution || profile.institution || null,
        status: subjectForm.status || 'completed',
        skills_learned: parseCommaList(subjectForm.skills_learned),
        notes: null
      }).select().single();
      if (error) throw error;
      setSubjects((current) => [data, ...current]);
      setSubjectForm(emptySubject);
      setNotice({ type: 'success', message: 'Subject saved.' });
    } catch (error) {
      setNotice({ type: 'error', message: `Subject could not be saved: ${error.message}` });
    }
  };

  const removeSubject = async (subjectId) => {
    if (!window.confirm('Remove this subject?')) return;
    const { error } = await supabase.from('academic_subjects').delete().eq('id', subjectId).eq('user_id', user.id);
    if (error) {
      setNotice({ type: 'error', message: `Subject could not be removed: ${error.message}` });
      return;
    }
    setSubjects((current) => current.filter((item) => item.id !== subjectId));
    setNotice({ type: 'success', message: 'Subject removed.' });
  };

  const saveGoal = async (event) => {
    event.preventDefault();
    if (!user?.id || !goal.career_title.trim()) return;
    setSaving(true);
    setNotice(null);
    try {
      const { data, error } = await supabase.from('career_goals').insert({
        user_id: user.id,
        career_title: goal.career_title.trim(),
        target_date: goal.target_date || null,
        motivation: goal.motivation || null,
        goal_type: 'primary',
        status: 'active',
        source: 'student_selected'
      }).select().single();
      if (error) throw error;

      const { error: archiveError } = await supabase.from('career_goals')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('status', 'active')
        .neq('id', data.id);
      if (archiveError) throw archiveError;

      setGoal({ ...emptyGoal, ...data });
      setNotice({ type: 'success', message: 'Career goal saved.' });
    } catch (error) {
      setNotice({ type: 'error', message: `Career goal could not be saved: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const saveCertificateSubjects = async (certificate) => {
    const subjectsList = parseCommaList(certSubjectDrafts[certificate.id] ?? toList(certificate.subjects).join(', '));
    const { data, error } = await supabase.from('saved_certifications')
      .update({ subjects: subjectsList, updated_at: new Date().toISOString() })
      .eq('id', certificate.id)
      .eq('user_id', user.id)
      .select('id,certification_name,provider,subjects,credit_hours,credential_type,is_verified,verification_status')
      .single();
    if (error) {
      setNotice({ type: 'error', message: `Certificate subjects could not be saved: ${error.message}` });
      return;
    }
    setCertificates((current) => current.map((item) => item.id === certificate.id ? data : item));
    setCertSubjectDrafts((current) => ({ ...current, [certificate.id]: toList(data.subjects).join(', ') }));
    setNotice({ type: 'success', message: 'Certificate subjects saved.' });
  };

  const persistAcademicSkills = async (analysisId, extractedSkills) => {
    const { data: existing, error: existingError } = await supabase.from('skill_tracking')
      .select('id,skill_name,category,source,verification_status,confidence,evidence,source_record_id,metadata')
      .eq('user_id', user.id);
    if (existingError) throw existingError;

    const existingMap = new Map((existing || []).map((item) => [normalize(item.skill_name), item]));
    for (const skill of extractedSkills) {
      if (!skill?.name?.trim()) continue;
      const key = normalize(skill.name);
      const current = existingMap.get(key);
      const confidence = Number.isFinite(Number(skill.confidence)) ? Number(skill.confidence) : 0.75;
      const academicSource = {
        source: 'academic_profile',
        source_record_id: analysisId,
        verification_status: 'ai_verified',
        evidence: 'Academic profile, subjects, courses, or certificate subjects'
      };

      if (current) {
        const existingSources = toList(current.metadata?.sources);
        const mergedSources = [
          ...existingSources.filter((item) => !(item?.source === 'academic_profile' && item?.source_record_id === analysisId)),
          academicSource
        ];
        const { error } = await supabase.from('skill_tracking').update({
          category: current.category || skill.category || 'Academic Evidence',
          confidence: Math.max(Number(current.confidence || 0), confidence),
          evidence: current.evidence || academicSource.evidence,
          metadata: {
            ...(current.metadata || {}),
            academic_profile_analysis_id: analysisId,
            sources: mergedSources
          },
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq('id', current.id).eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('skill_tracking').insert({
          user_id: user.id,
          skill_name: skill.name.trim(),
          category: skill.category || 'Academic Evidence',
          proficiency_level: 'unknown',
          status: 'existing',
          source: 'self_reported',
          verification_status: 'ai_verified',
          confidence,
          evidence: academicSource.evidence,
          source_record_id: analysisId,
          metadata: {
            academic_profile_analysis_id: analysisId,
            sources: [academicSource]
          },
          last_seen_at: new Date().toISOString()
        }).select('id,skill_name,metadata').single();
        if (error) throw error;
        existingMap.set(key, data);
      }
    }
  };

  const persistCareerRecommendations = async (analysisId, recommendations) => {
    if (!recommendations.length) return;
    const rows = recommendations.map((recommendation, index) => ({
      user_id: user.id,
      client_record_key: `academic:${analysisId}:${recommendation.id || index}`,
      source_analysis_id: analysisId,
      career_id: recommendation.id || null,
      career_title: recommendation.path || recommendation.career_title || 'Career path',
      category: recommendation.category || null,
      match_score: recommendation.match_score ?? null,
      match_percentage: recommendation.match_percentage ?? null,
      skill_gap_percentage: recommendation.skill_gap_percentage ?? null,
      matched_skills: recommendation.matched_skills || [],
      missing_skills: recommendation.missing_skills || [],
      recommendation_data: recommendation,
      market_data: {},
      updated_at: new Date().toISOString()
    }));
    const { error } = await supabase.from('career_recommendations')
      .upsert(rows, { onConflict: 'user_id,client_record_key' });
    if (error) throw error;
  };

  const analyzeAcademicProfile = async () => {
    if (!user?.id) return;
    if (!profile.field_of_study && !profile.program_name && subjects.length === 0) {
      setNotice({ type: 'error', message: 'Add your program or at least one subject before generating Career Intelligence.' });
      return;
    }

    setAnalyzing(true);
    setNotice(null);
    try {
      const certificateText = certificates.map((certificate) =>
        `${certificate.certification_name}; provider ${certificate.provider || 'unknown'}; subjects ${toList(certificate.subjects).join(', ')}; verification ${certificate.verification_status || (certificate.is_verified ? 'verified' : 'unverified')}`
      ).join('\n');
      const courseText = courses.map((course) =>
        `${course.course_name}; subject area ${course.subject_area || 'not set'}; ${course.credit_hours || 0} credits; status ${course.status || 'in_progress'}; skills ${toList(course.extracted_skills).map((skill) => skill?.name || skill).filter(Boolean).join(', ')}`
      ).join('\n');
      const text = [
        `ACADEMIC PROGRAM\nInstitution: ${profile.institution}\nProgram: ${profile.program_name}\nField of study: ${profile.field_of_study}\nDegree level: ${profile.degree_level}\nCredits earned: ${profile.credits_earned}\nCredits in progress: ${profile.credits_in_progress}\nGPA: ${profile.gpa}\nInterests: ${profile.interests}`,
        `CAREER GOAL\n${goal.career_title}\n${goal.motivation || ''}`,
        `ACADEMIC SUBJECTS\n${subjects.map((subject) => `${subject.subject_name} (${subject.credit_hours || 0} credits, ${subject.status}); area: ${subject.subject_area || 'not set'}; skills: ${toList(subject.skills_learned).join(', ')}`).join('\n')}`,
        `ONGOING COURSES\n${courseText}`,
        `CERTIFICATES AND DIPLOMAS\n${certificateText}`
      ].join('\n\n');

      const formData = new FormData();
      formData.append('file', new File([text], 'academic-career-profile.txt', { type: 'text/plain' }));
      const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const response = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `Analysis returned ${response.status}`);
      }

      const result = await response.json();
      const extractedSkills = toList(result.extracted_skills);
      const recommendations = toList(result.recommendations);
      const { data: analysis, error: saveError } = await supabase.from('resume_analyses').insert({
        user_id: user.id,
        filename: 'Academic Career Profile',
        character_count: result.character_count || text.length,
        skills_count: extractedSkills.length,
        extracted_skills: extractedSkills,
        explanations: toList(result.explanations),
        recommendations,
        ai_failed: Boolean(result.ai_failed),
        extraction_status: result.ai_failed ? 'fallback_completed' : 'completed',
        document_type: 'academic_profile',
        raw_analysis: {
          ...result,
          academic_profile: profile,
          academic_subjects: subjects,
          ongoing_courses: courses,
          certificates,
          career_goal: goal
        }
      }).select('id').single();
      if (saveError) throw saveError;

      await persistAcademicSkills(analysis.id, extractedSkills);
      await persistCareerRecommendations(analysis.id, recommendations);

      const { error: findingError } = await supabase.from('career_findings').upsert({
        user_id: user.id,
        client_record_key: `academic-analysis:${analysis.id}`,
        finding_type: 'academic_career_analysis',
        source_type: 'resume_analyses',
        source_id: analysis.id,
        title: goal.career_title ? `Academic pathway toward ${goal.career_title}` : 'Academic career analysis',
        status: 'active',
        data: {
          academic_profile: profile,
          academic_subjects: subjects,
          ongoing_courses: courses,
          career_goal: goal,
          extracted_skills: extractedSkills,
          recommendations
        },
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,client_record_key' });
      if (findingError) throw findingError;

      setNotice({
        type: 'success',
        message: `Academic profile analyzed successfully. ${extractedSkills.length} skills and ${recommendations.length} career paths were saved.`
      });

      if (typeof onOpenCareerIntelligence === 'function') {
        await onOpenCareerIntelligence();
      }
    } catch (error) {
      setNotice({ type: 'error', message: `Academic career analysis failed: ${error.message}` });
    } finally {
      setAnalyzing(false);
    }
  };

  const completedNames = new Set(subjects.filter((subject) => subject.status === 'completed').map((subject) => normalize(subject.subject_name)));
  const activeCourseNames = new Set(courses.filter((course) => ['in_progress', 'active'].includes(normalize(course.status))).map((course) => normalize(course.course_name)));
  const recommendations = useMemo(() => {
    const keyText = `${goal.career_title} ${profile.field_of_study} ${profile.program_name}`.toLowerCase();
    const key = Object.keys(subjectIdeas).find((item) => keyText.includes(item));
    const list = key ? subjectIdeas[key] : ['Statistics', 'Research Methods', 'Professional Communication', 'Digital Literacy', 'Project-Based Learning'];
    return list.filter((item) => !completedNames.has(normalize(item)) && !activeCourseNames.has(normalize(item))).slice(0, 5);
  }, [goal.career_title, profile.field_of_study, profile.program_name, subjects, courses]);

  const recordedCredits = subjects.reduce((sum, subject) => sum + Number(subject.credit_hours || 0), 0);
  const handleBack = () => {
    if (typeof onBack === 'function') {
      onBack();
      return;
    }
    window.location.reload();
  };

  if (loading) {
    return <div className="app-card flex min-h-[420px] items-center justify-center p-8"><div className="text-center"><div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-teal-100 border-t-teal-600" /><p className="mt-4 text-sm font-medium text-slate-500">Loading academic pathway…</p></div></div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300">Resume optional pathway</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Academic Profile & Career Goal</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Start with your major, subjects, credits, certificates, current courses or career goal. A resume can be added later.</p>
          </div>
          <button type="button" onClick={handleBack} className="h-fit rounded-xl border border-white/15 px-4 py-2 text-sm font-bold">Back to Dashboard</button>
        </div>
      </section>

      {notice && <div className={`rounded-2xl border p-4 text-sm ${notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{notice.message}</div>}

      <div className="grid gap-6 xl:grid-cols-3">
        <form onSubmit={saveProfile} className="app-card p-6 xl:col-span-2">
          <h3 className="text-xl font-bold text-slate-900">Study profile</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {[
              ['institution', 'Institution', 'text'],
              ['program_name', 'Program / degree', 'text'],
              ['field_of_study', 'Major / field of study', 'text'],
              ['degree_level', 'Degree level', 'text'],
              ['credits_earned', 'Credits earned', 'number'],
              ['credits_in_progress', 'Credits in progress', 'number'],
              ['gpa', 'GPA', 'number'],
              ['expected_graduation_date', 'Expected graduation', 'date']
            ].map(([field, label, type]) => <div key={field}><label className="mb-1 block text-sm font-semibold text-slate-700">{label}</label><input type={type} step={field === 'gpa' ? '0.01' : '0.5'} value={profile[field] ?? ''} onChange={(event) => setProfile({ ...profile, [field]: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" /></div>)}
            <div className="md:col-span-2"><label className="mb-1 block text-sm font-semibold text-slate-700">Interests</label><input value={profile.interests || ''} onChange={(event) => setProfile({ ...profile, interests: event.target.value })} placeholder="biology, healthcare, research, technology" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" /></div>
          </div>
          <button disabled={saving} className="mt-5 rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save academic profile'}</button>
        </form>

        <form onSubmit={saveGoal} className="rounded-2xl border border-teal-200 bg-teal-50 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Primary target</p>
          <h3 className="mt-1 text-xl font-bold text-slate-900">Career goal</h3>
          <input value={goal.career_title || ''} onChange={(event) => setGoal({ ...goal, career_title: event.target.value })} placeholder="Physician, Biologist, Data Analyst..." className="mt-4 w-full rounded-xl border border-teal-200 bg-white px-3 py-2.5" />
          <input type="date" value={goal.target_date || ''} onChange={(event) => setGoal({ ...goal, target_date: event.target.value })} className="mt-3 w-full rounded-xl border border-teal-200 bg-white px-3 py-2.5" />
          <textarea rows={4} value={goal.motivation || ''} onChange={(event) => setGoal({ ...goal, motivation: event.target.value })} placeholder="Why are you interested in this goal?" className="mt-3 w-full rounded-xl border border-teal-200 bg-white p-3" />
          <button disabled={saving || !goal.career_title.trim()} className="mt-3 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Save career goal</button>
        </form>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <form onSubmit={addSubject} className="app-card p-6">
          <h3 className="text-xl font-bold">Add subject</h3>
          <p className="mt-1 text-sm text-slate-500">Add completed, current or planned subjects.</p>
          <div className="mt-4 space-y-3">
            <input required placeholder="Subject name" value={subjectForm.subject_name} onChange={(event) => setSubjectForm({ ...subjectForm, subject_name: event.target.value })} className="w-full rounded-xl border px-3 py-2.5" />
            <div className="grid grid-cols-2 gap-3"><input placeholder="Code" value={subjectForm.subject_code} onChange={(event) => setSubjectForm({ ...subjectForm, subject_code: event.target.value })} className="rounded-xl border px-3 py-2.5" /><input type="number" step="0.5" placeholder="Credits" value={subjectForm.credit_hours} onChange={(event) => setSubjectForm({ ...subjectForm, credit_hours: event.target.value })} className="rounded-xl border px-3 py-2.5" /></div>
            <input placeholder="Subject area" value={subjectForm.subject_area} onChange={(event) => setSubjectForm({ ...subjectForm, subject_area: event.target.value })} className="w-full rounded-xl border px-3 py-2.5" />
            <div className="grid grid-cols-2 gap-3"><input placeholder="Semester" value={subjectForm.semester} onChange={(event) => setSubjectForm({ ...subjectForm, semester: event.target.value })} className="rounded-xl border px-3 py-2.5" /><input placeholder="Grade" value={subjectForm.grade} onChange={(event) => setSubjectForm({ ...subjectForm, grade: event.target.value })} className="rounded-xl border px-3 py-2.5" /></div>
            <select value={subjectForm.status} onChange={(event) => setSubjectForm({ ...subjectForm, status: event.target.value })} className="w-full rounded-xl border px-3 py-2.5"><option value="completed">Completed</option><option value="in_progress">In progress</option><option value="planned">Planned</option></select>
            <input placeholder="Skills learned, comma separated" value={subjectForm.skills_learned} onChange={(event) => setSubjectForm({ ...subjectForm, skills_learned: event.target.value })} className="w-full rounded-xl border px-3 py-2.5" />
          </div>
          <button className="mt-4 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white">Add subject</button>
        </form>

        <div className="app-card p-6 xl:col-span-2">
          <div><h3 className="text-xl font-bold">Academic record</h3><p className="text-sm text-slate-500">{subjects.length} subjects · {recordedCredits} recorded credits</p></div>
          <div className="mt-5 space-y-3">
            {subjects.map((subject) => <div key={subject.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><div><p className="font-bold text-slate-900">{subject.subject_name}</p><p className="text-xs text-slate-500">{subject.semester || 'Semester not set'} · {subject.credit_hours || 0} credits · {subject.status}</p></div><button type="button" onClick={() => removeSubject(subject.id)} className="text-xs font-bold text-rose-600">Remove</button></div>)}
            {subjects.length === 0 && <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">No subjects recorded yet.</p>}
          </div>
        </div>
      </div>

      {courses.length > 0 && <section className="app-card p-6"><p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700">Current learning</p><h3 className="mt-1 text-xl font-bold text-slate-950">Ongoing courses included in analysis</h3><div className="mt-4 grid gap-3 md:grid-cols-2">{courses.map((course) => <div key={course.id} className="rounded-xl border border-slate-200 p-4"><p className="font-bold text-slate-900">{course.course_name}</p><p className="mt-1 text-xs text-slate-500">{course.subject_area || 'Subject area not set'} · {course.credit_hours || 0} credits · {course.status || 'in_progress'}</p></div>)}</div></section>}

      {certificates.length > 0 && <section className="app-card p-6"><p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-700">Certificate subject evidence</p><h3 className="mt-1 text-xl font-bold text-slate-950">Add subjects covered by diplomas, trade or vocational certificates</h3><div className="mt-5 grid gap-4 lg:grid-cols-2">{certificates.map((certificate) => <div key={certificate.id} className="rounded-2xl border border-slate-200 p-4"><div><p className="font-bold text-slate-900">{certificate.certification_name}</p><p className="text-xs text-slate-500">{certificate.provider || 'Provider not recorded'} {certificate.is_verified ? '· verified' : ''}</p></div><input value={certSubjectDrafts[certificate.id] ?? toList(certificate.subjects).join(', ')} onChange={(event) => setCertSubjectDrafts({ ...certSubjectDrafts, [certificate.id]: event.target.value })} placeholder="Subjects, comma separated" className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5" /><button type="button" onClick={() => saveCertificateSubjects(certificate)} className="mt-3 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white">Save subjects</button></div>)}</div></section>}

      <section className="rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Next semester planning</p>
        <h3 className="mt-1 text-2xl font-black text-slate-900">Subjects to consider for {goal.career_title || profile.field_of_study || 'your goal'}</h3>
        <p className="mt-2 text-sm text-slate-600">These suggestions exclude subjects already completed and matching active courses. Always check degree requirements and prerequisites with your academic advisor.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{recommendations.map((item, index) => <div key={item} className="rounded-2xl border border-sky-100 bg-white p-4"><span className="text-xs font-bold text-sky-700">OPTION {index + 1}</span><p className="mt-1 font-bold text-slate-900">{item}</p></div>)}</div>
        <div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={analyzeAcademicProfile} disabled={analyzing} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{analyzing ? 'Analyzing and saving evidence…' : 'Generate Career Intelligence from Academic Profile'}</button><button type="button" onClick={() => onOpenCareerIntelligence?.()} className="rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white">Open Latest Career Intelligence</button></div>
      </section>
    </div>
  );
};

export default AcademicPathways;
