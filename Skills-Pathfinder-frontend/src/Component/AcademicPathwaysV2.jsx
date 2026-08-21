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
const emptySubject = {
  subject_name: '', subject_code: '', subject_area: '', credit_hours: '', grade: '', semester: '', institution: '', status: 'completed', skills_learned: ''
};
const emptyCourse = {
  course_name: '', institution: '', subject_area: '', credit_hours: '', semester: '', expected_completion_date: '', status: 'in_progress', skills: ''
};
const emptyGoal = { career_title: '', target_date: '', motivation: '' };
const safeArray = (value) => Array.isArray(value) ? value : [];
const normalize = (value = '') => String(value).trim().replace(/\s+/g, ' ').toLowerCase();
const commaList = (value = '') => String(value).split(',').map((item) => item.trim()).filter(Boolean);
const apiBase = () => (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const semesterTracks = [
  {
    keys: ['nurse', 'nursing', 'registered nurse', 'rn'],
    items: [
      ['Anatomy & Physiology', 'Builds core human-body knowledge used throughout nursing education and clinical practice.'],
      ['Microbiology', 'Supports infection prevention, pathogen knowledge, and clinical safety.'],
      ['Nutrition', 'Strengthens patient-care planning and health-promotion knowledge.'],
      ['Developmental Psychology', 'Supports age-appropriate care and communication across the lifespan.'],
      ['Statistics', 'Helps with evidence-based nursing, research interpretation, and quality improvement.']
    ]
  },
  {
    keys: ['physician', 'doctor', 'medicine', 'medical school'],
    items: [
      ['General Chemistry', 'Common pre-health foundation for later chemistry and biomedical coursework.'],
      ['Organic Chemistry', 'Supports biochemical and molecular understanding used in health sciences.'],
      ['Physics', 'Strengthens quantitative reasoning and common pre-med preparation.'],
      ['Biochemistry', 'Connects chemistry with cellular and human biological processes.'],
      ['Psychology', 'Supports behavioral, patient, and population-health understanding.']
    ]
  },
  {
    keys: ['biology', 'biologist', 'biotechnology', 'clinical research', 'laboratory'],
    items: [
      ['Genetics', 'Strengthens understanding of heredity, molecular biology, and modern life-science research.'],
      ['Cell Biology', 'Builds foundational knowledge for laboratory and biomedical work.'],
      ['Biochemistry', 'Connects biological systems with chemical processes.'],
      ['Statistics for Life Sciences', 'Supports experimental design and interpretation of biological data.'],
      ['Research Methods', 'Improves experimental design, documentation, and evidence evaluation.']
    ]
  },
  {
    keys: ['data analyst', 'data science', 'data scientist', 'analytics'],
    items: [
      ['Statistics', 'Provides the quantitative foundation for analysis and evidence-based conclusions.'],
      ['SQL / Database Systems', 'Builds the ability to retrieve and organize real-world data.'],
      ['Data Visualization', 'Develops clear communication of findings through charts and dashboards.'],
      ['Programming with Python', 'Supports cleaning, analysis, automation, and reproducible workflows.'],
      ['Business Analytics', 'Connects technical analysis with practical decision-making.']
    ]
  },
  {
    keys: ['cybersecurity', 'cyber security', 'security analyst'],
    items: [
      ['Computer Networks', 'Builds the networking foundation needed to understand attacks and defenses.'],
      ['Linux', 'Develops practical operating-system skills widely used in security work.'],
      ['Operating Systems', 'Strengthens understanding of processes, permissions, memory, and system security.'],
      ['Cloud Security', 'Prepares for modern identity, infrastructure, and cloud-risk concepts.'],
      ['Programming', 'Improves automation, scripting, and technical problem solving.']
    ]
  },
  {
    keys: ['software', 'developer', 'programmer', 'computer science'],
    items: [
      ['Programming Fundamentals', 'Strengthens core coding and problem-solving ability.'],
      ['Data Structures', 'Builds efficient problem solving and algorithmic thinking.'],
      ['Database Systems', 'Supports application data modeling and persistence.'],
      ['Web Development', 'Adds practical full-stack software-building experience.'],
      ['Software Engineering', 'Introduces testing, design, version control, and team-development practices.']
    ]
  },
  {
    keys: ['business', 'management', 'operations'],
    items: [
      ['Accounting', 'Builds financial literacy for operational and management decisions.'],
      ['Statistics', 'Supports evidence-based business analysis and forecasting.'],
      ['Business Communication', 'Strengthens written, verbal, and stakeholder communication.'],
      ['Project Management', 'Builds planning, scheduling, risk, and execution skills.'],
      ['Economics', 'Provides context for markets, incentives, and business decisions.']
    ]
  },
  {
    keys: ['finance', 'financial analyst', 'accountant'],
    items: [
      ['Financial Accounting', 'Builds the foundation for interpreting financial statements.'],
      ['Statistics', 'Supports forecasting, risk analysis, and evidence-based finance decisions.'],
      ['Corporate Finance', 'Develops valuation, capital, and investment decision knowledge.'],
      ['Investments', 'Builds understanding of assets, portfolios, and markets.'],
      ['Financial Modeling', 'Turns finance theory into practical spreadsheet-based analysis.']
    ]
  },
  {
    keys: ['teacher', 'education', 'instructional'],
    items: [
      ['Educational Psychology', 'Supports understanding of learning, motivation, and student development.'],
      ['Curriculum Design', 'Builds structured lesson and learning-program planning skills.'],
      ['Assessment', 'Develops methods for measuring learning and improving instruction.'],
      ['Classroom Management', 'Supports effective and safe learning environments.'],
      ['Instructional Technology', 'Adds practical digital teaching and learning tools.']
    ]
  }
];

const genericSemesterIdeas = [
  ['Research Methods', 'Improves evidence evaluation and structured problem solving.'],
  ['Statistics', 'Strengthens quantitative reasoning useful across many careers.'],
  ['Professional Communication', 'Builds writing, presentation, and stakeholder communication.'],
  ['Digital Literacy', 'Improves practical use of modern digital tools and information.'],
  ['Project-Based Learning', 'Creates evidence of applied work that can be shown to employers or graduate programs.']
];

const AcademicPathwaysV2 = ({ user, onOpenCareerIntelligence, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [savedProfile, setSavedProfile] = useState(null);
  const [profileForm, setProfileForm] = useState(emptyProfile);
  const [subjects, setSubjects] = useState([]);
  const [subjectForm, setSubjectForm] = useState(emptySubject);
  const [courseForm, setCourseForm] = useState(emptyCourse);
  const [goal, setGoal] = useState(emptyGoal);
  const [certificates, setCertificates] = useState([]);
  const [courses, setCourses] = useState([]);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    setNotice(null);
    try {
      const [profileResult, subjectResult, goalResult, certResult, courseResult] = await Promise.all([
        supabase.from('academic_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('academic_subjects').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('career_goals').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('saved_certifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('ongoing_courses').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      ]);
      const failure = [profileResult, subjectResult, goalResult, certResult, courseResult].find((item) => item.error);
      if (failure?.error) throw failure.error;
      setSavedProfile(profileResult.data || null);
      setSubjects(subjectResult.data || []);
      setGoal(goalResult.data ? { ...emptyGoal, ...goalResult.data } : emptyGoal);
      setCertificates(certResult.data || []);
      setCourses(courseResult.data || []);
      setProfileForm(emptyProfile);
    } catch (error) {
      setNotice({ type: 'error', message: `Academic data could not load: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.id]);

  const editSavedProfile = () => {
    if (!savedProfile) return;
    setProfileForm({ ...emptyProfile, ...savedProfile, interests: safeArray(savedProfile.interests).join(', '), expected_graduation_date: savedProfile.expected_graduation_date || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const payload = {
        user_id: user.id,
        institution: profileForm.institution || null,
        program_name: profileForm.program_name || null,
        field_of_study: profileForm.field_of_study || null,
        degree_level: profileForm.degree_level || null,
        academic_status: profileForm.academic_status || 'enrolled',
        credits_earned: Number(profileForm.credits_earned || 0),
        credits_in_progress: Number(profileForm.credits_in_progress || 0),
        expected_graduation_date: profileForm.expected_graduation_date || null,
        gpa: profileForm.gpa === '' ? null : Number(profileForm.gpa),
        interests: commaList(profileForm.interests),
        notes: profileForm.notes || null,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await supabase.from('academic_profiles').upsert(payload, { onConflict: 'user_id' }).select().single();
      if (error) throw error;
      setSavedProfile(data);
      setProfileForm(emptyProfile);
      setNotice({ type: 'success', message: 'Academic profile saved. The entry fields were cleared for the next update.' });
    } catch (error) {
      setNotice({ type: 'error', message: `Academic profile could not be saved: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const saveGoal = async (event) => {
    event.preventDefault();
    if (!goal.career_title.trim()) return;
    setSaving(true);
    setNotice(null);
    try {
      const { data, error } = await supabase.from('career_goals').insert({
        user_id: user.id,
        career_title: goal.career_title.trim(),
        target_date: goal.target_date || null,
        motivation: goal.motivation || null,
        goal_type: 'primary', status: 'active', source: 'student_selected'
      }).select().single();
      if (error) throw error;
      const { error: archiveError } = await supabase.from('career_goals').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('user_id', user.id).eq('status', 'active').neq('id', data.id);
      if (archiveError) throw archiveError;
      setGoal({ ...emptyGoal, ...data });
      setNotice({ type: 'success', message: 'Target career saved. Semester planning and Career Intelligence will now prioritize this goal.' });
    } catch (error) {
      setNotice({ type: 'error', message: `Career goal could not be saved: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const addSubject = async (event) => {
    event.preventDefault();
    if (!subjectForm.subject_name.trim()) return;
    try {
      const { data, error } = await supabase.from('academic_subjects').insert({
        user_id: user.id,
        subject_name: subjectForm.subject_name.trim(),
        subject_code: subjectForm.subject_code || null,
        subject_area: subjectForm.subject_area || null,
        credit_hours: Number(subjectForm.credit_hours || 0),
        grade: subjectForm.grade || null,
        semester: subjectForm.semester || null,
        institution: subjectForm.institution || savedProfile?.institution || null,
        status: subjectForm.status || 'completed',
        skills_learned: commaList(subjectForm.skills_learned),
        notes: null
      }).select().single();
      if (error) throw error;
      setSubjects((current) => [data, ...current]);
      setSubjectForm(emptySubject);
      setNotice({ type: 'success', message: 'Subject saved and the subject fields were cleared.' });
    } catch (error) {
      setNotice({ type: 'error', message: `Subject could not be saved: ${error.message}` });
    }
  };

  const addSuggestedSubject = async (suggestion) => {
    try {
      const { data, error } = await supabase.from('academic_subjects').insert({
        user_id: user.id,
        subject_name: suggestion.name,
        subject_area: goal.career_title || savedProfile?.field_of_study || 'Career preparation',
        credit_hours: 0,
        institution: savedProfile?.institution || null,
        status: 'planned',
        skills_learned: [],
        notes: `Suggested for ${goal.career_title || savedProfile?.field_of_study || 'career development'}`
      }).select().single();
      if (error) throw error;
      setSubjects((current) => [data, ...current]);
      setNotice({ type: 'success', message: `${suggestion.name} added to your planned subjects. You can update credits and semester later.` });
    } catch (error) {
      setNotice({ type: 'error', message: `Suggested subject could not be added: ${error.message}` });
    }
  };

  const removeSubject = async (id) => {
    if (!window.confirm('Remove this subject?')) return;
    const { error } = await supabase.from('academic_subjects').delete().eq('id', id).eq('user_id', user.id);
    if (error) return setNotice({ type: 'error', message: error.message });
    setSubjects((current) => current.filter((item) => item.id !== id));
  };

  const saveCourse = async (event) => {
    event.preventDefault();
    if (!courseForm.course_name.trim()) return;
    setSaving(true);
    setNotice(null);
    try {
      const skillObjects = commaList(courseForm.skills).map((name) => ({ name, category: 'Course Evidence', confidence: 1, source: 'ongoing_course' }));
      const { data, error } = await supabase.from('ongoing_courses').insert({
        user_id: user.id,
        course_name: courseForm.course_name.trim(),
        provider: courseForm.institution || null,
        institution: courseForm.institution || null,
        subject_area: courseForm.subject_area || null,
        credit_hours: Number(courseForm.credit_hours || 0),
        semester: courseForm.semester || null,
        expected_completion_date: courseForm.expected_completion_date || null,
        status: courseForm.status || 'in_progress',
        extracted_skills: skillObjects
      }).select().single();
      if (error) throw error;
      setCourses((current) => [data, ...current]);
      setCourseForm(emptyCourse);
      setNotice({ type: 'success', message: 'Ongoing course saved and included in Career Intelligence.' });
    } catch (error) {
      setNotice({ type: 'error', message: `Ongoing course could not be saved: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const removeCourse = async (id) => {
    if (!window.confirm('Remove this ongoing course?')) return;
    const { error } = await supabase.from('ongoing_courses').delete().eq('id', id).eq('user_id', user.id);
    if (error) return setNotice({ type: 'error', message: `Course could not be removed: ${error.message}` });
    setCourses((current) => current.filter((item) => item.id !== id));
    setNotice({ type: 'success', message: 'Ongoing course removed.' });
  };

  const persistAcademicSkills = async (analysisId, extractedSkills) => {
    const { data: existing, error: existingError } = await supabase.from('skill_tracking').select('*').eq('user_id', user.id);
    if (existingError) throw existingError;
    const map = new Map((existing || []).map((item) => [normalize(item.skill_name), item]));
    for (const skill of extractedSkills) {
      if (!skill?.name?.trim()) continue;
      const current = map.get(normalize(skill.name));
      const confidence = Number.isFinite(Number(skill.confidence)) ? Number(skill.confidence) : 0.76;
      const sourceEntry = { source: 'academic_profile', source_record_id: analysisId, verification_status: 'ai_verified', evidence: 'Academic profile, subjects, courses and certificate subjects' };
      if (current) {
        const sources = [...safeArray(current.metadata?.sources).filter((item) => !(item?.source === 'academic_profile' && item?.source_record_id === analysisId)), sourceEntry];
        const { error } = await supabase.from('skill_tracking').update({
          confidence: Math.max(Number(current.confidence || 0), confidence),
          category: current.category || skill.category || 'Academic Evidence',
          metadata: { ...(current.metadata || {}), academic_profile_analysis_id: analysisId, sources },
          last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString()
        }).eq('id', current.id).eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('skill_tracking').insert({
          user_id: user.id, skill_name: skill.name.trim(), category: skill.category || 'Academic Evidence',
          proficiency_level: 'unknown', status: 'existing', source: 'self_reported', verification_status: 'ai_verified',
          confidence, evidence: sourceEntry.evidence, source_record_id: analysisId,
          metadata: { academic_profile_analysis_id: analysisId, sources: [sourceEntry] }, last_seen_at: new Date().toISOString()
        }).select().single();
        if (error) throw error;
        map.set(normalize(skill.name), data);
      }
    }
  };

  const persistRecommendations = async (analysisId, recommendations) => {
    if (!recommendations.length) return;
    const rows = recommendations.map((rec, index) => ({
      user_id: user.id,
      client_record_key: `academic:${analysisId}:${rec.id || index}`,
      source_analysis_id: analysisId,
      career_id: rec.id || null,
      career_title: rec.path || rec.career_title || 'Career path',
      category: rec.category || null,
      match_score: rec.match_score ?? null,
      match_percentage: rec.match_percentage ?? null,
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

  const mergeTargetRecommendation = async (extractedSkills, genericRecommendations) => {
    if (!goal.career_title?.trim()) return genericRecommendations;
    try {
      const response = await fetch(`${apiBase()}/api/target-career-analysis`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ career_title: goal.career_title.trim(), skills: extractedSkills })
      });
      if (!response.ok) throw new Error(`Target analysis returned ${response.status}`);
      const payload = await response.json();
      if (payload?.target_found && payload?.recommendation) {
        const target = payload.recommendation;
        const remaining = genericRecommendations.filter((item) => item.id !== target.id && normalize(item.path) !== normalize(target.path));
        return [target, ...remaining].slice(0, 6);
      }
    } catch (error) {
      console.warn('Target career analysis unavailable:', error);
    }

    const placeholder = {
      id: `student_target_${normalize(goal.career_title).replace(/[^a-z0-9]+/g, '_')}`,
      path: goal.career_title.trim(), category: 'Student Selected Target', target_selected: true, target_unmapped: true,
      match_score: 0, match_percentage: 0, skill_gap_percentage: 100,
      matched_skills: [], missing_skills: [],
      match_reason: 'This is your selected target. The occupation is not yet mapped to a complete local requirement profile, so the system will preserve the goal instead of hiding it.'
    };
    return [placeholder, ...genericRecommendations].slice(0, 6);
  };

  const analyzeAcademicProfile = async () => {
    const profile = savedProfile || profileForm;
    if (!profile?.field_of_study && !profile?.program_name && !subjects.length && !courses.length && !certificates.length) {
      setNotice({ type: 'error', message: 'Add an academic profile, subject, ongoing course, or certificate before generating Career Intelligence.' });
      return;
    }
    setAnalyzing(true);
    setNotice(null);
    try {
      const text = [
        `ACADEMIC PROFILE\nInstitution: ${profile?.institution || ''}\nProgram: ${profile?.program_name || ''}\nField of study: ${profile?.field_of_study || ''}\nDegree level: ${profile?.degree_level || ''}\nCredits earned: ${profile?.credits_earned || 0}\nCredits in progress: ${profile?.credits_in_progress || 0}\nInterests: ${safeArray(profile?.interests).join(', ') || profile?.interests || ''}`,
        `TARGET CAREER\n${goal.career_title || ''}\n${goal.motivation || ''}`,
        `ACADEMIC SUBJECTS\n${subjects.map((item) => `${item.subject_name}; area ${item.subject_area || 'not set'}; ${item.credit_hours || 0} credits; ${item.status}; skills ${safeArray(item.skills_learned).join(', ')}`).join('\n')}`,
        `ONGOING COURSES\n${courses.map((item) => `${item.course_name}; provider ${item.provider || item.institution || 'not set'}; subject ${item.subject_area || 'not set'}; ${item.status}; expected completion ${item.expected_completion_date || 'not set'}; skills ${safeArray(item.extracted_skills).map((skill) => skill?.name || skill).filter(Boolean).join(', ')}`).join('\n')}`,
        `CERTIFICATES\n${certificates.map((item) => `${item.certification_name}; provider ${item.provider || 'not set'}; subjects ${safeArray(item.subjects).join(', ')}; skills ${safeArray(item.extracted_skills).map((skill) => skill?.name || skill).filter(Boolean).join(', ')}`).join('\n')}`
      ].join('\n\n');

      const formData = new FormData();
      formData.append('file', new File([text], 'academic-career-profile.txt', { type: 'text/plain' }));
      const response = await fetch(`${apiBase()}/api/upload`, { method: 'POST', body: formData });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `Academic analysis returned ${response.status}`);
      }
      const result = await response.json();
      const extractedSkills = safeArray(result.extracted_skills);
      const recommendations = await mergeTargetRecommendation(extractedSkills, safeArray(result.recommendations));

      const { data: analysis, error: analysisError } = await supabase.from('resume_analyses').insert({
        user_id: user.id,
        filename: 'Academic Career Profile',
        character_count: result.character_count || text.length,
        skills_count: extractedSkills.length,
        extracted_skills: extractedSkills,
        explanations: safeArray(result.explanations),
        recommendations,
        ai_failed: Boolean(result.ai_failed),
        extraction_status: result.ai_failed ? 'fallback_completed' : 'completed',
        document_type: 'academic_profile',
        raw_analysis: { ...result, recommendations, academic_profile: profile, academic_subjects: subjects, ongoing_courses: courses, certificates, career_goal: goal }
      }).select('id').single();
      if (analysisError) throw analysisError;

      await persistAcademicSkills(analysis.id, extractedSkills);
      await persistRecommendations(analysis.id, recommendations);
      const { error: findingError } = await supabase.from('career_findings').upsert({
        user_id: user.id,
        client_record_key: `academic-analysis:${analysis.id}`,
        finding_type: 'academic_career_analysis',
        source_type: 'resume_analyses',
        source_id: analysis.id,
        title: goal.career_title ? `Academic pathway toward ${goal.career_title}` : 'Academic career analysis',
        status: 'active',
        data: { academic_profile: profile, academic_subjects: subjects, ongoing_courses: courses, career_goal: goal, extracted_skills: extractedSkills, recommendations },
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,client_record_key' });
      if (findingError) throw findingError;

      const preferred = {
        analysis_id: analysis.id, filename: 'Academic Career Profile', character_count: result.character_count || text.length,
        extracted_skills: extractedSkills, explanations: safeArray(result.explanations), recommendations,
        academic_profile: profile, academic_subjects: subjects, ongoing_courses: courses, certifications: certificates, career_goal: goal
      };
      setNotice({ type: 'success', message: `Academic evidence analyzed: ${extractedSkills.length} skills found and ${recommendations.length} career paths prepared. Opening Career Intelligence…` });
      await onOpenCareerIntelligence?.(preferred);
    } catch (error) {
      setNotice({ type: 'error', message: `Academic Career Intelligence failed: ${error.message}` });
    } finally {
      setAnalyzing(false);
    }
  };

  const recordedCredits = subjects.reduce((sum, item) => sum + Number(item.credit_hours || 0), 0);
  const completedNames = new Set(subjects.filter((item) => ['completed', 'planned', 'in_progress'].includes(normalize(item.status))).map((item) => normalize(item.subject_name)));
  const activeCourseNames = new Set(courses.filter((item) => ['in_progress', 'active', 'planned'].includes(normalize(item.status))).map((item) => normalize(item.course_name)));
  const suggestedSubjects = useMemo(() => {
    const target = `${goal.career_title || ''} ${savedProfile?.field_of_study || ''} ${savedProfile?.program_name || ''}`.toLowerCase();
    const track = semesterTracks.find((entry) => entry.keys.some((key) => target.includes(key)));
    const ideas = track?.items || genericSemesterIdeas;
    return ideas
      .map(([name, why]) => ({ name, why }))
      .filter((item) => !completedNames.has(normalize(item.name)) && !activeCourseNames.has(normalize(item.name)))
      .slice(0, 5);
  }, [goal.career_title, savedProfile?.field_of_study, savedProfile?.program_name, subjects, courses]);

  if (loading) return <div className="app-card flex min-h-[420px] items-center justify-center p-8"><div className="text-center"><div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-teal-100 border-t-teal-600" /><p className="mt-4 text-sm text-slate-500">Loading academic pathway…</p></div></div>;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300">Academic study pathway</p><h2 className="mt-2 text-3xl font-black">Academic Profile, Subjects & Career Goal</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Add your academic record, ongoing courses, certificates and target career here. A resume is optional and can be added later.</p></div><button onClick={onBack} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold">Back to Dashboard</button></div>
      </section>

      {notice && <div className={`rounded-2xl border p-4 text-sm ${notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{notice.message}</div>}

      {savedProfile && <section className="app-card p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Saved academic profile</p><h3 className="mt-1 text-xl font-bold text-slate-950">{savedProfile.program_name || savedProfile.field_of_study || 'Academic profile'}</h3><p className="mt-2 text-sm text-slate-600">{savedProfile.institution || 'Institution not recorded'} · {savedProfile.credits_earned || 0} credits earned{savedProfile.expected_graduation_date ? ` · Expected graduation: ${savedProfile.expected_graduation_date}` : ''}</p></div><button onClick={editSavedProfile} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">Edit saved profile</button></div></section>}

      <div className="grid gap-6 xl:grid-cols-3">
        <form onSubmit={saveProfile} className="app-card p-6 xl:col-span-2"><h3 className="text-xl font-bold text-slate-900">{savedProfile ? 'Update academic profile' : 'Add academic profile'}</h3><p className="mt-1 text-sm text-slate-500">After saving, these fields clear. Your saved profile remains in the summary above.</p><div className="mt-5 grid gap-4 md:grid-cols-2">{[
          ['institution','Institution','text'],['program_name','Program / degree','text'],['field_of_study','Major / field of study','text'],['degree_level','Degree level','text'],['credits_earned','Credits earned','number'],['credits_in_progress','Credits in progress','number'],['gpa','GPA','number'],['expected_graduation_date','Expected graduation date','date']
        ].map(([field,label,type]) => <label key={field} className="text-sm font-semibold text-slate-700">{label}<input type={type} step={field === 'gpa' ? '0.01' : '0.5'} value={profileForm[field] ?? ''} onChange={(event) => setProfileForm({ ...profileForm, [field]: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-normal" /></label>)}<label className="md:col-span-2 text-sm font-semibold text-slate-700">Interests<input value={profileForm.interests || ''} onChange={(event) => setProfileForm({ ...profileForm, interests: event.target.value })} placeholder="biology, healthcare, research, technology" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-normal" /></label></div><button disabled={saving} className="mt-5 rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save academic profile'}</button></form>

        <form onSubmit={saveGoal} className="rounded-2xl border border-teal-200 bg-teal-50 p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Primary target</p><h3 className="mt-1 text-xl font-bold text-slate-900">Career goal</h3><input value={goal.career_title || ''} onChange={(event) => setGoal({ ...goal, career_title: event.target.value })} placeholder="Biologist, Data Analyst, Nurse..." className="mt-4 w-full rounded-xl border border-teal-200 bg-white px-3 py-2.5" /><label className="mt-3 block text-xs font-semibold text-teal-800">Target career date<input type="date" value={goal.target_date || ''} onChange={(event) => setGoal({ ...goal, target_date: event.target.value })} className="mt-1 w-full rounded-xl border border-teal-200 bg-white px-3 py-2.5" /></label><textarea rows={4} value={goal.motivation || ''} onChange={(event) => setGoal({ ...goal, motivation: event.target.value })} placeholder="Why are you interested in this goal?" className="mt-3 w-full rounded-xl border border-teal-200 bg-white p-3" /><button disabled={saving || !goal.career_title.trim()} className="mt-3 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Save career goal</button></form>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <form onSubmit={addSubject} className="app-card p-6"><h3 className="text-xl font-bold">Add academic subject</h3><p className="mt-1 text-sm text-slate-500">Completed, current, or planned subjects all count as academic pathway evidence.</p><div className="mt-4 space-y-3"><input required placeholder="Subject name" value={subjectForm.subject_name} onChange={(event) => setSubjectForm({ ...subjectForm, subject_name: event.target.value })} className="w-full rounded-xl border px-3 py-2.5" /><div className="grid grid-cols-2 gap-3"><input placeholder="Code" value={subjectForm.subject_code} onChange={(event) => setSubjectForm({ ...subjectForm, subject_code: event.target.value })} className="rounded-xl border px-3 py-2.5" /><input type="number" step="0.5" placeholder="Credits" value={subjectForm.credit_hours} onChange={(event) => setSubjectForm({ ...subjectForm, credit_hours: event.target.value })} className="rounded-xl border px-3 py-2.5" /></div><input placeholder="Subject area" value={subjectForm.subject_area} onChange={(event) => setSubjectForm({ ...subjectForm, subject_area: event.target.value })} className="w-full rounded-xl border px-3 py-2.5" /><input placeholder="Semester" value={subjectForm.semester} onChange={(event) => setSubjectForm({ ...subjectForm, semester: event.target.value })} className="w-full rounded-xl border px-3 py-2.5" /><select value={subjectForm.status} onChange={(event) => setSubjectForm({ ...subjectForm, status: event.target.value })} className="w-full rounded-xl border px-3 py-2.5"><option value="completed">Completed</option><option value="in_progress">In progress</option><option value="planned">Planned</option></select><input placeholder="Skills learned, comma separated" value={subjectForm.skills_learned} onChange={(event) => setSubjectForm({ ...subjectForm, skills_learned: event.target.value })} className="w-full rounded-xl border px-3 py-2.5" /></div><button className="mt-4 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white">Add subject</button></form>

        <div className="app-card p-6 xl:col-span-2"><h3 className="text-xl font-bold">Academic record</h3><p className="text-sm text-slate-500">{subjects.length} subjects · {recordedCredits} recorded credits</p><div className="mt-5 space-y-3">{subjects.map((subject) => <div key={subject.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><div><p className="font-bold text-slate-900">{subject.subject_name}</p><p className="text-xs text-slate-500">{subject.semester || 'Semester not set'} · {subject.credit_hours || 0} credits · {subject.status}</p></div><button type="button" onClick={() => removeSubject(subject.id)} className="text-xs font-bold text-rose-600">Remove</button></div>)}{subjects.length === 0 && <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">No subjects recorded yet.</p>}</div></div>
      </div>

      <section className="app-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700">Ongoing courses</p><h3 className="mt-1 text-xl font-bold text-slate-950">Add current learning here</h3><p className="mt-1 text-sm text-slate-500">You no longer need to leave Academic Pathway to add an ongoing course. Saved courses also remain available in Skills & Courses.</p></div><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">{courses.length} saved</span></div>
        <form onSubmit={saveCourse} className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <input required placeholder="Course name" value={courseForm.course_name} onChange={(event) => setCourseForm({ ...courseForm, course_name: event.target.value })} className="rounded-xl border px-3 py-2.5" />
          <input placeholder="Institution / provider" value={courseForm.institution} onChange={(event) => setCourseForm({ ...courseForm, institution: event.target.value })} className="rounded-xl border px-3 py-2.5" />
          <input placeholder="Subject area" value={courseForm.subject_area} onChange={(event) => setCourseForm({ ...courseForm, subject_area: event.target.value })} className="rounded-xl border px-3 py-2.5" />
          <input type="number" step="0.5" placeholder="Credits" value={courseForm.credit_hours} onChange={(event) => setCourseForm({ ...courseForm, credit_hours: event.target.value })} className="rounded-xl border px-3 py-2.5" />
          <input placeholder="Semester" value={courseForm.semester} onChange={(event) => setCourseForm({ ...courseForm, semester: event.target.value })} className="rounded-xl border px-3 py-2.5" />
          <label className="text-xs font-semibold text-slate-600">Expected course completion<input type="date" value={courseForm.expected_completion_date} onChange={(event) => setCourseForm({ ...courseForm, expected_completion_date: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" /></label>
          <select value={courseForm.status} onChange={(event) => setCourseForm({ ...courseForm, status: event.target.value })} className="rounded-xl border px-3 py-2.5"><option value="in_progress">In progress</option><option value="planned">Planned</option><option value="completed">Completed</option></select>
          <input placeholder="Skills covered, comma separated" value={courseForm.skills} onChange={(event) => setCourseForm({ ...courseForm, skills: event.target.value })} className="rounded-xl border px-3 py-2.5" />
          <button disabled={saving} className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50 md:col-span-2 lg:col-span-1">Save ongoing course</button>
        </form>
        {courses.length ? <div className="mt-5 grid gap-3 md:grid-cols-2">{courses.map((course) => <div key={course.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-900">{course.course_name}</p><p className="mt-1 text-xs text-slate-500">{course.institution || course.provider || 'Institution/provider not set'} · {course.subject_area || 'Subject area not set'} · {course.status || 'in_progress'}</p>{course.expected_completion_date && <p className="mt-1 text-xs font-semibold text-violet-700">Expected course completion: {course.expected_completion_date}</p>}</div><button type="button" onClick={() => removeCourse(course.id)} className="text-xs font-bold text-rose-600">Remove</button></div></div>)}</div> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No ongoing courses are saved yet. Add one above if you are currently taking or planning a course. This is optional.</p>}
      </section>

      <section className="rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Next semester planning</p>
        <h3 className="mt-1 text-2xl font-black text-slate-900">Subjects to consider for {goal.career_title || savedProfile?.field_of_study || 'your goal'}</h3>
        <p className="mt-2 text-sm text-slate-600">Suggestions now change with your saved target career and exclude subjects or courses already recorded. They are guidance, not official degree requirements.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{suggestedSubjects.map((item, index) => <div key={item.name} className="flex flex-col rounded-2xl border border-sky-100 bg-white p-4"><span className="text-xs font-bold text-sky-700">OPTION {index + 1}</span><p className="mt-1 font-bold text-slate-900">{item.name}</p><p className="mt-2 flex-1 text-xs leading-5 text-slate-500">{item.why}</p><button type="button" onClick={() => addSuggestedSubject(item)} className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800 hover:bg-sky-100">Add to planned subjects</button></div>)}</div>
        {suggestedSubjects.length === 0 && <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">The current suggestion set is already represented in your subjects or ongoing courses. Add more evidence or review your target with an academic advisor.</p>}
        <div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={analyzeAcademicProfile} disabled={analyzing} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{analyzing ? 'Analyzing saved evidence…' : 'Generate Career Intelligence'}</button><button type="button" onClick={() => onOpenCareerIntelligence?.()} className="rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white">Open Latest Career Intelligence</button></div>
      </section>
    </div>
  );
};

export default AcademicPathwaysV2;
