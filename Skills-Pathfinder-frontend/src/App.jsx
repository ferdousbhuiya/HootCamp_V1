import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Auth from './Component/Auth';
import UserDashboard from './Component/UserDashboard';
import UploadComponent from './Component/UploadComponent';
import SkillDashboard from './Component/SkillDashboard';
import CareerRecommendations from './Component/CareerRecommendations';
import OnboardingWizard from './Component/OnboardingWizard';
import CareerAdvisor from './Component/CareerAdvisor';
import SavedCareerHistory from './Component/SavedCareerHistory';
import { uploadPrivateDocument } from './lib/documentStorage';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const normalizeName = (value = '') => value.trim().replace(/\s+/g, ' ').toLowerCase();

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState(null);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [openingCareerIntelligence, setOpeningCareerIntelligence] = useState(false);

  const readOnboardingState = async (userId) => {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('has_completed_onboarding')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) throw profileError;
    return Boolean(profile?.has_completed_onboarding);
  };

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) console.error('Session check failed:', sessionError);
      if (!active) return;
      setUser(session?.user || null);

      if (session?.user) {
        try {
          const completed = await readOnboardingState(session.user.id);
          if (!active) return;
          setHasCompletedOnboarding(completed);
          setShowOnboarding(!completed);
        } catch (profileError) {
          console.error('Profile onboarding check failed:', profileError);
          if (!active) return;
          setHasCompletedOnboarding(false);
          setShowOnboarding(false);
          setError('Your account is signed in, but onboarding status could not be restored. You can reopen onboarding from the dashboard.');
        }
      }
      if (active) setLoading(false);
    };

    checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (!session?.user) {
        setResults(null);
        setShowRecommendations(false);
        setShowOnboarding(false);
        setHasCompletedOnboarding(false);
        setError(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleAuthSuccess = async (authenticatedUser, isNewUser = false) => {
    setUser(authenticatedUser);
    setError(null);
    if (isNewUser) {
      setHasCompletedOnboarding(false);
      setShowOnboarding(true);
      return;
    }
    try {
      const completed = await readOnboardingState(authenticatedUser.id);
      setHasCompletedOnboarding(completed);
      setShowOnboarding(!completed);
    } catch (profileError) {
      console.error('Could not restore onboarding state after sign in:', profileError);
      setHasCompletedOnboarding(false);
      setShowOnboarding(false);
      setError('Signed in successfully, but your onboarding status could not be loaded. You can reopen onboarding from your dashboard.');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setResults(null);
    setShowRecommendations(false);
    setShowOnboarding(false);
    setHasCompletedOnboarding(false);
    setError(null);
  };

  const syncResumeSkills = async (analysisId, data) => {
    const incomingSkills = Array.isArray(data.extracted_skills) ? data.extracted_skills : [];
    if (!incomingSkills.length) return;
    const { data: existingSkills, error: existingError } = await supabase
      .from('skill_tracking')
      .select('id,skill_name,source,verification_status,confidence,metadata')
      .eq('user_id', user.id);
    if (existingError) throw existingError;

    const explanationMap = new Map((data.explanations || []).map((item) => [normalizeName(item.skill), item]));
    const existingMap = new Map((existingSkills || []).map((item) => [normalizeName(item.skill_name), item]));

    for (const skill of incomingSkills) {
      if (!skill?.name) continue;
      const key = normalizeName(skill.name);
      const current = existingMap.get(key);
      const explanation = explanationMap.get(key);
      const confidence = Number.isFinite(Number(skill.confidence)) ? Number(skill.confidence) : 0.8;
      if (current) {
        const updates = {
          category: skill.category || undefined,
          confidence: Math.max(Number(current.confidence || 0), confidence),
          evidence: explanation?.evidence || undefined,
          metadata: { ...(current.metadata || {}), latest_resume_analysis_id: analysisId, latest_reasoning: explanation?.reasoning || null },
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        Object.keys(updates).forEach((field) => updates[field] === undefined && delete updates[field]);
        const { error: updateError } = await supabase.from('skill_tracking').update(updates).eq('id', current.id);
        if (updateError) throw updateError;
      } else {
        const { data: inserted, error: insertError } = await supabase.from('skill_tracking').insert({
          user_id: user.id,
          skill_name: skill.name.trim(),
          category: skill.category || 'General',
          proficiency_level: 'unknown',
          status: 'existing',
          source: 'resume_extracted',
          verification_status: 'ai_verified',
          confidence,
          evidence: explanation?.evidence || null,
          source_record_id: analysisId,
          metadata: {
            reasoning: explanation?.reasoning || null,
            sources: [{ source: 'resume_extracted', source_record_id: analysisId, verification_status: 'ai_verified', evidence: explanation?.evidence || null }]
          },
          last_seen_at: new Date().toISOString()
        }).select('id,skill_name,source,verification_status,confidence,metadata').single();
        if (insertError) throw insertError;
        existingMap.set(key, inserted);
      }
    }
  };

  const saveCareerRecommendationSnapshots = async (analysisId, recommendations = []) => {
    if (!recommendations.length) return;
    const timestamp = Date.now();
    const rows = recommendations.map((rec, index) => ({
      user_id: user.id,
      client_record_key: `${analysisId}:${rec.id || index}:${timestamp}`,
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
    const { error: recError } = await supabase.from('career_recommendations').insert(rows);
    if (recError) throw recError;
  };

  const handleUploadSuccess = async (data, originalFile) => {
    setResults(data);
    setShowRecommendations(false);
    setError(null);
    setIsLoading(false);
    if (!user) return;

    try {
      const { data: savedAnalysis, error: saveError } = await supabase.from('resume_analyses').insert({
        user_id: user.id,
        filename: data.filename,
        character_count: data.character_count,
        skills_count: data.extracted_skills?.length || 0,
        extracted_skills: data.extracted_skills || [],
        explanations: data.explanations || [],
        recommendations: data.recommendations || [],
        ai_failed: Boolean(data.ai_failed),
        extraction_status: data.ai_failed ? 'fallback_completed' : 'completed',
        document_type: 'resume',
        raw_analysis: data,
        storage_bucket: 'student-resumes'
      }).select('id').single();
      if (saveError) throw saveError;

      await syncResumeSkills(savedAnalysis.id, data);
      await saveCareerRecommendationSnapshots(savedAnalysis.id, data.recommendations || []);

      if (originalFile) {
        try {
          const storagePath = await uploadPrivateDocument({
            supabase,
            userId: user.id,
            file: originalFile,
            bucket: 'student-resumes'
          });
          const { error: storageUpdateError } = await supabase
            .from('resume_analyses')
            .update({ storage_bucket: 'student-resumes', storage_path: storagePath })
            .eq('id', savedAnalysis.id);
          if (storageUpdateError) throw storageUpdateError;
        } catch (storageError) {
          console.error('Resume source document storage failed:', storageError);
          setError('Your resume analysis and findings were saved, but the original resume file could not be stored. You can continue using the analysis and retry document storage later.');
        }
      }
    } catch (saveError) {
      console.error('Error persisting analysis findings:', saveError);
      setError('The analysis completed, but one or more findings could not be saved. Keep this page open and retry after checking the database migrations.');
      throw saveError;
    }
  };

  const handleUploadError = (err) => {
    setError(err?.message || 'Upload failed. Please try again.');
    setIsLoading(false);
  };

  const handleOnboardingComplete = async () => {
    setShowOnboarding(false);
    setHasCompletedOnboarding(true);
    if (!user) return;
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ has_completed_onboarding: true, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (updateError) {
      console.error('Could not persist onboarding status:', updateError);
      setError('Onboarding finished, but the completion status could not be saved.');
    }
  };

  const handleOnboardingCancel = () => setShowOnboarding(false);

  const openLatestCareerIntelligence = async () => {
    if (!user?.id || openingCareerIntelligence) return;
    setOpeningCareerIntelligence(true);
    setError(null);
    try {
      const { data: latest, error: latestError } = await supabase
        .from('resume_analyses')
        .select('filename,character_count,extracted_skills,explanations,recommendations,uploaded_at')
        .eq('user_id', user.id)
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw latestError;
      if (!latest) {
        setResults(null);
        setShowRecommendations(false);
        setError('Upload and analyze a resume first. Career Intelligence will appear here as soon as a saved analysis is available.');
        return;
      }
      setResults({
        filename: latest.filename,
        character_count: latest.character_count,
        extracted_skills: latest.extracted_skills || [],
        explanations: latest.explanations || [],
        recommendations: latest.recommendations || []
      });
      setShowRecommendations(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (careerError) {
      console.error('Could not open Career Intelligence:', careerError);
      setError(`Career Intelligence could not load your latest analysis: ${careerError.message}`);
    } finally {
      setOpeningCareerIntelligence(false);
    }
  };

  const startNewAnalysis = () => {
    setResults(null);
    setShowRecommendations(false);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (showOnboarding && user) {
    return <OnboardingWizard user={user} onComplete={handleOnboardingComplete} onCancel={handleOnboardingCancel} />;
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="animate-spin rounded-full h-14 w-14 border-4 border-indigo-100 border-t-indigo-600" /></div>;
  }

  if (!user) return <Auth onAuthSuccess={handleAuthSuccess} />;

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-3">
          <div className="mr-3 hidden shrink-0 items-center gap-2 md:flex">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 text-sm font-bold text-white">SP</div>
            <span className="font-bold text-slate-900">Student Workspace</span>
          </div>
          <button
            onClick={startNewAnalysis}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition ${!results ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Resume Analysis
          </button>
          <button
            onClick={openLatestCareerIntelligence}
            disabled={openingCareerIntelligence}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${showRecommendations ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'}`}
          >
            {openingCareerIntelligence ? 'Opening…' : 'Career Intelligence'}
          </button>
          <div className="ml-auto hidden shrink-0 text-xs text-slate-400 lg:block">Career paths · skill gaps · salary & market · learning roadmap</div>
        </div>
      </div>

      <UserDashboard
        user={user}
        onboardingComplete={hasCompletedOnboarding}
        onLogout={handleLogout}
        onStartOnboarding={() => setShowOnboarding(true)}
        onViewAnalysis={(savedAnalysis) => {
          if (savedAnalysis) {
            setResults({
              filename: savedAnalysis.filename,
              character_count: savedAnalysis.character_count,
              extracted_skills: savedAnalysis.extracted_skills || [],
              explanations: savedAnalysis.explanations || [],
              recommendations: savedAnalysis.recommendations || []
            });
          } else {
            setResults(null);
          }
          setShowRecommendations(false);
          setError(null);
        }}
      >
        {error && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>}
        {!results ? (
          <UploadComponent onUploadSuccess={handleUploadSuccess} onUploadError={handleUploadError} isLoading={isLoading} setIsLoading={setIsLoading} />
        ) : showRecommendations ? (
          <CareerRecommendations skills={results} user={user} onBack={() => setShowRecommendations(false)} />
        ) : (
          <SkillDashboard results={results} onBack={() => { setResults(null); setError(null); }} onRecommendations={() => setShowRecommendations(true)} />
        )}
      </UserDashboard>
      <SavedCareerHistory user={user} />
      <CareerAdvisor user={user} />
    </>
  );
}

export default App;
