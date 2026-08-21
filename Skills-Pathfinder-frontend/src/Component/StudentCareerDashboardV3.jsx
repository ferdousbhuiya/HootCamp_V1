import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import StudentCareerDashboardV2 from './StudentCareerDashboardV2';
import AcademicPathwaysV3 from './AcademicPathwaysV3';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

const StudentCareerDashboardV3 = (props) => {
  const { user, onAnalyzeResume, onUpdateProfile, onOpenCareerIntelligence } = props;
  const [checking, setChecking] = useState(true);
  const [hasEvidence, setHasEvidence] = useState(true);
  const [showGuide, setShowGuide] = useState(true);
  const [showAcademic, setShowAcademic] = useState(false);

  const checkEvidence = async () => {
    if (!user?.id) return;
    setChecking(true);
    try {
      const results = await Promise.all([
        supabase.from('academic_profiles').select('user_id').eq('user_id', user.id).limit(1),
        supabase.from('academic_subjects').select('id').eq('user_id', user.id).limit(1),
        supabase.from('resume_analyses').select('id').eq('user_id', user.id).limit(1),
        supabase.from('skill_tracking').select('id').eq('user_id', user.id).limit(1),
        supabase.from('saved_certifications').select('id').eq('user_id', user.id).limit(1),
        supabase.from('ongoing_courses').select('id').eq('user_id', user.id).limit(1),
        supabase.from('career_goals').select('id').eq('user_id', user.id).eq('status', 'active').limit(1)
      ]);
      const found = results.some((result) => !result.error && Array.isArray(result.data) && result.data.length > 0);
      setHasEvidence(found);
      setShowGuide(!found);
    } catch (error) {
      console.warn('First-use evidence check failed:', error);
      setHasEvidence(true);
      setShowGuide(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { checkEvidence(); }, [user?.id]);

  if (showAcademic) {
    return <AcademicPathwaysV3
      user={user}
      onOpenCareerIntelligence={onOpenCareerIntelligence}
      onBack={async () => { setShowAcademic(false); await checkEvidence(); }}
    />;
  }

  if (checking) {
    return <div className="app-card flex min-h-[360px] items-center justify-center p-8"><div className="text-center"><div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-teal-100 border-t-teal-600" /><p className="mt-4 text-sm text-slate-500">Preparing your career workspace…</p></div></div>;
  }

  if (!hasEvidence && showGuide) {
    const choices = [
      {
        title: 'I am building my academic path',
        label: 'No resume required',
        detail: 'Start with your program, major, subjects, credits, current courses and target career. Best for new students or students with little work history.',
        action: () => setShowAcademic(true),
        button: 'Start with academics',
        accent: 'teal'
      },
      {
        title: 'I have a resume or work experience',
        label: 'Employment evidence',
        detail: 'Upload or enter your resume so Skills Pathfinder can extract skills and compare them with career requirements. You can add studies and certificates afterward.',
        action: () => onAnalyzeResume?.(),
        button: 'Start with resume',
        accent: 'sky'
      },
      {
        title: 'I have certificates, skills or courses',
        label: 'Resume optional',
        detail: 'Build your evidence profile from certificates, self-reported skills and ongoing learning. A resume is optional and can be added later.',
        action: () => onUpdateProfile?.(),
        button: 'Build evidence profile',
        accent: 'violet'
      },
      {
        title: 'I have a mix of everything',
        label: 'Complete profile',
        detail: 'Combine resume, certificates, courses, academic subjects and career goals. All evidence is merged into one profile and duplicate skills are avoided.',
        action: () => onUpdateProfile?.(),
        button: 'Build complete profile',
        accent: 'amber'
      }
    ];
    const tones = {
      teal: 'border-teal-200 bg-teal-50 text-teal-800',
      sky: 'border-sky-200 bg-sky-50 text-sky-800',
      violet: 'border-violet-200 bg-violet-50 text-violet-800',
      amber: 'border-amber-200 bg-amber-50 text-amber-800'
    };

    return <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300">First-time setup</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Start with what you have.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">You do not need to decide whether you are only a student or only a job seeker. Choose the evidence you have today. Skills Pathfinder will combine everything into one Career Intelligence profile, and you can add the other evidence later.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {choices.map((choice) => <button key={choice.title} type="button" onClick={choice.action} className={`group rounded-3xl border p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tones[choice.accent]}`}>
          <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em]">{choice.label}</span>
          <h3 className="mt-4 text-xl font-black text-slate-950">{choice.title}</h3>
          <p className="mt-2 min-h-[72px] text-sm leading-6 text-slate-600">{choice.detail}</p>
          <span className="mt-5 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">{choice.button}</span>
        </button>)}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        <strong className="text-slate-900">One profile, not four separate tracks.</strong> Academic subjects, work experience, certificates, skills and ongoing courses can all exist together. Your target career and recommendations update as the evidence changes.
        <button type="button" onClick={() => setShowGuide(false)} className="ml-3 font-bold text-teal-700">Open dashboard anyway</button>
      </section>
    </div>;
  }

  return <StudentCareerDashboardV2 {...props} />;
};

export default StudentCareerDashboardV3;
