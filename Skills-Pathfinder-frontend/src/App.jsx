import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Auth from './Component/Auth';
import UserDashboard from './Component/UserDashboard';
import UploadComponent from './Component/UploadComponent';
import SkillDashboard from './Component/SkillDashboard';
import CareerRecommendations from './Component/CareerRecommendations';

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
  const [showUploadForm, setShowUploadForm] = useState(false); // ✅ NEW STATE

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
  };

  const handleLogout = () => {
    setUser(null);
    setResults(null);
    setShowRecommendations(false);
    setShowUploadForm(false); // ✅ Reset upload form on logout
  };

  const handleUploadSuccess = async (data) => {
    setResults(data);
    setShowRecommendations(false);
    setShowUploadForm(false); // ✅ Hide upload form after successful upload
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

  // ✅ NEW: Function to show upload form
  const handleShowUploadForm = () => {
    setShowUploadForm(true);
    setResults(null);
    setShowRecommendations(false);
  };

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
      onViewAnalysis={(savedAnalysis) => {
        if (savedAnalysis) {
          setResults({
            filename: savedAnalysis.filename,
            character_count: savedAnalysis.character_count,
            extracted_skills: savedAnalysis.extracted_skills,
            explanations: savedAnalysis.explanations,
            recommendations: savedAnalysis.recommendations
          });
          setShowUploadForm(false);
          setShowRecommendations(false);
        } else {
          // ✅ When onViewAnalysis() is called without params, show upload form
          handleShowUploadForm();
        }
      }}
    >
      {showUploadForm ? (
        <UploadComponent 
          onUploadSuccess={handleUploadSuccess}
          onUploadError={handleUploadError}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
        />
      ) : !results ? (
        // ✅ Show a welcome message or empty state
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Welcome to Skills Pathfinder!</h2>
          <p className="text-gray-600 mb-4">Get started by uploading your resume to analyze your skills.</p>
          <button
            onClick={handleShowUploadForm}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg transition-colors"
          >
            Upload Your Resume
          </button>
        </div>
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