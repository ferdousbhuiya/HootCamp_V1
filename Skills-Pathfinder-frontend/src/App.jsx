import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Auth from './Component/Auth';
import UserDashboard from './Component/UserDashboard';
import UploadComponent from './Component/UploadComponent';
import SkillDashboard from './Component/SkillDashboard';
import CareerRecommendations from './Component/CareerRecommendations';
import OnboardingWizard from './Component/OnboardingWizard'; // ✅ NEW IMPORT

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
  const [showOnboarding, setShowOnboarding] = useState(false); // ✅ NEW STATE
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setLoading(false);
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuthSuccess = (authenticatedUser) => {
    setUser(authenticatedUser);
    // Show onboarding wizard for new users
    setShowOnboarding(true);
  };

  const handleLogout = () => {
    setUser(null);
    setResults(null);
    setShowRecommendations(false);
    setShowOnboarding(false);
  };

  const handleUploadSuccess = async (data) => {
    setResults(data);
    setShowRecommendations(false);
    setError(null);
    setIsLoading(false);

    if (user) {
      try {
        await supabase.from('resume_analyses').insert({
          user_id: user.id,
          filename: data.filename,
          character_count: data.character_count,
          skills_count: data.extracted_skills?.length || 0,
          extracted_skills: data.extracted_skills,
          explanations: data.explanations,
          recommendations: data.recommendations
        });
      } catch (err) {
        console.error('Error saving analysis:', err);
      }
    }
  };

  const handleUploadError = (err) => {
    setError(err.message || 'Upload failed. Please try again.');
    setIsLoading(false);
  };

  const handleShowRecommendations = () => {
    setShowRecommendations(true);
  };

  // ✅ SHOW ONBOARDING WIZARD
  if (showOnboarding) {
    return <OnboardingWizard user={user} onComplete={() => setShowOnboarding(false)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <UserDashboard
      user={user}
      onLogout={handleLogout}
      onStartOnboarding={() => setShowOnboarding(true)} // ✅ Pass function to dashboard
      onViewAnalysis={(savedAnalysis) => {
        if (savedAnalysis) {
          setResults({
            filename: savedAnalysis.filename,
            character_count: savedAnalysis.character_count,
            extracted_skills: savedAnalysis.extracted_skills,
            explanations: savedAnalysis.explanations,
            recommendations: savedAnalysis.recommendations
          });
          setShowRecommendations(false);
        } else {
          setResults(null);
          setShowRecommendations(false);
        }
      }}
    >
      {!results ? (
        <UploadComponent 
          onUploadSuccess={handleUploadSuccess}
          onUploadError={handleUploadError}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
        />
      ) : showRecommendations ? (
        <CareerRecommendations 
          skills={results} 
          onBack={() => setShowRecommendations(false)}
        />
      ) : (
        <SkillDashboard 
          results={results} 
          onBack={() => setResults(null)}
          onRecommendations={handleShowRecommendations}
        />
      )}
    </UserDashboard>
  );
}

export default App;