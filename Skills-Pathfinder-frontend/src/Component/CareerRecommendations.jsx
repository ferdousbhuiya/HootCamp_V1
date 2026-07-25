import { useState, useEffect } from 'react';

const CareerRecommendations = ({ skills, onBack }) => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCareer, setSelectedCareer] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchRecommendations = async () => {
      setLoading(true);
      setError(null);
      
      console.log('🔵 1. Skills received in component:', skills?.extracted_skills);
      
      try {
        const response = await fetch('http://localhost:8000/api/recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ extracted_skills: skills?.extracted_skills || [] })
        });

        console.log('🟡 2. Response status:', response.status);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Failed to fetch recommendations');
        }
        
        const data = await response.json();
        console.log('🟢 3. Full API Response:', data);
        
        const recs = data.recommendations || [];
        console.log('🟢 4. Number of recommendations to render:', recs.length);
        
        setRecommendations(recs);
      } catch (err) {
        console.error('🔴 5. Error fetching recommendations:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (skills?.extracted_skills && skills.extracted_skills.length > 0) {
      fetchRecommendations();
    } else {
      console.warn('⚠️ No extracted skills found to send to API');
      setLoading(false);
    }
  }, [skills]);

  const getMatchColor = (score) => {
    if (score >= 0.7) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (score >= 0.5) return 'text-blue-700 bg-blue-50 border-blue-200';
    return 'text-amber-700 bg-amber-50 border-amber-200';
  };

  const getMatchBarColor = (score) => {
    if (score >= 0.7) return 'bg-emerald-500';
    if (score >= 0.5) return 'bg-blue-500';
    return 'bg-amber-500';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-12 text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mx-auto"></div>
        <p className="mt-6 text-lg text-gray-600 font-medium">Analyzing your career path...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
        <h3 className="text-red-800 font-semibold text-lg mb-2">Error Loading Recommendations</h3>
        <p className="text-red-600 mb-4">{error}</p>
        <button onClick={onBack} className="text-indigo-600 hover:underline">Go Back</button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Career Path Recommendations</h1>
            <p className="mt-1 text-indigo-100">
              {recommendations.length} career paths matched to your skills
            </p>
          </div>
          <button 
            onClick={onBack}
            className="flex items-center bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
          >
            ← Back to Skills
          </button>
        </div>
      </div>

      <div className="p-6">
        {recommendations.length === 0 ? (
          <div className="text-center py-12">
            <h3 className="text-xl font-semibold text-gray-800 mb-2">No career paths found</h3>
            <p className="text-gray-500">Try uploading a resume with more technical skills.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {recommendations.map((rec, index) => (
              <div 
                key={rec.id}
                className={`rounded-lg border-2 transition-all ${
                  index === 0 
                    ? 'border-indigo-300 bg-gradient-to-br from-indigo-50 to-purple-50' 
                    : 'border-gray-200 hover:border-indigo-300 bg-white'
                }`}
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-gray-800">{rec.path}</h3>
                        {index === 0 && (
                          <span className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs px-3 py-1 rounded-full font-medium">
                            ⭐ Top Match
                          </span>
                        )}
                        <span className="bg-gray-100 text-gray-700 text-xs px-3 py-1 rounded-full">
                          {rec.category}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3 mt-3">
                        <div className={`px-3 py-1 rounded-full text-sm font-semibold border ${getMatchColor(rec.match_score)}`}>
                          {(rec.match_score * 100).toFixed(0)}% Match
                        </div>
                        <div className="flex-1 h-2 bg-gray-200 rounded-full max-w-xs">
                          <div 
                            className={`h-2 rounded-full transition-all ${getMatchBarColor(rec.match_score)}`} 
                            style={{ width: `${rec.match_score * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="bg-white/80 p-4 rounded-lg border border-gray-200">
                      <div className="text-gray-500 text-sm mb-1">📈 Job Outlook</div>
                      <div className="font-semibold text-gray-800">{rec.job_outlook}</div>
                    </div>
                    <div className="bg-white/80 p-4 rounded-lg border border-gray-200">
                      <div className="text-gray-500 text-sm mb-1">💰 Median Salary</div>
                      <div className="font-semibold text-gray-800">{rec.median_salary}</div>
                    </div>
                    <div className="bg-white/80 p-4 rounded-lg border border-gray-200">
                      <div className="text-gray-500 text-sm mb-1">📍 Top Locations</div>
                      <div className="font-semibold text-gray-800 text-sm">{rec.top_locations.slice(0, 3).join(', ')}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <h4 className="font-semibold text-emerald-700 mb-2">✅ Your Matching Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {rec.matched_skills.map((skill, i) => (
                          <span key={i} className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-sm border border-emerald-200">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-amber-700 mb-2">🎯 Skills to Develop</h4>
                      <div className="flex flex-wrap gap-2">
                        {rec.missing_skills.map((skill, i) => (
                          <span key={i} className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm border border-amber-200">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedCareer(selectedCareer?.id === rec.id ? null : rec);
                      setActiveTab('overview');
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors mt-2"
                  >
                    {selectedCareer?.id === rec.id ? 'Hide Details' : 'View Full Details'}
                  </button>
                </div>

                {selectedCareer?.id === rec.id && (
                  <div className="border-t-2 border-indigo-200 bg-white p-6">
                    <div className="flex border-b border-gray-200 mb-4 overflow-x-auto">
                      {['overview', 'certifications', 'degrees', 'next-steps', 'resources'].map(tab => (
                        <button
                          key={tab}
                          className={`px-4 py-2 font-medium text-sm capitalize whitespace-nowrap ${
                            activeTab === tab 
                              ? 'border-indigo-500 text-indigo-600 border-b-2' 
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                          onClick={() => setActiveTab(tab)}
                        >
                          {tab.replace('-', ' ')}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4">
                      {activeTab === 'overview' && (
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                          <h5 className="font-semibold text-indigo-800 mb-2">💡 Recommendation</h5>
                          <p className="text-indigo-700 text-sm">
                            You have {rec.matched_skills.length} out of {rec.matched_skills.length + rec.missing_skills.length} required skills. 
                            Focus on developing {rec.missing_skills.slice(0, 3).join(', ')} to increase your match score.
                          </p>
                        </div>
                      )}

                      {activeTab === 'certifications' && (
                        <div className="space-y-3">
                          {rec.recommended_certifications.map((cert, i) => (
                            <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                              <div className="flex justify-between items-start mb-2">
                                <h5 className="font-semibold text-gray-800">{cert.name}</h5>
                                <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded">{cert.provider}</span>
                              </div>
                              <div className="flex gap-4 text-sm text-gray-600">
                                <span>⏱️ {cert.time}</span>
                                <span>💰 {cert.cost}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {activeTab === 'degrees' && (
                        <div className="space-y-3">
                          {rec.recommended_degrees.map((degree, i) => (
                            <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                              <h5 className="font-semibold text-gray-800 mb-2">{degree.name}</h5>
                              <div className="flex gap-4 text-sm text-gray-600">
                                <span>🎓 {degree.type}</span>
                                <span>⏱️ {degree.duration}</span>
                                <span>📚 {degree.format}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {activeTab === 'next-steps' && (
                        <ol className="space-y-3">
                          {rec.next_steps.map((step, i) => (
                            <li key={i} className="flex items-start gap-3">
                              <span className="flex-shrink-0 w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                                {i + 1}
                              </span>
                              <span className="text-gray-700 pt-0.5">{step}</span>
                            </li>
                          ))}
                        </ol>
                      )}

                      {activeTab === 'resources' && (
                        <div className="space-y-3">
                          {rec.learning_resources.map((resource, i) => (
                            <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                              <h5 className="font-semibold text-gray-800 mb-1">{resource.name}</h5>
                              <div className="flex gap-4 text-sm text-gray-600">
                                <span>📚 {resource.type}</span>
                                <span>💰 {resource.cost}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CareerRecommendations;