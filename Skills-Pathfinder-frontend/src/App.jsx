import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Auth from './Component/Auth';
import UserDashboard from './Component/UserDashboard';
import UploadComponent from './Component/UploadComponent';
import SkillDashboard from './Component/SkillDashboard';
import CareerRecommendations from './Component/CareerRecommendations';
import OnboardingWizard from './Component/OnboardingWizard';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState(null);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) console.error('Session check failed:', sessionError);
      setUser(session?.user || null);
      if (session?.user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('has_completed_onboarding')
          .eq('id', session.user.id)
          .maybeSingle();
        if (profileError) console.error('Profile onboarding check failed:', profileError);
        setHasCompletedOnboarding(Boolean(profile?.has_completed_onboarding));
      }
      setLoading(false);
    };

    checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (!session?.user) {
        setResults(null);
        setShowRecommendations(false);
        setShowOnboarding(false);
        setHasCompletedOnboarding(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleAuthSuccess = (authenticatedUser, isNewUser = false) => {
    setUser(authenticatedUser);
    setShowOnboarding(isNewUser);
    setHasCompletedOnboarding(!isNewUser);
  };

  const handleLogout = () => {
    setUser(null);
    setResults(null);
    setShowRecommendations(false);
    setShowOnboarding(false);
    setHasCompletedOnboarding(false);
    setError(null);
  };

  const handleUploadSuccess = async (data) => {
    setResults(data);
    setShowRecommendations(false);
    setError(null);
    setIsLoading(false);

    if (!user) return;
    const { error: saveError } = await supabase.from('resume_analyses').insert({
      user_id: user.id,
      filename: data.filename,
      character_count: data.character_count,
      skills_count: data.extracted_skills?.length || 0,
      extracted_skills: data.extracted_skills || [],
      explanations: data.explanations || [],
      recommendations: data.recommendations || []
    });

    if (saveError) {
      console.error('Error saving analysis:', saveError);
      setError('Your analysis completed, but it could not be saved to your account. Please retry before leaving this page.');
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

  if (showOnboarding && user) {
    return <OnboardingWizard user={user} onComplete={handleOnboardingComplete} />;
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600" /></div>;
  }

  if (!user) return <Auth onAuthSuccess={handleAuthSuccess} />;

  return (
    <UserDashboard
      user={user}
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
      {error && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>}
      {!results ? (
        <UploadComponent onUploadSuccess={handleUploadSuccess} onUploadError={handleUploadError} isLoading={isLoading} setIsLoading={setIsLoading} />
      ) : showRecommendations ? (
        <CareerRecommendations skills={results} user={user} onBack={() => setShowRecommendations(false)} />
      ) : (
        <SkillDashboard results={results} onBack={() => { setResults(null); setError(null); }} onRecommendations={() => setShowRecommendations(true)} />
      )}
    </UserDashboard>
  );
}

export default App;
